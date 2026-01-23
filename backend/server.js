import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config.js";
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 3001;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(cors());
app.use(express.json());

const ALLOWED_STATUS = [
  "draft",      // Rascunho / Conversa em andamento
  "pending",    // Confirmado / Aguardando cozinha
  "preparing",  // Em preparo
  "mounting",   // Montagem
  "delivering", // Saiu para entrega
  "finished",   // Finalizado
  "cancelled",  // Cancelado
  "canceled",
];

const sendError = (res, status, message) =>
  res.status(status).json({ error: message });

/* =========================
   FUNÇÕES AUXILIARES E ORIGINAIS
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

  if (error) return "basic";
  return (data?.plan || "basic").toLowerCase();
}

function canUseCRM(plan) {
  return ["pro", "advanced", "custom"].includes(plan);
}

function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/\D/g, "").trim();
  return digits ? digits : null;
}

/* =========================
   APIs V1 - INTELIGÊNCIA, PDV E CRM (NOVAS)
========================= */

// 1. Criar ou Atualizar Pedido (Suporta Recuperação de Carrinho, ROI e Rastreio)
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
      total_price,      // Para o ROI (Plano Executive)
      origin,           // ia_whatsapp, pdv_balcao, front_kds
      status,           // draft ou pending
      order_id          // Se enviado, atualiza o pedido existente
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

    if (order_id) {
      // Atualiza pedido existente (Conversa em andamento)
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
      // Cria novo pedido (Gera Tracking ID)
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

      if (error) return sendError(res, 500, "Erro ao criar pedido");
      resultData = data;
    }

    return res.status(201).json({
      success: true,
      tracking_url: `https://fluxon.evoriseai.com.br/rastreio?id=${resultData.tracking_id}`,
      order: resultData
    });
  } catch (err) {
    return sendError(res, 500, "Erro interno no servidor");
  }
});

// 2. Salvar Mensagens (Suporta SessionID Composto: Telefone/ID_Restaurante)
app.post("/api/v1/messages", async (req, res) => {
  try {
    let { restaurant_id, client_phone, sessionId, role, content } = req.body;

    // Lógica para separar o SessionID (Telefone/ID_Restaurante)
    if (sessionId && sessionId.includes('/')) {
      const parts = sessionId.split('/');
      client_phone = parts[0];
      restaurant_id = parts[1];
    }

    if (!restaurant_id || !client_phone || !content) {
      return sendError(res, 400, "Dados insuficientes (restaurant_id e client_phone são necessários)");
    }

    const { data, error } = await supabase
      .from("messages")
      .insert([{
        restaurant_id,
        client_phone: normalizePhone(client_phone),
        role: role || "user",
        content,
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) return sendError(res, 500, "Erro ao salvar mensagem");
    return res.status(201).json(data);
  } catch (err) {
    return sendError(res, 500, "Erro ao processar mensagem");
  }
});

// 3. Bloquinho de Notas / Perfil do Cliente (CRM Inteligente)
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
    return sendError(res, 500, "Erro ao processar perfil");
  }
});

// 4. Rota de Rastreio (Para o cliente final)
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
    return sendError(res, 500, "Erro ao buscar rastreio");
  }
});

/* =========================
   ROTAS ORIGINAIS (KDS, CRM, AUTH) - MANTIDAS INTEGRALMENTE
========================= */

app.post("/orders", async (req, res) => {
  // Redireciona para a nova lógica de pedidos para manter compatibilidade total
  req.url = "/api/v1/pedidos";
  return app._router.handle(req, res);
});

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
    return sendError(res, 500, "Erro ao listar pedidos");
  }
});

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
    return sendError(res, 500, "Erro ao atualizar pedido");
  }
});

app.delete("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) return sendError(res, 500, "Erro ao deletar pedido");
    return res.status(204).send();
  } catch (err) {
    return sendError(res, 500, "Erro ao deletar pedido");
  }
});

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
    return sendError(res, 500, "Erro ao buscar CRM");
  }
});

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
    return res.status(500).json({ error: "Erro inesperado" });
  }
});

app.listen(PORT, () => {
  console.log(`Fluxon Backend rodando na porta ${PORT}`);
});
