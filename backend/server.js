import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

// ✅ VALIDAÇÃO
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias!");
  process.exit(1);
}

// ✅ SUPABASE
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ✅ TESTE DE CONEXÃO
(async () => {
  try {
    const { data, error } = await supabase.from("restaurants").select("id").limit(1);
    if (error) throw error;
    console.log("✅ Conexão com Supabase OK!");
  } catch (err) {
    console.error("❌ Erro Supabase:", err.message);
  }
})();

// ✅ MIDDLEWARES
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-PDV-Token']
}));
app.use(express.json({ limit: '10mb' }));

// ✅ CONSTANTES
const ALLOWED_STATUS = ["draft", "pending", "preparing", "mounting", "delivering", "finished", "cancelled", "canceled"];

const sendError = (res, status, message) => {
  console.error(`[${status}] ${message}`);
  return res.status(status).json({ error: message });
};

/* =========================
   FUNÇÕES AUXILIARES
========================= */

async function restaurantExists(restaurant_id) {
  try {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id")
      .eq("id", restaurant_id)
      .limit(1);
    if (error) {
      console.error("❌ Erro ao validar restaurante:", error);
      return false;
    }
    return data && data.length > 0;
  } catch (err) {
    console.error("❌ Erro ao validar restaurante:", err);
    return false;
  }
}

async function getRestaurantPlan(restaurant_id) {
  try {
    const { data, error } = await supabase
      .from("restaurants")
      .select("plan")
      .eq("id", restaurant_id)
      .single();
    
    if (error) {
      console.error("❌ Erro ao buscar plano:", error);
      return "basic";
    }
    
    return (data?.plan || "basic").toLowerCase();
  } catch (err) {
    console.error("❌ Erro ao buscar plano:", err);
    return "basic";
  }
}

function canUseCRM(plan) {
  return ["advanced", "executive", "custom", "pro"].includes(plan.toLowerCase());
}

function canUseResults(plan) {
  return ["advanced", "executive", "custom"].includes(plan.toLowerCase());
}

function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/\D/g, "").trim();
  return digits || null;
}

/* =========================
   🔥 ROTA DE MÉTRICAS (CORRIGIDA)
========================= */

app.get("/api/v1/metrics/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { period = "30d" } = req.query;
    
    console.log(`📊 Buscando métricas para restaurante: ${restaurant_id}, período: ${period}`);
    
    // Verifica se o restaurante existe
    const exists = await restaurantExists(restaurant_id);
    if (!exists) {
      console.error(`❌ Restaurante não encontrado: ${restaurant_id}`);
      return sendError(res, 404, "Restaurante não encontrado");
    }
    
    // Verifica plano
    const plan = await getRestaurantPlan(restaurant_id);
    console.log(`📋 Plano do restaurante: ${plan}`);
    
    if (!canUseResults(plan)) {
      return res.status(403).json({
        error: "Recurso disponível apenas nos planos Advanced, Executive e Custom",
        current_plan: plan,
        upgrade_to: "advanced"
      });
    }
    
    // Calcula data de início
    let startDate = new Date();
    if (period === "3d") {
      startDate.setDate(startDate.getDate() - 3);
    } else if (period === "7d") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === "15d") {
      startDate.setDate(startDate.getDate() - 15);
    } else if (period === "30d") {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === "90d") {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period.endsWith("d")) {
      const days = parseInt(period);
      if (!isNaN(days)) {
        startDate.setDate(startDate.getDate() - days);
      }
    }

    console.log(`📅 Buscando pedidos desde: ${startDate.toISOString()}`);

    // Busca pedidos
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", startDate.toISOString());
    
    if (error) {
      console.error("❌ Erro ao buscar pedidos:", error);
      return sendError(res, 500, "Erro ao buscar pedidos do restaurante");
    }

    console.log(`✅ Pedidos encontrados: ${orders?.length || 0}`);

    // Inicializa métricas
    const metrics = {
      period,
      total_orders: orders?.length || 0,
      total_revenue: 0,
      average_ticket: 0,
      orders_by_origin: {
        ia_whatsapp: 0,
        pdv: 0,
        balcao: 0,
        outros: 0
      },
      orders_by_status: {
        pending: 0,
        preparing: 0,
        mounting: 0,
        delivering: 0,
        finished: 0,
        canceled: 0
      },
      orders_by_service_type: {
        delivery: 0,
        local: 0
      },
      unique_clients: 0
    };

    // Processa pedidos
    const uniquePhones = new Set();
    
    (orders || []).forEach(order => {
      const price = parseFloat(order.total_price) || 0;
      metrics.total_revenue += price;
      
      if (order.client_phone) {
        uniquePhones.add(normalizePhone(order.client_phone));
      }

      const origin = (order.origin || "outros").toLowerCase();
      if (metrics.orders_by_origin[origin] !== undefined) {
        metrics.orders_by_origin[origin]++;
      } else {
        metrics.orders_by_origin.outros++;
      }

      const status = (order.status || "pending").toLowerCase();
      const mappedStatus = status === "cancelled" ? "canceled" : status;
      if (metrics.orders_by_status[mappedStatus] !== undefined) {
        metrics.orders_by_status[mappedStatus]++;
      }

      const serviceType = (order.service_type || "local").toLowerCase();
      if (metrics.orders_by_service_type[serviceType] !== undefined) {
        metrics.orders_by_service_type[serviceType]++;
      }
    });

    metrics.unique_clients = uniquePhones.size;
    metrics.average_ticket = metrics.total_orders > 0 
      ? metrics.total_revenue / metrics.total_orders 
      : 0;

    console.log(`✅ Métricas calculadas:`, {
      total_orders: metrics.total_orders,
      total_revenue: metrics.total_revenue,
      unique_clients: metrics.unique_clients
    });

    return res.json(metrics);
  } catch (err) {
    console.error("❌ Erro em /api/v1/metrics:", err);
    return sendError(res, 500, "Erro interno ao processar métricas");
  }
});

/* =========================
   🔥 ROTA CRM (CORRIGIDA)
========================= */

app.get("/crm/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    
    console.log(`👥 Buscando CRM para restaurante: ${restaurant_id}`);
    
    if (!restaurant_id) {
      return sendError(res, 400, "restaurant_id é obrigatório");
    }

    // Verifica se o restaurante existe
    const exists = await restaurantExists(restaurant_id);
    if (!exists) {
      console.error(`❌ Restaurante não encontrado: ${restaurant_id}`);
      return sendError(res, 404, "Restaurante não encontrado");
    }

    // Verifica plano
    const plan = await getRestaurantPlan(restaurant_id);
    console.log(`📋 Plano do restaurante: ${plan}`);
    
    if (!canUseCRM(plan)) {
      return res.status(403).json({
        error: "CRM disponível apenas nos planos PRO, Advanced, Executive e Custom",
        current_plan: plan,
        upgrade_to: "pro"
      });
    }

    // Busca pedidos
    const { data, error } = await supabase
      .from("orders")
      .select("id, client_name, client_phone, created_at, total_price")
      .eq("restaurant_id", restaurant_id)
      .order("created_at", { ascending: true });
    
    if (error) {
      console.error("❌ Erro ao buscar pedidos para CRM:", error);
      return sendError(res, 500, "Erro ao buscar dados do CRM");
    }

    console.log(`✅ Pedidos encontrados para CRM: ${data?.length || 0}`);

    // Agrupa clientes por telefone
    const clients = Object.create(null);
    
    for (const o of data || []) {
      const phoneKey = normalizePhone(o.client_phone);
      const key = phoneKey || `anon-${o.id}`;

      if (!clients[key]) {
        clients[key] = {
          client_name: (o.client_name || "").trim() || "(Sem nome)",
          client_phone: phoneKey || "—",
          orders: 0,
          total_spent: 0,
          last_order_at: null
        };
      }

      clients[key].orders += 1;
      clients[key].total_spent += parseFloat(o.total_price) || 0;
      
      const currTime = o.created_at ? new Date(o.created_at).getTime() : 0;
      const prevTime = clients[key].last_order_at 
        ? new Date(clients[key].last_order_at).getTime() 
        : 0;

      if (currTime >= prevTime) {
        clients[key].last_order_at = o.created_at || clients[key].last_order_at;
      }

      const name = String(o.client_name || "").trim();
      if (name && currTime >= prevTime) {
        clients[key].client_name = name;
      }
    }

    // Ordena por última compra
    const result = Object.values(clients).sort((a, b) => {
      const ta = a.last_order_at ? new Date(a.last_order_at).getTime() : 0;
      const tb = b.last_order_at ? new Date(b.last_order_at).getTime() : 0;
      return tb - ta;
    });

    console.log(`✅ Clientes únicos no CRM: ${result.length}`);

    return res.json(result);
  } catch (err) {
    console.error("❌ Erro em /crm:", err);
    return sendError(res, 500, "Erro interno ao buscar CRM");
  }
});

/* =========================
   ROTAS ORIGINAIS
========================= */

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
    return res.json(data || []);
  } catch (err) {
    console.error("❌ Erro em /orders:", err);
    return sendError(res, 500, "Erro ao listar pedidos");
  }
});

// ✅ ATUALIZAR STATUS
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
      .select()
      .single();
    
    if (error || !data) return sendError(res, 500, "Erro ao atualizar pedido");
    return res.json(data);
  } catch (err) {
    console.error("❌ Erro em PATCH /orders:", err);
    return sendError(res, 500, "Erro ao atualizar pedido");
  }
});

app.patch("/orders/:id/status", async (req, res) => {
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
      .select()
      .single();
    
    if (error || !data) return sendError(res, 500, "Erro ao atualizar pedido");
    return res.json(data);
  } catch (err) {
    console.error("❌ Erro em PATCH /orders/status:", err);
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
    console.error("❌ Erro em DELETE /orders:", err);
    return sendError(res, 500, "Erro ao deletar pedido");
  }
});

// ✅ CRIAR/ATUALIZAR PEDIDO
app.post("/api/v1/pedidos", async (req, res) => {
  try {
    const {
      restaurant_id, client_name, client_phone, items, itens, notes,
      service_type, address, payment_method, total_price, origin,
      status, order_id, pdv_order_id, discount, subtotal, delivery_fee
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

    // CRM - Base de clientes
    if (phone) {
      await supabase.from("base_clientes").upsert({
        restaurant_id, telefone: phone, nome: client_name,
        ultima_interacao: now, ia_ativa: true
      }, { onConflict: 'telefone, restaurant_id' });
    }

    if (order_id) {
      // ATUALIZA
      const { data, error } = await supabase
        .from("orders")
        .update({
          itens: normalizedItems, notes: notes || "",
          status: finalStatus, total_price: total_price || 0,
          subtotal: subtotal || 0, discount: discount || 0,
          delivery_fee: delivery_fee || 0, pdv_order_id,
          update_at: now
        })
        .eq("id", order_id)
        .select()
        .single();
      
      if (error) return sendError(res, 500, "Erro ao atualizar pedido");
      resultData = data;
    } else {
      // CRIA
      const tracking_id = uuidv4().substring(0, 8).toUpperCase();
      const { data: last } = await supabase
        .from("orders")
        .select("order_number")
        .eq("restaurant_id", restaurant_id)
        .order("order_number", { ascending: false })
        .limit(1);
      
      const nextNumber = last && last.length > 0 
        ? Number(last[0].order_number) + 1 
        : 1;

      const { data, error } = await supabase
        .from("orders")
        .insert([{
          restaurant_id, client_name, client_phone: phone,
          order_number: nextNumber, itens: normalizedItems,
          notes: notes || "", status: finalStatus,
          service_type: service_type || "local",
          address: address || null, payment_method: payment_method || null,
          total_price: total_price || 0, subtotal: subtotal || 0,
          discount: discount || 0, delivery_fee: delivery_fee || 0,
          origin: finalOrigin, tracking_id, pdv_order_id,
          pdv_synced: false, created_at: now, update_at: now
        }])
        .select()
        .single();
      
      if (error) return sendError(res, 500, "Erro ao criar pedido: " + error.message);
      resultData = data;
    }

    return res.status(201).json({
      success: true,
      tracking_url: `https://fluxon.evoriseai.com.br/rastreio?id=${resultData.tracking_id}`,
      order: resultData
    });
  } catch (err) {
    console.error("❌ Erro em /api/v1/pedidos:", err);
    return sendError(res, 500, "Erro interno no servidor");
  }
});

// ✅ AUTH GOOGLE
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
    
    return res.json({ authorized: true, restaurant: data[0] });
  } catch (err) {
    console.error("❌ Erro em /auth/google:", err);
    return res.status(500).json({ error: "Erro inesperado" });
  }
});

// ✅ HEALTH
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "3.0.0-fixed"
  });
});

// ✅ ERROR HANDLING
app.use((err, req, res, next) => {
  console.error("❌ Erro:", err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

// ✅ START
app.listen(PORT, HOST, () => {
  console.log(`🚀 Fluxon Backend v3.0 FIXED em http://${HOST}:${PORT}`);
  console.log(`✅ Rotas corrigidas: /api/v1/metrics, /crm`);
});
