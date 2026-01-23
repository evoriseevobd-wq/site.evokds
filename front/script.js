// ===== CONFIG =====
const GOOGLE_CLIENT_ID =
  "872848052437-nl3lru9m1jhmfobk0imbpb2o9uk47mqi.apps.googleusercontent.com";

const API_BASE = "https://kds-backend.dahead.easypanel.host";
const API_URL = `${API_BASE}/orders`;
const AUTH_URL = `${API_BASE}/auth/google`;

// 🔹 CRM
const CRM_URL = `${API_BASE}/crm`;

// 🔹 NOVAS ROTAS V1 (ROI E DEMANDA) - AGREGADO
const METRICS_URL = `${API_BASE}/api/v1/metrics`;
const FORECAST_URL = `${API_BASE}/api/v1/demand-forecast`;

// ===== STATUS MAP =====
const STATUS_TO_BACKEND = {
  recebido: "pending",
  preparo: "preparing",
  pronto: "mounting",
  caminho: "delivering",
  finalizado: "finished",
  cancelado: "canceled",
};

const STATUS_FROM_BACKEND = {
  pending: "recebido",
  preparing: "preparo",
  mounting: "pronto",
  delivering: "caminho",
  finished: "finalizado",
  cancelled: "cancelado",
  canceled: "cancelado",
};

const views = {
  ativos: ["recebido", "preparo", "pronto"],
  finalizados: ["finalizado"],
  cancelados: ["cancelado"],
  entregas: ["caminho"],
};

// ===== ELEMENTS =====
const loginScreen = document.getElementById("login-screen");
const board = document.getElementById("board");

// Views
const crmView = document.getElementById("crm-view");
const resultsView = document.getElementById("results-view");

// Drawer
const drawer = document.getElementById("drawer");
const openDrawerBtn = document.getElementById("open-drawer");
const closeDrawerBtn = document.getElementById("close-drawer");
const drawerBackdrop = document.getElementById("drawer-backdrop");

const drawerOrdersBtn = document.getElementById("drawer-orders");
const drawerCrmBtn = document.getElementById("drawer-crm");
const drawerResultsBtn = document.getElementById("drawer-results");

// Back buttons
const crmBackBtn = document.getElementById("crm-back-btn");
const resultsBackBtn = document.getElementById("results-back-btn");

// CRM content
const crmContent = crmView?.querySelector(".crm-content") || null;

// Results IDs (mantidos para compatibilidade com seu HTML atual)
const resultTotalOrdersEl = document.getElementById("result-total-orders");
const resultUniqueClientsEl = document.getElementById("result-unique-clients");
const resultDeliveryOrdersEl = document.getElementById("result-delivery-orders");
const resultLocalOrdersEl = document.getElementById("result-local-orders");

// Tabs
const tabAtivos = document.getElementById("tab-ativos");
const tabFinalizados = document.getElementById("tab-finalizados");
const tabCancelados = document.getElementById("tab-cancelados");
const tabEntregas = document.getElementById("tab-entregas");

// Columns (column-body)
const columns = {
  recebido: document.getElementById("col-recebido"),
  preparo: document.getElementById("col-preparo"),
  pronto: document.getElementById("col-pronto"),
  caminho: document.getElementById("col-caminho"),
  finalizado: document.getElementById("col-finalizado"),
  cancelado: document.getElementById("col-cancelado"),
};

// User chip
const userChip = document.getElementById("user-chip");
const userNameEl = document.getElementById("user-name");
const userAvatar = document.getElementById("user-avatar");
const logoutBtn = document.getElementById("logout-btn");

// Unauthorized modal
const unauthorizedModal = document.getElementById("unauthorized-modal");
const unauthClose = document.getElementById("unauth-close");

// ===== ORDER MODAL (IDs do seu index.html) =====
const modalBackdrop = document.getElementById("modal");
const closeModalBtn = document.getElementById("close-modal");
const closeModalSecondaryBtn = document.getElementById("close-modal-secondary");

const modalId = document.getElementById("modal-id");
const modalCustomer = document.getElementById("modal-customer");
const modalTime = document.getElementById("modal-time");

const modalPhoneRow = document.getElementById("modal-phone-row");
const modalPhone = document.getElementById("modal-phone");

const modalAddressRow = document.getElementById("modal-address-row");
const modalAddress = document.getElementById("modal-address");

const modalPaymentRow = document.getElementById("modal-payment-row");
const modalPayment = document.getElementById("modal-payment");

const modalItems = document.getElementById("modal-items");
const modalNotes = document.getElementById("modal-notes");

const modalPrevBtn = document.getElementById("modal-prev");
const modalCancelBtn = document.getElementById("modal-cancel");
const modalNextBtn = document.getElementById("modal-next");

// ===== CREATE MODAL (IDs do seu index.html) =====
const createModal = document.getElementById("create-modal");
const openCreateBtn = document.getElementById("open-create");
const closeCreateBtn = document.getElementById("close-create");
const cancelCreateBtn = document.getElementById("cancel-create");
const saveCreateBtn = document.getElementById("save-create");

// Create fields
const newCustomer = document.getElementById("new-customer");
const newPhone = document.getElementById("new-phone");
const newItems = document.getElementById("new-items");
const newDelivery = document.getElementById("new-delivery");
const deliveryAddressWrap = document.getElementById("delivery-address-wrap");
const newAddress = document.getElementById("new-address");
const paymentWrap = document.getElementById("payment-wrap");
const newPayment = document.getElementById("new-payment");
const newNotes = document.getElementById("new-notes");

// Google button
const googleBtnContainer = document.getElementById("googleLoginBtn");

// ===== STATE =====
let currentView = "ativos";
let orders = [];
let activeOrderId = null;
let isFetching = false; // Trava para evitar polling duplicado

// 🔹 plano/features
let restaurantPlan = "basic";
let features = { crm: false, results: false, roi: false, forecast: false };

// CRM state
let crmClients = [];

// Results state (Executive)
const resultsState = {
  period: "7d",
  type: "all",
  uiReady: false,
};

// ===== HELPERS =====
function toFrontStatus(back) {
  const k = String(back || "").toLowerCase();
  return STATUS_FROM_BACKEND[k] || "recebido";
}

function toBackStatus(front) {
  const k = String(front || "").toLowerCase();
  return STATUS_TO_BACKEND[k] || "pending";
}

function formatTime(iso) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openBackdrop(el) {
  el?.classList.add("open");
}

function closeBackdrop(el) {
  el?.classList.remove("open");
}

function buildHeaders() {
  return { "Content-Type": "application/json" };
}

function getRestaurantId() {
  return localStorage.getItem("restaurant_id");
}

function normalizePhone(phone) {
  const p = String(phone || "").replace(/\D/g, "");
  return p || null;
}

// ===== FUNÇÕES DE CONTROLE DE PLANO (UNIFICADAS) =====
function canUseCRM(plan) {
  const p = plan.toLowerCase();
  return p === "pro" || p === "advanced" || p === "executive" || p === "custom";
}

function canUseResults(plan) {
  const p = plan.toLowerCase();
  return p === "advanced" || p === "executive" || p === "custom";
}

function canUseROI(plan) {
  const p = plan.toLowerCase();
  return p === "executive" || p === "custom";
}

function canUseForecast(plan) {
  const p = plan.toLowerCase();
  return p === "executive" || p === "custom";
}

function canUseOrders(plan) {
  return true;
}

function applyAccessUI() {
  const plan = restaurantPlan.toLowerCase();
  
  features.crm = canUseCRM(plan);
  features.results = canUseResults(plan);
  features.roi = canUseROI(plan);
  features.forecast = canUseForecast(plan);
  
  drawerCrmBtn?.classList.toggle("locked", !features.crm);
  drawerResultsBtn?.classList.toggle("locked", !features.results);
}

function closeDrawer() {
  drawer?.classList.remove("open");
  drawerBackdrop?.classList.remove("open");
}

// ===== TABS VISIBILITY =====
function findTabsContainer() {
  const a = tabAtivos;
  if (!a) return null;

  let el = a.parentElement;
  while (el && el !== document.body) {
    const hasAll =
      (!tabFinalizados || el.contains(tabFinalizados)) &&
      (!tabCancelados || el.contains(tabCancelados)) &&
      (!tabEntregas || el.contains(tabEntregas));
    if (hasAll) return el;
    el = el.parentElement;
  }

  return a.closest(".tabs") || document.querySelector(".tabs");
}

const tabsContainer = findTabsContainer();

function showTabsBar() {
  tabsContainer?.classList.remove("hidden");
}

function hideTabsBar() {
  tabsContainer?.classList.add("hidden");
}

// ===== UPGRADE MODAL =====
function showUpgradeModal(requiredPlan, featureName) {
  const existing = document.getElementById("upgrade-modal-backdrop");
  if (existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "upgrade-modal-backdrop";
  backdrop.className = "upgrade-modal-backdrop open";

  let featuresList = [];
  let planDisplay = "";
  
  if (requiredPlan === "pro") {
    planDisplay = "PRO ou ADVANCED";
    featuresList = [
      "CRM completo de clientes",
      "Histórico de pedidos por cliente",
      "Análise de frequência de compra",
      "Suporte prioritário"
    ];
  } else if (requiredPlan === "advanced") {
    planDisplay = "ADVANCED";
    featuresList = [
      "Relatórios executivos avançados",
      "Gráficos e insights detalhados",
      "Análise de picos e tendências",
      "Exportação de dados"
    ];
  } else if (requiredPlan === "executive") {
    planDisplay = "EXECUTIVE";
    featuresList = [
      "Cálculo de ROI em tempo real",
      "Previsão de demanda por IA",
      "Multiplicador de lucro",
      "Dashboard de inteligência financeira"
    ];
  }

  backdrop.innerHTML = `
    <div class="upgrade-modal">
      <div class="upgrade-icon">🔒</div>
      <h2>Recurso Bloqueado</h2>
      <p>O recurso <strong>${featureName}</strong> está disponível apenas nos planos <strong>${planDisplay}</strong>.</p>
      <div class="upgrade-features">
        ${featuresList.map(f => `<div class="upgrade-feature-item">✓ ${f}</div>`).join("")}
      </div>
      <div class="upgrade-actions">
        <button class="btn-upgrade-now" onclick="window.open('https://wa.me/5511999999999?text=Quero+fazer+upgrade+para+o+plano+${requiredPlan}', '_blank')">Fazer Upgrade Agora</button>
        <button class="btn-upgrade-close" onclick="document.getElementById('upgrade-modal-backdrop').remove()">Depois</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
}

// ===== NAVIGATION =====
function changeView(v) {
  currentView = v;
  
  tabAtivos?.classList.toggle("active", v === "ativos");
  tabFinalizados?.classList.toggle("active", v === "finalizados");
  tabCancelados?.classList.toggle("active", v === "cancelados");
  tabEntregas?.classList.toggle("active", v === "entregas");

  renderBoard();
}

function showBoard() {
  currentView = "ativos";
  crmView?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  board?.classList.remove("hidden");
  showTabsBar();
  closeDrawer();
  renderBoard();
}

function showCRM() {
  if (!features.crm) {
    showUpgradeModal("pro", "CRM de Clientes");
    return;
  }
  board?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  crmView?.classList.remove("hidden");
  hideTabsBar();
  closeDrawer();
  fetchCRM();
}

function showResults() {
  if (!features.results) {
    showUpgradeModal("advanced", "Módulo de Resultados");
    return;
  }
  board?.classList.add("hidden");
  crmView?.classList.add("hidden");
  resultsView?.classList.remove("hidden");
  hideTabsBar();
  closeDrawer();
  
  if (!resultsState.uiReady) {
    initResultsUI();
  }
  renderResultsExecutive();
}

// ===== CORE LOGIC =====
async function fetchOrders() {
  const rid = getRestaurantId();
  if (!rid || isFetching) return;

  isFetching = true;
  try {
    const resp = await fetch(`${API_URL}/${rid}`);
    if (!resp.ok) throw new Error("Erro ao buscar pedidos");
    
    const data = await resp.json();
    const newOrders = Array.isArray(data) ? data : [];

    // Preservar o estado local e atualizar apenas o necessário
    orders = newOrders.map((o) => ({
      ...o,
      _frontStatus: toFrontStatus(o.status),
    }));

    if (!crmView?.classList.contains("hidden")) {
      // Se estiver no CRM, não renderiza o board
    } else if (!resultsView?.classList.contains("hidden")) {
      renderResultsExecutive();
    } else {
      renderBoard();
    }
  } catch (e) {
    console.error("Polling Error:", e);
    // Exibir erro amigável se necessário
  } finally {
    isFetching = false;
  }
}

async function updateOrderStatus(orderId, newFrontStatus) {
  const backStatus = toBackStatus(newFrontStatus);
  try {
    const resp = await fetch(`${API_URL}/${orderId}/status`, {
      method: "PATCH",
      headers: buildHeaders(),
      body: JSON.stringify({ status: backStatus }),
    });

    if (!resp.ok) throw new Error("Erro ao atualizar status");

    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx !== -1) {
      orders[idx].status = backStatus;
      orders[idx]._frontStatus = newFrontStatus;
    }
    renderBoard();
    if (activeOrderId === orderId) openOrderModal(orderId);
  } catch (e) {
    console.error(e);
    alert("Não foi possível atualizar o status do pedido.");
  }
}

function renderBoard() {
  if (!board || board.classList.contains("hidden")) return;

  Object.values(columns).forEach((c) => {
    if (c) c.innerHTML = "";
  });

  const visible = views[currentView];
  const filtered = orders.filter((o) => visible.includes(o._frontStatus));

  filtered.forEach((o) => {
    const card = buildOrderCard(o);
    const col = columns[o._frontStatus];
    col?.appendChild(card);
  });

  toggleNoOrdersBalloons();
}

function buildOrderCard(order) {
  const card = document.createElement("div");
  card.className = "order-card";
  card.dataset.id = order.id;

  const itemsCount = Array.isArray(order.itens) ? order.itens.length : 0;
  const isDelivery = String(order.service_type || "").toLowerCase() === "delivery";
  const paymentText = isDelivery && order.payment_method ? order.payment_method : "";

  card.innerHTML = `
    <div class="order-top">
      <div class="order-number">#${order.order_number || ""}</div>
      <div class="order-client">${escapeHtml(order.client_name || "Cliente")}</div>
    </div>
    <div class="order-meta">
      <div class="order-time">${formatTime(order.created_at)}</div>
      <div class="order-items">${itemsCount} item(ns)</div>
    </div>
    ${isDelivery ? `<div class="order-delivery-tag">Delivery</div>` : ""}
    ${paymentText ? `<div class="order-payment-tag">${escapeHtml(paymentText)}</div>` : ""}
  `;

  card.addEventListener("click", () => openOrderModal(order.id));
  return card;
}

function toggleNoOrdersBalloons() {
  Object.keys(columns).forEach((k) => {
    const col = columns[k];
    if (!col) return;
    const existing = col.querySelector(".empty-balloon");
    if (col.children.length === 0 && !existing) {
      const b = document.createElement("div");
      b.className = "empty-balloon";
      b.textContent = "Nenhum pedido aqui";
      col.appendChild(b);
    } else if (col.children.length > 1 && existing) {
      existing.remove();
    }
  });
}

// ===== MODAL =====
function openOrderModal(orderId) {
  const order = orders.find((o) => o.id === orderId);
  if (!order) return;

  activeOrderId = orderId;

  if (modalId) modalId.textContent = `#${order.order_number || ""}`;
  if (modalCustomer) modalCustomer.textContent = order.client_name || "Cliente";
  if (modalTime) modalTime.textContent = formatDateTime(order.created_at);

  const phone = normalizePhone(order.client_phone);
  if (modalPhoneRow && modalPhone) {
    const hasPhone = !!phone;
    modalPhoneRow.style.display = hasPhone ? "" : "none";
    modalPhone.textContent = hasPhone ? phone : "";
  }

  if (modalItems) {
    modalItems.innerHTML = "";
    const itens = Array.isArray(order.itens) ? order.itens : [];
    itens.forEach((it) => {
      const li = document.createElement("li");
      const name = it?.name || it?.nome || "Item";
      const qty = it?.qty || it?.quantidade || 1;
      li.textContent = qty > 1 ? `${name} x${qty}` : `${name}`;
      modalItems.appendChild(li);
    });
  }

  if (modalNotes) modalNotes.textContent = order.notes || "";

  const isDelivery = String(order.service_type || "").toLowerCase() === "delivery";

  if (modalAddressRow && modalAddress) {
    const showAddress = isDelivery && !!String(order.address || "").trim();
    modalAddressRow.style.display = showAddress ? "" : "none";
    modalAddress.textContent = showAddress ? String(order.address || "") : "";
  }

  if (modalPaymentRow && modalPayment) {
    const showPay = isDelivery && !!String(order.payment_method || "").trim();
    modalPaymentRow.style.display = showPay ? "" : "none";
    modalPayment.textContent = showPay ? String(order.payment_method || "") : "";
  }

  modalPrevBtn?.classList.toggle("hidden", ["cancelado", "finalizado", "recebido"].includes(currentView));
  modalCancelBtn?.classList.toggle("hidden", ["cancelado", "finalizado"].includes(currentView));

  if (modalNextBtn) {
    const s = getFrontStatus(orderId);
    const nextLabel =
      s === "recebido"
        ? "Ir para Preparo"
        : s === "preparo"
        ? "Ir para Pronto"
        : s === "pronto"
        ? (isDelivery ? "Enviar para entrega" : "Finalizar pedido")
        : s === "caminho"
        ? "Finalizar"
        : "OK";
    modalNextBtn.textContent = nextLabel;
    modalNextBtn.classList.toggle("hidden", s === "finalizado" || s === "cancelado");
  }

  openBackdrop(modalBackdrop);
}

function closeOrderModal() {
  activeOrderId = null;
  closeBackdrop(modalBackdrop);
}

function getFrontStatus(orderId) {
  const o = orders.find((x) => x.id === orderId);
  return o?._frontStatus || "recebido";
}

function advanceStatus(orderId) {
  const o = orders.find((x) => x.id === orderId);
  if (!o) return;
  
  const s = getFrontStatus(orderId);
  const isDelivery = String(o.service_type || "").toLowerCase() === "delivery";
  
  const seq = isDelivery 
    ? ["recebido", "preparo", "pronto", "caminho", "finalizado"]
    : ["recebido", "preparo", "pronto", "finalizado"];
  
  const i = seq.indexOf(s);
  if (i === -1 || i === seq.length - 1) return;
  updateOrderStatus(orderId, seq[i + 1]);
}

function regressStatus(orderId) {
  const o = orders.find((x) => x.id === orderId);
  if (!o) return;
  
  const s = getFrontStatus(orderId);
  const isDelivery = String(o.service_type || "").toLowerCase() === "delivery";
  
  const seq = isDelivery 
    ? ["recebido", "preparo", "pronto", "caminho", "finalizado"]
    : ["recebido", "preparo", "pronto", "finalizado"];
  
  const i = seq.indexOf(s);
  if (i <= 0) return;
  updateOrderStatus(orderId, seq[i - 1]);
}

function cancelOrder(orderId) {
  updateOrderStatus(orderId, "cancelado");
}

// ===== CREATE ORDER =====
function updateCreateDeliveryVisibility() {
  const isDelivery = !!newDelivery?.checked;
  deliveryAddressWrap?.classList.toggle("hidden", !isDelivery);
  paymentWrap?.classList.toggle("hidden", !isDelivery);
}

function openCreateModal() {
  openBackdrop(createModal);
  updateCreateDeliveryVisibility();
}

function closeCreateModal() {
  closeBackdrop(createModal);

  if (newCustomer) newCustomer.value = "";
  if (newPhone) newPhone.value = "";
  if (newItems) newItems.value = "";
  if (newNotes) newNotes.value = "";
  if (newAddress) newAddress.value = "";
  if (newPayment) newPayment.value = "";
  if (newDelivery) newDelivery.checked = false;

  updateCreateDeliveryVisibility();
}

function parseItems(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;

  try {
    const obj = JSON.parse(s);
    return Array.isArray(obj) ? obj : null;
  } catch {
    if (s.includes(",")) {
      const parts = s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      if (parts.length) return parts.map((name) => ({ name, qty: 1 }));
    }

    const lines = s
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    if (!lines.length) return null;

    return lines.map((ln) => {
      const m = ln.match(/(.+?)\s*x\s*(\d+)$/i);
      if (m) return { name: m[1].trim(), qty: Number(m[2]) };
      return { name: ln, qty: 1 };
    });
  }
}

async function saveNewOrder() {
  const rid = getRestaurantId();
  const client = String(newCustomer?.value || "").trim();
  const itens = parseItems(newItems?.value);

  const isDelivery = !!newDelivery?.checked;
  const service_type = isDelivery ? "delivery" : "local";
  const address = String(newAddress?.value || "").trim();
  const payment_method = String(newPayment?.value || "").trim();

  const phoneRaw = String(newPhone?.value || "").trim();
  const client_phone = phoneRaw ? phoneRaw : null;

  if (!rid || !client || !itens) {
    alert("Preencha cliente e itens.");
    return;
  }

  if (isDelivery && !address) {
    alert("Endereço é obrigatório para delivery.");
    return;
  }

  if (isDelivery && !payment_method) {
    alert("Forma de pagamento é obrigatória para delivery.");
    return;
  }

  try {
    const body = {
      restaurant_id: rid,
      client_name: client,
      client_phone,
      itens,
      notes: String(newNotes?.value || ""),
      service_type,
      address: isDelivery ? address : null,
      payment_method: isDelivery ? payment_method : null,
      // Preparado para receber total_price via PDV externo
      total_price: 0 
    };

    const resp = await fetch(API_URL, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || "Erro ao criar pedido");

    orders.push({ ...data, _frontStatus: toFrontStatus(data.status) });
    closeCreateModal();
    renderBoard();
  } catch (e) {
    console.error(e);
    alert("Erro ao criar pedido.");
  }
}

// ===== CRM =====
async function fetchCRM() {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return;

  try {
    const resp = await fetch(`${CRM_URL}/${restaurantId}`);
    const data = await resp.json().catch(() => []);

    if (!resp.ok) {
      alert(data?.error || "Erro ao carregar CRM");
      return;
    }

    crmClients = Array.isArray(data) ? data : [];
    renderCRM();
  } catch (e) {
    console.error("Erro CRM:", e);
    alert("Erro ao carregar CRM");
  }
}

function renderCRM() {
  if (!crmContent) return;

  crmContent.innerHTML = "";

  const table = document.createElement("table");
  table.className = "crm-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Cliente</th>
        <th>Telefone</th>
        <th>Pedidos</th>
        <th>Última compra</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  crmClients.forEach((c) => {
    const tr = document.createElement("tr");
    const phone = features.crm ? (c.client_phone || c.client_id || "—") : "🔒";

    tr.innerHTML = `
      <td>${escapeHtml(c.client_name || "Cliente")}</td>
      <td>${escapeHtml(phone)}</td>
      <td>${Number(c.orders || 0)}</td>
      <td>${escapeHtml(formatDateTime(c.last_order_at))}</td>
    `;
    tbody.appendChild(tr);
  });

  crmContent.appendChild(table);
}

// ===== RESULTS (Executive) =====
function getPeriodRange(p) {
  const now = new Date();
  const endMs = now.getTime();
  let startMs = endMs;
  let bucket = "day";
  let days = 7;

  if (p === "24h") {
    startMs = endMs - 24 * 60 * 60 * 1000;
    bucket = "hour";
    days = 1;
  } else if (p === "7d") {
    startMs = endMs - 7 * 24 * 60 * 60 * 1000;
    days = 7;
  } else if (p === "30d") {
    startMs = endMs - 30 * 24 * 60 * 60 * 1000;
    days = 30;
  }

  return { startMs, endMs, bucket, days };
}

function niceStep(max) {
  if (max <= 5) return 1;
  if (max <= 10) return 2;
  if (max <= 25) return 5;
  if (max <= 50) return 10;
  if (max <= 100) return 20;
  if (max <= 500) return 100;
  return Math.pow(10, Math.floor(Math.log10(max)));
}

function initResultsUI() {
  const container = resultsView;
  if (!container) return;

  container.innerHTML = "";

  const root = document.createElement("div");
  root.className = "results-container";
  root.innerHTML = `
    <div class="results-header">
      <div class="results-title-row">
        <h2>Inteligência Financeira</h2>
        <div class="results-filters">
          <select id="results-period" class="results-select">
            <option value="24h">Últimas 24h</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </select>
          <select id="results-type" class="results-select">
            <option value="all">Todos os tipos</option>
            <option value="delivery">Delivery</option>
            <option value="local">Local</option>
          </select>
        </div>
      </div>
    </div>

    <div id="roi-container" class="roi-card hidden">
      <div class="roi-header">
        <div class="roi-badge">EXECUTIVE</div>
        <h3>Retorno sobre Investimento (ROI)</h3>
      </div>
      <div class="roi-grid">
        <div class="roi-item">
          <div class="roi-label">Vendas Totais</div>
          <div id="roi-total-sales" class="roi-value">R$ 0,00</div>
        </div>
        <div class="roi-item">
          <div class="roi-label">Multiplicador de Lucro</div>
          <div id="roi-multiplier" class="roi-value">0x</div>
          <div class="roi-subtext">O software já se pagou!</div>
        </div>
        <div class="roi-item">
          <div class="roi-label">Receita via IA</div>
          <div id="roi-ia-revenue" class="roi-value">R$ 0,00</div>
        </div>
      </div>
    </div>

    <div id="demand-alert" class="demand-alert hidden">
      <div class="demand-icon">⚡</div>
      <div id="demand-message" class="demand-text">Alta demanda prevista para as próximas horas!</div>
    </div>

    <div class="results-grid">
      <div class="metric-card">
        <div class="metric-label">Total de Pedidos</div>
        <div class="metric-value" data-metric="total">0</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Clientes Únicos</div>
        <div class="metric-value" data-metric="unique">0</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Delivery</div>
        <div class="metric-value" data-metric="delivery">0</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Local</div>
        <div class="metric-value" data-metric="local">0</div>
      </div>
    </div>

    <div class="chart-section">
      <div class="chart-header">
        <h3>Volume de Pedidos</h3>
        <div class="chart-legend">
          <span class="legend-item"><i style="background: rgba(139,92,246,0.35)"></i> Total</span>
          <span class="legend-item"><i style="background: #fff"></i> Delivery</span>
          <span class="legend-item"><i style="background: #22c55e"></i> Local</span>
        </div>
      </div>
      <div class="chart-wrapper">
        <svg id="results-chart-svg" viewBox="0 0 1000 320" preserveAspectRatio="none"></svg>
      </div>
    </div>

    <div class="insights-section">
      <h3>Insights do Período</h3>
      <div class="insights-grid">
        <div class="insight-card">
          <div class="insight-label">Crescimento</div>
          <div class="insight-value" data-insight="deltaTotal">0%</div>
          <div class="insight-note">vs período anterior</div>
        </div>

        <div class="insight-card">
          <div class="insight-label">Picos de Horário</div>
          <div class="insight-value" data-insight="peaks">—</div>
          <div class="insight-note" data-insight-note="peaks"></div>
        </div>

        <div class="insight-card">
          <div class="insight-label">Top itens</div>
          <div class="insight-value" data-insight="topItems">—</div>
          <div class="insight-note" data-insight-note="topItems"></div>
        </div>

        <div class="insight-card">
          <div class="insight-label">Cancelamentos</div>
          <div class="insight-value" data-insight="cancelRate">0%</div>
          <div class="insight-note" data-insight-note="cancelRate"></div>
        </div>
      </div>
    </div>
  `;

  container.appendChild(root);

  const periodSel = root.querySelector("#results-period");
  const typeSel = root.querySelector("#results-type");

  if (periodSel) {
    periodSel.value = resultsState.period;
    periodSel.addEventListener("change", () => {
      resultsState.period = periodSel.value;
      renderResultsExecutive();
    });
  }

  if (typeSel) {
    typeSel.value = resultsState.type;
    typeSel.addEventListener("change", () => {
      resultsState.type = typeSel.value;
      renderResultsExecutive();
    });
  }

  resultsState.uiReady = true;
}

function renderChartSVG(svg, range, series) {
  if (!svg) return;

  const W = 1000;
  const H = 320;
  const padL = 64;
  const padR = 18;
  const padT = 18;
  const padB = 56;

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxTotal = Math.max(1, ...series.total);
  const step = niceStep(maxTotal);
  const maxY = Math.ceil(maxTotal / step) * step;

  const y = (val) => padT + (1 - val / maxY) * plotH;
  const x = (i, n) => padL + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));

  const n = series.labels.length || 1;

  const parts = [];

  // Y Axis Ticks
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const val = (maxY * i) / ticks;
    const yy = y(val);
    parts.push(`<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="rgba(255,255,255,0.08)" />`);
    parts.push(
      `<text x="${padL - 10}" y="${yy + 4}" text-anchor="end" font-size="12" fill="rgba(255,255,255,0.6)">${Math.round(val)}</text>`
    );
  }

  // Bars (Total)
  const barW = Math.max(6, Math.min(26, plotW / Math.max(10, n)));
  for (let i = 0; i < n; i++) {
    const cx = x(i, n);
    const v = series.total[i] || 0;
    const yy = y(v);
    const hh = padT + plotH - yy;
    const bx = cx - barW / 2;
    parts.push(
      `<rect x="${bx}" y="${yy}" width="${barW}" height="${hh}" rx="6" ry="6" fill="rgba(139,92,246,0.35)" />`
    );
  }

  // Paths (Lines)
  function buildPath(values) {
    let d = "";
    for (let i = 0; i < n; i++) {
      const cx = x(i, n);
      const yy = y(values[i] || 0);
      d += i === 0 ? `M ${cx} ${yy}` : ` L ${cx} ${yy}`;
    }
    return d;
  }

  parts.push(
    `<path d="${buildPath(series.delivery)}" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="3" />`
  );

  parts.push(
    `<path d="${buildPath(series.local)}" fill="none" stroke="rgba(34,197,94,0.85)" stroke-width="3" />`
  );

  // X Axis Labels
  const labelEvery = range.bucket === "hour" ? 4 : Math.ceil(n / 7);
  for (let i = 0; i < n; i++) {
    if (i % Math.max(1, labelEvery) !== 0 && i !== n - 1) continue;
    const cx = x(i, n);
    const raw = series.labels[i];
    const text =
      range.bucket === "hour"
        ? `${raw}h`
        : (() => {
            const [yyyy, mm, dd] = String(raw).split("-");
            if (!dd) return raw;
            return `${dd}/${mm}`;
          })();
    parts.push(
      `<text x="${cx}" y="${H - 18}" text-anchor="middle" font-size="12" fill="rgba(255,255,255,0.6)">${text}</text>`
    );
  }

  svg.innerHTML = parts.join("");
}

function computePeaks(list) {
  const counts = new Array(24).fill(0);
  for (const o of list) {
    const d = new Date(o.created_at);
    const h = d.getHours();
    counts[h] = (counts[h] || 0) + 1;
  }
  const ranked = counts
    .map((v, h) => ({ h, v }))
    .sort((a, b) => b.v - a.v)
    .filter((x) => x.v > 0)
    .slice(0, 3);

  if (!ranked.length) return { text: "—", note: "Sem dados no período." };

  const text = ranked.map((x) => `${String(x.h).padStart(2, "0")}h`).join(" • ");
  const note = ranked.map((x) => `${String(x.h).padStart(2, "0")}h: ${x.v}`).join(" | ");
  return { text, note };
}

function computeTopItems(list) {
  const map = new Map();
  for (const o of list) {
    const itens = Array.isArray(o.itens) ? o.itens : [];
    for (const it of itens) {
      const name = String(it?.name || it?.nome || "").trim();
      if (!name) continue;
      const qty = Number(it?.qty || it?.quantidade || 1) || 1;
      map.set(name, (map.get(name) || 0) + qty);
    }
  }
  const top = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (!top.length) return { text: "—", note: "Sem itens no período." };

  const text = top.map(([n]) => n).slice(0, 2).join(" • ") + (top.length > 2 ? " • ..." : "");
  const note = top.map(([n, q]) => `${n} (${q})`).join(" | ");
  return { text, note };
}

async function renderResultsExecutive() {
  if (!resultsState.uiReady) return;

  const rid = getRestaurantId();
  if (!rid) return;

  const range = getPeriodRange(resultsState.period);
  const type = resultsState.type;

  // Filtragem local dos pedidos carregados
  const filtered = orders.filter((o) => {
    const ms = new Date(o.created_at).getTime();
    if (ms < range.startMs || ms > range.endMs) return false;
    if (type !== "all" && o.service_type !== type) return false;
    return true;
  });

  // Cálculo de ROI em Tempo Real (Executive)
  if (features.roi) {
    const roiCont = document.getElementById("roi-container");
    if (roiCont) {
      roiCont.classList.remove("hidden");
      
      // Soma total_price dos pedidos (considerando que o backend agora envia esse campo)
      const totalSales = filtered.reduce((acc, o) => acc + (Number(o.total_price) || 0), 0);
      const multiplier = totalSales / 4000;

      const salesEl = document.getElementById("roi-total-sales");
      const multEl = document.getElementById("roi-multiplier");
      
      if (salesEl) salesEl.textContent = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalSales);
      if (multEl) multEl.textContent = `ROI de ${multiplier.toFixed(1)}x`;
    }

    // IA Metrics (Opcional se o backend suportar)
    try {
      const roiResp = await fetch(`${METRICS_URL}/${rid}`);
      if (roiResp.ok) {
        const m = await roiResp.json();
        const revEl = document.getElementById("roi-ia-revenue");
        if (revEl) revEl.textContent = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(m.ia_revenue || 0);
      }
    } catch (e) { console.error("ROI API Error:", e); }

    // Demand Forecast
    try {
      const demandResp = await fetch(`${FORECAST_URL}/${rid}`);
      if (demandResp.ok) {
        const d = await demandResp.json();
        const alertBox = document.getElementById("demand-alert");
        if (alertBox) {
          alertBox.classList.toggle("hidden", !d.is_high_demand);
          const msgEl = document.getElementById("demand-message");
          if (msgEl) msgEl.textContent = d.alert_message;
        }
      }
    } catch (e) { console.error("Demand Error:", e); }
  }

  const prevRange = {
    startMs: range.startMs - (range.endMs - range.startMs),
    endMs: range.startMs,
  };
  const prevList = orders.filter((o) => {
    const ms = new Date(o.created_at).getTime();
    return ms >= prevRange.startMs && ms < prevRange.endMs;
  });

  // Métricas Básicas
  const metrics = {
    total: filtered.length,
    unique: new Set(filtered.map((o) => o.client_phone || o.client_name)).size,
    delivery: filtered.filter((o) => o.service_type === "delivery").length,
    local: filtered.filter((o) => o.service_type === "local").length,
  };

  // Atualiza cards
  document.querySelectorAll("[data-metric]").forEach((el) => {
    const k = el.dataset.metric;
    if (metrics[k] !== undefined) el.textContent = metrics[k];
  });

  // Insights
  const deltaTotal = prevList.length > 0 ? ((filtered.length - prevList.length) / prevList.length) * 100 : 0;
  const deltaEl = document.querySelector('[data-insight="deltaTotal"]');
  if (deltaEl) {
    deltaEl.textContent = `${deltaTotal > 0 ? "+" : ""}${Math.round(deltaTotal)}%`;
    deltaEl.style.color = deltaTotal >= 0 ? "#22c55e" : "#ef4444";
  }

  const peaks = computePeaks(filtered);
  const peaksEl = document.querySelector('[data-insight="peaks"]');
  if (peaksEl) peaksEl.textContent = peaks.text;
  const peaksNote = document.querySelector('[data-insight-note="peaks"]');
  if (peaksNote) peaksNote.textContent = peaks.note;

  const tops = computeTopItems(filtered);
  const topsEl = document.querySelector('[data-insight="topItems"]');
  if (topsEl) topsEl.textContent = tops.text;
  const topsNote = document.querySelector('[data-insight-note="topItems"]');
  if (topsNote) topsNote.textContent = tops.note;

  const cancels = filtered.filter((o) => o._frontStatus === "cancelado").length;
  const cancelRate = filtered.length > 0 ? (cancels / filtered.length) * 100 : 0;
  const cancelEl = document.querySelector('[data-insight="cancelRate"]');
  if (cancelEl) cancelEl.textContent = `${Math.round(cancelRate)}%`;

  // Gráfico
  const series = { labels: [], total: [], delivery: [], local: [] };
  if (range.bucket === "hour") {
    for (let h = 0; h < 24; h++) {
      series.labels.push(h);
      const hList = filtered.filter((o) => new Date(o.created_at).getHours() === h);
      series.total.push(hList.length);
      series.delivery.push(hList.filter((o) => o.service_type === "delivery").length);
      series.local.push(hList.filter((o) => o.service_type === "local").length);
    }
  } else {
    const days = range.days;
    for (let i = 0; i < days; i++) {
      const d = new Date(range.startMs + i * 24 * 60 * 60 * 1000);
      const iso = d.toISOString().split("T")[0];
      series.labels.push(iso);
      const dList = filtered.filter((o) => o.created_at?.startsWith(iso));
      series.total.push(dList.length);
      series.delivery.push(dList.filter((o) => o.service_type === "delivery").length);
      series.local.push(dList.filter((o) => o.service_type === "local").length);
    }
  }

  const svg = document.getElementById("results-chart-svg");
  renderChartSVG(svg, range, series);
}

// ===== AUTH & GOOGLE =====
function decodeJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(window.atob(base64));
  } catch (e) { return null; }
}

async function handleCredentialResponse(response) {
  const payload = decodeJwt(response.credential);
  if (!payload || !payload.email) return;

  try {
    const resp = await fetch(AUTH_URL, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ email: payload.email }),
    });

    const data = await resp.json();
    if (data.authorized && data.restaurant) {
      localStorage.setItem("restaurant_id", data.restaurant.id);
      localStorage.setItem("restaurant_name", data.restaurant.name);
      localStorage.setItem("restaurant_plan", data.restaurant.plan || "basic");
      localStorage.setItem("user_email", payload.email);
      localStorage.setItem("user_name", payload.name);
      localStorage.setItem("user_picture", payload.picture);

      location.reload();
    } else {
      openBackdrop(unauthorizedModal);
    }
  } catch (e) {
    console.error("Auth Error:", e);
    alert("Erro ao autenticar. Tente novamente.");
  }
}

function initGoogleLogin() {
  if (!googleBtnContainer) return;
  
  window.google?.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
  });

  window.google?.accounts.id.renderButton(googleBtnContainer, {
    theme: "outline",
    size: "large",
    width: 280,
  });
}

function logout() {
  localStorage.clear();
  location.reload();
}

// ===== INITIALIZATION =====
function init() {
  const rid = getRestaurantId();

  if (!rid) {
    loginScreen?.classList.remove("hidden");
    board?.classList.add("hidden");
    initGoogleLogin();
    return;
  }

  loginScreen?.classList.add("hidden");
  board?.classList.remove("hidden");

  restaurantPlan = localStorage.getItem("restaurant_plan") || "basic";
  applyAccessUI();

  // User UI
  if (userChip) {
    userChip.hidden = false;
    if (userNameEl) userNameEl.textContent = localStorage.getItem("user_name") || "Usuário";
    if (userAvatar) userAvatar.src = localStorage.getItem("user_picture") || "";
  }

  // Listeners
  openDrawerBtn?.addEventListener("click", () => {
    openBackdrop(drawer);
    openBackdrop(drawerBackdrop);
  });
  closeDrawerBtn?.addEventListener("click", closeDrawer);
  drawerBackdrop?.addEventListener("click", closeDrawer);

  drawerOrdersBtn?.addEventListener("click", showBoard);
  drawerCrmBtn?.addEventListener("click", showCRM);
  drawerResultsBtn?.addEventListener("click", showResults);

  crmBackBtn?.addEventListener("click", showBoard);
  resultsBackBtn?.addEventListener("click", showBoard);

  tabAtivos?.addEventListener("click", () => changeView("ativos"));
  tabFinalizados?.classList.add("tab-item"); // Garantir classe para estilo
  tabFinalizados?.addEventListener("click", () => changeView("finalizados"));
  tabCancelados?.addEventListener("click", () => changeView("cancelados"));
  tabEntregas?.addEventListener("click", () => changeView("entregas"));

  openCreateBtn?.addEventListener("click", openCreateModal);
  closeCreateBtn?.addEventListener("click", closeCreateModal);
  cancelCreateBtn?.addEventListener("click", closeCreateModal);
  saveCreateBtn?.addEventListener("click", saveNewOrder);
  newDelivery?.addEventListener("change", updateCreateDeliveryVisibility);

  closeModalBtn?.addEventListener("click", closeOrderModal);
  closeModalSecondaryBtn?.addEventListener("click", closeOrderModal);
  modalCancelBtn?.addEventListener("click", () => {
    if (activeOrderId && confirm("Deseja realmente cancelar este pedido?")) {
      cancelOrder(activeOrderId);
      closeOrderModal();
    }
  });
  modalPrevBtn?.addEventListener("click", () => activeOrderId && regressStatus(activeOrderId));
  modalNextBtn?.addEventListener("click", () => activeOrderId && advanceStatus(activeOrderId));

  logoutBtn?.addEventListener("click", logout);
  unauthClose?.addEventListener("click", () => closeBackdrop(unauthorizedModal));

  // Polling com tratamento de erro e trava de concorrência
  fetchOrders();
  setInterval(fetchOrders, 15000);
}

// Start
document.addEventListener("DOMContentLoaded", init);
