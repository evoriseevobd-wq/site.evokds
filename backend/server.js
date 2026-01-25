import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias!");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  try {
    const { data, error } = await supabase.from("restaurants").select("id").limit(1);
    if (error) throw error;
    console.log("✅ Conexão com Supabase OK!");
  } catch (err) {
    console.error("❌ Erro Supabase:", err.message);
  }
})();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10mb' }));

const ALLOWED_STATUS = ["draft", "pending", "preparing", "mounting", "delivering", "finished", "cancelled", "canceled"];

const sendError = (res, status, message) => {
  console.error(`[${status}] ${message}`);
  return res.status(status).json({ error: message });
};

async function restaurantExists(restaurant_id) {
  try {
    const { data, error } = await supabase.from("restaurants").select("id").eq("id", restaurant_id).limit(1);
    if (error) return false;
    return data && data.length > 0;
  } catch (err) {
    return false;
  }
}

async function getRestaurantPlan(restaurant_id) {
  try {
    const { data, error } = await supabase.from("restaurants").select("plan").eq("id", restaurant_id).single();
    if (error) return "basic";
    return (data?.plan || "basic").toLowerCase();
  } catch (err) {
    return "basic";
  }
}

function canUseCRM(plan) {
  return ["pro", "advanced", "executive", "custom"].includes(plan.toLowerCase());
}

function canUseResults(plan) {
  return ["advanced", "executive", "custom"].includes(plan.toLowerCase());
}

function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/\D/g, "").trim();
  return digits || null;
}

/* ========================================
   🔥 ROTA DE MÉTRICAS COMPLETA
======================================== */

app.get("/api/v1/metrics/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { period = "30d" } = req.query;
    
    console.log(`📊 Buscando métricas para: ${restaurant_id}, período: ${period}`);
    
    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");
    
    const plan = await getRestaurantPlan(restaurant_id);
    console.log(`📋 Plano: ${plan}`);
    
    if (!canUseResults(plan)) {
      return res.status(403).json({
        error: "Recurso disponível apenas nos planos Advanced, Executive e Custom",
        current_plan: plan,
        upgrade_to: "advanced"
      });
    }
    
    // Calcula datas
    let days = 30;
    if (period === "3d") days = 3;
    else if (period === "7d") days = 7;
    else if (period === "15d") days = 15;
    else if (period === "30d") days = 30;
    else if (period === "90d") days = 90;
    else if (period.endsWith("d")) days = parseInt(period) || 30;
    
    const currentStart = new Date();
    currentStart.setDate(currentStart.getDate() - days);
    
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - days);
    const previousEnd = new Date(currentStart);
    
    console.log(`📅 Período atual: ${currentStart.toISOString()}`);
    console.log(`📅 Período anterior: ${previousStart.toISOString()} até ${previousEnd.toISOString()}`);

    // Busca pedidos do período ATUAL
    const { data: currentOrders, error: currentError } = await supabase
      .from("orders")
      .select("id, client_phone, origin, status, service_type, created_at, total_price")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", currentStart.toISOString());
    
    if (currentError) {
      console.error("❌ Erro ao buscar pedidos:", currentError);
      return sendError(res, 500, "Erro ao buscar pedidos");
    }

    // Busca pedidos do período ANTERIOR
    const { data: previousOrders, error: previousError } = await supabase
      .from("orders")
      .select("id, total_price, created_at")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", previousStart.toISOString())
      .lt("created_at", previousEnd.toISOString());

    console.log(`✅ Pedidos atuais: ${currentOrders?.length || 0}`);
    console.log(`✅ Pedidos anteriores: ${previousOrders?.length || 0}`);

    // Inicializa métricas
    const metrics = {
      period,
      total_orders: currentOrders?.length || 0,
      total_revenue: 0,
      average_ticket: 0,
      unique_clients: 0,
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
      ia_performance: {
        orders: 0,
        revenue: 0,
        percentage: 0
      },
      client_base: {
        new_clients: 0,
        recurring_clients: 0,
        new_percentage: 0,
        recurring_percentage: 0
      },
      comparison: {
        orders: { current: 0, previous: 0, growth: 0 },
        revenue: { current: 0, previous: 0, growth: 0 },
        ticket: { current: 0, previous: 0, growth: 0 }
      }
    };

    // Processa pedidos ATUAIS
    const uniquePhones = new Set();
    const clientFirstOrders = {}; // telefone -> primeira data de pedido EVER
    
    (currentOrders || []).forEach(order => {
      // Faturamento
      const price = parseFloat(order.total_price) || 0;
      metrics.total_revenue += price;
      
      // Clientes únicos
      if (order.client_phone) {
        const phone = normalizePhone(order.client_phone);
        if (phone) uniquePhones.add(phone);
      }

      // Origem
      const origin = (order.origin || "outros").toLowerCase();
      if (metrics.orders_by_origin[origin] !== undefined) {
        metrics.orders_by_origin[origin]++;
        
        // Performance IA
        if (origin === "ia_whatsapp") {
          metrics.ia_performance.orders++;
          metrics.ia_performance.revenue += price;
        }
      } else {
        metrics.orders_by_origin.outros++;
      }

      // Status
      const status = (order.status || "pending").toLowerCase();
      const mappedStatus = status === "cancelled" ? "canceled" : status;
      if (metrics.orders_by_status[mappedStatus] !== undefined) {
        metrics.orders_by_status[mappedStatus]++;
      }

      // Tipo de serviço
      const serviceType = (order.service_type || "local").toLowerCase();
      if (metrics.orders_by_service_type[serviceType] !== undefined) {
        metrics.orders_by_service_type[serviceType]++;
      }
    });

    metrics.unique_clients = uniquePhones.size;
    metrics.average_ticket = metrics.total_orders > 0 ? metrics.total_revenue / metrics.total_orders : 0;

    // Performance IA %
    metrics.ia_performance.percentage = metrics.total_orders > 0 
      ? (metrics.ia_performance.orders / metrics.total_orders) * 100 
      : 0;

    // Base de clientes (novos vs recorrentes)
    // Busca TODOS os pedidos do restaurante para identificar primeiro pedido
    const { data: allOrders } = await supabase
      .from("orders")
      .select("client_phone, created_at")
      .eq("restaurant_id", restaurant_id)
      .order("created_at", { ascending: true });

    const clientFirstOrderDate = {};
    (allOrders || []).forEach(order => {
      const phone = normalizePhone(order.client_phone);
      if (phone && !clientFirstOrderDate[phone]) {
        clientFirstOrderDate[phone] = new Date(order.created_at);
      }
    });

    // Classifica clientes
    uniquePhones.forEach(phone => {
      const firstOrderDate = clientFirstOrderDate[phone];
      if (firstOrderDate && firstOrderDate >= currentStart) {
        metrics.client_base.new_clients++;
      } else {
        metrics.client_base.recurring_clients++;
      }
    });

    const totalClients = metrics.unique_clients;
    metrics.client_base.new_percentage = totalClients > 0 ? (metrics.client_base.new_clients / totalClients) * 100 : 0;
    metrics.client_base.recurring_percentage = totalClients > 0 ? (metrics.client_base.recurring_clients / totalClients) * 100 : 0;

    // Comparação com período anterior
    let previousRevenue = 0;
    (previousOrders || []).forEach(order => {
      previousRevenue += parseFloat(order.total_price) || 0;
    });

    const previousOrdersCount = previousOrders?.length || 0;
    const previousTicket = previousOrdersCount > 0 ? previousRevenue / previousOrdersCount : 0;

    metrics.comparison.orders.current = metrics.total_orders;
    metrics.comparison.orders.previous = previousOrdersCount;
    metrics.comparison.orders.growth = previousOrdersCount > 0 
      ? ((metrics.total_orders - previousOrdersCount) / previousOrdersCount) * 100 
      : 0;

    metrics.comparison.revenue.current = metrics.total_revenue;
    metrics.comparison.revenue.previous = previousRevenue;
    metrics.comparison.revenue.growth = previousRevenue > 0 
      ? ((metrics.total_revenue - previousRevenue) / previousRevenue) * 100 
      : 0;

    metrics.comparison.ticket.current = metrics.average_ticket;
    metrics.comparison.ticket.previous = previousTicket;
    metrics.comparison.ticket.growth = previousTicket > 0 
      ? ((metrics.average_ticket - previousTicket) / previousTicket) * 100 
      : 0;

    console.log(`✅ Métricas calculadas com sucesso!`);

    return res.json(metrics);
  } catch (err) {
    console.error("❌ Erro em /api/v1/metrics:", err);
    return sendError(res, 500, "Erro interno ao processar métricas");
  }
});

/* ========================================
   🔥 ROTA CRM
======================================== */

app.get("/crm/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    console.log(`👥 Buscando CRM para: ${restaurant_id}`);
    
    if (!restaurant_id) return sendError(res, 400, "restaurant_id é obrigatório");

    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");

    const plan = await getRestaurantPlan(restaurant_id);
    
    if (!canUseCRM(plan)) {
      return res.status(403).json({
        error: "CRM disponível apenas nos planos PRO, Advanced, Executive e Custom",
        current_plan: plan,
        upgrade_to: "pro"
      });
    }

    const { data, error } = await supabase
      .from("orders")
      .select("id, client_name, client_phone, created_at, total_price")
      .eq("restaurant_id", restaurant_id)
      .order("created_at", { ascending: true });
    
    if (error) {
      console.error("❌ Erro ao buscar pedidos para CRM:", error);
      return sendError(res, 500, "Erro ao buscar dados do CRM");
    }

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
      const prevTime = clients[key].last_order_at ? new Date(clients[key].last_order_at).getTime() : 0;

      if (currTime >= prevTime) {
        clients[key].last_order_at = o.created_at || clients[key].last_order_at;
      }

      const name = String(o.client_name || "").trim();
      if (name && currTime >= prevTime) {
        clients[key].client_name = name;
      }
    }

    const result = Object.values(clients).sort((a, b) => {
      const ta = a.last_order_at ? new Date(a.last_order_at).getTime() : 0;
      const tb = b.last_order_at ? new Date(b.last_order_at).getTime() : 0;
      return tb - ta;
    });

    console.log(`✅ Clientes únicos: ${result.length}`);
    return res.json(result);
  } catch (err) {
    console.error("❌ Erro em /crm:", err);
    return sendError(res, 500, "Erro interno ao buscar CRM");
  }
});

/* ========================================
   ROTAS ORIGINAIS
======================================== */

app.get("/orders/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { data, error } = await supabase.from("orders").select("*").eq("restaurant_id", restaurant_id).order("created_at", { ascending: true });
    if (error) return sendError(res, 500, "Erro ao listar pedidos");
    return res.json(data || []);
  } catch (err) {
    return sendError(res, 500, "Erro ao listar pedidos");
  }
});

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

app.post("/api/v1/pedidos", async (req, res) => {
  try {
    const {
      restaurant_id, client_name, client_phone, items, itens, notes,
      service_type, address, payment_method, total_price, origin,
      status, order_id
    } = req.body || {};

    const normalizedItems = Array.isArray(items) ? items : Array.isArray(itens) ? itens : [];
    const phone = normalizePhone(client_phone);
    const finalOrigin = origin || "outros";
    const finalStatus = status || "pending";

    if (!restaurant_id || !client_name) {
      return sendError(res, 400, "restaurant_id e client_name são obrigatórios");
    }

    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");

    const now = new Date().toISOString();
    let resultData;

    if (order_id) {
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
        .select()
        .single();
      
      if (error) return sendError(res, 500, "Erro ao atualizar pedido");
      resultData = data;
    } else {
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
          created_at: now,
          update_at: now
        }])
        .select()
        .single();
      
      if (error) {
        console.error("❌ Erro ao criar pedido:", error);
        return sendError(res, 500, "Erro ao criar pedido: " + error.message);
      }
      resultData = data;
    }

    return res.status(201).json({ success: true, order: resultData });
  } catch (err) {
    console.error("❌ Erro em /api/v1/pedidos:", err);
    return sendError(res, 500, "Erro interno no servidor");
  }
});

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
/* ========================================
   📈 ROTA DE TIMELINE (dados diários)
======================================== */

app.get("/api/v1/metrics/:restaurant_id/timeline", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { period = "30d" } = req.query;
    
    console.log(`📊 Buscando timeline para: ${restaurant_id}, período: ${period}`);
    
    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");
    
    const plan = await getRestaurantPlan(restaurant_id);
    
    if (!canUseResults(plan)) {
      return res.status(403).json({
        error: "Recurso disponível apenas nos planos Advanced, Executive e Custom",
        current_plan: plan,
        upgrade_to: "advanced"
      });
    }
    
    // Calcula datas
    let days = 30;
    if (period === "3d") days = 3;
    else if (period === "7d") days = 7;
    else if (period === "15d") days = 15;
    else if (period === "30d") days = 30;
    else if (period === "90d") days = 90;
    else if (period === "all") days = 3650; // ~10 anos
    else if (period.endsWith("d")) days = parseInt(period) || 30;
    
    const currentStart = new Date();
    currentStart.setDate(currentStart.getDate() - days);
    currentStart.setHours(0, 0, 0, 0);

    console.log(`📅 Buscando pedidos desde: ${currentStart.toISOString()}`);

    // Busca pedidos do período
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, created_at, total_price, status")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", currentStart.toISOString())
      .order("created_at", { ascending: true });
    
    if (error) {
      console.error("❌ Erro ao buscar pedidos:", error);
      return sendError(res, 500, "Erro ao buscar pedidos");
    }

    console.log(`✅ Pedidos encontrados: ${orders?.length || 0}`);

    // Agrupa pedidos por dia
    const dailyData = {};
    
(orders || []).forEach(order => {
  try {
    // Valida created_at
    if (!order.created_at) return;
    
    const date = new Date(order.created_at);
    
    // Verifica se a data é válida
    if (isNaN(date.getTime())) return;
    
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
    
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = {
        date: dateKey,
        revenue: 0,
        orders: 0
      };
    }
    
    // Garante que total_price é um número válido
    const price = parseFloat(order.total_price);
    dailyData[dateKey].revenue += (isNaN(price) ? 0 : price);
    dailyData[dateKey].orders += 1;
  } catch (err) {
    console.warn(`⚠️ Pedido ignorado:`, order.id, err.message);
  }
});

    // Busca preço do plano
    const { data: restaurantData } = await supabase
      .from("restaurants")
      .select("plan")
      .eq("id", restaurant_id)
      .single();

    const planPrices = { basic: 1200, pro: 2500, advanced: 4000, executive: 6000, custom: 10000 };
    const planPrice = planPrices[(restaurantData?.plan || "basic").toLowerCase()] || 1200;

    // Converte para array e calcula métricas
    const timeline = Object.values(dailyData)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(day => ({
        date: day.date,
        revenue: day.revenue,
        orders: day.orders,
        ticket: day.orders > 0 ? day.revenue / day.orders : 0,
        roi: day.revenue / planPrice
      }));

    // Calcula período anterior para comparação
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - days);
    
    const { data: previousOrders } = await supabase
      .from("orders")
      .select("id, total_price")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", previousStart.toISOString())
      .lt("created_at", currentStart.toISOString());

    let previousRevenue = 0;
    (previousOrders || []).forEach(o => {
      previousRevenue += parseFloat(o.total_price) || 0;
    });

    const previousOrdersCount = previousOrders?.length || 0;
    const previousTicket = previousOrdersCount > 0 ? previousRevenue / previousOrdersCount : 0;
    const previousROI = previousRevenue / planPrice;

    // Calcula crescimentos
    const currentRevenue = timeline.reduce((sum, day) => sum + day.revenue, 0);
    const currentOrders = timeline.reduce((sum, day) => sum + day.orders, 0);
    const currentTicket = currentOrders > 0 ? currentRevenue / currentOrders : 0;
    const currentROI = currentRevenue / planPrice;

    const comparison = {
      revenue_growth: previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0,
      orders_growth: previousOrdersCount > 0 ? ((currentOrders - previousOrdersCount) / previousOrdersCount) * 100 : 0,
      ticket_growth: previousTicket > 0 ? ((currentTicket - previousTicket) / previousTicket) * 100 : 0,
      roi_growth: previousROI > 0 ? ((currentROI - previousROI) / previousROI) * 100 : 0
    };

    console.log(`✅ Timeline gerada: ${timeline.length} dias`);

    return res.json({
      period,
      days,
      timeline,
      comparison,
      current_totals: {
        revenue: currentRevenue,
        orders: currentOrders,
        ticket: currentTicket,
        roi: currentROI
      },
      previous_totals: {
        revenue: previousRevenue,
        orders: previousOrdersCount,
        ticket: previousTicket,
        roi: previousROI
      }
    });

  } catch (err) {
    console.error("❌ Erro em /api/v1/metrics/timeline:", err);
    return sendError(res, 500, `Erro interno ao processar timeline: ${err.message}`);
  }
});
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "4.0.0-dashboard-completo"
  });
});

app.use((err, req, res, next) => {
  console.error("❌ Erro:", err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 Fluxon Backend v4.0 DASHBOARD COMPLETO em http://${HOST}:${PORT}`);
  console.log(`✅ COM origin (IA/PDV/Balcão)`);
  console.log(`✅ SEM tracking_id`);
  console.log(`✅ Métricas avançadas: comparação, IA, clientes, status`);
});
