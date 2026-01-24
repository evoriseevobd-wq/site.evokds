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

async function getRestaurantByApiKey(apiKey) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("pdv_api_key", apiKey)
    .single();
  return error ? null : data;
}

function canUseCRM(plan) {
  return ["advanced", "executive", "custom", "pro"].includes(plan);
}

function canUseROI(plan) {
  return ["executive", "custom"].includes(plan);
}

function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/\D/g, "").trim();
  return digits || null;
}

// ✅ MIDDLEWARE PDV
async function authenticatePDV(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['x-pdv-token'];
  if (!apiKey) return sendError(res, 401, "API Key não fornecida");
  
  const restaurant = await getRestaurantByApiKey(apiKey);
  if (!restaurant) return sendError(res, 401, "API Key inválida");
  
  req.restaurant = restaurant;
  next();
}

/* =========================
   ROTAS PRINCIPAIS
========================= */

// ✅ CRIAR/ATUALIZAR PEDIDO
app.post("/api/v1/pedidos", async (req, res) => {
  try {
    const { restaurant_id, client_name, client_phone, items, itens, notes, service_type, address, payment_method, total_price, origin, status, order_id, pdv_order_id, discount, subtotal, delivery_fee } = req.body || {};

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
        restaurant_id, telefone: phone, nome: client_name, ultima_interacao: now, ia_ativa: true
      }, { onConflict: 'telefone, restaurant_id' });
    }

    if (order_id) {
      // ATUALIZA
      const { data, error } = await supabase
        .from("orders")
        .update({ itens: normalizedItems, notes: notes || "", status: finalStatus, total_price: total_price || 0, subtotal: subtotal || 0, discount: discount || 0, delivery_fee: delivery_fee || 0, pdv_order_id, update_at: now })
        .eq("id", order_id)
        .select().single();
      if (error) return sendError(res, 500, "Erro ao atualizar pedido");
      resultData = data;
    } else {
      // CRIA
      const tracking_id = uuidv4().substring(0, 8).toUpperCase();
      const { data: last } = await supabase.from("orders").select("order_number").eq("restaurant_id", restaurant_id).order("order_number", { ascending: false }).limit(1);
      const nextNumber = last && last.length > 0 ? Number(last[0].order_number) + 1 : 1;

      const { data, error } = await supabase
        .from("orders")
        .insert([{ restaurant_id, client_name, client_phone: phone, order_number: nextNumber, itens: normalizedItems, notes: notes || "", status: finalStatus, service_type: service_type || "local", address: address || null, payment_method: payment_method || null, total_price: total_price || 0, subtotal: subtotal || 0, discount: discount || 0, delivery_fee: delivery_fee || 0, origin: finalOrigin, tracking_id, pdv_order_id, pdv_synced: false, created_at: now, update_at: now }])
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

// ✅ SALVAR MENSAGENS
app.post("/api/v1/messages", async (req, res) => {
  try {
    let { restaurant_id, client_phone, sessionId, role, content, from_me } = req.body;

    if (sessionId && sessionId.includes('/')) {
      const parts = sessionId.split('/');
      client_phone = parts[0];
      restaurant_id = parts[1];
    }

    const phone = normalizePhone(client_phone);
    if (!restaurant_id || !phone || !content) return sendError(res, 400, "Dados insuficientes");

    if (from_me === true || role === "assistant_manual") {
      await supabase.from("base_clientes").update({ ia_ativa: false }).eq("telefone", phone).eq("restaurant_id", restaurant_id);
    }

    const { data, error } = await supabase
      .from("messages")
      .insert([{ restaurant_id, client_phone: phone, role: role || "user", content, created_at: new Date().toISOString() }])
      .select();

    if (error) return sendError(res, 500, "Erro ao salvar mensagem");
    return res.status(201).json(data);
  } catch (err) {
    console.error("Erro em /api/v1/messages:", err);
    return sendError(res, 500, "Erro ao processar mensagem");
  }
});

// ✅ MÉTRICAS E ROI
app.get("/api/v1/metrics/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { period = "30d" } = req.query;
    const plan = await getRestaurantPlan(restaurant_id);
    
    let startDate = new Date();
    if (period === "24h") startDate.setHours(startDate.getHours() - 24);
    else if (period === "7d") startDate.setDate(startDate.getDate() - 7);
    else if (period === "30d") startDate.setDate(startDate.getDate() - 30);
    else if (period === "90d") startDate.setDate(startDate.getDate() - 90);

    const { data: orders, error } = await supabase.from("orders").select("*").eq("restaurant_id", restaurant_id).gte("created_at", startDate.toISOString());
    if (error) return sendError(res, 500, "Erro ao buscar métricas");

    const metrics = {
      period, total_orders: orders.length, total_revenue: 0, average_ticket: 0,
      orders_by_origin: { ia_whatsapp: 0, pdv: 0, balcao: 0, outros: 0 },
      orders_by_status: { pending: 0, preparing: 0, mounting: 0, delivering: 0, finished: 0, canceled: 0 },
      orders_by_service_type: { delivery: 0, local: 0 },
      unique_clients: new Set()
    };

    let executive = null;
    if (canUseROI(plan)) {
      executive = {
        roi: { ia_revenue: 0, ia_orders_count: 0, ia_ticket_medio: 0, manual_revenue: 0, manual_orders_count: 0, manual_ticket_medio: 0, roi_percentage: 0, revenue_difference: 0 },
        financials: { gross_revenue: 0, discounts_total: 0, delivery_fees_total: 0, net_revenue: 0 },
        hourly_distribution: new Array(24).fill(0),
        top_items: {}
      };
    }

    orders.forEach(order => {
      const price = parseFloat(order.total_price) || 0;
      metrics.total_revenue += price;
      if (order.client_phone) metrics.unique_clients.add(order.client_phone);

      const origin = order.origin || "outros";
      if (metrics.orders_by_origin[origin] !== undefined) metrics.orders_by_origin[origin]++;
      else metrics.orders_by_origin.outros++;

      const status = order.status || "pending";
      if (metrics.orders_by_status[status] !== undefined) metrics.orders_by_status[status]++;

      const serviceType = order.service_type || "local";
      if (metrics.orders_by_service_type[serviceType] !== undefined) metrics.orders_by_service_type[serviceType]++;

      if (executive) {
        if (origin === "ia_whatsapp") {
          executive.roi.ia_revenue += price;
          executive.roi.ia_orders_count++;
        } else {
          executive.roi.manual_revenue += price;
          executive.roi.manual_orders_count++;
        }
        executive.financials.gross_revenue += price;
        executive.financials.discounts_total += parseFloat(order.discount) || 0;
        executive.financials.delivery_fees_total += parseFloat(order.delivery_fee) || 0;

        const hour = new Date(order.created_at).getHours();
        executive.hourly_distribution[hour]++;

        (Array.isArray(order.itens) ? order.itens : []).forEach(item => {
          const name = item?.name || item?.nome || "Item";
          const qty = item?.qty || item?.quantidade || 1;
          if (!executive.top_items[name]) executive.top_items[name] = { qty: 0, revenue: 0 };
          executive.top_items[name].qty += qty;
          executive.top_items[name].revenue += (parseFloat(item?.price || item?.preco || 0) * qty);
        });
      }
    });

    metrics.unique_clients = metrics.unique_clients.size;
    metrics.average_ticket = metrics.total_orders > 0 ? metrics.total_revenue / metrics.total_orders : 0;

    if (executive) {
      executive.roi.ia_ticket_medio = executive.roi.ia_orders_count > 0 ? executive.roi.ia_revenue / executive.roi.ia_orders_count : 0;
      executive.roi.manual_ticket_medio = executive.roi.manual_orders_count > 0 ? executive.roi.manual_revenue / executive.roi.manual_orders_count : 0;
      executive.roi.revenue_difference = executive.roi.ia_revenue - executive.roi.manual_revenue;
      const dailyCost = 150, daysInPeriod = period === "24h" ? 1 : period === "7d" ? 7 : 30;
      executive.roi.roi_percentage = (dailyCost * daysInPeriod) > 0 ? ((executive.roi.ia_revenue - (dailyCost * daysInPeriod)) / (dailyCost * daysInPeriod)) * 100 : 0;
      executive.financials.net_revenue = executive.financials.gross_revenue - executive.financials.discounts_total + executive.financials.delivery_fees_total;
      executive.top_items = Object.entries(executive.top_items).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10).map(([name, data]) => ({ name, ...data }));
    }

    return res.json({ ...metrics, ...(executive && { executive }) });
  } catch (err) {
    console.error("Erro em /api/v1/metrics:", err);
    return sendError(res, 500, "Erro ao processar métricas");
  }
});

// ✅ PREVISÃO DE DEMANDA
app.get("/api/v1/demand-forecast/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const plan = await getRestaurantPlan(restaurant_id);
    if (!canUseROI(plan)) return sendError(res, 403, "Recurso disponível apenas no plano Executive");

    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(now.getDate() - 56);

    const { data: history, error } = await supabase.from("orders").select("created_at, total_price").eq("restaurant_id", restaurant_id).gte("created_at", eightWeeksAgo.toISOString());
    if (error) return sendError(res, 500, "Erro ao buscar histórico");

    const similarOrders = history.filter(o => { const d = new Date(o.created_at); return d.getDay() === dayOfWeek && d.getHours() === hour; });
    const averageHistory = similarOrders.length / 8;

    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const currentOrders = history.filter(o => new Date(o.created_at) >= oneHourAgo);
    const isHighDemand = currentOrders.length > (averageHistory * 1.2);
    const demandPercentage = averageHistory > 0 ? ((currentOrders.length - averageHistory) / averageHistory) * 100 : 0;

    const forecast = [];
    for (let h = 1; h <= 3; h++) {
      const futureHour = (hour + h) % 24;
      const futureOrders = history.filter(o => { const d = new Date(o.created_at); return d.getDay() === dayOfWeek && d.getHours() === futureHour; });
      forecast.push({ hour: futureHour, expected_orders: Math.round(futureOrders.length / 8), expected_revenue: futureOrders.reduce((acc, o) => acc + (parseFloat(o.total_price) || 0), 0) / 8 });
    }

    return res.json({
      current: { volume: currentOrders.length, hour },
      average: { volume: Math.round(averageHistory * 10) / 10 },
      analysis: { is_high_demand: isHighDemand, demand_percentage: Math.round(demandPercentage), status: isHighDemand ? "high" : demandPercentage < -20 ? "low" : "normal" },
      forecast,
      alert_message: isHighDemand ? `🚀 ALTA DEMANDA! Volume ${Math.abs(Math.round(demandPercentage))}% acima da média.` : demandPercentage < -20 ? `📉 Volume ${Math.abs(Math.round(demandPercentage))}% abaixo da média.` : "✅ Volume dentro do normal."
    });
  } catch (err) {
    console.error("Erro em /api/v1/demand-forecast:", err);
    return sendError(res, 500, "Erro ao processar previsão");
  }
});

/* =========================
   APIs PDV
========================= */

// ✅ WEBHOOK - RECEBER PEDIDOS DO PDV
app.post("/api/v1/pdv/orders", authenticatePDV, async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { pdv_order_id, client_name, client_phone, items, total_price, subtotal, discount, delivery_fee, payment_method, service_type, address, notes, status } = req.body;

    if (!pdv_order_id) return sendError(res, 400, "pdv_order_id é obrigatório");

    const { data: existing } = await supabase.from("orders").select("id").eq("pdv_order_id", pdv_order_id).eq("restaurant_id", restaurant.id).single();

    const now = new Date().toISOString();
    const phone = normalizePhone(client_phone);
    let resultData;

    if (existing) {
      const { data, error } = await supabase.from("orders").update({ itens: items || [], total_price: total_price || 0, subtotal: subtotal || 0, discount: discount || 0, delivery_fee: delivery_fee || 0, payment_method, status: status || "pending", notes: notes || "", pdv_synced: true, update_at: now }).eq("id", existing.id).select().single();
      if (error) return sendError(res, 500, "Erro ao atualizar pedido");
      resultData = data;
    } else {
      const tracking_id = uuidv4().substring(0, 8).toUpperCase();
      const { data: last } = await supabase.from("orders").select("order_number").eq("restaurant_id", restaurant.id).order("order_number", { ascending: false }).limit(1);
      const nextNumber = last && last.length > 0 ? Number(last[0].order_number) + 1 : 1;

      const { data, error } = await supabase.from("orders").insert([{ restaurant_id: restaurant.id, client_name: client_name || "Cliente PDV", client_phone: phone, order_number: nextNumber, itens: items || [], notes: notes || "", status: status || "pending", service_type: service_type || "local", address, payment_method, total_price: total_price || 0, subtotal: subtotal || 0, discount: discount || 0, delivery_fee: delivery_fee || 0, origin: "pdv", tracking_id, pdv_order_id, pdv_synced: true, created_at: now, update_at: now }]).select().single();
      if (error) return sendError(res, 500, "Erro ao criar pedido");
      resultData = data;
    }

    return res.status(201).json({ success: true, order: resultData });
  } catch (err) {
    console.error("Erro em /api/v1/pdv/orders:", err);
    return sendError(res, 500, "Erro interno");
  }
});

// ✅ BUSCAR PEDIDOS NÃO SINCRONIZADOS
app.get("/api/v1/pdv/orders/pending", authenticatePDV, async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { data, error } = await supabase.from("orders").select("*").eq("restaurant_id", restaurant.id).eq("pdv_synced", false).order("created_at", { ascending: true });
    if (error) return sendError(res, 500, "Erro ao buscar pedidos");
    return res.json({ success: true, count: data.length, orders: data });
  } catch (err) {
    console.error("Erro:", err);
    return sendError(res, 500, "Erro interno");
  }
});

// ✅ CONFIRMAR SINCRONIZAÇÃO
app.patch("/api/v1/pdv/orders/:order_id/sync", authenticatePDV, async (req, res) => {
  try {
    const { order_id } = req.params;
    const { pdv_order_id, status } = req.body;
    const { data, error } = await supabase.from("orders").update({ pdv_synced: true, pdv_order_id, status, update_at: new Date().toISOString() }).eq("id", order_id).eq("restaurant_id", req.restaurant.id).select().single();
    if (error || !data) return sendError(res, 500, "Erro ao sincronizar");
    return res.json({ success: true, order: data });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// ✅ RESUMO DO CAIXA
app.get("/api/v1/pdv/cash-summary", authenticatePDV, async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const { data: orders, error } = await supabase.from("orders").select("*").eq("restaurant_id", restaurant.id).gte("created_at", `${targetDate}T00:00:00`).lt("created_at", `${targetDate}T23:59:59`).in("status", ["finished", "delivering"]);
    if (error) return sendError(res, 500, "Erro ao buscar resumo");

    const summary = { date: targetDate, total_orders: orders.length, gross_revenue: 0, discounts: 0, delivery_fees: 0, net_revenue: 0, by_payment_method: {}, by_origin: { ia_whatsapp: { count: 0, revenue: 0 }, pdv: { count: 0, revenue: 0 }, balcao: { count: 0, revenue: 0 } } };

    orders.forEach(order => {
      const total = parseFloat(order.total_price) || 0;
      summary.gross_revenue += total;
      summary.discounts += parseFloat(order.discount) || 0;
      summary.delivery_fees += parseFloat(order.delivery_fee) || 0;

      const method = order.payment_method || "não_informado";
      if (!summary.by_payment_method[method]) summary.by_payment_method[method] = { count: 0, revenue: 0 };
      summary.by_payment_method[method].count++;
      summary.by_payment_method[method].revenue += total;

      const origin = order.origin || "balcao";
      if (summary.by_origin[origin]) { summary.by_origin[origin].count++; summary.by_origin[origin].revenue += total; }
    });

    summary.net_revenue = summary.gross_revenue - summary.discounts + summary.delivery_fees;
    return res.json({ success: true, summary });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// ✅ GERAR API KEY
app.post("/api/v1/pdv/generate-key", async (req, res) => {
  try {
    const { restaurant_id, admin_email } = req.body;
    if (!restaurant_id || !admin_email) return sendError(res, 400, "restaurant_id e admin_email obrigatórios");

    const { data: restaurant, error: fetchError } = await supabase.from("restaurants").select("*").eq("id", restaurant_id).eq("email", admin_email).single();
    if (fetchError || !restaurant) return sendError(res, 403, "Não autorizado");

    const apiKey = `fluxon_${uuidv4().replace(/-/g, '')}`;
    await supabase.from("restaurants").update({ pdv_api_key: apiKey, pdv_api_key_created_at: new Date().toISOString() }).eq("id", restaurant_id);

    return res.json({ success: true, api_key: apiKey, message: "Guarde esta chave em local seguro." });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

/* =========================
   ROTAS ORIGINAIS
========================= */

// ✅ LISTAR PEDIDOS
app.get("/orders/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { data, error } = await supabase.from("orders").select("*").eq("restaurant_id", restaurant_id).order("created_at", { ascending: true });
    if (error) return sendError(res, 500, "Erro ao listar pedidos");
    return res.json(data);
  } catch (err) {
    return sendError(res, 500, "Erro ao listar pedidos");
  }
});

// ✅ ATUALIZAR STATUS
app.patch("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!ALLOWED_STATUS.includes(status)) return sendError(res, 400, "status inválido");

    const { data, error } = await supabase.from("orders").update({ status, update_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error || !data) return sendError(res, 500, "Erro ao atualizar pedido");
    return res.json(data);
  } catch (err) {
    return sendError(res, 500, "Erro ao atualizar pedido");
  }
});

app.patch("/orders/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!ALLOWED_STATUS.includes(status)) return sendError(res, 400, "status inválido");

    const { data, error } = await supabase.from("orders").update({ status, update_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error || !data) return sendError(res, 500, "Erro ao atualizar pedido");
    return res.json(data);
  } catch (err) {
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

    const { data, error } = await supabase.from("orders").select("id, client_name, client_phone, created_at, total_price").eq("restaurant_id", restaurant_id).order("created_at", { ascending: true });
    if (error) return sendError(res, 500, "Erro ao buscar CRM");

    const clients = Object.create(null);
    for (const o of data || []) {
      const phoneKey = normalizePhone(o.client_phone);
      const key = phoneKey || `anon-${o.id}`;

      if (!clients[key]) {
        clients[key] = { client_name: (o.client_name || "").trim() || "(Sem nome)", client_phone: phoneKey || "—", orders: 0, total_spent: 0, last_order_at: null };
      }
      clients[key].orders += 1;
      clients[key].total_spent += parseFloat(o.total_price) || 0;
      const currTime = o.created_at ? new Date(o.created_at).getTime() : 0;
      const prevTime = clients[key].last_order_at ? new Date(clients[key].last_order_at).getTime() : 0;
      if (currTime >= prevTime) clients[key].last_order_at = o.created_at || clients[key].last_order_at;
      const name = String(o.client_name || "").trim();
      if (name && currTime >= prevTime) clients[key].client_name = name;
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

// ✅ PERFIL DO CLIENTE
app.post("/api/v1/client-profiles", async (req, res) => {
  try {
    const { restaurant_id, client_phone, ai_notes, preferences } = req.body;
    const phone = normalizePhone(client_phone);
    const { data, error } = await supabase.from("client_profiles").upsert({ restaurant_id, client_phone: phone, ai_notes, preferences, update_at: new Date().toISOString() }, { onConflict: 'client_phone, restaurant_id' }).select();
    if (error) return sendError(res, 500, "Erro ao salvar perfil");
    return res.json(data);
  } catch (err) {
    return sendError(res, 500, "Erro ao processar perfil");
  }
});

// ✅ RASTREIO
app.get("/api/v1/rastreio/:tracking_id", async (req, res) => {
  try {
    const { tracking_id } = req.params;
    const { data, error } = await supabase.from("orders").select("client_name, status, itens, total_price, update_at, service_type").eq("tracking_id", tracking_id).single();
    if (error || !data) return sendError(res, 404, "Pedido não encontrado");
    return res.json(data);
  } catch (err) {
    return sendError(res, 500, "Erro ao buscar rastreio");
  }
});

// ✅ AUTH GOOGLE
app.post("/auth/google", async (req, res) => {
  try {
    const { email } = req.body;
    const { data, error } = await supabase.from("restaurants").select("*").eq("email", email).limit(1);
    if (error || !data || data.length === 0) return res.status(403).json({ authorized: false });
    return res.json({ authorized: true, restaurant: data[0] });
  } catch (err) {
    return res.status(500).json({ error: "Erro inesperado" });
  }
});

// ✅ HEALTH
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "2.0.0" });
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
  console.log(`🚀 Fluxon Backend v2.0 em http://${HOST}:${PORT}`);
});
