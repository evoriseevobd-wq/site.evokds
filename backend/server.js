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
    // Busca TODOS os pedidos do restaurante para identificar histórico
    const { data: allOrders } = await supabase
      .from("orders")
      .select("client_phone, created_at")
      .eq("restaurant_id", restaurant_id)
      .order("created_at", { ascending: true });

    // Conta pedidos por cliente no período ATUAL
    const ordersInPeriod = {};
    (currentOrders || []).forEach(order => {
      const phone = normalizePhone(order.client_phone);
      if (phone) {
        ordersInPeriod[phone] = (ordersInPeriod[phone] || 0) + 1;
      }
    });

    // Verifica se cliente tinha pedidos ANTES do período
    const hadOrdersBefore = {};
    (allOrders || []).forEach(order => {
      const phone = normalizePhone(order.client_phone);
      const orderDate = new Date(order.created_at);
      if (phone && orderDate < currentStart) {
        hadOrdersBefore[phone] = true;
      }
    });

    // Classifica clientes
    uniquePhones.forEach(phone => {
      const ordersCount = ordersInPeriod[phone] || 0;
      const hadPreviousOrders = hadOrdersBefore[phone] || false;
      
      // RECORRENTE se:
      // 1. Fez 2+ pedidos no período OU
      // 2. Já tinha pedidos antes do período
      if (ordersCount >= 2 || hadPreviousOrders) {
        metrics.client_base.recurring_clients++;
      } else {
        // NOVO: fez apenas 1 pedido e é o primeiro dele
        metrics.client_base.new_clients++;
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
   📈 ROTA DE TIMELINE (dados diários) - 🔥 CORRIGIDA
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
    
    // ========================================
    // 🔥 NOVA LÓGICA DE DATAS DINÂMICAS
    // ========================================
    
    let days = 30;
    let pointsCount = 15; // Padrão
    let interval = 2; // Intervalo entre pontos
    
    if (period === "3d") {
      days = 3;
      pointsCount = 3;
      interval = 1;
    } else if (period === "7d") {
      days = 7;
      pointsCount = 7;
      interval = 1;
    } else if (period === "15d") {
      days = 15;
      pointsCount = 15;
      interval = 1;
    } else if (period === "30d") {
      days = 30;
      pointsCount = 15;
      interval = 2;
    } else if (period === "90d") {
      days = 90;
      pointsCount = 15;
      interval = 6;
    } else if (period === "all") {
      days = 3650; // ~10 anos
      pointsCount = 30;
      interval = Math.floor(days / pointsCount);
    } else if (period.endsWith("d")) {
      days = parseInt(period) || 30;
      pointsCount = Math.min(15, days);
      interval = Math.max(1, Math.floor(days / pointsCount));
    }
    
    // Data de hoje (zero horas)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Data inicial
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    
    console.log(`📅 Período: ${days} dias | Pontos: ${pointsCount} | Intervalo: ${interval} dias`);
    console.log(`📅 De ${startDate.toISOString()} até ${today.toISOString()}`);

    // Busca pedidos do período
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, created_at, total_price, status")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: true });
    
    if (error) {
      console.error("❌ Erro ao buscar pedidos:", error);
      return sendError(res, 500, "Erro ao buscar pedidos");
    }

    console.log(`✅ Pedidos encontrados: ${orders?.length || 0}`);

    // ========================================
    // 🔥 GERA OS PONTOS DO GRÁFICO
    // ========================================
    
    // Agrupa pedidos por dia (YYYY-MM-DD)
    const ordersByDay = {};
    
    (orders || []).forEach(order => {
      try {
        if (!order.created_at) return;
        
        const date = new Date(order.created_at);
        if (isNaN(date.getTime())) return;
        
        const dateKey = date.toISOString().split('T')[0];
        
        if (!ordersByDay[dateKey]) {
          ordersByDay[dateKey] = {
            revenue: 0,
            orders: 0
          };
        }
        
        const price = parseFloat(order.total_price);
        ordersByDay[dateKey].revenue += (isNaN(price) ? 0 : price);
        ordersByDay[dateKey].orders += 1;
      } catch (err) {
        console.warn(`⚠️ Pedido ignorado:`, order.id, err.message);
      }
    });
    
    // Busca preço do plano (para ROI)
    const { data: restaurantData } = await supabase
      .from("restaurants")
      .select("plan")
      .eq("id", restaurant_id)
      .single();

    const planPrices = { basic: 1200, pro: 2500, advanced: 4000, executive: 6000, custom: 10000 };
    const planPrice = planPrices[(restaurantData?.plan || "basic").toLowerCase()] || 1200;
    
    // Cria os pontos do gráfico
    const timeline = [];
    
    for (let i = 0; i < pointsCount; i++) {
      // Calcula a data deste ponto
      const pointDate = new Date(today);
      pointDate.setDate(pointDate.getDate() - ((pointsCount - 1 - i) * interval));
      pointDate.setHours(0, 0, 0, 0);
      
      const dateKey = pointDate.toISOString().split('T')[0];
      
      // Se o intervalo for > 1, precisa somar vários dias
      let totalRevenue = 0;
      let totalOrders = 0;
      
      if (interval === 1) {
        // Apenas 1 dia
        const dayData = ordersByDay[dateKey];
        if (dayData) {
          totalRevenue = dayData.revenue;
          totalOrders = dayData.orders;
        }
      } else {
        // Soma vários dias (agrupamento)
        for (let d = 0; d < interval; d++) {
          const checkDate = new Date(pointDate);
          checkDate.setDate(checkDate.getDate() + d);
          const checkKey = checkDate.toISOString().split('T')[0];
          
          const dayData = ordersByDay[checkKey];
          if (dayData) {
            totalRevenue += dayData.revenue;
            totalOrders += dayData.orders;
          }
        }
      }
      
      timeline.push({
        date: dateKey,
        revenue: totalRevenue,
        orders: totalOrders,
        ticket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        roi: totalRevenue / planPrice
      });
    }

    // ========================================
    // 📊 COMPARAÇÃO COM PERÍODO ANTERIOR
    // ========================================
    
    const previousStart = new Date(startDate);
    previousStart.setDate(previousStart.getDate() - days);
    
    const { data: previousOrders } = await supabase
      .from("orders")
      .select("id, total_price")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", previousStart.toISOString())
      .lt("created_at", startDate.toISOString());

    let previousRevenue = 0;
    (previousOrders || []).forEach(o => {
      previousRevenue += parseFloat(o.total_price) || 0;
    });

    const previousOrdersCount = previousOrders?.length || 0;
    const previousTicket = previousOrdersCount > 0 ? previousRevenue / previousOrdersCount : 0;
    const previousROI = previousRevenue / planPrice;

    // Totais do período atual
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

    console.log(`✅ Timeline gerada: ${timeline.length} pontos`);
    console.log(`📊 Último ponto: ${timeline[timeline.length - 1]?.date} (deve ser hoje: ${today.toISOString().split('T')[0]})`);

    return res.json({
      period,
      days,
      points_count: pointsCount,
      interval,
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
/* ========================================
   🔗 ROTA DE RASTREAMENTO DE PEDIDO
======================================== */

app.get("/api/v1/tracking/:tracking_code", async (req, res) => {
  try {
    const { tracking_code } = req.params;
    
    console.log(`🔍 Rastreando pedido: ${tracking_code}`);
    
    // Busca o pedido (pode ser por ID ou order_number)
    let query = supabase
      .from("orders")
      .select("id, order_number, client_name, client_phone, status, itens, total_price, created_at, service_type, address, payment_method, notes")
      .limit(1);
    
    // Tenta buscar por ID ou por order_number
    if (tracking_code.includes('-')) {
      // É um UUID
      query = query.eq("id", tracking_code);
    } else {
      // É um número de pedido
      query = query.eq("order_number", parseInt(tracking_code));
    }
    
    const { data, error } = await query.single();
    
    if (error || !data) {
      console.log(`❌ Pedido não encontrado: ${tracking_code}`);
      return res.status(404).json({
        success: false,
        error: "Pedido não encontrado"
      });
    }
    
    // Mapeia status para progresso
    const statusMap = {
      "draft": { progress: 0, label: "Rascunho" },
      "pending": { progress: 20, label: "Pedido Confirmado" },
      "preparing": { progress: 40, label: "Em Preparo" },
      "mounting": { progress: 60, label: "Montando" },
      "delivering": { progress: 80, label: "Saiu para Entrega" },
      "finished": { progress: 100, label: "Pedido Entregue" },
      "cancelled": { progress: 0, label: "Cancelado" },
      "canceled": { progress: 0, label: "Cancelado" }
    };
    
    const currentStatus = data.status || "pending";
    const statusInfo = statusMap[currentStatus] || statusMap["pending"];
    
    // Formata os itens
    const items = Array.isArray(data.itens) ? data.itens.map(item => ({
      name: item.name || item.produto || "Item",
      quantity: item.quantity || item.quantidade || 1,
      price: parseFloat(item.price || item.preco || 0)
    })) : [];
    
    // Calcula tempo restante estimado (baseado no status)
    let timeRemaining = 0;
    if (currentStatus === "pending") timeRemaining = 40;
    else if (currentStatus === "preparing") timeRemaining = 30;
    else if (currentStatus === "mounting") timeRemaining = 15;
    else if (currentStatus === "delivering") timeRemaining = 20;
    
    const response = {
      success: true,
      order: {
        id: data.id,
        order_number: data.order_number || tracking_code,
        client_name: data.client_name,
        status: currentStatus,
        progress: statusInfo.progress,
        timeRemaining,
        total_amount: parseFloat(data.total_price) || 0,
        items,
        service_type: data.service_type,
        address: data.address,
        payment_method: data.payment_method,
        notes: data.notes,
        confirmed_at: data.created_at,
        preparing_at: currentStatus === "preparing" || currentStatus === "mounting" || currentStatus === "delivering" || currentStatus === "finished" ? data.created_at : null,
        ready_at: currentStatus === "mounting" || currentStatus === "delivering" || currentStatus === "finished" ? data.created_at : null,
        out_for_delivery_at: currentStatus === "delivering" || currentStatus === "finished" ? data.created_at : null,
        delivered_at: currentStatus === "finished" ? data.created_at : null,
        cancelled_at: currentStatus === "cancelled" || currentStatus === "canceled" ? data.created_at : null
      }
    };
    
    console.log(`✅ Pedido rastreado: #${data.order_number} - Status: ${currentStatus}`);
    
    return res.json(response);
    
  } catch (err) {
    console.error("❌ Erro em /api/v1/tracking:", err);
    return sendError(res, 500, "Erro ao rastrear pedido");
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
  console.log(`✅ Timeline com datas dinâmicas - último ponto sempre HOJE`);
});
