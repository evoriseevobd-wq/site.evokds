import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { v4 as uuidv4 } from 'uuid';

// Carrega variáveis de ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

// ✅ VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias!");
  process.exit(1);
}

// ✅ CONFIGURAÇÃO DO SUPABASE
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ✅ TESTE DE CONEXÃO COM SUPABASE
(async () => {
  try {
    const { data, error } = await supabase.from("restaurants").select("id").limit(1);
    if (error) throw error;
    console.log("✅ Conexão com Supabase estabelecida com sucesso!");
  } catch (err) {
    console.error("❌ Erro ao conectar com Supabase:", err.message);
  }
})();

// ✅ MIDDLEWARES
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// ✅ STATUS PERMITIDOS
const ALLOWED_STATUS = [
  "draft", "pending", "preparing", "mounting", 
  "delivering", "finished", "cancelled", "canceled"
];

// ✅ FUNÇÃO DE ERRO PADRONIZADA
const sendError = (res, status, message) => {
  console.error(`[${status}] ${message}`);
  return res.status(status).json({ error: message });
};

/* =========================
   FUNÇÕES AUXILIARES
========================= */

async function restaurantExists(restaurant_id) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id")
    .eq("id", restaurant_id)
    .limit(1);

  if (error) throw new Error("Erro ao validar restaurante");
  return data && data.length > 0;
}

async function getRestaurantPlan(restaurant_id) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("plan")
    .eq("id", restaurant_id)
    .single();

  if (error) return "essential";
  return (data?.plan || "essential").toLowerCase();
}

function canUseCRM(plan) {
  return ["advanced", "executive", "custom", "pro"].includes(plan);
}

function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/\D/g, "").trim();
  return digits ? digits : null;
}

/* =========================
   APIs V1 - INTELIGÊNCIA, PDV E CRM
========================= */

// ✅ 1. CRIAR OU ATUALIZAR PEDIDO
app.post("/api/v1/pedidos", async (req, res) => {
  try {
    const {
      restaurant_id,
      client_name,
      client_phone,
      items,
      itens,
      notes,
      service_type,
      address,
      payment_method,
      total_price,
      origin,
      status,
      order_id
    } = req.body || {};

    const normalizedItems = Array.isArray(items) ? items : Array.isArray(itens) ? itens : [];
    const phone = normalizePhone(client_phone);
    const finalOrigin = origin || "ia_whatsapp";
    const finalStatus = status || "pending";

    if (!restaurant_id || !client_name) {
      return sendError(res, 400, "restaurant_id e client_name são obrigatórios");
    }

    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");

    const now = new Date().toISOString();
    let resultData;

    // ✅ BASE DE CLIENTES (CRM)
    if (phone) {
      await supabase
        .from("base_clientes")
        .upsert({
          restaurant_id,
          telefone: phone,
          nome: client_name,
          ultima_interacao: now,
          ia_ativa: true
        }, { onConflict: 'telefone, restaurant_id' });
    }

    if (order_id) {
      // ✅ ATUALIZA PEDIDO EXISTENTE
      const { data, error } = await supabase
        .from("orders")
        .update({
          itens: normalizedItems,
          notes: notes || "",
          status: finalStatus,
          total_price: total_price || 0,
          update_at: now
        })
        .eq("id", order_id)
        .select().single();
      
      if (error) return sendError(res, 500, "Erro ao atualizar pedido");
      resultData = data;
    } else {
      // ✅ CRIA NOVO PEDIDO
      const tracking_id = uuidv4().substring(0, 8).toUpperCase();
      const { data: last } = await supabase
        .from("orders")
        .select("order_number")
        .eq("restaurant_id", restaurant_id)
        .order("order_number", { ascending: false })
        .limit(1);

      const nextNumber = last && last.length > 0 ? Number(last[0].order_number) + 1 : 1;

      const { data, error } = await supabase
        .from("orders")
        .insert([{
          restaurant_id,
          client_name,
          client_phone: phone,
          order_number: nextNumber,
          itens: normalizedItems,
          notes: notes || "",
          status: finalStatus,
          service_type: service_type || "local",
          address: address || null,
          payment_method: payment_method || null,
          total_price: total_price || 0,
          origin: finalOrigin,
          tracking_id: tracking_id,
          created_at: now,
          update_at: now
        }])
        .select().single();

      if (error) return sendError(res, 500, "Erro ao criar pedido: " + error.message);
      resultData = data;
    }

    return res.status(201).json({
      success: true,
      tracking_url: `https://fluxon.evoriseai.com.br/rastreio?id=${resultData.tracking_id}`,
      order: resultData
    });
  } catch (err) {
    console.error("Erro em /api/v1/pedidos:", err);
    return sendError(res, 500, "Erro interno no servidor");
  }
});

// ✅ 2. SALVAR MENSAGENS
app.post("/api/v1/messages", async (req, res) => {
  try {
    let { restaurant_id, client_phone, sessionId, role, content, from_me } = req.body;

    if (sessionId && sessionId.includes('/')) {
      const parts = sessionId.split('/');
      client_phone = parts[0];
      restaurant_id = parts[1];
    }

    const phone = normalizePhone(client_phone);

    if (!restaurant_id || !phone || !content) {
      return sendError(res, 400, "Dados insuficientes");
    }

    // ✅ DESATIVA IA SE MENSAGEM FOR DO DONO
    if (from_me === true || role === "assistant_manual") {
      await supabase
        .from("base_clientes")
        .update({ ia_ativa: false })
        .eq("telefone", phone)
        .eq("restaurant_id", restaurant_id);
    }

    const { data, error } = await supabase
      .from("messages")
      .insert([{
        restaurant_id,
        client_phone: phone,
        role: role || "user",
        content,
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) return sendError(res, 500, "Erro ao salvar mensagem");
    return res.status(201).json(data);
  } catch (err) {
    console.error("Erro em /api/v1/messages:", err);
    return sendError(res, 500, "Erro ao processar mensagem");
  }
});

// ✅ 3. MÉTRICAS E ROI (EXECUTIVE)
app.get("/api/v1/metrics/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    
    const { data: orders, error } = await supabase
      .from("orders")
      .select("total_price, origin, created_at")
      .eq("restaurant_id", restaurant_id);

    if (error) return sendError(res, 500, "Erro ao buscar métricas");

    const metrics = {
      total_revenue: 0,
      ia_revenue: 0,
      ia_orders_count: 0,
      balcao_revenue: 0,
      balcao_orders_count: 0,
      ticket_medio_ia: 0
    };

    orders.forEach(order => {
      const price = parseFloat(order.total_price) || 0;
      metrics.total_revenue += price;

      if (order.origin === "ia_whatsapp") {
        metrics.ia_revenue += price;
        metrics.ia_orders_count++;
      } else {
        metrics.balcao_revenue += price;
        metrics.balcao_orders_count++;
      }
    });

    metrics.ticket_medio_ia = metrics.ia_orders_count > 0 
      ? (metrics.ia_revenue / metrics.ia_orders_count) 
      : 0;

    return res.json(metrics);
  } catch (err) {
    console.error("Erro em /api/v1/metrics:", err);
    return sendError(res, 500, "Erro ao processar métricas");
  }
});

// ✅ 4. PREVISÃO DE DEMANDA (EXECUTIVE)
app.get("/api/v1/demand-forecast/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(now.getDate() - 28);

    const { data: history, error } = await supabase
      .from("orders")
      .select("created_at")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", fourWeeksAgo.toISOString());

    if (error) return sendError(res, 500, "Erro ao buscar histórico");

    const similarOrders = history.filter(o => {
      const d = new Date(o.created_at);
      return d.getDay() === dayOfWeek && d.getHours() === hour;
    });

    const averageHistory = similarOrders.length / 4;

    const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
    const currentOrders = history.filter(o => new Date(o.created_at) >= oneHourAgo);

    const isHighDemand = currentOrders.length > (averageHistory * 1.2);

    return res.json({
      current_volume: currentOrders.length,
      average_history: averageHistory,
      is_high_demand: isHighDemand,
      alert_message: isHighDemand 
        ? "🚀 ALTA DEMANDA DETECTADA! Volume 20% acima da média." 
        : "Volume dentro do normal."
    });
  } catch (err) {
    console.error("Erro em /api/v1/demand-forecast:", err);
    return sendError(res, 500, "Erro ao processar previsão");
  }
});

// ✅ 5. PERFIL DO CLIENTE (CRM)
app.post("/api/v1/client-profiles", async (req, res) => {
  try {
    const { restaurant_id, client_phone, ai_notes, preferences } = req.body;
    const phone = normalizePhone(client_phone);

    const { data, error } = await supabase
      .from("client_profiles")
      .upsert({
        restaurant_id,
        client_phone: phone,
        ai_notes,
        preferences,
        update_at: new Date().toISOString()
      }, { onConflict: 'client_phone, restaurant_id' })
      .select();

    if (error) return sendError(res, 500, "Erro ao salvar perfil");
    return res.json(data);
  } catch (err) {
    console.error("Erro em /api/v1/client-profiles:", err);
    return sendError(res, 500, "Erro ao processar perfil");
  }
});

// ✅ 6. RASTREIO DE PEDIDO
app.get("/api/v1/rastreio/:tracking_id", async (req, res) => {
  try {
    const { tracking_id } = req.params;
    const { data, error } = await supabase
      .from("orders")
      .select("client_name, status, itens, total_price, update_at, service_type")
      .eq("tracking_id", tracking_id)
      .single();

    if (error || !data) return sendError(res, 404, "Pedido não encontrado");
    return res.json(data);
  } catch (err) {
    console.error("Erro em /api/v1/rastreio:", err);
    return sendError(res, 500, "Erro ao buscar rastreio");
  }
});

/* =========================
   ROTAS ORIGINAIS (KDS, CRM, AUTH)
========================= */

// ✅ ROTA ALTERNATIVA /orders (POST) - CORRIGIDA
app.post("/orders", async (req, res) => {
  // Redireciona para a rota V1
  req.url = "/api/v1/pedidos";
  req.body = { ...req.body };
  return app.handle(req, res);
});

// ✅ LISTAR PEDIDOS
app.get("/orders/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .order("created_at", { ascending: true });

    if (error) return sendError(res, 500, "Erro ao listar pedidos");
    return res.json(data);
  } catch (err) {
    console.error("Erro em GET /orders:", err);
    return sendError(res, 500, "Erro ao listar pedidos");
  }
});

// ✅ ATUALIZAR STATUS DO PEDIDO
app.patch("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!ALLOWED_STATUS.includes(status)) {
      return sendError(res, 400, "status inválido");
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ status, update_at: new Date().toISOString() })
      .eq("id", id)
      .select().single();

    if (error || !data) return sendError(res, 500, "Erro ao atualizar pedido");

    return res.json(data);
  } catch (err) {
    console.error("Erro em PATCH /orders:", err);
    return sendError(res, 500, "Erro ao atualizar pedido");
  }
});

// ✅ DELETAR PEDIDO
app.delete("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) return sendError(res, 500, "Erro ao deletar pedido");
    return res.status(204).send();
  } catch (err) {
    console.error("Erro em DELETE /orders:", err);
    return sendError(res, 500, "Erro ao deletar pedido");
  }
});

// ✅ CRM
app.get("/crm/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    if (!restaurant_id) return sendError(res, 400, "restaurant_id é obrigatório");

    const plan = await getRestaurantPlan(restaurant_id);
    if (!canUseCRM(plan)) return sendError(res, 403, "Plano não permite acesso ao CRM");

    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");

    const { data, error } = await supabase
      .from("orders")
      .select("id, client_name, client_phone, created_at")
      .eq("restaurant_id", restaurant_id)
      .order("created_at", { ascending: true });

    if (error) return sendError(res, 500, "Erro ao buscar CRM");

    const clients = Object.create(null);
    for (const o of data || []) {
      const phoneKey = normalizePhone(o.client_phone);
      const key = phoneKey || `anon-${o.id}`;

      if (!clients[key]) {
        clients[key] = {
          client_name: (o.client_name || "").trim() || "(Sem nome)",
          client_phone: phoneKey || "—",
          orders: 0,
          last_order_at: null,
        };
      }

      clients[key].orders += 1;
      const currTime = o.created_at ? new Date(o.created_at).getTime() : 0;
      const prevTime = clients[key].last_order_at ? new Date(clients[key].last_order_at).getTime() : 0;

      if (currTime >= prevTime) {
        clients[key].last_order_at = o.created_at || clients[key].last_order_at;
      }

      const name = String(o.client_name || "").trim();
      if (name && (currTime >= prevTime || !clients[key].client_name)) {
        clients[key].client_name = name;
      }
    }

    const result = Object.values(clients).sort((a, b) => {
      const ta = a.last_order_at ? new Date(a.last_order_at).getTime() : 0;
      const tb = b.last_order_at ? new Date(b.last_order_at).getTime() : 0;
      return tb - ta;
    });

    return res.json(result);
  } catch (err) {
    console.error("Erro em /crm:", err);
    return sendError(res, 500, "Erro ao buscar CRM");
  }
});

// ✅ AUTENTICAÇÃO GOOGLE
app.post("/auth/google", async (req, res) => {
  try {
    const { email } = req.body;
    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("email", email)
      .limit(1);

    if (error || !data || data.length === 0) {
      return res.status(403).json({ authorized: false });
    }

    return res.json({
      authorized: true,
      restaurant: data[0],
    });
  } catch (err) {
    console.error("Erro em /auth/google:", err);
    return res.status(500).json({ error: "Erro inesperado" });
  }
});

// ✅ TRATAMENTO DE ERROS GLOBAL
app.use((err, req, res, next) => {
  console.error("❌ Erro não tratado:", err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

// ✅ ROTA 404
app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

// ✅ INICIA O SERVIDOR
app.listen(PORT, HOST, () => {
  console.log(`🚀 Backend rodando em http://${HOST}:${PORT}`);
  console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});
