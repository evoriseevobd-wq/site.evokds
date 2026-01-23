import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

// ===== VALIDAÇÃO DE AMBIENTE =====
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias!");
  process.exit(1);
}

// ===== SUPABASE =====
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Teste de conexão
(async () => {
  try {
    const { data, error } = await supabase.from("restaurants").select("id").limit(1);
    if (error) throw error;
    console.log("✅ Conexão com Supabase estabelecida!");
  } catch (err) {
    console.error("❌ Erro ao conectar com Supabase:", err.message);
  }
})();

// ===== MIDDLEWARES =====
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));
app.use(express.json({ limit: '10mb' }));

// ===== CONSTANTES =====
const ALLOWED_STATUS = [
  "draft", "pending", "preparing", "mounting", 
  "delivering", "finished", "cancelled", "canceled"
];

const PLAN_FEATURES = {
  essential: {
    crm: false,
    results: false,
    roi: false,
    forecast: false,
    pdv_sync: false,
    cart_recovery: false,
    tracking: false,
    campaigns: false
  },
  advanced: {
    crm: true,
    results: true,
    roi: false,
    forecast: false,
    pdv_sync: "manual", // Sincronização manual
    cart_recovery: true,
    tracking: true,
    campaigns: false
  },
  executive: {
    crm: true,
    results: true,
    roi: true,
    forecast: true,
    pdv_sync: "auto", // Sincronização automática total
    cart_recovery: true,
    tracking: true,
    campaigns: true
  },
  custom: {
    crm: true,
    results: true,
    roi: true,
    forecast: true,
    pdv_sync: "auto",
    cart_recovery: true,
    tracking: true,
    campaigns: true
  }
};

// ===== HELPERS =====
const sendError = (res, status, message) => {
  console.error(`[${status}] ${message}`);
  return res.status(status).json({ error: message });
};

function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/\D/g, "").trim();
  return digits ? digits : null;
}

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

function hasFeature(plan, feature) {
  const planFeatures = PLAN_FEATURES[plan] || PLAN_FEATURES.essential;
  return planFeatures[feature] || false;
}

// ===== MIDDLEWARE DE VALIDAÇÃO DE PLANO =====
const requireFeature = (feature) => {
  return async (req, res, next) => {
    const restaurant_id = req.params.restaurant_id || req.body.restaurant_id;
    
    if (!restaurant_id) {
      return sendError(res, 400, "restaurant_id é obrigatório");
    }

    const plan = await getRestaurantPlan(restaurant_id);
    
    if (!hasFeature(plan, feature)) {
      return res.status(403).json({
        error: "Recurso não disponível no seu plano",
        feature,
        current_plan: plan,
        upgrade_to: feature === 'crm' ? 'advanced' : 
                    feature === 'roi' || feature === 'forecast' ? 'executive' : 
                    'advanced'
      });
    }

    next();
  };
};

/* ========================================
   🔥 NOVA API - INTEGRAÇÃO PDV (ADVANCED/EXECUTIVE)
======================================== */

// 📤 ENVIAR PEDIDO PARA PDV EXTERNO (MarketUP, etc)
app.post("/api/v1/pdv/send-order", async (req, res) => {
  try {
    const { restaurant_id, order_id, pdv_system } = req.body;

    if (!restaurant_id || !order_id) {
      return sendError(res, 400, "restaurant_id e order_id são obrigatórios");
    }

    const plan = await getRestaurantPlan(restaurant_id);
    
    if (!hasFeature(plan, 'pdv_sync')) {
      return sendError(res, 403, "Integração PDV disponível apenas nos planos Advanced e Executive");
    }

    // Busca o pedido
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return sendError(res, 404, "Pedido não encontrado");
    }

    // Formata para o PDV externo
    const pdvPayload = {
      external_id: order.id,
      tracking_id: order.tracking_id,
      order_number: order.order_number,
      customer: {
        name: order.client_name,
        phone: order.client_phone
      },
      items: order.itens.map(item => ({
        name: item.name || item.nome,
        quantity: item.qty || item.quantidade || 1,
        price: item.price || item.preco || 0
      })),
      total: order.total_price || 0,
      service_type: order.service_type,
      payment_method: order.payment_method,
      notes: order.notes,
      created_at: order.created_at
    };

    // Registra a tentativa de sincronização
    await supabase
      .from("pdv_sync_log")
      .insert([{
        restaurant_id,
        order_id,
        pdv_system: pdv_system || "marketup",
        payload: pdvPayload,
        sync_type: plan === 'executive' ? 'auto' : 'manual',
        status: 'pending',
        created_at: new Date().toISOString()
      }]);

    return res.json({
      success: true,
      message: plan === 'executive' 
        ? "Pedido será sincronizado automaticamente" 
        : "Pedido preparado para sincronização manual",
      sync_mode: plan === 'executive' ? 'auto' : 'manual',
      payload: pdvPayload
    });

  } catch (err) {
    console.error("Erro em /api/v1/pdv/send-order:", err);
    return sendError(res, 500, "Erro ao enviar pedido para PDV");
  }
});

// 📥 RECEBER ATUALIZAÇÃO DO PDV (webhook)
app.post("/api/v1/pdv/webhook", async (req, res) => {
  try {
    const { 
      restaurant_id, 
      tracking_id, 
      status, 
      total_price,
      payment_status,
      pdv_order_id 
    } = req.body;

    if (!restaurant_id || !tracking_id) {
      return sendError(res, 400, "restaurant_id e tracking_id são obrigatórios");
    }

    // Busca o pedido pelo tracking_id
    const { data: order, error: findError } = await supabase
      .from("orders")
      .select("id, status")
      .eq("restaurant_id", restaurant_id)
      .eq("tracking_id", tracking_id)
      .single();

    if (findError || !order) {
      return sendError(res, 404, "Pedido não encontrado");
    }

    // Atualiza o pedido
    const updateData = {
      update_at: new Date().toISOString()
    };

    if (status) updateData.status = status;
    if (total_price !== undefined) updateData.total_price = total_price;
    if (pdv_order_id) updateData.pdv_order_id = pdv_order_id;

    const { error: updateError } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", order.id);

    if (updateError) {
      return sendError(res, 500, "Erro ao atualizar pedido");
    }

    // Registra o webhook
    await supabase
      .from("pdv_webhooks_log")
      .insert([{
        restaurant_id,
        order_id: order.id,
        payload: req.body,
        created_at: new Date().toISOString()
      }]);

    return res.json({
      success: true,
      message: "Pedido atualizado via webhook PDV",
      order_id: order.id
    });

  } catch (err) {
    console.error("Erro em /api/v1/pdv/webhook:", err);
    return sendError(res, 500, "Erro ao processar webhook");
  }
});

// 📊 OBTER VALORES DO PDV (para sincronização manual - ADVANCED)
app.get("/api/v1/pdv/orders/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { start_date, end_date } = req.query;

    const plan = await getRestaurantPlan(restaurant_id);
    
    if (!hasFeature(plan, 'pdv_sync')) {
      return sendError(res, 403, "Recurso disponível apenas nos planos Advanced e Executive");
    }

    let query = supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .order("created_at", { ascending: false });

    if (start_date) {
      query = query.gte("created_at", start_date);
    }
    if (end_date) {
      query = query.lte("created_at", end_date);
    }

    const { data: orders, error } = await query;

    if (error) {
      return sendError(res, 500, "Erro ao buscar pedidos");
    }

    // Calcula totais para o PDV
    const summary = {
      total_orders: orders.length,
      total_revenue: orders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0),
      by_payment_method: {},
      by_service_type: {},
      pending_sync: orders.filter(o => !o.pdv_order_id).length
    };

    orders.forEach(order => {
      // Por método de pagamento
      const payment = order.payment_method || 'not_specified';
      summary.by_payment_method[payment] = (summary.by_payment_method[payment] || 0) + (parseFloat(order.total_price) || 0);

      // Por tipo de serviço
      const service = order.service_type || 'local';
      summary.by_service_type[service] = (summary.by_service_type[service] || 0) + 1;
    });

    return res.json({
      success: true,
      orders,
      summary,
      sync_mode: plan === 'executive' ? 'auto' : 'manual'
    });

  } catch (err) {
    console.error("Erro em /api/v1/pdv/orders:", err);
    return sendError(res, 500, "Erro ao buscar dados do PDV");
  }
});

/* ========================================
   📊 DASHBOARD EXECUTIVE APRIMORADO
======================================== */

// 💰 ROI E FATURAMENTO DETALHADO (EXECUTIVE)
app.get("/api/v1/analytics/roi/:restaurant_id", requireFeature('roi'), async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { period = '30d' } = req.query;

    // Calcula período
    const now = new Date();
    let startDate = new Date();
    
    if (period === '7d') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(now.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(now.getDate() - 90);
    }

    // Busca pedidos do período
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", startDate.toISOString());

    if (error) {
      return sendError(res, 500, "Erro ao buscar dados de ROI");
    }

    // Calcula métricas
    const totalRevenue = orders.reduce((sum, o) => 
      sum + (parseFloat(o.total_price) || 0), 0
    );

    const iaOrders = orders.filter(o => o.origin === 'ia_whatsapp');
    const iaRevenue = iaOrders.reduce((sum, o) => 
      sum + (parseFloat(o.total_price) || 0), 0
    );

    const manualOrders = orders.filter(o => o.origin !== 'ia_whatsapp');
    const manualRevenue = manualOrders.reduce((sum, o) => 
      sum + (parseFloat(o.total_price) || 0), 0
    );

    // ROI baseado no plano (R$ 4.500/mês para Executive)
    const planCost = 4500;
    const roi = totalRevenue > 0 ? ((totalRevenue - planCost) / planCost) * 100 : 0;
    const multiplier = totalRevenue / planCost;

    // Ticket médio
    const avgTicketIA = iaOrders.length > 0 ? iaRevenue / iaOrders.length : 0;
    const avgTicketManual = manualOrders.length > 0 ? manualRevenue / manualOrders.length : 0;

    // Taxa de conversão (pedidos finalizados vs cancelados)
    const finishedOrders = orders.filter(o => o.status === 'finished').length;
    const canceledOrders = orders.filter(o => o.status === 'canceled' || o.status === 'cancelled').length;
    const conversionRate = orders.length > 0 ? (finishedOrders / orders.length) * 100 : 0;

    return res.json({
      period,
      period_days: period === '7d' ? 7 : period === '30d' ? 30 : 90,
      total_revenue: totalRevenue,
      ia_revenue: iaRevenue,
      manual_revenue: manualRevenue,
      plan_cost: planCost,
      roi_percentage: roi,
      multiplier: parseFloat(multiplier.toFixed(2)),
      total_orders: orders.length,
      ia_orders: iaOrders.length,
      manual_orders: manualOrders.length,
      avg_ticket_ia: avgTicketIA,
      avg_ticket_manual: avgTicketManual,
      avg_ticket_overall: orders.length > 0 ? totalRevenue / orders.length : 0,
      finished_orders: finishedOrders,
      canceled_orders: canceledOrders,
      conversion_rate: conversionRate,
      revenue_per_day: totalRevenue / (period === '7d' ? 7 : period === '30d' ? 30 : 90),
      message: multiplier >= 1 
        ? `✅ O sistema já se pagou ${multiplier.toFixed(1)}x!` 
        : `📊 Você está a ${((1 - multiplier) * 100).toFixed(0)}% de atingir o ROI positivo`
    });

  } catch (err) {
    console.error("Erro em /api/v1/analytics/roi:", err);
    return sendError(res, 500, "Erro ao calcular ROI");
  }
});

// 📈 PREVISÃO DE DEMANDA AVANÇADA (EXECUTIVE)
app.get("/api/v1/analytics/demand-forecast/:restaurant_id", requireFeature('forecast'), async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    // Últimas 4 semanas para comparação
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(now.getDate() - 28);

    const { data: history, error } = await supabase
      .from("orders")
      .select("created_at, total_price")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", fourWeeksAgo.toISOString());

    if (error) {
      return sendError(res, 500, "Erro ao buscar histórico");
    }

    // Pedidos semelhantes (mesmo dia da semana e hora)
    const similarOrders = history.filter(o => {
      const d = new Date(o.created_at);
      return d.getDay() === dayOfWeek && d.getHours() === hour;
    });

    const averageHistory = similarOrders.length / 4;
    const averageRevenuePerOrder = similarOrders.reduce((sum, o) => 
      sum + (parseFloat(o.total_price) || 0), 0
    ) / (similarOrders.length || 1);

    // Volume atual (última hora)
    const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
    const currentOrders = history.filter(o => 
      new Date(o.created_at) >= oneHourAgo
    );

    const isHighDemand = currentOrders.length > (averageHistory * 1.3);
    const isModerateDemand = currentOrders.length > (averageHistory * 1.1);

    // Previsão para próximas horas
    const nextHoursForecast = [];
    for (let i = 1; i <= 3; i++) {
      const futureHour = (hour + i) % 24;
      const similarFuture = history.filter(o => {
        const d = new Date(o.created_at);
        return d.getDay() === dayOfWeek && d.getHours() === futureHour;
      });
      
      nextHoursForecast.push({
        hour: futureHour,
        expected_orders: Math.round(similarFuture.length / 4),
        expected_revenue: (similarFuture.length / 4) * averageRevenuePerOrder
      });
    }

    return res.json({
      current_volume: currentOrders.length,
      average_history: averageHistory,
      is_high_demand: isHighDemand,
      is_moderate_demand: isModerateDemand,
      demand_level: isHighDemand ? 'high' : isModerateDemand ? 'moderate' : 'normal',
      alert_message: isHighDemand 
        ? "🚀 ALTA DEMANDA! Volume 30% acima da média." 
        : isModerateDemand 
        ? "⚡ Demanda moderada. Volume 10% acima da média."
        : "✅ Volume dentro do normal.",
      next_hours_forecast: nextHoursForecast,
      recommendations: isHighDemand 
        ? ["Aumentar equipe de cozinha", "Preparar ingredientes extras", "Ativar backup de entregadores"]
        : ["Manter operação normal"]
    });

  } catch (err) {
    console.error("Erro em /api/v1/analytics/demand-forecast:", err);
    return sendError(res, 500, "Erro ao processar previsão");
  }
});

// 🎯 RECUPERAÇÃO DE CARRINHO (ADVANCED/EXECUTIVE)
app.get("/api/v1/cart-recovery/pending/:restaurant_id", requireFeature('cart_recovery'), async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    
    // Busca conversas abandonadas (mensagens sem pedido nos últimos 30 min)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const { data: messages, error } = await supabase
      .from("messages")
      .select("client_phone, created_at")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", thirtyMinAgo)
      .order("created_at", { ascending: false });

    if (error) {
      return sendError(res, 500, "Erro ao buscar carrinhos abandonados");
    }

    // Agrupa por telefone
    const phoneGroups = {};
    messages.forEach(msg => {
      if (!phoneGroups[msg.client_phone]) {
        phoneGroups[msg.client_phone] = [];
      }
      phoneGroups[msg.client_phone].push(msg);
    });

    // Verifica quais não finalizaram pedido
    const abandoned = [];
    
    for (const [phone, msgs] of Object.entries(phoneGroups)) {
      const { data: recentOrders } = await supabase
        .from("orders")
        .select("id")
        .eq("restaurant_id", restaurant_id)
        .eq("client_phone", phone)
        .gte("created_at", thirtyMinAgo)
        .limit(1);

      if (!recentOrders || recentOrders.length === 0) {
        abandoned.push({
          client_phone: phone,
          last_interaction: msgs[0].created_at,
          message_count: msgs.length
        });
      }
    }

    return res.json({
      total_abandoned: abandoned.length,
      abandoned_carts: abandoned,
      recovery_opportunity: abandoned.length * 45, // Estimativa: R$45 por carrinho
      message: abandoned.length > 0 
        ? `${abandoned.length} cliente(s) com carrinho abandonado. Recupere agora!`
        : "Nenhum carrinho abandonado no momento."
    });

  } catch (err) {
    console.error("Erro em /api/v1/cart-recovery/pending:", err);
    return sendError(res, 500, "Erro ao buscar carrinhos abandonados");
  }
});

/* ========================================
   ROTAS ORIGINAIS (MANTIDAS E OTIMIZADAS)
======================================== */

// ✅ CRIAR OU ATUALIZAR PEDIDO
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

    // BASE DE CLIENTES (CRM)
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
      // ATUALIZA PEDIDO EXISTENTE
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
      // CRIA NOVO PEDIDO
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

// DEMAIS ROTAS ORIGINAIS (mantidas)
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

app.get("/crm/:restaurant_id", requireFeature('crm'), async (req, res) => {
  try {
    const { restaurant_id } = req.params;

    const { data, error } = await supabase
      .from("orders")
      .select("id, client_name, client_phone, created_at, total_price")
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
          total_spent: 0,
          last_order_at: null,
        };
      }

      clients[key].orders += 1;
      clients[key].total_spent += parseFloat(o.total_price) || 0;
      
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

// ROTAS ALTERNATIVAS
app.post("/orders", async (req, res) => {
  req.url = "/api/v1/pedidos";
  req.body = { ...req.body };
  return app.handle(req, res);
});

app.use((err, req, res, next) => {
  console.error("❌ Erro não tratado:", err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 Backend rodando em http://${HOST}:${PORT}`);
  console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💎 Recursos por plano configurados!`);
});
