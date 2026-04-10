import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import multer from "multer";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { fileTypeFromBuffer } from "file-type";
import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
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

// ===== WEBSOCKET =====
io.on("connection", (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  socket.on("join_restaurant", (restaurant_id) => {
    socket.join(restaurant_id);
    console.log(`🏠 Socket ${socket.id} entrou na sala: ${restaurant_id}`);
  });

  socket.on("disconnect", () => {
    console.log(`❌ Cliente desconectado: ${socket.id}`);
  });
});

// Função global para emitir atualização de pedido
function emitOrderUpdate(restaurant_id, order) {
  io.to(restaurant_id).emit("order_updated", order);
}

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  next();
});

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

async function getIntegracao(restaurant_id, tipo) {
  try {
    const { data, error } = await supabase
      .from("integracoes")
      .select("dados")
      .eq("restaurant_id", restaurant_id)
      .eq("tipo", tipo)
      .single();
    if (error || !data) return null;
    return data.dados;
  } catch (err) {
    return null;
  }
}

async function getRestaurantPlan(restaurant_id) {
  try {
    const { data, error } = await supabase.from("restaurants").select("plan").eq("id", restaurant_id).single();
   if (error) return "essential";
return (data?.plan || "essential").toLowerCase();
  } catch (err) {
    return "essencial";
  }
}

const PLAN_HIERARCHY = ["essential", "advanced", "executive", "custom"];

function planLevel(plan) {
  const idx = PLAN_HIERARCHY.indexOf((plan || "essential").toLowerCase());
  return idx === -1 ? 0 : idx;
}

function canUseTracking(plan)        { return planLevel(plan) >= planLevel("advanced");  }
function canUseCRM(plan)             { return planLevel(plan) >= planLevel("advanced");  }
function canUsePDV(plan)             { return planLevel(plan) >= planLevel("advanced");  }
function canUseEstoque(plan)         { return planLevel(plan) >= planLevel("advanced");  }
function canUseCarrinho(plan)        { return planLevel(plan) >= planLevel("advanced");  }
function canUseResults(plan)         { return planLevel(plan) >= planLevel("executive"); }
function canUseAutoatendimento(plan) { return planLevel(plan) >= planLevel("executive"); }
function canUseFidelizacao(plan)     { return planLevel(plan) >= planLevel("executive"); }
function canUseMetas(plan)           { return planLevel(plan) >= planLevel("executive"); }
function canUseMultiUnidades(plan)   { return planLevel(plan) >= planLevel("custom");    }

function planError(res, current_plan, required) {
  return res.status(403).json({
    error: `Recurso disponível apenas no plano ${required} ou superior`,
    current_plan,
    upgrade_to: required
  });
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
    let currentOrders = [];
    const { data: fetchedOrders, error: currentError } = await supabase
      .from("orders")
      .select("id, client_phone, origin, status, service_type, created_at, total_price")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", currentStart.toISOString());
    
    if (currentError) {
      console.error("❌ Erro ao buscar pedidos:", currentError);
      return sendError(res, 500, "Erro ao buscar pedidos");
    }

    currentOrders = fetchedOrders || [];

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
  autoatendimento: 0,
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
   const ninetyDaysBeforeStart = new Date(currentStart);
ninetyDaysBeforeStart.setDate(ninetyDaysBeforeStart.getDate() - 90);

const hadOrdersBefore = {};
(allOrders || []).forEach(order => {
  const phone = normalizePhone(order.client_phone);
  const orderDate = new Date(order.created_at);
  if (phone && orderDate < currentStart && orderDate >= ninetyDaysBeforeStart) {
    hadOrdersBefore[phone] = true;
  }
});

// Faturamento recorrente — soma pedidos do período de clientes que já compraram antes
let recurringRevenue = 0;
(currentOrders || []).forEach(order => {
  const phone = normalizePhone(order.client_phone);
  if (phone && (hadOrdersBefore[phone] || (ordersInPeriod[phone] || 0) >= 2)) {
    recurringRevenue += parseFloat(order.total_price) || 0;
  }
});
metrics.recurring_revenue = recurringRevenue;
    
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

// ==========================================
    // 🔁 TAXA DE RETORNO
    // ==========================================
    // Clientes que compraram no período anterior E no atual
    const returningClients = [...uniquePhones].filter(phone => hadOrdersBefore[phone]).length;
    metrics.taxa_retorno = uniquePhones.size > 0
      ? (returningClients / uniquePhones.size) * 100
      : 0;
    metrics.taxa_retorno_count = returningClients;

    // Comparação taxa de retorno com período anterior
    const { data: prevPeriodOrders } = await supabase
      .from("orders")
      .select("client_phone")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", previousStart.toISOString())
      .lt("created_at", previousEnd.toISOString());

    const prevPeriodPhones = new Set((prevPeriodOrders || []).map(o => normalizePhone(o.client_phone)).filter(Boolean));
    const prevBeforeStart = new Date(previousStart);
    prevBeforeStart.setDate(prevBeforeStart.getDate() - days);

    const { data: prevBeforeOrders } = await supabase
      .from("orders")
      .select("client_phone")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", prevBeforeStart.toISOString())
      .lt("created_at", previousStart.toISOString());

    const prevHadBefore = new Set((prevBeforeOrders || []).map(o => normalizePhone(o.client_phone)).filter(Boolean));
    const prevReturning = [...prevPeriodPhones].filter(p => prevHadBefore.has(p)).length;
    const prevTaxaRetorno = prevPeriodPhones.size > 0 ? (prevReturning / prevPeriodPhones.size) * 100 : 0;

    metrics.comparison.taxa_retorno = {
      current: metrics.taxa_retorno,
      previous: prevTaxaRetorno,
      growth: prevTaxaRetorno > 0 ? ((metrics.taxa_retorno - prevTaxaRetorno) / prevTaxaRetorno) * 100 : 0
    };

    // ==========================================
    // 🔄 FREQUÊNCIA MÉDIA
    // ==========================================
    // Média de pedidos por cliente único no período
    const totalOrdersForFreq = currentOrders.length;
    metrics.frequencia_media = uniquePhones.size > 0
      ? totalOrdersForFreq / uniquePhones.size
      : 0;

    // Comparação frequência
    const prevFrequencia = prevPeriodPhones.size > 0
      ? (prevPeriodOrders?.length || 0) / prevPeriodPhones.size
      : 0;
    metrics.comparison.frequencia = {
      current: metrics.frequencia_media,
      previous: prevFrequencia,
      growth: prevFrequencia > 0 ? ((metrics.frequencia_media - prevFrequencia) / prevFrequencia) * 100 : 0
    };

    // ==========================================
    // 💤 CLIENTES INATIVOS
    // ==========================================
    // Clientes que NÃO compraram nos últimos X dias mas compraram antes
    const date7  = new Date(); date7.setDate(date7.getDate() - 7);
    const date15 = new Date(); date15.setDate(date15.getDate() - 15);
    const date30 = new Date(); date30.setDate(date30.getDate() - 30);

    // Mapa: telefone -> última compra
    const lastOrderByPhone = {};
    (allOrders || []).forEach(order => {
      const phone = normalizePhone(order.client_phone);
      if (!phone) return;
      const d = new Date(order.created_at);
      if (!lastOrderByPhone[phone] || d > lastOrderByPhone[phone]) {
        lastOrderByPhone[phone] = d;
      }
    });

    let inativos7 = 0, inativos15 = 0, inativos30 = 0;
    Object.values(lastOrderByPhone).forEach(lastDate => {
      if (lastDate < date7)  inativos7++;
      if (lastDate < date15) inativos15++;
      if (lastDate < date30) inativos30++;
    });

    metrics.clientes_inativos = {
      dias_7: inativos7,
      dias_15: inativos15,
      dias_30: inativos30,
      total_na_base: Object.keys(lastOrderByPhone).length
    };

    // ==========================================
    // 🎁 PRÓXIMOS DA RECOMPENSA
    // ==========================================
    // Busca menor prêmio disponível e conta clientes a menos de 20% dos pontos
    const { data: premios } = await supabase
      .from("premios_fidelidade")
      .select("pontos_necessarios")
      .eq("restaurant_id", restaurant_id)
      .eq("ativo", true)
      .order("pontos_necessarios")
      .limit(1);

    if (premios && premios.length > 0) {
      const menorPremio = premios[0].pontos_necessarios;
      const limiar = menorPremio * 0.8; // 80% do caminho

      const { data: clientesPerto } = await supabase
        .from("base_clientes")
        .select("pontos")
        .eq("restaurant_id", restaurant_id)
        .eq("Status", "ATIVO")
        .gte("pontos", limiar)
        .lt("pontos", menorPremio);

      metrics.proximos_recompensa = {
        count: clientesPerto?.length || 0,
        pontos_premio: menorPremio,
        limiar_80pct: Math.round(limiar)
      };
    } else {
      metrics.proximos_recompensa = { count: 0, pontos_premio: null, limiar_80pct: null };
    }
    
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
      .select("id, order_number, client_name, client_phone, status, itens, total_price, created_at, update_at, preparing_at, mounting_at, delivering_at, delivered_at, service_type, address, payment_method, notes")
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
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 2);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", cutoff.toISOString())
      .order("created_at", { ascending: true });
    if (error) return sendError(res, 500, "Erro ao listar pedidos");
    return res.json(data || []);
  } catch (err) {
    return sendError(res, 500, "Erro ao listar pedidos");
  }
});

app.patch("/orders/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    
    if (!ALLOWED_STATUS.includes(status)) return sendError(res, 400, "status inválido");
    
    const now = new Date().toISOString();
    
    // Objeto de atualização base
    const updateData = {
      status,
      update_at: now
    };
    
    // Adiciona timestamp específico baseado no status
    if (status === "pending") {
      updateData.confirmed_at = now;
    } else if (status === "preparing") {
      updateData.preparing_at = now;
    } else if (status === "mounting") {
      updateData.mounting_at = now;
    } else if (status === "delivering") {
      updateData.delivering_at = now;
    } else if (status === "finished") {
      updateData.delivered_at = now;
    } else if (status === "cancelled" || status === "canceled") {
      updateData.cancelled_at = now;
    }
    
    const { data, error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    
   if (error || !data) return sendError(res, 500, "Erro ao atualizar pedido");
    emitOrderUpdate(data.restaurant_id, data);

    // Agenda webhook de satisfação 2h após finalizar
    if (status === "finished" || status === "delivered") {
      setTimeout(async () => {
        const { data: orderCompleto } = await supabase
          .from("orders")
          .select("*")
          .eq("id", id)
          .single();

        if (orderCompleto) {
          await dispararWebhookSatisfacao(orderCompleto);
        }
      }, 2 * 60 * 60 * 1000); // 2 horas em ms

      console.log(`⏱️ Webhook satisfação agendado para 2h — Pedido ${id}`);
    }

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

    // 🔒 Restrição: autoatendimento só para Executive e Custom
    if (finalOrigin === "autoatendimento") {
      const plan = await getRestaurantPlan(restaurant_id);
      if (!["executive", "custom"].includes(plan.toLowerCase())) {
        return res.status(403).json({
          error: "Autoatendimento disponível apenas nos planos Executive e Custom",
          current_plan: plan,
          upgrade_to: "executive"
        });
      }
    }
    const now = new Date().toISOString();
    let resultData;

   if (order_id) {
  const { data, error } = await supabase
    .from("orders")
    .update({
      client_name,
      client_phone: phone,
      itens: normalizedItems,
      notes: notes || "",
      status: finalStatus,
      total_price: total_price || 0,
      service_type: service_type || "local",
      address: address || null,
      payment_method: payment_method || null,
      update_at: now
    })
    .eq("id", order_id)
    .select()
    .single();

  if (error) {
    console.error("❌ Erro update pedido:", JSON.stringify(error));
    return sendError(res, 500, "Erro ao atualizar pedido: " + error.message);
  }
  resultData = data; // ← estava faltando!
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

    // Gera código único: primeiros 8 caracteres do restaurant_id + order_number
const shortRestaurantId = restaurant_id.substring(0, 8);
const trackingCode = `${shortRestaurantId}_${resultData.order_number}`;

const { data: restData } = await supabase
  .from("restaurants")
  .select("tracking_url")
  .eq("id", restaurant_id)
  .single();

const baseUrl = restData?.tracking_url;

// Só gera o link se tiver tracking_url cadastrado
const trackingLink = baseUrl ? `${baseUrl}?code=${trackingCode}` : null;
    
// ⭐ FIDELIZAÇÃO
try {
  if (phone && !order_id && finalOrigin !== "fidelidade") {
    const pontosGanhos = Math.floor((parseFloat(total_price) || 0) * 15);

    if (pontosGanhos > 0) {
      const { data: perfil } = await supabase
        .from("base_clientes")
        .select("*")
        .eq("restaurant_id", restaurant_id)
        .eq("numero", phone)
        .single();

      if (perfil) {
        await supabase
          .from("base_clientes")
          .update({ pontos: (perfil.pontos || 0) + pontosGanhos })
          .eq("id", perfil.id);
      } else {
        const token = (Math.random().toString(36).substring(2, 8) +
                       Math.random().toString(36).substring(2, 8)).substring(0, 12);
        await supabase
          .from("base_clientes")
          .insert([{
            restaurant_id,
            nome: client_name || "",
            numero: phone,
            pontos: pontosGanhos,
            pontos_resgatados: 0,
            token_fidelidade: token,
            Status: "ATIVO"
          }]);
      }
      console.log(`⭐ ${phone} ganhou ${pontosGanhos}pts | Pedido #${resultData.order_number}`);
    }
  }
} catch (loyaltyErr) {
  console.error("⚠️ Erro na fidelização:", loyaltyErr.message);
}
// ⭐ FIM FIDELIZAÇÃO

    
return res.status(201).json({ 
  success: true, 
  order: resultData,
  tracking_code: trackingCode,
  tracking_link: trackingLink
});  
  emitOrderUpdate(restaurant_id, resultData);

  } catch (err) {
    console.error("❌ Erro em /api/v1/pedidos:", err);
    return sendError(res, 500, "Erro interno no servidor");
  }
});

app.post("/auth/google", async (req, res) => {
  try {
    const { credential } = req.body; // recebe o token JWT do Google, não o email

    if (!credential) return res.status(400).json({ error: "Token ausente" });

    // Verifica o token com a API do Google — impossível de falsificar
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ authorized: false, error: "Token inválido" });
    }

    const email = payload.email;

    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("email", email)
      .limit(1);

    if (error || !data || data.length === 0)
      return res.status(403).json({ authorized: false });

    // Gera um JWT próprio para autenticar nas próximas requisições
    const token = jwt.sign(
      { restaurant_id: data[0].id, email, plan: data[0].plan },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({ authorized: true, restaurant: data[0], token });
  } catch (err) {
    console.error("Erro auth:", err);
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
    const currentOrdersCount = timeline.reduce((sum, day) => sum + day.orders, 0);
    const currentTicket = currentOrdersCount > 0 ? currentRevenue / currentOrdersCount : 0;
const currentROI = currentRevenue / planPrice;

    const comparison = {
      revenue_growth: previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0,
      orders_growth: previousOrdersCount > 0 ? ((currentOrdersCount - previousOrdersCount) / previousOrdersCount) * 100 : 0,
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
        orders: currentOrdersCount,
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
    
    let query = supabase
      .from("orders")
      .select("id, order_number, restaurant_id, client_name, client_phone, status, itens, total_price, created_at, update_at, preparing_at, mounting_at, delivering_at, delivered_at, service_type, address, payment_method, notes")
      .limit(1);
    
   // Verifica se é formato: restaurantId_orderNumber
if (tracking_code.includes('_')) {
  const [shortId, orderNumber] = tracking_code.split('_');
  
  console.log(`📍 Buscando: Restaurant ${shortId}*, Pedido #${orderNumber}`);
  
  // Busca todos os pedidos com esse order_number
const { data: allOrders, error: searchError } = await supabase
    .from("orders")
    .select("id, order_number, restaurant_id, client_name, client_phone, status, itens, total_price, created_at, update_at, preparing_at, mounting_at, delivering_at, delivered_at, service_type, address, payment_method, notes")
    .eq("order_number", parseInt(orderNumber));
  
  if (searchError || !allOrders || allOrders.length === 0) {
    console.log(`❌ Nenhum pedido #${orderNumber} encontrado`);
    return res.status(404).json({
      success: false,
      error: "Pedido não encontrado"
    });
  }
  
  // Filtra pelo restaurant_id que começa com shortId
  const data = allOrders.find(order => order.restaurant_id.startsWith(shortId));
  
  if (!data) {
    console.log(`❌ Pedido #${orderNumber} não encontrado para restaurant ${shortId}*`);
    return res.status(404).json({
      success: false,
      error: "Pedido não encontrado"
    });
  }
  
  // Pula o resto do query e vai direto pro processamento
  // (apaga as linhas 713-732 e substitui por):
  
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
  
  const items = Array.isArray(data.itens) ? data.itens.map(item => ({
    name: item.name || item.produto || "Item",
    quantity: item.quantity || item.quantidade || 1,
    price: parseFloat(item.price || item.preco || 0)
  })) : [];
  
  let timeRemaining = 0;
  if (currentStatus === "pending") timeRemaining = 40;
  else if (currentStatus === "preparing") timeRemaining = 30;
  else if (currentStatus === "mounting") timeRemaining = 15;
  else if (currentStatus === "delivering") timeRemaining = 20;
  
const response = {
  success: true,
  order: {
    id: data.id,
    order_number: data.order_number,
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
    preparing_at: data.preparing_at || null,
    mounting_at: data.mounting_at || null,
    delivering_at: data.delivering_at || null,
    delivered_at: data.delivered_at || null,
    cancelled_at: data.cancelled_at || null
  }
};
  
  console.log(`✅ Pedido rastreado: #${data.order_number} - Status: ${currentStatus}`);
  
  return res.json(response);
}

    // Se for UUID completo (fallback)
    else if (tracking_code.includes('-')) {
      query = query.eq("id", tracking_code);
    } 
    // Se for apenas número (não permitir)
    else {
      return res.status(400).json({
        success: false,
        error: "Formato inválido. Use: restaurantId_orderNumber"
      });
    }
    
    const { data, error } = await query.single();
    
    if (error || !data) {
      console.log(`❌ Pedido não encontrado: ${tracking_code}`);
      return res.status(404).json({
        success: false,
        error: "Pedido não encontrado"
      });
    }
    
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
    
    const items = Array.isArray(data.itens) ? data.itens.map(item => ({
      name: item.name || item.produto || "Item",
      quantity: item.quantity || item.quantidade || 1,
      price: parseFloat(item.price || item.preco || 0)
    })) : [];
    
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

// ONDE COLAR: server.js, após a rota de timeline, antes do app.get("")

app.get("/api/v1/metrics/:restaurant_id/timing", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { period = "30d" } = req.query;

    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");

    const plan = await getRestaurantPlan(restaurant_id);
    if (!canUseResults(plan)) return res.status(403).json({ error: "Plano insuficiente", upgrade_to: "advanced" });

    // Calcula data inicial
    const days = period === "all" ? 3650 : (parseInt(period) || 30);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Busca pedidos finalizados com timestamps
    const { data: orders, error } = await supabase
      .from("orders")
      .select("created_at, preparing_at, mounting_at, delivering_at, delivered_at, service_type")
      .eq("restaurant_id", restaurant_id)
      .eq("status", "finished")
      .gte("created_at", startDate.toISOString())
      .not("preparing_at", "is", null);

    if (error) return sendError(res, 500, "Erro ao buscar pedidos");

    const METAS = { confirmacao: 5, preparo: 15, montagem: 8, entrega: 20 };
    const totals = { confirmacao: 0, preparo: 0, montagem: 0, entrega: 0 };
    const counts = { confirmacao: 0, preparo: 0, montagem: 0, entrega: 0 };

    const diffMin = (a, b) => {
      if (!a || !b) return null;
      const d = (new Date(b) - new Date(a)) / 60000;
      return (d > 0 && d < 300) ? d : null;
    };

    // Calcula tempo de cada etapa por pedido
    (orders || []).forEach(o => {
      const delivery = (o.service_type || "").toLowerCase() === "delivery";
      const d1 = diffMin(o.created_at, o.preparing_at);
      const d2 = diffMin(o.preparing_at, o.mounting_at);
      const d3 = diffMin(o.mounting_at, delivery ? o.delivering_at : o.delivered_at);
      const d4 = delivery ? diffMin(o.delivering_at, o.delivered_at) : null;

      if (d1) { totals.confirmacao += d1; counts.confirmacao++; }
      if (d2) { totals.preparo     += d2; counts.preparo++;     }
      if (d3) { totals.montagem    += d3; counts.montagem++;    }
      if (d4) { totals.entrega     += d4; counts.entrega++;     }
    });

    // Médias por etapa
    const medias = Object.fromEntries(
      Object.keys(totals).map(k => [k, counts[k] > 0 ? parseFloat((totals[k] / counts[k]).toFixed(2)) : 0])
    );

    // Identifica gargalos (etapas acima da meta)
    const gargalos = Object.keys(METAS)
      .filter(k => medias[k] > METAS[k])
      .map(k => ({ etapa: k, excesso: parseFloat((medias[k] - METAS[k]).toFixed(2)) }));

    return res.json({
      period,
      total_analisados: orders?.length || 0,
      medias,
      metas: METAS,
      gargalos
    });

  } catch (err) {
    return sendError(res, 500, `Erro interno: ${err.message}`);
  }
});

app.get("/api/v1/metrics/:restaurant_id/top-products", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { period = "30d" } = req.query;
    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");
    const plan = await getRestaurantPlan(restaurant_id);
    if (!canUseResults(plan)) return res.status(403).json({ error: "Plano insuficiente" });
    const days = period === "all" ? 3650 : (parseInt(period) || 30);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const { data: orders, error } = await supabase
      .from("orders")
      .select("itens")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", startDate.toISOString());
    if (error) return sendError(res, 500, "Erro ao buscar pedidos");
    const ranking = {};
    (orders || []).forEach(order => {
      (order.itens || []).forEach(item => {
        const nome = String(item.name || item.nome || "")
          .toLowerCase().trim()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ");
        if (!nome) return;
        ranking[nome] = (ranking[nome] || 0) + (item.qty || item.quantidade || 1);
      });
    });
    const sorted = Object.entries(ranking)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nome, qty]) => ({ nome: nome.charAt(0).toUpperCase() + nome.slice(1), qty }));
    return res.json(sorted);
  } catch (err) {
    return sendError(res, 500, `Erro interno: ${err.message}`);
  }
});

app.get("/api/v1/metrics/:restaurant_id/resumo-dia", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    const { data: orders, error } = await supabase
      .from("orders").select("*")
      .eq("restaurant_id", restaurant_id)
      .gte("created_at", hoje.toISOString())
      .lt("created_at", amanha.toISOString());
    if (error) return sendError(res, 500, "Erro ao buscar pedidos");
    const finalizados = (orders || []).filter(o => o.status === "finished");
    const cancelados = (orders || []).filter(o => o.status === "canceled" || o.status === "cancelled");
    const faturamento = finalizados.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0);
    const ticketMedio = finalizados.length > 0 ? faturamento / finalizados.length : 0;
    const delivery = finalizados.filter(o => String(o.service_type || "").toLowerCase() === "delivery").length;
    const local = finalizados.filter(o => String(o.service_type || "").toLowerCase() !== "delivery").length;
    const porPagamento = {};
    finalizados.forEach(o => {
      const m = o.payment_method || "Não informado";
      if (!porPagamento[m]) porPagamento[m] = { qtd: 0, valor: 0 };
      porPagamento[m].qtd++;
      porPagamento[m].valor += parseFloat(o.total_price) || 0;
    });
    const topItens = {};
    finalizados.forEach(o => {
      (o.itens || []).forEach(it => {
        const nome = it.name || it.nome || "?";
        topItens[nome] = (topItens[nome] || 0) + (it.qty || it.quantidade || 1);
      });
    });
    const topSorted = Object.entries(topItens)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([nome, qty]) => ({ nome, qty }));
    return res.json({
      data: hoje.toISOString(),
      total_pedidos: finalizados.length,
      faturamento,
      ticket_medio: ticketMedio,
      cancelados: cancelados.length,
      delivery,
      local,
      por_pagamento: porPagamento,
      top_itens: topSorted
    });
  } catch (err) {
    return sendError(res, 500, `Erro interno: ${err.message}`);
  }
});

app.get("/api/v1/pedidos-cliente", async (req, res) => {
  try {
    const { restaurant_id, phone } = req.query;
    if (!restaurant_id || !phone) return sendError(res, 400, "restaurant_id e phone são obrigatórios");
    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm) return sendError(res, 400, "Telefone inválido");
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, itens, total_price, created_at, status, service_type, payment_method")
      .eq("restaurant_id", restaurant_id)
      .eq("client_phone", phoneNorm)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return sendError(res, 500, "Erro ao buscar pedidos");
    return res.json(data || []);
  } catch (err) {
    return sendError(res, 500, `Erro interno: ${err.message}`);
  }
});

// GET - Lista cardápio do restaurante
app.get("/api/v1/cardapio/:restaurant_id", async (req, res) => {
  const { restaurant_id } = req.params;
  const { data, error } = await supabase
    .from("cardapio")
    .select("*")
    .eq("restaurant_id", restaurant_id)
    .order("categoria").order("ordem");
  if (error) return sendError(res, 500, "Erro ao buscar cardápio");
  return res.json(data);
});

// GET - Busca itens do cardápio por nome (autocomplete)
app.get("/api/v1/cardapio/:restaurant_id/busca", async (req, res) => {
  const { restaurant_id } = req.params;
  const { q = "" } = req.query;

  if (!q || q.trim().length < 1) {
    return res.json([]);
  }

  const { data, error } = await supabase
    .from("cardapio")
    .select("id, nome, preco, categoria")
    .eq("restaurant_id", restaurant_id)
    .eq("ativo", true)
    .ilike("nome", `%${q.trim()}%`)
    .order("nome")
    .limit(10);

  if (error) return sendError(res, 500, "Erro ao buscar itens");
  return res.json(data || []);
});



// POST - Cria item no cardápio
app.post("/api/v1/cardapio", async (req, res) => {
  const { restaurant_id, nome, descricao, preco, categoria, foto_url, ordem } = req.body;
  if (!restaurant_id || !nome || !preco) return sendError(res, 400, "Campos obrigatórios: restaurant_id, nome, preco");
  const { data, error } = await supabase
    .from("cardapio")
    .insert([{ restaurant_id, nome, descricao, preco, categoria: categoria || "Geral", foto_url, ordem: ordem || 0 }])
    .select().single();
  if (error) return sendError(res, 500, "Erro ao criar item");
  return res.status(201).json(data);
});

// PATCH - Edita item do cardápio
app.patch("/api/v1/cardapio/:id", async (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  const { data, error } = await supabase
    .from("cardapio")
    .update(fields)
    .eq("id", id)
    .select().single();
  if (error) return sendError(res, 500, "Erro ao atualizar item");
  return res.json(data);
});

// DELETE - Remove item do cardápio
app.delete("/api/v1/cardapio/:id", async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("cardapio").delete().eq("id", id);
  if (error) return sendError(res, 500, "Erro ao deletar item");
  return res.json({ success: true });
});

const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 5 * 1024 * 1024 } 
});

app.post("/api/v1/upload-image", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 400, "Nenhum arquivo enviado");

    const ext = req.file.originalname.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const bucket = req.body.bucket || req.query.bucket || "cardapio-images";
    const allowedBuckets = ["cardapio-images", "restaurante-logos", "premios-images"];
    if (!allowedBuckets.includes(bucket)) return sendError(res, 400, "Bucket inválido");

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (error) return sendError(res, 500, "Erro ao fazer upload: " + error.message);

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return res.json({ success: true, url: urlData.publicUrl });
  } catch (err) {
    return sendError(res, 500, "Erro interno no upload");
  }
});

app.get("/api/v1/dominio/:dominio", async (req, res) => {
  const { dominio } = req.params;
  const { data, error } = await supabase
    .from("restaurants")
    .select("id")
    .eq("fidelidade_url", dominio)
    .single();
  if (error || !data) return sendError(res, 404, "Domínio não encontrado");
  return res.json({ restaurant_id: data.id });
});

app.patch("/api/v1/restaurante/:restaurant_id/dominio", async (req, res) => {
  const { restaurant_id } = req.params;
  const { dominio } = req.body;
  
  const { data, error } = await supabase
    .from("restaurants")
    .update({ fidelidade_url: dominio })
    .eq("id", restaurant_id);
    
  if (error) return sendError(res, 500, "Erro ao salvar domínio");
  return res.json({ success: true });
});

app.patch("/api/v1/restaurante/:restaurant_id/dominio-cardapio", async (req, res) => {
  const { restaurant_id } = req.params;
  const { dominio } = req.body;
  const { error } = await supabase
    .from("restaurants")
    .update({ cardapio_url: dominio })
    .eq("id", restaurant_id);
  if (error) return sendError(res, 500, "Erro ao salvar domínio do cardápio");
  return res.json({ success: true });
});

app.get("/api/v1/dominio-cardapio/:dominio", async (req, res) => {
  const { dominio } = req.params;
  const { data, error } = await supabase
    .from("restaurants")
    .select("id")
    .eq("cardapio_url", dominio)
    .single();
  if (error || !data) return sendError(res, 404, "Domínio não encontrado");
  return res.json({ restaurant_id: data.id });
});

// GET - Busca config do restaurante (logo, cores, nome)
app.get("/api/v1/restaurante/:restaurant_id/config", async (req, res) => {
  try {
    const { restaurant_id } = req.params;

    const { data: rest } = await supabase
      .from("restaurants")
      .select("name")
      .eq("id", restaurant_id)
      .single();

    const { data: config } = await supabase
      .from("restaurante_config")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .single();

    return res.json({
      nome_exibicao: config?.nome_exibicao || "",
      logo_url: config?.logo_url || null,
      cor_primaria: config?.cor_primaria || "#f97373",
      cor_secundaria: config?.cor_secundaria || "#b91c1c",
      cor_fundo: config?.cor_fundo || "#0c0a09",
      subtitulo: config?.subtitulo || null,
      telefone: config?.telefone || null,
      instagram: config?.instagram || null,
      descricao: config?.descricao || null,
      tema: config?.tema || "dark"
    });
  } catch (err) {
    return sendError(res, 500, "Erro ao buscar configuração");
  }
});

// PATCH - Salva config do restaurante
app.patch("/api/v1/restaurante/:restaurant_id/config", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const fields = req.body;

    const { error } = await supabase
      .from("restaurante_config")
      .upsert({ restaurant_id, ...fields }, { onConflict: "restaurant_id" });

    if (error) return sendError(res, 500, "Erro ao salvar config");
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// GET - Busca config da impressora
app.get("/api/v1/restaurante/:restaurant_id/impressora", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const dados = await getIntegracao(restaurant_id, "printnode");
    return res.json({
      printnode_api_key: dados?.printnode_api_key ? "configurado" : "",
      printnode_printer_id: dados?.printnode_printer_id || ""
    });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// PATCH - Salva config da impressora
app.patch("/api/v1/restaurante/:restaurant_id/impressora", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { printnode_api_key, printnode_printer_id } = req.body;
    if (!printnode_api_key || !printnode_printer_id)
      return sendError(res, 400, "API Key e Printer ID são obrigatórios");

    const existing = await getIntegracao(restaurant_id, "printnode");
    const dados = {
      printnode_api_key: printnode_api_key !== "configurado" ? printnode_api_key : existing?.printnode_api_key,
      printnode_printer_id
    };

    await supabase.from("integracoes").upsert({
      restaurant_id, tipo: "printnode", dados, ativo: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "restaurant_id,tipo" });

    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// PATCH - Salva tracking_url
app.patch("/api/v1/restaurante/:restaurant_id/tracking-url", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { tracking_url } = req.body;
    const { error } = await supabase
      .from("restaurants")
      .update({ tracking_url })
      .eq("id", restaurant_id);
    if (error) return sendError(res, 500, "Erro ao salvar tracking URL");
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// GET - Busca tracking_url
app.get("/api/v1/restaurante/:restaurant_id/tracking-url", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { data, error } = await supabase
      .from("restaurants")
      .select("tracking_url")
      .eq("id", restaurant_id)
      .single();
    if (error || !data) return sendError(res, 404, "Não encontrado");
    return res.json({ tracking_url: data.tracking_url || "" });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// GET - Busca config fiscal
app.get("/api/v1/restaurante/:restaurant_id/fiscal", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const dados = await getIntegracao(restaurant_id, "focusnfe");
    return res.json({
      focusnfe_token: dados?.focusnfe_token ? "configurado" : "",
      cnpj: dados?.cnpj || "",
      inscricao_estadual: dados?.inscricao_estadual || "",
      regime_tributario: dados?.regime_tributario || "1"
    });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// PATCH - Salva config fiscal
app.patch("/api/v1/restaurante/:restaurant_id/fiscal", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { focusnfe_token, cnpj, inscricao_estadual, regime_tributario } = req.body;
    const existing = await getIntegracao(restaurant_id, "focusnfe");
    const dados = {
      focusnfe_token: focusnfe_token !== "configurado" ? focusnfe_token : existing?.focusnfe_token,
      cnpj, inscricao_estadual, regime_tributario
    };
    await supabase.from("integracoes").upsert({
      restaurant_id, tipo: "focusnfe", dados, ativo: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "restaurant_id,tipo" });
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

/* ========================================
   🖨️ ROTAS DE IMPRESSORA (PrintNode)
======================================== */

async function printOrder(order, apiKey, printerId) {
  try {
    const isDelivery = String(order.service_type || '').toLowerCase() === 'delivery';
    const itens = Array.isArray(order.itens) ? order.itens : [];
    let totalRecalculado = 0;

    const itensComPreco = await Promise.all(itens.map(async (it) => {
      const nome = it.name || it.nome || 'Item';
      const qty  = it.qty || it.quantidade || it.quantity || 1;
      let preco  = parseFloat(it.price || it.preco || 0);

      if (preco === 0 && order.restaurant_id) {
        const { data: cardapioItem } = await supabase
          .from("cardapio").select("preco")
          .eq("restaurant_id", order.restaurant_id)
          .ilike("nome", nome).limit(1).single();
        if (cardapioItem?.preco) preco = parseFloat(cardapioItem.preco);
      }

      totalRecalculado += preco * qty;
      return { nome, qty, preco };
    }));

    const totalFinal = parseFloat(order.total_price || 0) > 0
      ? parseFloat(order.total_price)
      : totalRecalculado;

    const horario = new Date(order.created_at || Date.now())
      .toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo'
      });

    // ── Busca dados do restaurante ─────────────────
    const { data: restData } = await supabase
  .from("restaurants")
  .select("name, tracking_url")
  .eq("id", order.restaurant_id)
  .single();

const { data: restConfig } = await supabase
  .from("restaurante_config")
  .select("nome_exibicao, subtitulo, telefone, instagram")
  .eq("restaurant_id", order.restaurant_id)
  .single();

    const ESC = 0x1B;
    const GS  = 0x1D;
    const bytes = [];

    const b = (...args) => args.forEach(v => bytes.push(v));

    const txt = (str) => {
      const map = {
        'á':'a','à':'a','â':'a','ã':'a','ä':'a',
        'é':'e','è':'e','ê':'e','ë':'e',
        'í':'i','ì':'i','î':'i','ï':'i',
        'ó':'o','ò':'o','ô':'o','õ':'o','ö':'o',
        'ú':'u','ù':'u','û':'u','ü':'u',
        'ç':'c','ñ':'n',
        'Á':'A','À':'A','Â':'A','Ã':'A',
        'É':'E','È':'E','Ê':'E',
        'Í':'I','Î':'I',
        'Ó':'O','Ô':'O','Õ':'O',
        'Ú':'U','Û':'U',
        'Ç':'C','Ñ':'N'
      };
      String(str || '').replace(/[^\x20-\x7E]/g, c => map[c] || '?')
        .split('').forEach(c => bytes.push(c.charCodeAt(0)));
    };

    const lf     = () => b(0x0A);
    const lineEq   = (n = 48) => { txt('='.repeat(n)); lf(); };
    const lineDash = (n = 48) => { txt('-'.repeat(n)); lf(); };

    // ── Reset ──────────────────────────────────────
    b(ESC, 0x40);

    // ── CABEÇALHO ──────────────────────────────────
    b(ESC, 0x61, 0x01); // centralizar

    b(GS, 0x21, 0x11);
    b(ESC, 0x45, 0x01);
    txt(restConfig?.nome_exibicao || restData?.name || 'Restaurante'); lf();
    b(GS, 0x21, 0x00);
    b(ESC, 0x45, 0x00);

   if (restConfig?.subtitulo) { txt(`- ${restConfig.subtitulo} -`); lf(); }
    lf();
if (restConfig?.telefone) { txt(restConfig.telefone); lf(); }
    lf();

    // ── DIVISOR GROSSO ─────────────────────────────
    b(ESC, 0x61, 0x00); // esquerda
    lineEq();

    // ── DADOS DO PEDIDO ────────────────────────────
    b(ESC, 0x45, 0x01);
    const tipoLabel = isDelivery ? '[DELIVERY]' : '[RETIRADA]';
    const pedidoStr = `Pedido #${order.order_number || ''}`;
    const espacoPedido = 48 - pedidoStr.length - tipoLabel.length;
    txt(pedidoStr + ' '.repeat(Math.max(1, espacoPedido)) + tipoLabel); lf();
    b(ESC, 0x45, 0x00);

    txt(`Cliente : ${order.client_name || ''}`); lf();
txt(`Horario : ${horario}`); lf();
if (isDelivery && order.address) { txt(`Endereco: ${order.address}`); lf(); }
if (order.payment_method)        { txt(`Pagament: ${order.payment_method}`); lf(); }
if (order.client_phone)          { txt(`Telefone: ${order.client_phone}`); lf(); }

    
    // ── DIVISOR FINO ───────────────────────────────
    lineDash();

    // ── CABEÇALHO DOS ITENS ────────────────────────
    b(ESC, 0x45, 0x01);
    txt('ITEM                              QTD    VALOR'); lf();
    b(ESC, 0x45, 0x00);

    lineDash();

    // ── ITENS ──────────────────────────────────────
    for (const it of itensComPreco) {
      const nome  = it.nome.substring(0, 32).padEnd(32);
      const qty   = String(it.qty).padStart(5);
      const valor = `R$${(it.preco * it.qty).toFixed(2)}`.padStart(9);
      txt(`${nome}${qty} ${valor}`); lf();
    }

    lineDash();

    // ── OBSERVAÇÕES ────────────────────────────────
    if (order.notes) {
      lf();
      b(ESC, 0x45, 0x01); txt('Obs:'); lf(); b(ESC, 0x45, 0x00);
      txt(order.notes); lf();
      lf();
    }

    // ── TOTAL ──────────────────────────────────────
    lineEq();
    b(ESC, 0x45, 0x01);
    b(GS, 0x21, 0x01);
    const totalLabel = 'TOTAL:';
    const totalValor = `R$ ${totalFinal.toFixed(2)}`;
    const espacoTotal = 48 - totalLabel.length - totalValor.length;
    txt(totalLabel + ' '.repeat(Math.max(1, espacoTotal)) + totalValor); lf();
    b(GS, 0x21, 0x00);
    b(ESC, 0x45, 0x00);
    lineEq();

    // ── RODAPÉ ─────────────────────────────────────
    lf();
    b(ESC, 0x61, 0x01); // centralizar
    txt('Obrigado pela preferencia!'); lf();
    txt('Volte sempre :)'); lf();
    lf();
    txt('* * * * * * * * * * * * * * * * * * * *'); lf();
    lf();
    if (restConfig?.instagram) {
  txt('Siga-nos no Instagram:'); lf();
  b(ESC, 0x45, 0x01);
  txt(`${restConfig.instagram}`); lf();
  b(ESC, 0x45, 0x00);
  lf();
}
txt('Feito com FlowON'); lf();
lf();

    // ── CORTE ──────────────────────────────────────
    b(GS, 0x56, 0x41, 0x06);

    const rawBuffer = Buffer.from(bytes);

    const response = await fetch("https://api.printnode.com/printjobs", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${apiKey}:`).toString("base64"),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        printerId: parseInt(printerId),
        title: `Pedido #${order.order_number}`,
        contentType: "raw_base64",
        content: rawBuffer.toString("base64"),
        source: "FluxON"
      })
    });

    const result = await response.json();
    console.log(`🖨️ Pedido #${order.order_number} impresso:`, result);
    return true;
  } catch (err) {
    console.error("⚠️ Erro ao imprimir:", err.message);
    return false;
  }
}

// POST - Testa impressão
app.post("/api/v1/restaurante/:restaurant_id/impressora/teste", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const data = await getIntegracao(restaurant_id, "printnode");
if (!data?.printnode_api_key || !data?.printnode_printer_id)
  return sendError(res, 400, "Impressora não configurada");

    const testOrder = {
      order_number: "TESTE",
      client_name: "Teste FluxON",
      service_type: "local",
      itens: [{ quantity: 1, name: "Item Teste", price: 10.00 }],
      total_price: 10.00,
      notes: "Impressão de teste"
    };

    const success = await printOrder(testOrder, data.printnode_api_key, data.printnode_printer_id);
    return res.json({ success, message: success ? "Teste enviado!" : "Falha ao imprimir" });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// POST - Imprime pedido manualmente pelo operador
app.post("/api/v1/restaurante/:restaurant_id/imprimir-pedido", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { order_id } = req.body;

    if (!order_id) return sendError(res, 400, "order_id é obrigatório");

   const config = await getIntegracao(restaurant_id, "printnode");
if (!config?.printnode_api_key || !config?.printnode_printer_id)
  return sendError(res, 400, "Impressora não configurada");

    // Busca os dados do pedido
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order)
      return sendError(res, 404, "Pedido não encontrado");

    // Usa a função printOrder que já gera o cupom corretamente
    const success = await printOrder(order, config.printnode_api_key, config.printnode_printer_id);

    if (!success) return sendError(res, 500, "Erro ao enviar para impressora");

    return res.json({ success: true });

  } catch (err) {
    console.error("❌ Erro em /imprimir-pedido:", err);
    return sendError(res, 500, "Erro interno ao imprimir");
  }
});

app.patch("/api/v1/pedidos/:id/payment", async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method } = req.body;

    if (!payment_method) return sendError(res, 400, "payment_method é obrigatório");

    const { data, error } = await supabase
      .from("orders")
      .update({ payment_method, update_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) return sendError(res, 500, "Erro ao atualizar pagamento");
    emitOrderUpdate(data.restaurant_id, data.order);

    return res.json({ success: true, order: data });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

/* ========================================
   ⭐ FIDELIZAÇÃO
======================================== */

// Lista prêmios do restaurante
app.get("/api/v1/fidelidade/:restaurant_id/premios", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { data, error } = await supabase
      .from("premios_fidelidade")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .eq("ativo", true)
      .order("pontos_necessarios");
    if (error) return sendError(res, 500, "Erro ao buscar prêmios");
    return res.json(data || []);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// Cria prêmio
app.post("/api/v1/fidelidade/premios", async (req, res) => {
  try {
    const { restaurant_id, nome, descricao, pontos_necessarios } = req.body;
    if (!restaurant_id || !nome || !pontos_necessarios)
      return sendError(res, 400, "Campos obrigatórios: restaurant_id, nome, pontos_necessarios");
    const { data, error } = await supabase
      .from("premios_fidelidade")
      .insert([{ restaurant_id, nome, descricao, pontos_necessarios, ativo: true }])
      .select().single();
    if (error) return sendError(res, 500, "Erro ao criar prêmio");
    return res.status(201).json(data);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// Edita prêmio
app.patch("/api/v1/fidelidade/premios/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("premios_fidelidade")
      .update(req.body)
      .eq("id", id)
      .select().single();
    if (error) return sendError(res, 500, "Erro ao atualizar prêmio");
    return res.json(data);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// Deleta prêmio
app.delete("/api/v1/fidelidade/premios/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("premios_fidelidade").delete().eq("id", id);
    if (error) return sendError(res, 500, "Erro ao deletar prêmio");
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// Lista clientes com pontos (admin)
app.get("/api/v1/fidelidade/:restaurant_id/clientes", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { data, error } = await supabase
      .from("base_clientes")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .eq("Status", "ATIVO")
      .order("pontos", { ascending: false });
    if (error) return sendError(res, 500, "Erro ao buscar clientes");
    return res.json(data || []);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// Cliente busca dados pelo token
app.get("/api/v1/fidelidade/cliente/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { data: cliente, error } = await supabase
      .from("base_clientes")
      .select("*")
      .eq("token_fidelidade", token)
      .single();
    if (error || !cliente) return sendError(res, 404, "Cliente não encontrado");

    const { data: premios } = await supabase
      .from("premios_fidelidade")
      .select("*")
      .eq("restaurant_id", cliente.restaurant_id)
      .eq("ativo", true)
      .order("pontos_necessarios");

    const phoneNormalizado = normalizePhone(cliente.numero);

    const { data: resgates } = await supabase
      .from("orders")
      .select("id, order_number, itens, created_at, status")
      .eq("restaurant_id", cliente.restaurant_id)
      .eq("client_phone", phoneNormalizado)
      .eq("origin", "fidelidade")
      .order("created_at", { ascending: false })
      .limit(10);

    return res.json({
      cliente: {
        nome: cliente.nome,
        pontos: cliente.pontos,
        pontos_resgatados: cliente.pontos_resgatados,
        token: cliente.token_fidelidade,
        restaurant_id: cliente.restaurant_id
      },
      premios: premios || [],
      resgates: resgates || []
    });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// POST - Resgate de fidelidade
app.post("/api/v1/fidelidade/resgatar", async (req, res) => {
  try {
    const { token, itens, service_type, address } = req.body;
    if (!token || !itens || !Array.isArray(itens) || itens.length === 0)
      return sendError(res, 400, "token e itens são obrigatórios");

    const { data: cliente } = await supabase
      .from("base_clientes")
      .select("*")
      .eq("token_fidelidade", token)
      .single();
    if (!cliente) return sendError(res, 404, "Cliente não encontrado");

    const premiosCarrinho = [];
    let totalPontos = 0;

    for (const item of itens) {
      const { data: premio } = await supabase
        .from("premios_fidelidade")
        .select("*")
        .eq("id", item.premio_id)
        .single();
      if (!premio) return sendError(res, 404, `Prêmio ${item.premio_id} não encontrado`);
      premiosCarrinho.push({ ...premio, quantidade: item.quantidade || 1 });
      totalPontos += premio.pontos_necessarios * (item.quantidade || 1);
    }

    if (cliente.pontos < totalPontos)
      return sendError(res, 400, "Pontos insuficientes");

    const { data: last } = await supabase
      .from("orders")
      .select("order_number")
      .eq("restaurant_id", cliente.restaurant_id)
      .order("order_number", { ascending: false })
      .limit(1);
    const nextNumber = last && last.length > 0 ? Number(last[0].order_number) + 1 : 1;

    const now = new Date().toISOString();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([{
        restaurant_id: cliente.restaurant_id,
        client_name: cliente.nome,
        client_phone: cliente.numero,
        order_number: nextNumber,
        itens: premiosCarrinho.map(p => ({ name: p.nome, qty: p.quantidade, price: 0 })),
        notes: `🎁 Resgate de fidelidade — ${totalPontos} pontos`,
        status: "pending",
        service_type: service_type || "local",
        address: address || null,
        total_price: 0,
        origin: "fidelidade",
        created_at: now,
        update_at: now
      }])
      .select().single();

    if (orderError) return sendError(res, 500, "Erro ao criar pedido de resgate");

    await supabase
      .from("base_clientes")
      .update({
        pontos: cliente.pontos - totalPontos,
        pontos_resgatados: (cliente.pontos_resgatados || 0) + totalPontos
      })
      .eq("id", cliente.id);

    try {
      const { data: printerConfig } = await supabase
        .from("restaurants")
        .select("printnode_api_key, printnode_printer_id")
        .eq("id", cliente.restaurant_id)
        .single();

      if (printerConfig?.printnode_api_key && printerConfig?.printnode_printer_id) {
        setTimeout(async () => {
          try {
            const { data: freshOrder } = await supabase
              .from("orders")
              .select("*")
              .eq("id", order.id)
              .single();

            if (freshOrder && freshOrder.status !== "cancelled" && freshOrder.status !== "canceled") {
              await printOrder(freshOrder, printerConfig.printnode_api_key, printerConfig.printnode_printer_id);
              console.log(`🖨️ Auto-impressão do pedido #${freshOrder.order_number}`);
            }
          } catch (printErr) {
            console.error("⚠️ Erro na auto-impressão:", printErr.message);
          }
        }, 60 * 1000);
      }
    } catch (printErr) {
      console.error("⚠️ Erro ao agendar impressão:", printErr.message);
    }

    return res.status(201).json({ success: true, order });
  } catch (err) {
    console.error("❌ Erro em /api/v1/fidelidade/resgatar:", err);
    return sendError(res, 500, "Erro interno no servidor");
  }
});

// ===== INTEGRAÇÕES =====

// GET - Busca integração por tipo
app.get("/api/v1/restaurante/:restaurant_id/integracao/:tipo", async (req, res) => {
  try {
    const { restaurant_id, tipo } = req.params;
    const { data, error } = await supabase
      .from("integracoes")
      .select("dados, ativo")
      .eq("restaurant_id", restaurant_id)
      .eq("tipo", tipo)
      .single();
    if (error || !data) return res.json({ configurado: false });
    
    // Nunca retorna tokens/secrets para o frontend
    const dadosSeguros = {};
    Object.keys(data.dados).forEach(key => {
      const camposSensiveis = ["access_token", "client_secret", "token", "merchant_key", "api_key"];
      const isSensivel = camposSensiveis.some(s => key.includes(s));
      dadosSeguros[key] = isSensivel ? "configurado" : data.dados[key];
    });

    return res.json({ configurado: true, ativo: data.ativo, dados: dadosSeguros });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// PATCH - Salva ou atualiza integração
app.patch("/api/v1/restaurante/:restaurant_id/integracao/:tipo", async (req, res) => {
  try {
    const { restaurant_id, tipo } = req.params;
    const { dados, ativo } = req.body;
    if (!dados) return sendError(res, 400, "dados são obrigatórios");

    // Verifica se já existe
    const { data: existing } = await supabase
      .from("integracoes")
      .select("id, dados")
      .eq("restaurant_id", restaurant_id)
      .eq("tipo", tipo)
      .single();

    if (existing) {
      // Merge dos dados — não sobrescreve campos que vieram como "configurado"
      const dadosMerge = { ...existing.dados };
      Object.keys(dados).forEach(key => {
        if (dados[key] !== "configurado" && dados[key] !== "") {
          dadosMerge[key] = dados[key];
        }
      });

      const { error } = await supabase
        .from("integracoes")
        .update({ dados: dadosMerge, ativo: ativo ?? true, updated_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (error) return sendError(res, 500, "Erro ao atualizar integração");
    } else {
      const { error } = await supabase
        .from("integracoes")
        .insert([{ restaurant_id, tipo, dados, ativo: ativo ?? true }]);

      if (error) return sendError(res, 500, "Erro ao criar integração");
    }

    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// DELETE - Remove integração
app.delete("/api/v1/restaurante/:restaurant_id/integracao/:tipo", async (req, res) => {
  try {
    const { restaurant_id, tipo } = req.params;
    const { error } = await supabase
      .from("integracoes")
      .delete()
      .eq("restaurant_id", restaurant_id)
      .eq("tipo", tipo);
    if (error) return sendError(res, 500, "Erro ao remover integração");
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// ===== MARKETPLACE =====
app.get("/api/v1/restaurante/:restaurant_id/marketplace", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const ifood = await getIntegracao(restaurant_id, "ifood");
    const aiqfome = await getIntegracao(restaurant_id, "aiqfome");
    return res.json({
      ifood_api_key: ifood?.api_key ? "configurado" : "",
      aiqfome_api_key: aiqfome?.api_key ? "configurado" : ""
    });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

app.post("/api/v1/restaurante/:restaurant_id/marketplace", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { platform, api_key } = req.body;
    if (!platform || !api_key) return sendError(res, 400, "platform e api_key são obrigatórios");
    const allowedPlatforms = ["ifood", "aiqfome"];
    if (!allowedPlatforms.includes(platform)) return sendError(res, 400, "platform inválido");
    await supabase.from("integracoes").upsert({
      restaurant_id, tipo: platform, dados: { api_key }, ativo: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "restaurant_id,tipo" });
    return res.json({ success: true, platform });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// GET - Busca config Mercado Pago
app.get("/api/v1/restaurante/:restaurant_id/mp", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { data, error } = await supabase
      .from("restaurants")
      .select("mp_access_token, mp_device_id")
      .eq("id", restaurant_id)
      .single();
    if (error || !data) return sendError(res, 404, "Restaurante não encontrado");
    return res.json({
      mp_access_token: data.mp_access_token ? "configurado" : "",
      mp_device_id: data.mp_device_id || ""
    });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// PATCH - Salva config Mercado Pago
app.patch("/api/v1/restaurante/:restaurant_id/mp", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { mp_access_token, mp_device_id } = req.body;
    if (!mp_access_token || !mp_device_id) 
      return sendError(res, 400, "Access Token e Device ID são obrigatórios");
    const { error } = await supabase
      .from("restaurants")
      .update({ mp_access_token, mp_device_id })
      .eq("id", restaurant_id);
    if (error) return sendError(res, 500, "Erro ao salvar configuração");
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// POST - Cria intenção de pagamento na maquininha
app.post("/api/v1/restaurante/:restaurant_id/mp/cobrar", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { order_id, valor } = req.body;

    if (!order_id || !valor) 
      return sendError(res, 400, "order_id e valor são obrigatórios");

    const config = await getIntegracao(restaurant_id, "maquininha");
    if (!config?.mp_access_token || !config?.mp_device_id)
      return sendError(res, 400, "Mercado Pago não configurado");

    const mpResp = await fetch(
      `https://api.mercadopago.com/point/integration-api/devices/${config.mp_device_id}/payment-intents`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.mp_access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: Math.round(valor * 100),
          additional_info: {
            external_reference: order_id,
            print_on_terminal: true
          }
        })
      }
    );

    const mpData = await mpResp.json();

    if (!mpResp.ok) {
      console.error("❌ Erro MP:", mpData);
      return sendError(res, 500, mpData.message || "Erro ao criar cobrança");
    }

    // Salva o payment_intent_id no pedido para conferir no webhook
    await supabase
      .from("orders")
      .update({ mp_payment_intent_id: mpData.id })
      .eq("id", order_id);

    console.log(`💳 Cobrança criada: ${mpData.id} para pedido ${order_id}`);
    return res.json({ success: true, payment_intent_id: mpData.id });

  } catch (err) {
    console.error("❌ Erro em /mp/cobrar:", err);
    return sendError(res, 500, "Erro interno");
  }
});

app.post("/api/v1/restaurante/:restaurant_id/mp/ativar-pdv", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const config = await getIntegracao(restaurant_id, "maquininha");
    if (!config?.mp_access_token || !config?.mp_device_id)
      return sendError(res, 400, "Maquininha não configurada");

    const mpResp = await fetch(
      `https://api.mercadopago.com/point/integration-api/devices/${config.mp_device_id}`,
      {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${config.mp_access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ operating_mode: "PDV" })
      }
    );

    const data = await mpResp.json();
    console.log("🔧 Ativar PDV:", data);
    return res.json({ success: mpResp.ok, data });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// DELETE - Cancela intenção de pagamento pendente
app.delete("/api/v1/restaurante/:restaurant_id/mp/cancelar-intent/:intent_id", async (req, res) => {
  try {
    const { restaurant_id, intent_id } = req.params;
    const config = await getIntegracao(restaurant_id, "maquininha");
    if (!config?.mp_access_token)
      return sendError(res, 400, "Maquininha não configurada");

    const mpResp = await fetch(
      `https://api.mercadopago.com/point/integration-api/devices/${config.mp_device_id}/payment-intents/${intent_id}`,
      {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${config.mp_access_token}`
        }
      }
    );

    const data = await mpResp.json();
    console.log("🗑️ Cancelar intent:", data);
    return res.json({ success: mpResp.ok, data });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// GET - Lista intenções pendentes do device
app.get("/api/v1/restaurante/:restaurant_id/mp/intent-atual", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const config = await getIntegracao(restaurant_id, "maquininha");
    if (!config?.mp_access_token || !config?.mp_device_id)
      return sendError(res, 400, "Maquininha não configurada");

    const mpResp = await fetch(
      `https://api.mercadopago.com/point/integration-api/devices/${config.mp_device_id}/payment-intents`,
      {
        headers: {
          "Authorization": `Bearer ${config.mp_access_token}`
        }
      }
    );

    const data = await mpResp.json();
    console.log("🔍 Intent atual:", data);
    return res.json({ success: mpResp.ok, data });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// POST - Webhook do Mercado Pago
app.post("/api/v1/mp/webhook", async (req, res) => {
  try {
    console.log("📩 Webhook MP recebido!");
    console.log("📩 Headers:", JSON.stringify(req.headers));
    console.log("📩 Body:", JSON.stringify(req.body));
    console.log("📩 Query:", JSON.stringify(req.query));
    
    const type = req.body.type || req.body.action || req.query.type;
    const type = req.body.type || req.body.action || req.query.type;
const dataId = req.body?.data?.id || req.body?.data_id || req.query?.["data.id"] || req.query?.data_id;
    
    console.log("📩 Type:", type, "| Data ID:", dataId);
    
    if (!type || !dataId) {
      console.log("⚠️ Webhook sem type ou data_id, ignorando");
      return res.sendStatus(200);
    }

    if (type !== "payment_intent") return res.sendStatus(200);

    const paymentIntentId = data?.id;
    if (!paymentIntentId) return res.sendStatus(200);

    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("mp_payment_intent_id", paymentIntentId)
      .single();

    if (error || !order) {
      console.warn("⚠️ Pedido não encontrado para payment_intent:", paymentIntentId);
      return res.sendStatus(200);
    }

    const config = await getIntegracao(order.restaurant_id, "maquininha");

const statusResp = await fetch(
  `https://api.mercadopago.com/point/integration-api/payment-intents/${paymentIntentId}`,
  {
    headers: { "Authorization": `Bearer ${config.mp_access_token}` }
  }
);

    const statusData = await statusResp.json();
    console.log("💳 Status MP:", statusData.state);

    if (statusData.state === "FINISHED") {
      const now = new Date().toISOString();
      const { data: updated } = await supabase
        .from("orders")
        .update({
          status: "finished",
          payment_method: statusData.payment?.type || "maquininha",
          delivered_at: now,
          update_at: now
        })
        .eq("id", order.id)
        .select()
        .single();

      if (updated) {
        emitOrderUpdate(order.restaurant_id, updated);
        console.log(`✅ Pedido ${order.order_number} finalizado via MP`);
      }

    } else if (statusData.state === "CANCELED" || statusData.state === "ERROR") {
      const now = new Date().toISOString();
      const { data: updated } = await supabase
        .from("orders")
        .update({
          status: "cancelled",
          update_at: now
        })
        .eq("id", order.id)
        .select()
        .single();

      if (updated) {
        emitOrderUpdate(order.restaurant_id, updated);
        console.log(`❌ Pedido ${order.order_number} cancelado via MP`);
      }
    }

    return res.sendStatus(200);

  } catch (err) {
    console.error("❌ Erro no webhook MP:", err);
    return res.sendStatus(500);
  }
});

// ===== WEBHOOK SATISFAÇÃO =====
async function dispararWebhookSatisfacao(order) {
  try {
    const webhookConfig = await getIntegracao(order.restaurant_id, "webhook_satisfaction");
const webhookUrl = webhookConfig?.webhook_url;
    if (!webhookUrl) return;

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: order.id,
        order_number: order.order_number,
        client_name: order.client_name,
        client_phone: order.client_phone,
        total_price: order.total_price,
        itens: order.itens,
        finished_at: order.delivered_at,
        triggered_at: new Date().toISOString()
      })
    });

    console.log(`✅ Webhook satisfação disparado para pedido #${order.order_number}`);
  } catch (err) {
    console.error(`❌ Erro ao disparar webhook satisfação:`, err.message);
  }
}

app.get("/api/v1/restaurante/:restaurant_id/webhook-satisfaction", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const dados = await getIntegracao(restaurant_id, "webhook_satisfaction");
return res.json({ success: true, webhook_url: dados?.webhook_url || "" });
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

app.post("/api/v1/restaurante/:restaurant_id/webhook-satisfaction", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const { webhook_url } = req.body;

   await supabase.from("integracoes").upsert({
  restaurant_id, tipo: "webhook_satisfaction",
  dados: { webhook_url: webhook_url || null }, ativo: true,
  updated_at: new Date().toISOString()
}, { onConflict: "restaurant_id,tipo" });
return res.json({ success: true });
    
  } catch (err) {
    return sendError(res, 500, "Erro interno");
  }
});

// ===== HEALTH CHECK =====
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "4.0.0-dashboard-completo"
  });
});

// ===== ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error("❌ Erro:", err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

// ===== 404 — SEMPRE O ÚLTIMO MIDDLEWARE =====
app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 Fluxon Backend v4.0 DASHBOARD COMPLETO em http://${HOST}:${PORT}`);
  console.log(`✅ COM origin (IA/PDV/Balcão)`);
  console.log(`✅ SEM tracking_id`);
  console.log(`✅ Métricas avançadas: comparação, IA, clientes, status`);
  console.log(`✅ Timeline com datas dinâmicas - último ponto sempre HOJE`);
});
