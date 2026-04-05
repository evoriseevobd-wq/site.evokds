// ===== CONFIG =====
const GOOGLE_CLIENT_ID =
  "872848052437-nl3lru9m1jhmfobk0imbpb2o9uk47mqi.apps.googleusercontent.com";

const API_BASE = "https://kds-backend.dahead.easypanel.host";
const API_URL = `${API_BASE}/orders`;
const AUTH_URL = `${API_BASE}/auth/google`;
const CRM_URL = `${API_BASE}/crm`;
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
const crmView = document.getElementById("crm-view");
const resultsView = document.getElementById("results-view");

const drawer = document.getElementById("drawer");
const openDrawerBtn = document.getElementById("open-drawer");
const closeDrawerBtn = document.getElementById("close-drawer");
const drawerBackdrop = document.getElementById("drawer-backdrop");

const drawerOrdersBtn = document.getElementById("drawer-orders");
const drawerCrmBtn = document.getElementById("drawer-crm");
const drawerResultsBtn = document.getElementById("drawer-results");

const crmBackBtn = document.getElementById("crm-back-btn");
const resultsBackBtn = document.getElementById("results-back-btn");

const crmContent = crmView?.querySelector(".crm-content") || null;

const tabAtivos = document.getElementById("tab-ativos");
const tabFinalizados = document.getElementById("tab-finalizados");
const tabCancelados = document.getElementById("tab-cancelados");
const tabEntregas = document.getElementById("tab-entregas");

const columns = {
  recebido: document.getElementById("col-recebido"),
  preparo: document.getElementById("col-preparo"),
  pronto: document.getElementById("col-pronto"),
  caminho: document.getElementById("col-caminho"),
  finalizado: document.getElementById("col-finalizado"),
  cancelado: document.getElementById("col-cancelado"),
};

const userChip = document.getElementById("user-chip");
const userNameEl = document.getElementById("user-name");
const userAvatar = document.getElementById("user-avatar");
const logoutBtn = document.getElementById("logout-btn");

const unauthorizedModal = document.getElementById("unauthorized-modal");
const unauthClose = document.getElementById("unauth-close");

const modalBackdrop = document.getElementById("modal");
const closeModalBtn = document.getElementById("close-modal");
const closeModalSecondaryBtn = document.getElementById("close-modal-secondary");
const modalEditBtn = document.getElementById("modal-edit-btn");

const modalId = document.getElementById("modal-id");
const modalCustomer = document.getElementById("modal-customer");
const modalTime = document.getElementById("modal-time");


const modalAddressRow = document.getElementById("modal-address-row");
const modalAddress = document.getElementById("modal-address");


const modalItems = document.getElementById("modal-items");
const modalNotes = document.getElementById("modal-notes");
const modalPrevBtn = document.getElementById("modal-prev");
const modalCancelBtn = document.getElementById("modal-cancel");
const modalNextBtn = document.getElementById("modal-next");

const createModal = document.getElementById("create-modal");
const openCreateBtn = document.getElementById("open-create");
const closeCreateBtn = document.getElementById("close-create");
const cancelCreateBtn = document.getElementById("cancel-create");
const saveCreateBtn = document.getElementById("save-create");

const newCustomer = document.getElementById("new-customer");
const newPhone = document.getElementById("new-phone");
const newItems = document.getElementById("new-items");
const newDelivery = document.getElementById("new-delivery");
const deliveryAddressWrap = document.getElementById("delivery-address-wrap");
const newAddress = document.getElementById("new-address");
const paymentWrap = document.getElementById("payment-wrap");
const newPayment = document.getElementById("new-payment");
const newNotes = document.getElementById("new-notes");

const googleBtnContainer = document.getElementById("googleLoginBtn");

// ===== STATE =====
let currentView = "ativos";
let orders = [];
let activeOrderId = null;
let isFetching = false;
let editingOrderId = null;

let restaurantPlan = "basic";
let restaurantPlanPrice = 1200; // Preço padrão
let features = { 
  crm: false, 
  results: false, 
  roi: false, 
  forecast: false
};

let crmClients = [];
let metricsData = null;
let chartInstance = null;
let insightsChartInstance = null; // 🔥 NOVO
const insightsState = { activeMetric: 'revenue', timelineData: null }; // 🔥 NOVO

const resultsState = {
  period: "30d",
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

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { 
    style: "currency", 
    currency: "BRL" 
  }).format(value || 0);
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

// ===== PLAN FEATURES & PRICES =====
function getPlanPrice(plan) {
  const prices = {
    essential: 1200,
    advanced: 2500,
    executive: 4000,
    custom: 7000
  };
  return prices[plan.toLowerCase()] || 1400;
}

function applyAccessUI() {
  const plan = restaurantPlan.toLowerCase();
  restaurantPlanPrice = getPlanPrice(plan);

  // Essential — só pedidos
  if (plan === "essential") {
    features.crm = false;
    features.results = false;
    features.roi = false;
    features.forecast = false;
  }
  // Advanced — + rastreio, CRM, PDV
  else if (plan === "advanced") {
    features.crm = true;
    features.results = false;
    features.roi = false;
    features.forecast = false;
  }
  // Executive — + dashboard, fidelização, autoatendimento
  else if (plan === "executive") {
    features.crm = true;
    features.results = true;
    features.roi = true;
    features.forecast = true;
  }
  // Custom — tudo
  else if (plan === "custom") {
    features.crm = true;
    features.results = true;
    features.roi = true;
    features.forecast = true;
  }

  drawerCrmBtn?.classList.toggle("locked", !features.crm);
  drawerResultsBtn?.classList.toggle("locked", !features.results);
  document.getElementById("drawer-autoatendimento")?.classList.toggle("locked", plan !== "executive" && plan !== "custom");
}

function closeDrawer() {
  drawer?.classList.remove("open");
  drawerBackdrop?.classList.remove("open");
}

// ===== TABS =====
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
  let planPrice = "";
  
 if (requiredPlan === "pro" || requiredPlan === "advanced") {
  planDisplay = "ADVANCED";
  planPrice = "R$ 2.500/mês";
  featuresList = [
    "CRM completo de clientes",
    "Recuperação de carrinho abandonado",
    "Link de rastreio em tempo real",
    "Relatórios PDF via WhatsApp (quinzenais)",
    "Integração PDV",
    "Controle de estoque"
  ];
} else if (requiredPlan === "executive") {
  planDisplay = "EXECUTIVE";
  planPrice = "R$ 4.000/mês";
  featuresList = [
    "Tudo do plano Advanced",
    "Dashboard de ROI em tempo real",
    "Previsão de demanda por IA",
    "Automação de campanhas",
    "Controle de metas",
    "Programa de fidelização",
    "Acompanhamento quinzenal com equipe Evorise"
  ];
}

  backdrop.innerHTML = `
    <div class="upgrade-modal">
      <button class="upgrade-dismiss" onclick="document.getElementById('upgrade-modal-backdrop').remove()">×</button>
      <div class="upgrade-icon">🔒</div>
      <h2 class="upgrade-title">Recurso Bloqueado</h2>
      <p class="upgrade-message">
        O recurso <strong>${featureName}</strong> está disponível apenas no plano:
      </p>
      <div class="upgrade-plan">${planDisplay} - ${planPrice}</div>
      
      <div class="upgrade-features">
        <p class="upgrade-features-title">O que você ganha com o upgrade:</p>
        <ul>
          ${featuresList.map(f => `<li>${f}</li>`).join("")}
        </ul>
      </div>
      
      <div class="upgrade-actions">
        <button class="upgrade-btn" onclick="window.open('https://wa.me/5514997194089?text=Quero fazer upgrade para o plano ${requiredPlan.toUpperCase()}!', '_blank')">
          🚀 Fazer Upgrade Agora
        </button>
        <button class="upgrade-close-btn" onclick="document.getElementById('upgrade-modal-backdrop').remove()">
          Depois
        </button>
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
  document.getElementById("autoatendimento-view")?.classList.add("hidden");
  document.getElementById("settings-view")?.classList.add("hidden");
  document.getElementById("cardapio-view")?.classList.add("hidden");
  document.getElementById("fidelidade-view")?.classList.add("hidden");
  board?.classList.remove("hidden");
  showTabsBar();
  closeDrawer();
  renderBoard();
}

function showCRM() {
  if (!features.crm) {
    showUpgradeModal("advanced", "CRM de Clientes");
    return;
  }
  board?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  document.getElementById("autoatendimento-view")?.classList.add("hidden");
  document.getElementById("settings-view")?.classList.add("hidden");
  document.getElementById("cardapio-view")?.classList.add("hidden");
  document.getElementById("fidelidade-view")?.classList.add("hidden");
  crmView?.classList.remove("hidden");
  hideTabsBar();
  closeDrawer();
  fetchCRM();
}

function showResults() {
  if (!features.results) {
    showUpgradeModal("executive", "Dashboard de Resultados");
    return;
  }
  board?.classList.add("hidden");
  crmView?.classList.add("hidden");
  document.getElementById("autoatendimento-view")?.classList.add("hidden");
  document.getElementById("settings-view")?.classList.add("hidden");
  document.getElementById("cardapio-view")?.classList.add("hidden");
  document.getElementById("fidelidade-view")?.classList.add("hidden");
  resultsView?.classList.remove("hidden");
  hideTabsBar();
  closeDrawer();
  if (!resultsState.uiReady) {
    setupPeriodButtons();
    resultsState.uiReady = true;
  }
  fetchAndRenderMetrics();
}
  

function showCardapio() {
  board?.classList.add("hidden");
  crmView?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  document.getElementById("settings-view")?.classList.add("hidden");
  document.getElementById("autoatendimento-view")?.classList.add("hidden");
  document.getElementById("fidelidade-view")?.classList.add("hidden");
  document.getElementById("cardapio-view")?.classList.remove("hidden");
  hideTabsBar();
  closeDrawer();
  fetchCardapio();
}

function showFidelidade() {
  const plan = restaurantPlan.toLowerCase();
  if (plan !== "executive" && plan !== "custom") {
    showUpgradeModal("executive", "Programa de Fidelidade");
    return;
  }
  board?.classList.add("hidden");
  crmView?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  document.getElementById("settings-view")?.classList.add("hidden");
  document.getElementById("autoatendimento-view")?.classList.add("hidden");
  document.getElementById("cardapio-view")?.classList.add("hidden");
  document.getElementById("fidelidade-view")?.classList.remove("hidden");
  hideTabsBar();
  closeDrawer();
  initFidelidade();
}

function showAutoatendimento() {
  const plan = restaurantPlan.toLowerCase();
  if (plan !== "executive" && plan !== "custom") {
    showUpgradeModal("executive", "Autoatendimento");
    return;
  }
  board?.classList.add("hidden");
  crmView?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  document.getElementById("settings-view")?.classList.add("hidden");
  document.getElementById("fidelidade-view")?.classList.add("hidden");
  document.getElementById("cardapio-view")?.classList.add("hidden");
  document.getElementById("autoatendimento-view")?.classList.remove("hidden");
  hideTabsBar();
  closeDrawer();
  initAutoatendimento();
}

function showSettings() {
  board?.classList.add("hidden");
  crmView?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  document.getElementById("autoatendimento-view")?.classList.add("hidden");
  document.getElementById("settings-view")?.classList.remove("hidden");
  hideTabsBar();
  closeDrawer();
  loadSettingsData();
}

async function loadSettingsData() {
  const rid = getRestaurantId();
  if (!rid) return;

  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/impressora`);
    const data = await resp.json();
    console.log("🖨️ Config carregada:", data);
    if (data.printnode_api_key)
      document.getElementById("settings-printnode-key").value = data.printnode_api_key;
    if (data.printnode_printer_id)
      document.getElementById("settings-printnode-printer").value = data.printnode_printer_id;
  } catch (e) {
    console.error("Erro ao carregar config impressora:", e);
  }

  const trackingUrl = localStorage.getItem("tracking_url") || "https://rastreio.evoriseai.com.br";
  document.getElementById("settings-tracking-url").value = trackingUrl;
}

function setupPeriodButtons() {
  const periodButtons = document.querySelectorAll('.period-btn');
  
  periodButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      periodButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      resultsState.period = btn.dataset.period;
      fetchAndRenderMetrics();
    });
  });
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

    orders = newOrders.map((o) => ({
      ...o,
      _frontStatus: toFrontStatus(o.status),
    }));

    if (!crmView?.classList.contains("hidden")) {
      // Não renderiza
    } else if (!resultsView?.classList.contains("hidden")) {
      // Não renderiza (metrics já atualiza sozinho)
    }
  } catch (e) {
    console.error("Polling Error:", e);
  } finally {
    isFetching = false;
    if (!modalBackdrop?.classList.contains("open") && !createModal?.classList.contains("open")) {
      renderBoard();
    }
  }
} // ← fecha fetchOrders

async function updateOrderStatus(orderId, newFrontStatus) {
  const backStatus = toBackStatus(newFrontStatus);
  try {
    const resp = await fetch(`${API_URL}/${orderId}/status`, {  // 🔥 ADICIONA /status
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
    
    // ❌ REMOVE ESTA LINHA:
    // if (activeOrderId === orderId) openOrderModal(orderId);
    
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

  const visibleStatuses = views[currentView];
  
  Object.keys(columns).forEach((statusKey) => {
    const column = columns[statusKey]?.parentElement;
    if (column) {
      if (visibleStatuses.includes(statusKey)) {
        column.classList.remove("hidden");
      } else {
        column.classList.add("hidden");
      }
    }
  });

  const filtered = orders.filter((o) => visibleStatuses.includes(o._frontStatus));

  filtered.forEach((o) => {
    const card = buildOrderCard(o);
    const col = columns[o._frontStatus];
    col?.appendChild(card);
  });

  toggleNoOrdersBalloons();
}

function getOriginLabel(origin) {
  const map = {
    ia_whatsapp: "WhatsApp",
    whatsapp: "WhatsApp",
    ifood: "iFood",
    aiqfome: "Aiqfome",
    autoatendimento: "Autoatendimento",
    balcao: "Balcão",
  };
  return map[String(origin).toLowerCase()] || origin;
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
${order.origin === "fidelidade" 
  ? `<div class="order-fidelidade-tag">🎁 Fidelidade</div>` 
  : order.origin ? `<div class="order-origin-tag">${getOriginLabel(order.origin)}</div>` : ""}
  <div class="card-checkbox-wrap" onclick="event.stopPropagation()">
    <input type="checkbox" class="card-checkbox" data-id="${order.id}"
      onchange="toggleCardSelection('${order.id}', this.checked)" />
  </div>
  `;

  card.addEventListener("click", () => openOrderModal(order.id));
  return card;
}

// ===== SELEÇÃO MÚLTIPLA =====
let selectedOrderIds = new Set();

function toggleCardSelection(orderId, checked) {
  if (checked) {
    selectedOrderIds.add(orderId);
  } else {
    selectedOrderIds.delete(orderId);
  }
  updateSelectionBar();
}

function updateSelectionBar() {
  // Remove todas as mini-barras antigas
  document.querySelectorAll(".col-action-bar").forEach(b => b.remove());
  if (selectedOrderIds.size === 0) return;

  const porColuna = {};
  selectedOrderIds.forEach(id => {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    const col = o._frontStatus;
    if (!porColuna[col]) porColuna[col] = [];
    porColuna[col].push(id);
  });

  Object.entries(porColuna).forEach(([status, ids]) => {
    const colBody = columns[status];
    if (!colBody) return;
    const header = colBody.closest(".column")?.querySelector(".column-header");
    if (!header) return;
    const bar = document.createElement("div");
    bar.className = "col-action-bar";
    bar.innerHTML = `
      <span>${ids.length} sel.</span>
      <button onclick="advanceSelectedOrders()">Mover →</button>
    `;
    header.appendChild(bar);
  });
}

function clearSelection() {
  selectedOrderIds.clear();
  document.querySelectorAll(".card-checkbox").forEach(cb => cb.checked = false);
  document.getElementById("selection-action-bar")?.remove();
}

async function advanceSelectedOrders() {
  const ids = [...selectedOrderIds];
  await Promise.all(ids.map(async id => {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    const s = o._frontStatus;
    const isDelivery = String(o.service_type || "").toLowerCase() === "delivery";
    const seq = isDelivery
      ? ["recebido", "preparo", "pronto", "caminho", "finalizado"]
      : ["recebido", "preparo", "pronto", "finalizado"];
    const i = seq.indexOf(s);
    if (i === -1 || i === seq.length - 1) return;
    return updateOrderStatus(id, seq[i + 1]);
  }));
  clearSelection();
  renderBoard();
}

function toggleNoOrdersBalloons() {
  Object.keys(columns).forEach((k) => {
    const col = columns[k];
    if (!col) return;
    
    const column = col.parentElement;
    if (column && column.classList.contains("hidden")) return;
    
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

  // Restaura checkboxes após re-render
  selectedOrderIds.forEach(id => {
    const cb = document.querySelector(`.card-checkbox[data-id="${id}"]`);
    if (cb) cb.checked = true;
  });
}


// ===== MODAL =====
function openOrderModal(orderId) {
  const order = orders.find((o) => o.id === orderId);
  if (!order) return;

  activeOrderId = orderId;

  if (modalId) modalId.textContent = `#${order.order_number || ""}`;
  if (modalCustomer) modalCustomer.textContent = order.client_name || "Cliente";

  // Telefone + Horário na mesma linha
  const phone = normalizePhone(order.client_phone);
  const modalPhoneEl = document.getElementById("modal-phone");
  const modalTimeEl = document.getElementById("modal-time");
  if (modalPhoneEl) modalPhoneEl.textContent = phone || "—";
  if (modalTimeEl) modalTimeEl.textContent = formatDateTime(order.created_at);

  // Pagamento + Valor na mesma linha
  const paymentPriceRow = document.getElementById("modal-payment-price-row");
  const modalPaymentEl = document.getElementById("modal-payment");
  const modalTotalPriceEl = document.getElementById("modal-total-price");
  const isDelivery = String(order.service_type || "").toLowerCase() === "delivery";

   if (paymentPriceRow && modalPaymentEl && modalTotalPriceEl) {
  paymentPriceRow.style.display = "";
  modalPaymentEl.textContent = String(order.payment_method || "—");
  modalTotalPriceEl.textContent = order.total_price ? formatCurrency(order.total_price) : "—";
}

  // Endereço linha completa
  if (modalAddressRow && modalAddress) {
    const showAddress = isDelivery && !!String(order.address || "").trim();
    modalAddressRow.style.display = showAddress ? "" : "none";
    modalAddress.textContent = showAddress ? String(order.address || "") : "";
  }

  // Itens
if (modalItems) {
    modalItems.innerHTML = "";
    const itens = Array.isArray(order.itens) ? order.itens : [];
    itens.forEach((it) => {
      const name = it?.name || it?.nome || "Item";
      const qty = it?.qty || it?.quantidade || 1;
      const price = it?.price || it?.preco || 0;
      const li = document.createElement("li");
      li.style.cssText = "list-style:none; display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:rgba(46,8,8,0.75); border:1px solid rgba(91,28,28,0.85); border-radius:10px; gap:12px;";
      li.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
          <span style="color:rgba(252,228,228,0.95); font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</span>
          ${price > 0 ? `<span style="color:rgba(251,191,36,0.85); font-size:12px; font-weight:700; white-space:nowrap;">R$${(price * qty).toFixed(2)}</span>` : ""}
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
          <span style="color:rgba(252,228,228,0.5); font-size:14px; font-weight:800;">x${qty}</span>
          <span style="color:rgba(252,228,228,0.4); font-size:12px;">un</span>
        </div>
      `;
      modalItems.appendChild(li);
    });
  }

  if (modalNotes) modalNotes.textContent = order.notes || "";

  modalPrevBtn?.classList.toggle("hidden", ["cancelado", "finalizado", "recebido"].includes(order._frontStatus));
  // Botão imprimir — só aparece em "recebido"
let printBtn = document.getElementById("modal-print-btn");
if (!printBtn) {
  printBtn = document.createElement("button");
  printBtn.id = "modal-print-btn";
  printBtn.className = "primary-button";
  printBtn.innerHTML = "🖨️ Imprimir & Preparar";
  modalNextBtn?.parentElement?.insertBefore(printBtn, modalNextBtn);
}
printBtn.onclick = () => imprimirPedido(activeOrderId);
printBtn.classList.toggle("hidden", order._frontStatus !== "recebido");
  modalCancelBtn?.classList.toggle("hidden", ["cancelado", "finalizado"].includes(order._frontStatus));

  if (modalNextBtn) {
    const s = getFrontStatus(orderId);
    const nextLabel =
      s === "recebido" ? "Ir para Preparo"
      : s === "preparo" ? "Ir para Pronto"
      : s === "pronto" ? (isDelivery ? "Enviar para entrega" : "Finalizar pedido")
      : s === "caminho" ? "Finalizar"
      : "OK";
    modalNextBtn.textContent = nextLabel;
modalNextBtn.classList.toggle("hidden", s === "finalizado" || s === "cancelado");
  }

const editBtn = document.getElementById("modal-edit-btn");
if (editBtn) {
  editBtn.classList.toggle("hidden", order._frontStatus !== "recebido");
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

  const proximoStatus = seq[i + 1];

  // Presencial indo finalizar → pede pagamento antes
  if (!isDelivery && proximoStatus === "finalizado" && !o.payment_method) {
    closeOrderModal();
    showPaymentModal(orderId);
    return;
  }

  updateOrderStatus(orderId, proximoStatus);
  closeOrderModal();
}

function showPaymentModal(orderId) {
  const existing = document.getElementById("payment-modal");
  if (existing) existing.remove();

  const o = orders.find((x) => x.id === orderId); // 🔥 busca o pedido aqui
  if (!o) return;

  const modal = document.createElement("div");
  modal.id = "payment-modal";
  modal.className = "modal-backdrop open";

  modal.innerHTML = `
    <div class="modal confirm-modal">
      <div class="modal-header">
        <h3>💳 Forma de Pagamento</h3>
      </div>
      <div class="modal-body">
        <div style="background:rgba(46,8,8,0.45); border:1px solid rgba(91,28,28,0.85); border-radius:12px; padding:12px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
          <span style="color:rgba(252,228,228,0.7); font-weight:700;">Valor Total</span>
          <span style="color:rgba(252,228,228,1); font-size:18px; font-weight:900;">${formatCurrency(o.total_price || 0)}</span>
        </div>
        <p style="color:rgba(252,228,228,0.8); margin-bottom:12px;">Como o cliente vai pagar?</p>
        <select id="payment-select" style="width:100%; padding:12px 14px; border-radius:12px; border:1px solid rgba(91,28,28,0.85); background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:14px; font-family:inherit; outline:none;">
          <option value="">Selecione...</option>
          <option value="pix">PIX</option>
          <option value="credito">Cartão de crédito</option>
          <option value="debito">Cartão de débito</option>
          <option value="dinheiro">Dinheiro</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" id="payment-cancel">Cancelar</button>
        <button class="primary-button" id="payment-confirm">Finalizar Pedido</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById("payment-cancel").addEventListener("click", () => modal.remove());

 document.getElementById("payment-confirm").addEventListener("click", async () => {
  const metodo = document.getElementById("payment-select").value;
  if (!metodo) { alert("Selecione o método de pagamento."); return; }

  await fetch(`${API_BASE}/api/v1/pedidos/${orderId}/payment`, {
    method: "PATCH",
    headers: buildHeaders(),
    body: JSON.stringify({ payment_method: metodo })
  });

  modal.remove();
  updateOrderStatus(orderId, "finalizado");
});

  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
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
  
  // ✅ Atualiza o status
  updateOrderStatus(orderId, seq[i - 1]);
  
  // ✅ FECHA O MODAL
  closeOrderModal();
}

async function imprimirPedido(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  const rid = getRestaurantId();

  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/imprimir-pedido`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ order_id: orderId })
    });

    const data = await resp.json();

    if (!resp.ok || !data.success) {
      throw new Error(data.error || 'Erro ao imprimir');
    }

    // Sucesso — avança para preparo e fecha modal
    updateOrderStatus(orderId, 'preparo');
    closeOrderModal();

  } catch (e) {
    console.error('Erro PrintNode:', e);


    // Avança mesmo assim
    updateOrderStatus(orderId, 'preparo');
    closeOrderModal();
  }
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

function openCreateModal(e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  closeDrawer();
  saveCreateBtn.dataset.editOrderId = ""; // ← só limpa ao abrir como NOVO
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
  const totalPriceField = document.getElementById("new-total-price");
  if (totalPriceField) totalPriceField.value = "";
  // ← REMOVE a linha: if (saveCreateBtn) saveCreateBtn.dataset.editOrderId = "";
  updateCreateDeliveryVisibility();
}

// ===== 🔥 MÁSCARA DE DINHEIRO =====
function formatMoneyInput(input) {
  let value = input.value.replace(/\D/g, ''); // Remove tudo que não é número
  
  if (value === '') {
    input.value = '';
    return;
  }
  
  // Converte para número com centavos
  value = (parseInt(value) / 100).toFixed(2);
  
  // Formata com vírgula
  value = value.replace('.', ',');
  
  // Adiciona pontos de milhar
  value = value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  input.value = value;
}

function parseItems(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];

  try {
    const obj = JSON.parse(s);
    if (Array.isArray(obj)) return obj;
    return [];
  } catch {
    // Separa por vírgula
    if (s.includes(",")) {
      const parts = s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      if (parts.length) {
        return parts.map((name) => ({ 
          name: name, 
          qty: 1,
          quantidade: 1
        }));
      }
    }

    // Separa por linha
    const lines = s
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    if (lines.length === 0) return [];

    return lines.map((ln) => {
      const m = ln.match(/(.+?)\s*x\s*(\d+)$/i);
      if (m) {
        return { 
          name: m[1].trim(), 
          qty: Number(m[2]),
          quantidade: Number(m[2])
        };
      }
      return { 
        name: ln, 
        qty: 1,
        quantidade: 1
      };
    });
  }
}

 
async function saveNewOrder() {
  const editOrderId = editingOrderId || null;
  
  console.log("🧪 editOrderId:", editOrderId);
  console.log("🧪 tipo:", typeof editOrderId);

  const rid = getRestaurantId();
  const client = String(newCustomer?.value || "").trim();
  const itens = parseItems(newItems?.value);

  const isDelivery = !!newDelivery?.checked;
  const service_type = isDelivery ? "delivery" : "local";
  const address = String(newAddress?.value || "").trim();
  const payment_method = String(newPayment?.value || "").trim();
  const phoneRaw = String(newPhone?.value || "").trim();
  const client_phone = phoneRaw ? phoneRaw : null;

  const totalPriceFormatted = document.getElementById("new-total-price")?.value || '0';
  const total_price = parseFloat(totalPriceFormatted.replace(/\./g, '').replace(',', '.')) || 0;

  if (!rid || !client) { alert("Preencha o nome do cliente."); return; }
  if (!itens || itens.length === 0) { alert("Preencha os itens do pedido."); return; }
  if (isDelivery && !address) { alert("Endereço é obrigatório para delivery."); return; }
  if (isDelivery && !payment_method) { alert("Forma de pagamento é obrigatória para delivery."); return; }

  try {
    // ← SEM segunda declaração de editOrderId aqui!
    const body = {
      restaurant_id: rid,
      client_name: client,
      client_phone,
      itens,
      notes: String(newNotes?.value || ""),
      service_type,
      address: isDelivery ? address : null,
      payment_method: isDelivery ? payment_method : null,
      total_price,
      origin: "balcao",
      ...(editOrderId ? { order_id: editOrderId } : {})
    };

    const resp = await fetch(`${API_BASE}/api/v1/pedidos`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("Erro ao criar pedido:", data);
      throw new Error(data?.error || "Erro ao criar pedido");
    }

    if (editOrderId) {
  const idx = orders.findIndex(o => o.id === editOrderId);
  if (idx !== -1) orders[idx] = { ...orders[idx], ...data.order, _frontStatus: toFrontStatus(data.order.status) };
} else {
  orders.push({ ...data.order, _frontStatus: toFrontStatus(data.order.status) });
}
editingOrderId = null;
    
    closeCreateModal();
    saveCreateBtn.dataset.editOrderId = "";
    renderBoard();
  } catch (e) {
    console.error("Erro em saveNewOrder:", e);
    alert(`Erro ao criar pedido: ${e.message}`);
  }
}

// ===== 🔥 CRM CORRIGIDO =====
async function fetchCRM() {
  const restaurantId = getRestaurantId();
  if (!restaurantId) {
    console.error("❌ Restaurant ID não encontrado");
    return;
  }

  try {
    console.log("🔍 Buscando CRM para:", restaurantId);
    
    const resp = await fetch(`${CRM_URL}/${restaurantId}`);
    
    console.log("📡 Status da resposta CRM:", resp.status);
    
    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({ error: "Erro desconhecido" }));
      console.error("❌ Erro CRM:", errorData);
      
      if (resp.status === 403) {
        alert("Seu plano não permite acesso ao CRM. Faça upgrade para PRO ou ADVANCED.");
      } else if (resp.status === 404) {
        alert("Restaurante não encontrado no sistema.");
      } else if (resp.status === 500) {
        alert("Erro no servidor ao buscar CRM. Tente novamente mais tarde.");
      } else {
        alert(errorData?.error || "Erro ao carregar CRM");
      }
      
      crmContent.innerHTML = `
        <div class="empty-state">
          <p style="color: #ef4444;">❌ ${errorData?.error || "Erro ao carregar CRM"}</p>
          <p style="font-size: 14px; color: var(--muted);">Status: ${resp.status}</p>
        </div>
      `;
      return;
    }

    const data = await resp.json();
    console.log("✅ Dados CRM recebidos:", data);

    if (!Array.isArray(data)) {
      console.error("❌ Resposta CRM não é um array:", data);
      crmContent.innerHTML = `
        <div class="empty-state">
          <p style="color: #ef4444;">Erro: Resposta inválida do servidor</p>
        </div>
      `;
      return;
    }

    crmClients = data;
    renderCRM();
  } catch (e) {
    console.error("❌ Erro fatal ao buscar CRM:", e);
    
    if (crmContent) {
      crmContent.innerHTML = `
        <div class="empty-state">
          <p style="color: #ef4444;">❌ Erro de conexão ao buscar CRM</p>
          <p style="font-size: 14px; color: var(--muted);">${e.message}</p>
          <button class="primary-button" onclick="fetchCRM()" style="margin-top: 16px;">
            Tentar Novamente
          </button>
        </div>
      `;
    }
  }
}

function renderCRM() {
  if (!crmContent) return;

  crmContent.innerHTML = "";

  if (crmClients.length === 0) {
    crmContent.innerHTML = `
      <div class="empty-state">
        <p>Nenhum cliente cadastrado ainda.</p>
      </div>
    `;
    return;
  }

  const table = document.createElement("table");
  table.className = "crm-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Cliente</th>
        <th>Telefone</th>
        <th>Pedidos</th>
        <th>Total Gasto</th>
        <th>Última compra</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  crmClients.forEach((c) => {
    const tr = document.createElement("tr");
    const phone = c.client_phone || "—";
    const totalSpent = c.total_spent || 0;

    tr.innerHTML = `
      <td>${escapeHtml(c.client_name || "Cliente")}</td>
      <td class="crm-phone-clickable">${escapeHtml(phone)}</td>
      <td>${Number(c.orders || 0)}</td>
      <td>${formatCurrency(totalSpent)}</td>
      <td>${escapeHtml(formatDateTime(c.last_order_at))}</td>
    `;
    
    // Click para abrir popup com pedidos do cliente
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => openClientDetailsModal(c));
    
    tbody.appendChild(tr);
  });

  crmContent.appendChild(table);
}

// 🔥 POPUP COM PEDIDOS DO CLIENTE
async function openClientDetailsModal(client) {
  const rid = getRestaurantId();
  if (!rid) return;

  try {
    // Busca todos os pedidos do cliente
    const resp = await fetch(`${API_URL}/${rid}`);
    const allOrders = await resp.json();
    
    const clientOrders = allOrders.filter(o => 
      normalizePhone(o.client_phone) === normalizePhone(client.client_phone)
    );

    // Cria modal
    const existing = document.getElementById("client-details-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "client-details-modal";
    modal.className = "modal-backdrop open";
    
    modal.innerHTML = `
      <div class="modal client-details-modal-content">
        <div class="modal-header">
          <div>
            <h3>${escapeHtml(client.client_name)}</h3>
            <p class="muted">${client.client_phone}</p>
          </div>
          <button class="icon-button" id="close-client-details" style="margin-left: auto;">×</button>
        </div>
        
        <div class="modal-body">
          <div class="client-stats">
            <div class="stat-item">
              <span class="stat-label">Total de Pedidos</span>
              <span class="stat-value">${client.orders}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Total Gasto</span>
              <span class="stat-value">${formatCurrency(client.total_spent)}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Ticket Médio</span>
              <span class="stat-value">${formatCurrency(client.total_spent / client.orders)}</span>
            </div>
          </div>
          
          <div class="client-orders-section">
            <h4>Histórico de Pedidos</h4>
            <div class="client-orders-list">
              ${clientOrders.map(order => `
                <div class="client-order-item">
                  <div class="order-item-header">
                    <span class="order-item-number">#${order.order_number}</span>
                    <span class="order-item-date">${formatDateTime(order.created_at)}</span>
                    <span class="order-item-price">${formatCurrency(order.total_price)}</span>
                  </div>
                  <div class="order-item-details">
                    ${(order.itens || []).map(item => 
                      `<span class="order-item-tag">${item.name || item.nome} x${item.qty || item.quantidade || 1}</span>`
                    ).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        
        <div class="modal-actions">
          <button class="ghost-button" id="close-client-details-2">Fechar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("close-client-details")?.addEventListener("click", () => modal.remove());
    document.getElementById("close-client-details-2")?.addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });

  } catch (e) {
    console.error("Erro ao buscar pedidos do cliente:", e);
    alert("Erro ao carregar detalhes do cliente");
  }
}



async function fetchAndRenderMetrics() {
  const rid = getRestaurantId();
  if (!rid) return;

  try {
    // Converte período para query
    let queryPeriod = resultsState.period;
    if (queryPeriod === "all") {
      // Busca desde sempre (muito tempo atrás)
      queryPeriod = "3650d"; // 10 anos
    } else if (queryPeriod === "3d") {
      queryPeriod = "3d";
    } else if (queryPeriod === "15d") {
      queryPeriod = "15d";
    }

    const resp = await fetch(`${METRICS_URL}/${rid}?period=${queryPeriod}`);
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.error);

    metricsData = data;
    renderMetricsUI(data);
  } catch (e) {
    console.error("Erro ao buscar métricas:", e);
  }
}


function renderComparison(elementId, percentage) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  const isPositive = percentage >= 0;
  const arrow = isPositive ? "↑" : "↓";
  const color = isPositive ? "#22c55e" : "#ef4444";
  
  el.textContent = `${arrow} ${Math.abs(percentage).toFixed(1)}% vs período anterior`;
  el.style.color = color;
}


// ===== AUTH =====
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

  if (window.google?.accounts?.id) {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    });
    window.google.accounts.id.renderButton(googleBtnContainer, {
      theme: "outline",
      size: "large",
      width: 280,
    });
  } else {
    // Google ainda não carregou, tenta de novo em 300ms
    setTimeout(initGoogleLogin, 300);
  }
}

function logout() {
  localStorage.clear();
  location.reload();
}

// ===== MODAL DE CONFIRMAÇÃO CUSTOMIZADO =====
function showConfirmModal(message, onConfirm) {
  // Remove modal existente se houver
  const existing = document.getElementById("custom-confirm-modal");
  if (existing) existing.remove();

  // Cria o modal
  const modal = document.createElement("div");
  modal.id = "custom-confirm-modal";
  modal.className = "modal-backdrop open";
  
  modal.innerHTML = `
    <div class="modal confirm-modal">
      <div class="modal-header">
        <h3>⚠️ Confirmação</h3>
      </div>
      <div class="modal-body">
        <p style="font-size: 16px; color: rgba(252, 228, 228, 0.9); text-align: center; margin: 0;">
          ${message}
        </p>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" id="confirm-cancel">Cancelar</button>
        <button class="danger-button" id="confirm-ok">Confirmar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event listeners
  document.getElementById("confirm-cancel").addEventListener("click", () => {
    modal.remove();
  });

  document.getElementById("confirm-ok").addEventListener("click", () => {
    modal.remove();
    onConfirm();
  });

  // Fechar ao clicar fora
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// ===== DRAWER SETUP =====
function setupDrawer() {
  console.log("🔧 Configurando drawer...");

  // Botão de abrir
  const openBtn = document.getElementById("open-drawer");
  const drawerEl = document.getElementById("drawer");
  const backdropEl = document.getElementById("drawer-backdrop");
  const closeBtn = document.getElementById("close-drawer");

  if (openBtn && drawerEl && backdropEl) {
    openBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("🎯 Abrindo drawer...");
      drawerEl.classList.add("open");
      backdropEl.classList.add("open");
    });
    console.log("✅ Botão abrir configurado");
  } else {
    console.error("❌ Elementos não encontrados:", {
      openBtn: !!openBtn,
      drawerEl: !!drawerEl,
      backdropEl: !!backdropEl
    });
  }

  // Botão de fechar
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("🚪 Fechando drawer...");
      closeDrawer();
    });
  }

  // Fechar ao clicar no backdrop
  if (backdropEl) {
    backdropEl.addEventListener("click", () => {
      console.log("🚪 Fechando drawer (backdrop)...");
      closeDrawer();
    });
  }

  // Botões de navegação
  const ordersBtn = document.getElementById("drawer-orders");
  const crmBtn = document.getElementById("drawer-crm");
  const resultsBtn = document.getElementById("drawer-results");

  if (ordersBtn) ordersBtn.addEventListener("click", showBoard);
  if (crmBtn) crmBtn.addEventListener("click", showCRM);
  if (resultsBtn) resultsBtn.addEventListener("click", showResults);
  const cardapioBtn = document.getElementById("drawer-cardapio");
if (cardapioBtn) cardapioBtn.addEventListener("click", showCardapio);

const fidelidadeBtn = document.getElementById("drawer-fidelidade");
if (fidelidadeBtn) fidelidadeBtn.addEventListener("click", showFidelidade);

const autoatendimentoBtn = document.getElementById("drawer-autoatendimento");
if (autoatendimentoBtn) autoatendimentoBtn.addEventListener("click", showAutoatendimento);

  console.log("✅ Drawer totalmente configurado!");
}

// ===== INIT =====
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

  if (userChip) {
    userChip.hidden = false;
    if (userNameEl) userNameEl.textContent = localStorage.getItem("user_name") || "Usuário";
    if (userAvatar) userAvatar.src = localStorage.getItem("user_picture") || "";
  }
// Configura o drawer
setupDrawer();
// Event listeners dos modais
if (closeModalBtn) closeModalBtn.addEventListener("click", closeOrderModal);

if (modalEditBtn) modalEditBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  e.preventDefault();

  const order = orders.find(o => o.id === activeOrderId);
  if (!order) return;

  const orderIdParaEditar = activeOrderId;
  closeOrderModal();

  setTimeout(() => {
    openBackdrop(createModal);
    isFetching = true;
    setTimeout(() => { isFetching = false; }, 2000);

    if (newCustomer) newCustomer.value = order.client_name || "";
    if (newPhone) newPhone.value = order.client_phone || "";
    if (newNotes) newNotes.value = order.notes || "";

    const totalField = document.getElementById("new-total-price");
    if (totalField) totalField.value = order.total_price ? String(order.total_price).replace(".", ",") : "";

    const isDelivery = String(order.service_type || "").toLowerCase() === "delivery";
    if (newDelivery) {
      newDelivery.checked = isDelivery;
      updateCreateDeliveryVisibility();
    }
    if (isDelivery && newAddress) newAddress.value = order.address || "";
    if (isDelivery && newPayment) newPayment.value = order.payment_method || "";

    itensPedido = (order.itens || []).map(it => ({
      name: it.name || it.nome || "",
      qty: it.qty || it.quantidade || 1,
      price: parseFloat(it.price || it.preco || 0),
      quantidade: it.qty || it.quantidade || 1
    }));
    renderItensSelecionados();

    editingOrderId = orderIdParaEditar;
    console.log("✅ editingOrderId setado:", editingOrderId);
  }, 50);
});
  
  if (closeModalSecondaryBtn) closeModalSecondaryBtn.addEventListener("click", closeOrderModal);
if (modalBackdrop) modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeOrderModal();
});
if (modalPrevBtn) modalPrevBtn.addEventListener("click", () => regressStatus(activeOrderId));
if (modalNextBtn) modalNextBtn.addEventListener("click", () => advanceStatus(activeOrderId));
if (modalCancelBtn) modalCancelBtn.addEventListener("click", () => {
  showConfirmModal("Tem certeza que deseja cancelar este pedido?", () => {
    cancelOrder(activeOrderId);
    closeOrderModal();
  });
});

// Event listeners do modal de criação
if (openCreateBtn) openCreateBtn.addEventListener("click", openCreateModal);
if (closeCreateBtn) closeCreateBtn.addEventListener("click", closeCreateModal);
if (cancelCreateBtn) cancelCreateBtn.addEventListener("click", closeCreateModal);
if (saveCreateBtn) saveCreateBtn.addEventListener("click", saveNewOrder);
if (newDelivery) newDelivery.addEventListener("change", updateCreateDeliveryVisibility);

// Máscara de dinheiro
const totalPriceField = document.getElementById("new-total-price");
if (totalPriceField) {
  totalPriceField.addEventListener("input", function() {
    formatMoneyInput(this);
  });
}

  // 🔍 AUTOCOMPLETE DE ITENS
  const searchInput = document.getElementById("new-items-search");
  const dropdown = document.getElementById("autocomplete-dropdown");
  const itensSelecionados = document.getElementById("itens-selecionados");
  const hiddenItems = document.getElementById("new-items");
  let itensPedido = [];

  function atualizarHiddenItems() {
    hiddenItems.value = JSON.stringify(itensPedido);
  }

function renderItensSelecionados() {
  itensSelecionados.innerHTML = itensPedido.map((it, i) => `
    <div style="
      display:flex; align-items:center; justify-content:space-between;
      padding:10px 14px;
      background:rgba(46,8,8,0.75);
      border:1px solid rgba(91,28,28,0.85);
      border-radius:10px;
      width:100%;
      gap:12px;
    ">
      <!-- ESQUERDA: Nome + preço -->
      <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
        <span style="color:rgba(252,228,228,0.95); font-weight:700; font-size:14px;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${it.name}
        </span>
        ${it.price > 0 ? `
          <span style="color:rgba(251,191,36,0.85); font-size:12px; font-weight:700; white-space:nowrap;">
            R$${(it.price * it.qty).toFixed(2)}
          </span>
        ` : ''}
      </div>

      <!-- DIREITA: − input + -->
      <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
        
        <button onclick="alterarQtd(${i}, -1)" style="
          background:none; border:none;
          color:rgba(252,228,228,0.5);
          font-size:18px; font-weight:900; cursor:pointer;
          padding:0 4px; line-height:1;
        ">−</button>

        <input 
          type="number" 
          min="1"
          value="${it.qty}"
          onchange="setQtd(${i}, this.value)"
          style="
            width:46px; text-align:center;
            background:rgba(20,3,3,0.4);
            border:1px solid rgba(91,28,28,0.7);
            border-radius:8px;
            color:rgba(252,228,228,1);
            font-weight:800; font-size:14px;
            padding:4px 6px;
            font-family:'Space Grotesk', sans-serif;
            outline:none;
          "
        />

        <span style="color:rgba(252,228,228,0.4); font-size:12px;">un</span>

        <button onclick="alterarQtd(${i}, 1)" style="
          background:none; border:none;
          color:rgba(252,228,228,0.5);
          font-size:18px; font-weight:900; cursor:pointer;
          padding:0 4px; line-height:1;
        ">+</button>

      </div>
    </div>
  `).join('');
  atualizarHiddenItems();
}

 window.removerItemPedido = function(index) {
  itensPedido.splice(index, 1);
  renderItensSelecionados();
  // Recalcula total
  const totalField = document.getElementById("new-total-price");
  if (totalField) {
    const soma = itensPedido.reduce((acc, i) => acc + (i.price * i.qty), 0);
    totalField.value = soma > 0 ? soma.toFixed(2).replace('.', ',') : '';
  }
};

window.alterarQtd = function(index, delta) {
  itensPedido[index].qty += delta;
  itensPedido[index].quantidade = itensPedido[index].qty;

  if (itensPedido[index].qty <= 0) {
    itensPedido.splice(index, 1);
  }

  window.setQtd = function(index, value) {
  const qty = parseInt(value) || 1;
  
  if (qty <= 0) {
    itensPedido.splice(index, 1);
  } else {
    itensPedido[index].qty = qty;
    itensPedido[index].quantidade = qty;
  }

  renderItensSelecionados();

  const totalField = document.getElementById("new-total-price");
  if (totalField) {
    const soma = itensPedido.reduce((acc, i) => acc + (i.price * i.qty), 0);
    totalField.value = soma > 0 ? soma.toFixed(2).replace('.', ',') : '';
  }
};
  
  renderItensSelecionados();

  const totalField = document.getElementById("new-total-price");
  if (totalField) {
    const soma = itensPedido.reduce((acc, i) => acc + (i.price * i.qty), 0);
    totalField.value = soma > 0 ? soma.toFixed(2).replace('.', ',') : '';
  }
};
  
  function adicionarItem(item) {
    const existente = itensPedido.find(i => i.name === item.nome);
    if (existente) {
      existente.qty++;
    } else {
      itensPedido.push({ name: item.nome, qty: 1, price: parseFloat(item.preco || 0), quantidade: 1 });
    }
    renderItensSelecionados();
    searchInput.value = '';
    dropdown.style.display = 'none';

// Recalcula o total sempre
const totalField = document.getElementById("new-total-price");
if (totalField) {
  const soma = itensPedido.reduce((acc, i) => acc + (i.price * i.qty), 0);
  if (soma > 0) {
    totalField.value = soma.toFixed(2).replace('.', ',');
  }
}
  }

  let autocompleteTimer = null;
  searchInput?.addEventListener("input", () => {
    clearTimeout(autocompleteTimer);
    const q = searchInput.value.trim();
    if (q.length < 1) { dropdown.style.display = 'none'; return; }

    autocompleteTimer = setTimeout(async () => {
      const rid = getRestaurantId();
      if (!rid) return;
      try {
        const resp = await fetch(`${API_BASE}/api/v1/cardapio/${rid}/busca?q=${encodeURIComponent(q)}`);
        const itens = await resp.json();

        if (!itens.length) { dropdown.style.display = 'none'; return; }

        dropdown.innerHTML = itens.map(it => `
          <div onclick="window._selecionarItem(${JSON.stringify(it).replace(/"/g, '&quot;')})"
            style="padding:12px 16px; cursor:pointer; border-bottom:1px solid rgba(91,28,28,0.4);
              display:flex; justify-content:space-between; align-items:center;
              transition:background 0.15s;"
            onmouseover="this.style.background='rgba(91,28,28,0.5)'"
            onmouseout="this.style.background='transparent'">
            <span style="color:rgba(252,228,228,0.95); font-weight:700; font-size:14px;">${it.nome}</span>
            <span style="color:rgba(251,191,36,0.9); font-weight:800; font-size:13px;">R$${parseFloat(it.preco).toFixed(2)}</span>
          </div>
        `).join('');
        dropdown.style.display = 'block';
      } catch(e) { dropdown.style.display = 'none'; }
    }, 250);
  });

  window._selecionarItem = adicionarItem;

  document.addEventListener("click", (e) => {
    if (!searchInput?.contains(e.target) && !dropdown?.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  // Limpa itens ao fechar o modal
  const origClose = closeCreateModal;
  closeCreateModal = function() {
    itensPedido = [];
    renderItensSelecionados();
    if (searchInput) searchInput.value = '';
    origClose();
  };

// Event listeners das tabs
if (tabAtivos) tabAtivos.addEventListener("click", () => changeView("ativos"));
if (tabFinalizados) tabFinalizados.addEventListener("click", () => changeView("finalizados"));
if (tabCancelados) tabCancelados.addEventListener("click", () => changeView("cancelados"));
if (tabEntregas) tabEntregas.addEventListener("click", () => changeView("entregas"));

// Event listeners dos botões de voltar
if (crmBackBtn) crmBackBtn.addEventListener("click", showBoard);
if (resultsBackBtn) resultsBackBtn.addEventListener("click", showBoard);
  const autoatendimentoBackBtn = document.getElementById("autoatendimento-back-btn");
if (autoatendimentoBackBtn) autoatendimentoBackBtn.addEventListener("click", showBoard);
const cardapioBackBtn = document.getElementById("cardapio-back-btn");
if (cardapioBackBtn) cardapioBackBtn.addEventListener("click", showBoard);

const fidelidadeBackBtn = document.getElementById("fidelidade-back-btn");
if (fidelidadeBackBtn) fidelidadeBackBtn.addEventListener("click", showBoard);
document.getElementById("btn-novo-item-cardapio")?.addEventListener("click", () => openItemModal());
const settingsBtn = document.getElementById("drawer-settings");
if (settingsBtn) settingsBtn.addEventListener("click", showSettings);

const settingsBackBtn = document.getElementById("settings-back-btn");
if (settingsBackBtn) settingsBackBtn.addEventListener("click", showBoard);

document.getElementById("btn-salvar-impressora")?.addEventListener("click", salvarImpressora);
document.getElementById("btn-testar-impressora")?.addEventListener("click", testarImpressora);
document.getElementById("btn-salvar-rastreio")?.addEventListener("click", salvarRastreio);

// Logout
if (logoutBtn) logoutBtn.addEventListener("click", logout);
if (unauthClose) unauthClose.addEventListener("click", () => closeBackdrop(unauthorizedModal));

// Polling de pedidos
setInterval(fetchOrders, 5000);
fetchOrders();

const dominioSalvo = localStorage.getItem("cardapio_url");
if (dominioSalvo) {
  const el = document.getElementById("input-dominio-cardapio");
  if (el) el.value = dominioSalvo;
}

renderBoard();
}
// ========================================
// 🎨 DASHBOARD COMPLETO - 4 GRÁFICOS
// ========================================

// Variáveis globais para os gráficos
let originChartInstance = null;
let serviceChartInstance = null;
let clientsChartInstance = null;
let statusChartInstance = null;

// Função principal para renderizar TODOS os gráficos
function renderAllCharts(data) {
  renderOriginChart(data);
  renderServiceChart(data);
  renderClientsChart(data);
  renderStatusChart(data);
}
// ========================================
// 💡 GRÁFICO DE INSIGHTS INTERATIVO
// ========================================

async function fetchAndRenderInsights() {
  const rid = getRestaurantId();
  if (!rid) return;

  try {
    console.log("📊 Buscando timeline para Insights...");
    
    const resp = await fetch(`${METRICS_URL}/${rid}/timeline?period=${resultsState.period}`);
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.error);

    insightsState.timelineData = data;
    console.log("✅ Timeline recebida:", data);
    
    renderInsightsChart(data);
    setupCardClickHandlers();
  } catch (e) {
    console.error("❌ Erro ao buscar timeline:", e);
  }
}
function renderInsightsChart(data) {
  const canvas = document.getElementById("insightsChart");
  if (!canvas) {
    console.warn("⚠️ Canvas insightsChart não encontrado");
    return;
  }

  const timeline = data.timeline || [];
  
  if (timeline.length === 0) {
    console.warn("⚠️ Timeline vazia");
    return;
  }

  console.log(`📈 Renderizando Insights: ${insightsState.activeMetric}`);
  
  // Labels (datas formatadas)
  const labels = timeline.map(day => {
    const date = new Date(day.date);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  });

  // 🔥 TODOS OS DATASETS POSSÍVEIS
  const allDatasets = {
    revenue: {
      label: '💰 Faturamento',
      data: timeline.map(day => day.revenue),
      borderColor: 'rgba(251, 191, 36, 1)',
      backgroundColor: 'rgba(251, 191, 36, 0.15)',
      metricKey: 'revenue'
    },
    roi: {
      label: '📊 ROI',
      data: timeline.map(day => day.roi),
      borderColor: 'rgba(139, 92, 246, 1)',
      backgroundColor: 'rgba(139, 92, 246, 0.15)',
      metricKey: 'roi'
    },
    ticket: {
      label: '💳 Ticket Médio',
      data: timeline.map(day => day.ticket),
      borderColor: 'rgba(34, 197, 94, 1)',
      backgroundColor: 'rgba(34, 197, 94, 0.15)',
      metricKey: 'ticket'
    },
    orders: {
      label: '📦 Pedidos',
      data: timeline.map(day => day.orders),
      borderColor: 'rgba(249, 115, 115, 1)',
      backgroundColor: 'rgba(249, 115, 115, 0.15)',
      metricKey: 'orders'
    }
  };

  // 🔥 PEGA APENAS O DATASET ATIVO
  const activeDataset = allDatasets[insightsState.activeMetric];
  
  // Estilo da linha ativa
  activeDataset.borderWidth = 3;
  activeDataset.tension = 0.4;
  activeDataset.pointRadius = 5;
  activeDataset.pointHoverRadius = 10;
  activeDataset.pointBackgroundColor = activeDataset.borderColor;
  activeDataset.pointBorderColor = '#fff';
  activeDataset.pointBorderWidth = 2;
  activeDataset.fill = true;
  activeDataset.pointHitRadius = 15;

  // 🔥 CALCULA ESCALA BASEADO APENAS NA MÉTRICA ATIVA
  const maxValue = Math.max(...activeDataset.data);
  const suggestedMax = Math.ceil(maxValue * 1.2); // 20% acima
  
  console.log(`📊 Max: ${maxValue} | Escala: 0 a ${suggestedMax}`);

  // Destroi gráfico anterior
  if (insightsChartInstance) {
    insightsChartInstance.destroy();
  }

  // Cria o gráfico COM APENAS 1 DATASET
  insightsChartInstance = new Chart(canvas, {
    type: 'line',
    data: { 
      labels, 
      datasets: [activeDataset] // 🔥 SÓ O ATIVO!
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      
      interaction: {
        mode: 'index',
        intersect: false
      },
      
      plugins: {
        legend: {
          display: false
        },
        
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: 'rgba(252, 228, 228, 0.95)',
          bodyColor: 'rgba(252, 228, 228, 0.95)',
          borderColor: activeDataset.borderColor,
          borderWidth: 2,
          padding: 12,
          cornerRadius: 6,
          displayColors: false,
          
          callbacks: {
            title: function(context) {
              return context[0].label;
            },
            
            label: function(context) {
              const label = context.dataset.label || '';
              const value = context.parsed.y || 0;
              
              if (insightsState.activeMetric === 'revenue' || insightsState.activeMetric === 'ticket') {
                return `${label}: ${formatCurrency(value)}`;
              } else if (insightsState.activeMetric === 'roi') {
                return `${label}: ${value.toFixed(2)}x`;
              } else {
                return `${label}: ${value}`;
              }
            }
          }
        }
      },
      
      scales: {
        y: {
          beginAtZero: true,
          max: suggestedMax, // 🔥 USA max (não suggestedMax)
          
          ticks: {
            color: 'rgba(252, 228, 228, 0.7)',
            font: { family: 'Space Grotesk', size: 11 },
            padding: 10,
            callback: function(value) {
              if (insightsState.activeMetric === 'revenue' || insightsState.activeMetric === 'ticket') {
                return formatCurrency(value);
              } else if (insightsState.activeMetric === 'roi') {
                return value.toFixed(1) + 'x';
              }
              return value;
            }
          },
          grid: { 
            color: 'rgba(249, 115, 115, 0.08)',
            drawBorder: false
          }
        },
        x: {
          ticks: {
            color: 'rgba(252, 228, 228, 0.7)',
            font: { family: 'Space Grotesk', size: 11 }
          },
          grid: { 
            color: 'rgba(249, 115, 115, 0.05)',
            drawBorder: false
          }
        }
      }
    }
  });

  console.log("✅ Gráfico renderizado!");
}

function setupCardClickHandlers() {
  // Mapeia cards para suas métricas
  const cardMetricMap = {
    'faturamento-card': 'revenue',
    'roi-card': 'roi',
    'ticket-card': 'ticket',
    'pedidos-card': 'orders'
  };

  // Adiciona evento de clique em cada card
  Object.keys(cardMetricMap).forEach(cardClass => {
    const card = document.querySelector(`.${cardClass}`);
    if (card) {
      card.addEventListener('click', () => {
        const metric = cardMetricMap[cardClass];
        console.log(`🎯 Card clicado: ${metric}`);
        
        // Atualiza estado
        insightsState.activeMetric = metric;
        
        // Atualiza classes dos cards
        document.querySelectorAll('.premium-card').forEach(c => {
          c.classList.remove('active-metric');
        });
        card.classList.add('active-metric');
        
        // Re-renderiza o gráfico
        if (insightsState.timelineData) {
          renderInsightsChart(insightsState.timelineData);
        }
      });
    }
  });

  // Ativa o card de Faturamento por padrão
  const revenueCard = document.querySelector('.faturamento-card');
  if (revenueCard) {
    revenueCard.classList.add('active-metric');
  }
}
let timingChartInstance      = null;
let topProductsChartInstance = null;
let peakHoursChartInstance   = null;
// ========================================
// 📊 GRÁFICO 1: ORIGEM DOS PEDIDOS (Pizza)
function renderOriginChart(data) {
  const canvas = document.getElementById("originChart");
  if (!canvas) return;

  // ✅ APENAS IA E BALCÃO
  const iaOrders = data.orders_by_origin?.ia_whatsapp || 0;
const balcaoOrders = data.orders_by_origin?.balcao || 0;
const ifoodOrders = data.orders_by_origin?.ifood || 0;
const aiqfomeOrders = data.orders_by_origin?.aiqfome || 0;
const autoatendimentoOrders = data.orders_by_origin?.autoatendimento || 0;

  if (originChartInstance) {
    originChartInstance.destroy();
  }

  originChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
    labels: [' IA WhatsApp', ' iFood', ' Aiqfome', ' Autoatendimento', ' Balcão'],
datasets: [{
  data: [iaOrders, ifoodOrders, aiqfomeOrders, autoatendimentoOrders, balcaoOrders],
  backgroundColor: [
    'rgba(34, 197, 94, 0.9)',    // Verde - IA WhatsApp
    'rgba(239, 68, 68, 0.9)',    // Vermelho - iFood
    'rgba(139, 92, 246, 0.9)',   // Roxo - Aiqfome
    'rgba(30, 30, 30, 0.9)',     // Preto - Anota Aí
    'rgba(59, 130, 246, 0.9)'    // Azul - Balcão
  ],
  borderColor: [
    'rgba(34, 197, 94, 1)',
    'rgba(239, 68, 68, 1)',
    'rgba(139, 92, 246, 1)',
    'rgba(30, 30, 30, 1)',
    'rgba(59, 130, 246, 1)'
  ],
  borderWidth: 3
}]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
  position: 'bottom',
  labels: {
    color: 'rgba(252, 228, 228, 0.9)',
    font: { size: 11, family: 'Space Grotesk', weight: '700' },
    padding: 10,
    boxWidth: 12,
    boxHeight: 12
  }
},
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: 'rgba(252, 228, 228, 0.95)',
          bodyColor: 'rgba(252, 228, 228, 0.8)',
          borderColor: 'rgba(249, 115, 115, 0.5)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${label}: ${value} pedidos (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

// ========================================
// 📊 GRÁFICO 2: DELIVERY VS LOCAL (Barras)
// ========================================
function renderServiceChart(data) {
  const canvas = document.getElementById("serviceChart");
  if (!canvas) return;

  const deliveryOrders = data.orders_by_service_type?.delivery || 0;
  const localOrders = data.orders_by_service_type?.local || 0;

  if (serviceChartInstance) {
    serviceChartInstance.destroy();
  }

  serviceChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['🚚 Delivery', '🏪 Local'],
      datasets: [{
        label: 'Pedidos',
        data: [deliveryOrders, localOrders],
        backgroundColor: [
          'rgba(251, 191, 36, 0.8)',  // Dourado - Delivery
          'rgba(249, 115, 115, 0.8)'  // Vermelho - Local
        ],
        borderColor: [
          'rgba(251, 191, 36, 1)',
          'rgba(249, 115, 115, 1)'
        ],
        borderWidth: 3,
        borderRadius: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: 'rgba(252, 228, 228, 0.95)',
          bodyColor: 'rgba(252, 228, 228, 0.8)',
          borderColor: 'rgba(249, 115, 115, 0.5)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              const value = context.parsed.y || 0;
              const total = deliveryOrders + localOrders;
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${value} pedidos (${percentage}%)`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: 'rgba(252, 228, 228, 0.7)',
            font: { family: 'Space Grotesk' }
          },
          grid: { color: 'rgba(249, 115, 115, 0.1)' }
        },
        x: {
          ticks: {
            color: 'rgba(252, 228, 228, 0.9)',
            font: { size: 14, family: 'Space Grotesk', weight: 'bold' }
          },
          grid: { display: false }
        }
      }
    }
  });
}

// ========================================
// 📊 GRÁFICO 3: BASE DE CLIENTES (Pizza)
// ========================================
function renderClientsChart(data) {
  const canvas = document.getElementById("clientsChart");
  if (!canvas) return;

  const newClients = data.client_base?.new_clients || 0;
  const recurringClients = data.client_base?.recurring_clients || 0;

  if (clientsChartInstance) {
    clientsChartInstance.destroy();
  }

  clientsChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['🆕 Novos', '🔄 Recorrentes'],
      datasets: [{
        data: [newClients, recurringClients],
        backgroundColor: [
          'rgba(34, 197, 94, 0.9)',   // Verde - Novos
          'rgba(139, 92, 246, 0.9)'   // Roxo - Recorrentes
        ],
        borderColor: [
          'rgba(34, 197, 94, 1)',
          'rgba(139, 92, 246, 1)'
        ],
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: 'rgba(252, 228, 228, 0.9)',
            font: { size: 13, family: 'Space Grotesk', weight: '600' },
            padding: 15
          }
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: 'rgba(252, 228, 228, 0.95)',
          bodyColor: 'rgba(252, 228, 228, 0.8)',
          borderColor: 'rgba(249, 115, 115, 0.5)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${label}: ${value} clientes (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

// ⏱️ TEMPO MÉDIO POR ETAPA
async function fetchAndRenderTiming() {
  const rid = getRestaurantId();
  if (!rid) return;
  try {
    const resp = await fetch(`${METRICS_URL}/${rid}/timing?period=${resultsState.period}`);
    const data = await resp.json();
    if (!resp.ok) return;
    renderTimingChart(data);
  } catch (e) {
    console.error("Erro timing:", e);
  }
}

function renderTimingChart(data) {
  const canvas = document.getElementById("timingChart");
  if (!canvas) return;
  const { medias, metas } = data;
  const labels = ['⏳ Confirmação', '👨‍🍳 Preparo', '📦 Montagem', '🚚 Entrega'];
  const valores = [medias.confirmacao, medias.preparo, medias.montagem, medias.entrega];
  const metasArr = [metas.confirmacao, metas.preparo, metas.montagem, metas.entrega];
  const cores = valores.map((v, i) => v <= metasArr[i] ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.85)');
  const coresBorda = valores.map((v, i) => v <= metasArr[i] ? 'rgba(34,197,94,1)' : 'rgba(239,68,68,1)');
  if (timingChartInstance) timingChartInstance.destroy();
  timingChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Tempo Médio (min)', data: valores, backgroundColor: cores, borderColor: coresBorda, borderWidth: 3, borderRadius: 10, borderSkipped: false },
        { label: 'Meta', data: metasArr, type: 'line', borderColor: 'rgba(251,191,36,0.9)', borderDash: [6,4], borderWidth: 2, pointBackgroundColor: 'rgba(251,191,36,1)', pointRadius: 5, fill: false, tension: 0 }
      ]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { color: 'rgba(252,228,228,0.8)', font: { family: 'Space Grotesk', size: 12, weight: '700' }, padding: 16 } },
        tooltip: {
          backgroundColor: 'rgba(17,24,39,0.95)', titleColor: 'rgba(252,228,228,0.95)', bodyColor: 'rgba(252,228,228,0.8)', padding: 12,
          callbacks: { label: function(ctx) {
            const v = ctx.parsed.x || 0;
            if (ctx.datasetIndex === 0) {
              const diff = v - metasArr[ctx.dataIndex];
              return [`Média: ${v.toFixed(1)} min`, diff <= 0 ? `✅ ${Math.abs(diff).toFixed(1)}min abaixo da meta` : `🔴 ${diff.toFixed(1)}min acima da meta`];
            }
            return `Meta: ${v} min`;
          }}
        }
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: 'rgba(252,228,228,0.7)', font: { family: 'Space Grotesk', size: 11 }, callback: v => `${v} min` }, grid: { color: 'rgba(249,115,115,0.08)' } },
        y: { ticks: { color: 'rgba(252,228,228,0.9)', font: { family: 'Space Grotesk', size: 13, weight: '700' } }, grid: { display: false } }
      }
    }
  });
}

// 🏆 PRODUTOS MAIS VENDIDOS
function normalizarNome(nome) {
  return String(nome || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function renderTopProductsChart(allOrders) {
  const canvas = document.getElementById("topProductsChart");
  if (!canvas) return;
  const days = resultsState.period === "all" ? 3650 : (parseInt(resultsState.period) || 30);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const ranking = {};
  (allOrders || []).forEach(o => {
    if (new Date(o.created_at) < startDate) return;
    (o.itens || []).forEach(item => {
      const nome = normalizarNome(item.name || item.nome || "");
      if (!nome) return;
      ranking[nome] = (ranking[nome] || 0) + (item.qty || item.quantidade || 1);
    });
  });
  const sorted = Object.entries(ranking).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (sorted.length === 0) return;
  const labels = sorted.map(([nome]) => nome.charAt(0).toUpperCase() + nome.slice(1));
  const valores = sorted.map(([, qty]) => qty);
  const cores = ['rgba(251,191,36,0.85)','rgba(249,115,115,0.85)','rgba(139,92,246,0.85)','rgba(34,197,94,0.85)','rgba(59,130,246,0.85)','rgba(236,72,153,0.85)','rgba(251,191,36,0.6)','rgba(249,115,115,0.6)','rgba(139,92,246,0.6)','rgba(34,197,94,0.6)'];
  if (topProductsChartInstance) topProductsChartInstance.destroy();
  topProductsChartInstance = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Unidades vendidas', data: valores, backgroundColor: cores, borderWidth: 2, borderRadius: 8, borderSkipped: false }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: 'rgba(17,24,39,0.95)', titleColor: 'rgba(252,228,228,0.95)', bodyColor: 'rgba(252,228,228,0.8)', padding: 12, callbacks: { label: ctx => ` ${ctx.parsed.x} unidades` } }
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: 'rgba(252,228,228,0.7)', font: { family: 'Space Grotesk', size: 11 } }, grid: { color: 'rgba(249,115,115,0.08)' } },
        y: { ticks: { color: 'rgba(252,228,228,0.9)', font: { family: 'Space Grotesk', size: 12, weight: '700' } }, grid: { display: false } }
      }
    }
  });
}

// 🕐 PICO DE VENDAS POR HORÁRIO
function renderPeakHoursChart(allOrders) {
  const canvas = document.getElementById("peakHoursChart");
  if (!canvas) return;
  const days = resultsState.period === "all" ? 3650 : (parseInt(resultsState.period) || 30);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const porHora = Array(24).fill(0);
  (allOrders || []).forEach(o => {
    if (new Date(o.created_at) < startDate) return;
    porHora[new Date(o.created_at).getHours()]++;
  });
  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}h`);
  const maxVal = Math.max(...porHora);
  const cores = porHora.map(v => `rgba(249,115,115,${0.2 + (maxVal > 0 ? v/maxVal : 0) * 0.75})`);
  if (peakHoursChartInstance) peakHoursChartInstance.destroy();
  peakHoursChartInstance = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Pedidos', data: porHora, backgroundColor: cores, borderWidth: 2, borderRadius: 6, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: 'rgba(17,24,39,0.95)', titleColor: 'rgba(252,228,228,0.95)', bodyColor: 'rgba(252,228,228,0.8)', padding: 12,
          callbacks: { title: ctx => `${ctx[0].label} — ${String(parseInt(ctx[0].label)+1).padStart(2,'0')}h`, label: ctx => ` ${ctx.parsed.y} pedidos` }
        }
      },
      scales: {
        x: { ticks: { color: 'rgba(252,228,228,0.6)', font: { family: 'Space Grotesk', size: 10 }, maxRotation: 0 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: 'rgba(252,228,228,0.7)', font: { family: 'Space Grotesk', size: 11 } }, grid: { color: 'rgba(249,115,115,0.08)' } }
      }
    }
  });
}

// ========================================
// 📊 GRÁFICO 4: STATUS OPERACIONAL (Pizza GRANDE)
// ========================================
function renderStatusChart(data) {
  const canvas = document.getElementById("statusChart");
  if (!canvas) return;

  const pending = data.orders_by_status?.pending || 0;
  const preparing = data.orders_by_status?.preparing || 0;
  const mounting = data.orders_by_status?.mounting || 0;
  const delivering = data.orders_by_status?.delivering || 0;
  const finished = data.orders_by_status?.finished || 0;
  const canceled = data.orders_by_status?.canceled || 0;

  if (statusChartInstance) {
    statusChartInstance.destroy();
  }

  statusChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: [
        '⏳ Aguardando',
        '👨‍🍳 Em Preparo',
        '📦 Montando',
        '🚚 Entregando',
        '✅ Finalizados',
        '❌ Cancelados'
      ],
      datasets: [{
        data: [pending, preparing, mounting, delivering, finished, canceled],
        backgroundColor: [
          'rgba(251, 191, 36, 0.9)',  // Amarelo - Pendente
          'rgba(249, 115, 115, 0.9)', // Vermelho - Preparo
          'rgba(139, 92, 246, 0.9)',  // Roxo - Montando
          'rgba(59, 130, 246, 0.9)',  // Azul - Entregando
          'rgba(34, 197, 94, 0.9)',   // Verde - Finalizado
          'rgba(107, 114, 128, 0.9)'  // Cinza - Cancelado
        ],
        borderColor: [
          'rgba(251, 191, 36, 1)',
          'rgba(249, 115, 115, 1)',
          'rgba(139, 92, 246, 1)',
          'rgba(59, 130, 246, 1)',
          'rgba(34, 197, 94, 1)',
          'rgba(107, 114, 128, 1)'
        ],
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: 'rgba(252, 228, 228, 0.9)',
            font: { size: 13, family: 'Space Grotesk', weight: '600' },
            padding: 15,
            boxWidth: 15,
            boxHeight: 15
          }
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: 'rgba(252, 228, 228, 0.95)',
          bodyColor: 'rgba(252, 228, 228, 0.8)',
          borderColor: 'rgba(249, 115, 115, 0.5)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${label}: ${value} pedidos (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

// ========================================
// 🎨 FUNÇÃO PARA ATUALIZAR A UI COMPLETA
// ========================================
function renderMetricsUI(data) {
  console.log("📊 Renderizando métricas:", data);
  
  // Helper function para definir texto com segurança
  const safeSetText = (id, value) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = value;
    } else {
      console.warn(`⚠️ Elemento não encontrado: ${id}`);
    }
  };
  
  // Cards principais
  const revenue = data.total_revenue || 0;
  safeSetText("card-revenue", formatCurrency(revenue));
  
  const roi = revenue / restaurantPlanPrice;
  safeSetText("card-roi", `${roi.toFixed(1)}x`);
  
  const avgTicket = data.average_ticket || 0;
  safeSetText("card-ticket", formatCurrency(avgTicket));
  
  safeSetText("card-orders", data.total_orders || 0);
  safeSetText("card-plan-price", formatCurrency(restaurantPlanPrice));
  
// Gráficos
  console.log("🎨 Renderizando gráficos...");
  renderAllCharts(data);
  fetchAndRenderInsights(); // 🔥 ADICIONE ESTA LINHA
  console.log("✅ Métricas renderizadas com sucesso!");
  fetchAndRenderTiming();
  renderTopProductsChart(orders);
  renderPeakHoursChart(orders);
  

  // Performance IA
  safeSetText("ia-orders", data.ia_performance?.orders || 0);
  safeSetText("ia-revenue", formatCurrency(data.ia_performance?.revenue || 0));
  safeSetText("ia-percentage", `${(data.ia_performance?.percentage || 0).toFixed(1)}%`);
  
  // Gráficos
  console.log("🎨 Renderizando gráficos...");
  renderAllCharts(data);
  console.log("✅ Métricas renderizadas com sucesso!");
}

function renderComparison(elementId, percentage) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  const isPositive = percentage >= 0;
  const arrow = isPositive ? "↑" : "↓";
  const color = isPositive ? "#22c55e" : "#ef4444";
  
  el.textContent = `${arrow} ${Math.abs(percentage).toFixed(1)}%`;
  el.style.color = color;
  el.style.fontWeight = '700';
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

// ========================================
// 📱 AUTOATENDIMENTO
// ========================================
let cardapioItems = [];

async function initAutoatendimento() {
  setupAutoatendimentoTabs();
  document.getElementById("painel-mesas")?.classList.remove("hidden");

  // 🔥 ADICIONE ISTO:
  const dominioSalvo = localStorage.getItem("cardapio_url");
  const el = document.getElementById("input-dominio-cardapio");
  if (dominioSalvo && el) el.value = dominioSalvo;
}

function setupAutoatendimentoTabs() {
  const tabMesas = document.getElementById("tab-mesas");
  const painelMesas = document.getElementById("painel-mesas");

  tabMesas?.addEventListener("click", () => {
    painelMesas.classList.remove("hidden");
  });

  document.getElementById("btn-gerar-qr")?.addEventListener("click", gerarQrCodes);
}

async function fetchCardapio() {
  const rid = getRestaurantId();
  if (!rid) return;
  try {
    const resp = await fetch(`${API_BASE}/api/v1/cardapio/${rid}`);
    const data = await resp.json();
    cardapioItems = Array.isArray(data) ? data : [];
    renderCardapio();
  } catch (e) {
    console.error("Erro ao buscar cardápio:", e);
  }
}

function renderCardapio() {
  const lista = document.getElementById("lista-cardapio-view") || document.getElementById("lista-cardapio");
  if (!lista) return;

  if (cardapioItems.length === 0) {
    lista.innerHTML = `<p style="color:rgba(252,228,228,0.5); text-align:center; padding:40px 0;">Nenhum item cadastrado. Clique em "+ Novo Item" para começar.</p>`;
    return;
  }

  const categorias = {};
  cardapioItems.forEach(item => {
    const cat = item.categoria || "Geral";
    if (!categorias[cat]) categorias[cat] = [];
    categorias[cat].push(item);
  });

  lista.innerHTML = Object.entries(categorias).map(([cat, itens]) => `
    <div style="margin-bottom:24px;">
      <h4 style="color:rgba(252,228,228,0.6); font-size:12px; text-transform:uppercase; letter-spacing:2px; margin-bottom:12px;">${cat}</h4>
      <div class="sortable-list" data-categoria="${cat}">
        ${itens.map(item => `
          <div class="sortable-item" data-id="${item.id}" draggable="true"
            onclick="openItemDetailModal(${JSON.stringify(item).replace(/"/g, '&quot;')})"
            style="display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:rgba(46,8,8,0.45); border:1px solid rgba(91,28,28,0.85); border-radius:12px; margin-bottom:8px; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span class="drag-handle" style="cursor:grab; font-size:16px; color:rgba(252,228,228,0.3); padding:0 4px;">⠿</span>
              <div style="width:10px; height:10px; border-radius:50%; background:${item.ativo ? 'rgba(34,197,94,1)' : 'rgba(107,114,128,1)'}"></div>
              <div>
                <div style="color:rgba(252,228,228,0.95); font-weight:700; font-size:14px;">${escapeHtml(item.nome)}</div>
                ${item.descricao ? `<div style="color:rgba(252,228,228,0.5); font-size:12px;">${escapeHtml(item.descricao)}</div>` : ""}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="color:rgba(251,191,36,1); font-weight:900; font-size:16px;">${formatCurrency(item.preco)}</span>
              <button onclick="event.stopPropagation(); toggleAtivo('${item.id}', ${item.ativo})" style="padding:6px 10px; border-radius:8px; border:1px solid rgba(91,28,28,0.85); background:transparent; color:rgba(252,228,228,0.7); cursor:pointer; font-size:11px;">
                ${item.ativo ? "Desativar" : "Ativar"}
              </button>
              <button onclick="event.stopPropagation(); openItemModal(${JSON.stringify(item).replace(/"/g, '&quot;')})" style="padding:6px 10px; border-radius:8px; border:1px solid rgba(91,28,28,0.85); background:transparent; color:rgba(252,228,228,0.7); cursor:pointer; font-size:11px;">
                Editar
              </button>
              <button onclick="event.stopPropagation(); deletarItem('${item.id}')" style="padding:6px 10px; border-radius:8px; border:1px solid rgba(239,68,68,0.5); background:transparent; color:rgba(239,68,68,0.8); cursor:pointer; font-size:11px;">
                Excluir
              </button>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  // Ativa drag and drop em todas as listas
  document.querySelectorAll('.sortable-list').forEach(list => setupDragDrop(list));
}

function setupDragDrop(list) {
  let dragEl = null;

  list.querySelectorAll('.sortable-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragEl = item;
      setTimeout(() => item.style.opacity = '0.4', 0);
    });

    item.addEventListener('dragend', () => {
      item.style.opacity = '1';
      dragEl = null;
      salvarOrdem(list);
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragEl || dragEl === item) return;
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        list.insertBefore(dragEl, item);
      } else {
        list.insertBefore(dragEl, item.nextSibling);
      }
    });
  });
}

async function salvarOrdem(list) {
  const ids = [...list.querySelectorAll('.sortable-item')].map(el => el.dataset.id);
  
  try {
    await Promise.all(ids.map((id, index) =>
      fetch(`${API_BASE}/api/v1/cardapio/${id}`, {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify({ ordem: index })
      })
    ));
    // Atualiza a ordem local sem re-renderizar tudo
    ids.forEach((id, index) => {
      const item = cardapioItems.find(i => i.id === id);
      if (item) item.ordem = index;
    });
  } catch (e) {
    console.error("Erro ao salvar ordem:", e);
  }
}

function openItemModal(item = null) {
  const existing = document.getElementById("item-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "item-modal";
  modal.className = "modal-backdrop open";

  modal.innerHTML = `
    <div class="modal confirm-modal">
      <div class="modal-header">
        <h3>${item ? "✏️ Editar Item" : "➕ Novo Item"}</h3>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:12px; max-height:70vh; overflow-y:auto;">
        <label style="color:rgba(252,228,228,0.8); font-size:13px;">Nome *
          <input id="item-nome" value="${item ? escapeHtml(item.nome) : ""}" placeholder="Ex: X-Burguer"
            style="width:100%; margin-top:6px; padding:10px 14px; border-radius:10px; border:1px solid rgba(91,28,28,0.85); background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:14px; outline:none;" />
        </label>
        <label style="color:rgba(252,228,228,0.8); font-size:13px;">Descrição
          <input id="item-descricao" value="${item ? escapeHtml(item.descricao || "") : ""}" placeholder="Ex: Pão, carne, queijo..."
            style="width:100%; margin-top:6px; padding:10px 14px; border-radius:10px; border:1px solid rgba(91,28,28,0.85); background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:14px; outline:none;" />
        </label>
        <label style="color:rgba(252,228,228,0.8); font-size:13px;">Preço *
          <input id="item-preco" value="${item ? item.preco : ""}" placeholder="0,00" inputmode="decimal"
            style="width:100%; margin-top:6px; padding:10px 14px; border-radius:10px; border:1px solid rgba(91,28,28,0.85); background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:14px; outline:none;" />
        </label>
        <label style="color:rgba(252,228,228,0.8); font-size:13px;">Categoria
          <input id="item-categoria" value="${item ? escapeHtml(item.categoria || "") : ""}" placeholder="Ex: Lanches, Bebidas..."
            style="width:100%; margin-top:6px; padding:10px 14px; border-radius:10px; border:1px solid rgba(91,28,28,0.85); background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:14px; outline:none;" />
        </label>

        <label style="color:rgba(252,228,228,0.8); font-size:13px;">Fotos do Item (até 3)
          <div style="display:flex; gap:10px; margin-top:8px;">
            ${[0,1,2].map(i => {
              const url = getFotoUrl(item, i);
              return `
              <div style="flex:1; position:relative;">
                <div id="dropzone-${i}" style="
                  border:2px dashed rgba(249,115,115,0.5);
                  border-radius:12px; padding:12px; text-align:center;
                  cursor:pointer; background:rgba(46,8,8,0.3); position:relative;
                  min-height:90px; display:flex; flex-direction:column;
                  align-items:center; justify-content:center; gap:6px;
                ">
                  ${url ? `
                    <img src="${url}" style="width:100%; height:70px; object-fit:cover; border-radius:8px;" />
                    <button type="button" onclick="removerFoto(${i})" style="
                      position:absolute; top:4px; right:4px; width:20px; height:20px;
                      border-radius:50%; border:none; background:rgba(239,68,68,0.9);
                      color:white; font-size:11px; cursor:pointer; line-height:1;
                    ">×</button>
                  ` : `
                    <div style="font-size:22px;">📷</div>
                    <div style="color:rgba(252,228,228,0.4); font-size:10px;">Foto ${i+1}</div>
                  `}
                  <input type="file" id="file-${i}" accept="image/*" style="
                    position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%;
                  " />
                </div>
                <input type="hidden" id="foto-url-${i}" value="${url}" />
              </div>`;
            }).join('')}
          </div>
        </label>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" id="item-cancel">Cancelar</button>
        <button class="primary-button" id="item-save">Salvar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById("item-preco").addEventListener("input", function() { formatMoneyInput(this); });

  [0,1,2].forEach(i => {
    document.getElementById(`file-${i}`).addEventListener("change", async function() {
      if (this.files[0]) await handleFileUploadSlot(this.files[0], i);
    });
  });

  document.getElementById("item-cancel").addEventListener("click", () => modal.remove());
  document.getElementById("item-save").addEventListener("click", () => salvarItem(item?.id));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

function getFotoUrl(item, index) {
  if (!item || !item.foto_url) return "";
  try {
    const parsed = JSON.parse(item.foto_url);
    if (Array.isArray(parsed)) return parsed[index] || "";
    return index === 0 ? item.foto_url : "";
  } catch {
    return index === 0 ? item.foto_url : "";
  }
}

function getFotos(item) {
  if (!item || !item.foto_url) return [];
  try {
    const parsed = JSON.parse(item.foto_url);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    return [item.foto_url];
  } catch {
    return [item.foto_url];
  }
}

function removerFoto(index) {
  document.getElementById(`foto-url-${index}`).value = "";
  const dropzone = document.getElementById(`dropzone-${index}`);
  dropzone.innerHTML = `
    <div style="font-size:22px;">📷</div>
    <div style="color:rgba(252,228,228,0.4); font-size:10px;">Foto ${index+1}</div>
    <input type="file" id="file-${index}" accept="image/*" style="
      position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%;
    " />
  `;
  document.getElementById(`file-${index}`).addEventListener("change", async function() {
    if (this.files[0]) await handleFileUploadSlot(this.files[0], index);
  });
}

async function handleFileUploadSlot(file, index) {
  const croppedBlob = await openCropModal(file);
  if (!croppedBlob) return;

  const croppedUrl = URL.createObjectURL(croppedBlob);
  const dropzone = document.getElementById(`dropzone-${index}`);

  dropzone.innerHTML = `
    <img src="${croppedUrl}" style="width:100%; height:70px; object-fit:cover; border-radius:8px;" />
    <button type="button" onclick="removerFoto(${index})" style="
      position:absolute; top:4px; right:4px; width:20px; height:20px;
      border-radius:50%; border:none; background:rgba(239,68,68,0.9);
      color:white; font-size:11px; cursor:pointer; line-height:1;
    ">×</button>
    <input type="file" id="file-${index}" accept="image/*" style="
      position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%;
    " />
  `;

  document.getElementById(`file-${index}`).addEventListener("change", async function() {
    if (this.files[0]) await handleFileUploadSlot(this.files[0], index);
  });

  try {
    const formData = new FormData();
    formData.append('file', croppedBlob, 'foto.jpg');
    const resp = await fetch(`${API_BASE}/api/v1/upload-image`, { method: 'POST', body: formData });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erro no upload');
    document.getElementById(`foto-url-${index}`).value = data.url;
    dropzone.querySelector('img').src = data.url;
  } catch (e) {
    alert('Erro ao enviar imagem: ' + e.message);
    document.getElementById(`foto-url-${index}`).value = "";
  }
}

function openItemDetailModal(item) {
  const existing = document.getElementById("item-detail-modal");
  if (existing) existing.remove();

  const fotos = getFotos(item);
  const temFotos = fotos.length > 0;

  const modal = document.createElement("div");
  modal.id = "item-detail-modal";
  modal.className = "modal-backdrop open";

  modal.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header">
        <h3>${escapeHtml(item.nome)}</h3>
        <button class="icon-button" id="close-item-detail">×</button>
      </div>
      <div class="modal-body" style="gap:16px;">

        ${temFotos ? `
        <!-- CARROSSEL -->
        <div style="position:relative; border-radius:14px; overflow:hidden; background:rgba(0,0,0,0.3);">
          <div id="carrossel-track" style="display:flex; transition:transform 0.3s ease;">
            ${fotos.map(url => `
              <img src="${url}" style="min-width:100%; height:220px; object-fit:cover; flex-shrink:0;" />
            `).join('')}
          </div>

          ${fotos.length > 1 ? `
          <button onclick="carrosselAnterior()" style="
            position:absolute; left:10px; top:50%; transform:translateY(-50%);
            width:34px; height:34px; border-radius:50%; border:none;
            background:rgba(0,0,0,0.6); color:white; font-size:18px;
            cursor:pointer; display:flex; align-items:center; justify-content:center;
          ">‹</button>
          <button onclick="carrosselProximo(${fotos.length})" style="
            position:absolute; right:10px; top:50%; transform:translateY(-50%);
            width:34px; height:34px; border-radius:50%; border:none;
            background:rgba(0,0,0,0.6); color:white; font-size:18px;
            cursor:pointer; display:flex; align-items:center; justify-content:center;
          ">›</button>

          <!-- BOLINHAS -->
          <div style="position:absolute; bottom:10px; left:50%; transform:translateX(-50%); display:flex; gap:6px;">
            ${fotos.map((_, i) => `
              <div id="bolinha-${i}" style="
                width:8px; height:8px; border-radius:50%;
                background:${i === 0 ? 'white' : 'rgba(255,255,255,0.4)'};
                cursor:pointer; transition:all 0.2s;
              " onclick="irParaFoto(${i}, ${fotos.length})"></div>
            `).join('')}
          </div>
          ` : ''}
        </div>
        ` : ''}

        <!-- INFORMAÇÕES -->
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="color:rgba(252,228,228,0.7); font-size:13px; font-weight:700; 
            background:rgba(91,28,28,0.5); padding:4px 12px; border-radius:999px;">
            ${escapeHtml(item.categoria || "Geral")}
          </span>
          <span style="color:rgba(251,191,36,1); font-size:26px; font-weight:900; 
            font-family:'Space Grotesk',sans-serif;">
            ${formatCurrency(item.preco)}
          </span>
        </div>

        ${item.descricao ? `
        <p style="color:rgba(252,228,228,0.75); font-size:14px; line-height:1.6; margin:0;
          padding:12px; background:rgba(46,8,8,0.35); border-radius:10px; border:1px solid rgba(91,28,28,0.55);">
          ${escapeHtml(item.descricao)}
        </p>
        ` : ''}

        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:10px; height:10px; border-radius:50%; 
            background:${item.ativo ? 'rgba(34,197,94,1)' : 'rgba(107,114,128,1)'}"></div>
          <span style="color:rgba(252,228,228,0.6); font-size:13px;">
            ${item.ativo ? 'Disponível' : 'Indisponível'}
          </span>
        </div>

      </div>
      <div class="modal-actions">
        <button class="ghost-button" id="close-item-detail-2">Fechar</button>
        <button class="primary-button" onclick="document.getElementById('item-detail-modal').remove(); openItemModal(${JSON.stringify(item).replace(/"/g, '&quot;')})">
          ✏️ Editar
        </button>
      </div>
    </div>
  `;

  // Estado do carrossel
  window._carrosselIndex = 0;

  document.body.appendChild(modal);
  document.getElementById("close-item-detail").addEventListener("click", () => modal.remove());
  document.getElementById("close-item-detail-2").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

// Funções do carrossel
function irParaFoto(index, total) {
  window._carrosselIndex = index;
  const track = document.getElementById("carrossel-track");
  if (track) track.style.transform = `translateX(-${index * 100}%)`;
  for (let i = 0; i < total; i++) {
    const b = document.getElementById(`bolinha-${i}`);
    if (b) b.style.background = i === index ? 'white' : 'rgba(255,255,255,0.4)';
  }
}

function carrosselProximo(total) {
  const next = (window._carrosselIndex + 1) % total;
  irParaFoto(next, total);
}

function carrosselAnterior() {
  const track = document.getElementById("carrossel-track");
  if (!track) return;
  const total = track.children.length;
  const prev = (window._carrosselIndex - 1 + total) % total;
  irParaFoto(prev, total);
}

function setupFotoDropzone(existingUrl = "") {
  const dropzone = document.getElementById("foto-dropzone");
  const fileInput = document.getElementById("foto-file-input");
  const preview = document.getElementById("foto-preview");
  const previewWrap = document.getElementById("foto-preview-wrap");
  const placeholder = document.getElementById("foto-placeholder");
  const hiddenInput = document.getElementById("item-foto");

  if (existingUrl) {
    preview.src = existingUrl;
    previewWrap.style.display = "block";
    placeholder.style.display = "none";
  }

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "rgba(249,115,115,0.9)";
    dropzone.style.background = "rgba(249,115,115,0.1)";
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.style.borderColor = "rgba(249,115,115,0.5)";
    dropzone.style.background = "rgba(46,8,8,0.3)";
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "rgba(249,115,115,0.5)";
    dropzone.style.background = "rgba(46,8,8,0.3)";
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) handleFileUpload(file);
  });
}

function resizeImage(file, maxWidth, maxHeight) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Mantém proporção
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
    };

    img.src = url;
  });
}

// ── CROP ──
let cropperInstance = null;
let cropResolve = null;

function openCropModal(file) {
  return new Promise((resolve) => {
    cropResolve = resolve;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.getElementById('crop-image');
      img.src = e.target.result;

      document.getElementById('crop-modal-backdrop').classList.remove('hidden');

      // Destrói instância anterior se houver
      if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
      }

      // Espera o img carregar antes de iniciar o Cropper
      img.onload = () => {
        cropperInstance = new Cropper(img, {
          aspectRatio: 1,         // quadrado — igual Instagram
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 0.9,
          restore: false,
          guides: false,
          center: false,
          highlight: false,
          cropBoxMovable: false,
          cropBoxResizable: false,
          toggleDragModeOnDblclick: false,
        });
      };
    };
    reader.readAsDataURL(file);
  });
}

function cancelCrop() {
  document.getElementById('crop-modal-backdrop').classList.add('hidden');
  if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
  if (cropResolve) { cropResolve(null); cropResolve = null; }
}

function confirmCrop() {
  if (!cropperInstance || !cropResolve) return;

  const canvas = cropperInstance.getCroppedCanvas({ width: 800, height: 800 });

  canvas.toBlob((blob) => {
    document.getElementById('crop-modal-backdrop').classList.add('hidden');
    cropperInstance.destroy();
    cropperInstance = null;

    const resolve = cropResolve;
    cropResolve = null;
    resolve(blob); // devolve o blob já recortado
  }, 'image/jpeg', 0.9);
}

async function handleFileUpload(file) {
  const previewEl = document.getElementById('foto-preview');
  const inputUrl  = document.getElementById('item-foto'); // ✅ era 'item-foto-url'

  // Mostra preview local imediatamente
  const localUrl = URL.createObjectURL(file);
  if (previewEl) {
    previewEl.src = localUrl;
    previewEl.style.display = 'block';
  }

  // Abre o modal de crop e espera a pessoa confirmar
  const croppedBlob = await openCropModal(file);

  if (!croppedBlob) {
    if (previewEl) { previewEl.src = ''; previewEl.style.display = 'none'; }
    if (inputUrl)  { inputUrl.value = ''; }
    return;
  }

  // Atualiza preview com a imagem recortada
  const croppedUrl = URL.createObjectURL(croppedBlob);
  if (previewEl) { previewEl.src = croppedUrl; }

  // Faz o upload
  try {
    const formData = new FormData();
    formData.append('file', croppedBlob, 'foto.jpg'); // ✅ era 'image'

    const resp = await fetch(`${API_BASE}/api/v1/upload-image`, {
      method: 'POST',
      body: formData // ✅ sem header Authorization
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erro no upload');

    if (inputUrl) { inputUrl.value = data.url; }
    if (previewEl) { previewEl.src = data.url; }

  } catch (e) {
    alert('Erro ao enviar imagem: ' + e.message);
    if (previewEl) { previewEl.src = ''; previewEl.style.display = 'none'; }
    if (inputUrl)  { inputUrl.value = ''; }
  }
}

async function salvarItem(id = null) {
  const rid = getRestaurantId();
  const nome = document.getElementById("item-nome").value.trim();
  const descricao = document.getElementById("item-descricao").value.trim();
  const precoRaw = document.getElementById("item-preco").value;
  const preco = parseFloat(precoRaw.replace(/\./g, "").replace(",", ".")) || 0;
  const categoria = document.getElementById("item-categoria").value.trim() || "Geral";

  const fotos = [0,1,2]
    .map(i => document.getElementById(`foto-url-${i}`)?.value?.trim() || "")
    .filter(url => url !== "");

  const foto_url = fotos.length === 0 ? null :
                   fotos.length === 1 ? fotos[0] :
                   JSON.stringify(fotos);

  if (!nome || !preco) { alert("Nome e preço são obrigatórios."); return; }

  try {
    if (id) {
      await fetch(`${API_BASE}/api/v1/cardapio/${id}`, {
        method: "PATCH", headers: buildHeaders(),
        body: JSON.stringify({ nome, descricao, preco, categoria, foto_url })
      });
    } else {
      await fetch(`${API_BASE}/api/v1/cardapio`, {
        method: "POST", headers: buildHeaders(),
        body: JSON.stringify({ restaurant_id: rid, nome, descricao, preco, categoria, foto_url })
      });
    }
    document.getElementById("item-modal")?.remove();
    await fetchCardapio();
  } catch (e) {
    alert("Erro ao salvar item.");
  }
}

async function toggleAtivo(id, ativoAtual) {
  await fetch(`${API_BASE}/api/v1/cardapio/${id}`, {
    method: "PATCH", headers: buildHeaders(),
    body: JSON.stringify({ ativo: !ativoAtual })
  });
  await fetchCardapio();
}

async function deletarItem(id) {
  showConfirmModal("Tem certeza que deseja excluir este item?", async () => {
    await fetch(`${API_BASE}/api/v1/cardapio/${id}`, { method: "DELETE", headers: buildHeaders() });
    await fetchCardapio();
  });
}

function toggleDominioConfig() {
  const pop = document.getElementById("dominio-popover");
  pop.style.display = pop.style.display === "none" ? "block" : "none";
  setTimeout(() => {
    document.addEventListener("click", closeDominioOnClickOutside, { once: true });
  }, 10);
}

function closeDominioOnClickOutside(e) {
  const pop = document.getElementById("dominio-popover");
  const btn = document.getElementById("btn-config-dominio");
  if (!pop?.contains(e.target) && !btn?.contains(e.target)) {
    if (pop) pop.style.display = "none";
  }
}

function salvarDominio() {
  const val = document.getElementById("input-dominio-cardapio")?.value.trim();
  if (!val) { alert("Digite o domínio antes de salvar."); return; }
  
  const hostname = val.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
  localStorage.setItem("cardapio_url", hostname);

  fetch(`${API_BASE}/api/v1/restaurante/${getRestaurantId()}/dominio-cardapio`, {
    method: "PATCH",
    headers: buildHeaders(),
    body: JSON.stringify({ dominio: hostname })
  });

  document.getElementById("dominio-popover").style.display = "none";
  const btn = document.getElementById("btn-config-dominio");
  btn.textContent = "✓";
  btn.style.color = "rgba(34,197,94,1)";
  setTimeout(() => { btn.textContent = "⋯"; btn.style.color = "rgba(252,228,228,0.7)"; }, 1500);
}

async function salvarImpressora() {
  const rid = getRestaurantId();
  const key = document.getElementById("settings-printnode-key").value.trim();
  const printer = document.getElementById("settings-printnode-printer").value.trim();
  const status = document.getElementById("settings-printer-status");

  if (!key || !printer) {
    status.textContent = "❌ Preencha API Key e Printer ID.";
    status.style.color = "rgba(239,68,68,0.9)";
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/impressora`, {
      method: "PATCH",
      headers: buildHeaders(),
      body: JSON.stringify({ printnode_api_key: key, printnode_printer_id: printer })
    });
    if (!resp.ok) throw new Error();
    status.textContent = "✅ Impressora salva com sucesso!";
    status.style.color = "rgba(34,197,94,0.9)";
  } catch (e) {
    status.textContent = "❌ Erro ao salvar. Tente novamente.";
    status.style.color = "rgba(239,68,68,0.9)";
  }
}

async function testarImpressora() {
  const rid = getRestaurantId();
  const status = document.getElementById("settings-printer-status");
  status.textContent = "⏳ Enviando teste...";
  status.style.color = "rgba(252,228,228,0.6)";

  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/impressora/teste`, {
      method: "POST",
      headers: buildHeaders()
    });
    const data = await resp.json();
    if (data.success) {
      status.textContent = "✅ Teste enviado! Verifique sua impressora.";
      status.style.color = "rgba(34,197,94,0.9)";
    } else {
      throw new Error();
    }
  } catch (e) {
    status.textContent = "❌ Falha no teste. Verifique API Key e Printer ID.";
    status.style.color = "rgba(239,68,68,0.9)";
  }
}

async function salvarRastreio() {
  const url = document.getElementById("settings-tracking-url").value.trim();
  const rid = getRestaurantId();
  const status = document.getElementById("settings-tracking-status");

  if (!url) {
    status.textContent = "❌ Digite a URL de rastreio.";
    status.style.color = "rgba(239,68,68,0.9)";
    return;
  }

  localStorage.setItem("tracking_url", url);

  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/tracking-url`, {
      method: "PATCH",
      headers: buildHeaders(),
      body: JSON.stringify({ tracking_url: url })
    });

    status.textContent = resp.ok ? "✅ URL salva!" : "❌ Erro ao salvar.";
    status.style.color = resp.ok ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)";
  } catch (e) {
    status.textContent = "❌ Erro de conexão.";
    status.style.color = "rgba(239,68,68,0.9)";
  }
}

function gerarQrCodes() {
  const qtd = parseInt(document.getElementById("input-mesas").value) || 10;
  const lista = document.getElementById("lista-qrcodes");
  if (!lista) return;

  let dominioRaw = (document.getElementById("input-dominio-cardapio")?.value || localStorage.getItem("fidelidade_url") || "").trim();
  if (!dominioRaw) {
    document.getElementById("dominio-popover").style.display = "block";
    document.getElementById("input-dominio-cardapio")?.focus();
    alert("Configure o domínio do cardápio antes (botão ⋯).");
    return;
  }

  const dominio = dominioRaw.startsWith("http") ? dominioRaw.replace(/\/$/, "") : `https://${dominioRaw.replace(/\/$/, "")}`;
  lista.innerHTML = "";

  // Barra de ações
  const printBar = document.createElement("div");
  printBar.style.cssText = "width:100%; margin-bottom:16px; display:flex; align-items:center; justify-content:space-between; gap:12px;";
  printBar.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px;">
      <input type="checkbox" id="select-all-qr" class="qr-checkbox"
  style="flex-shrink:0;"
  onchange="toggleSelectAllQr(this.checked)" />
      <label for="select-all-qr"
        style="color:rgba(252,228,228,0.8); font-size:13px; font-weight:700; cursor:pointer;">
        Selecionar todos
      </label>
      <span id="qr-selected-count"
        style="color:rgba(249,115,115,0.9); font-size:12px; font-weight:700; display:none;">
        0 selecionados
      </span>
    </div>
    <button onclick="imprimirQrCodes()" style="
      padding:10px 20px; border-radius:10px; border:none;
      background:rgba(249,115,115,0.85); color:#000;
      font-weight:800; font-size:13px; cursor:pointer;
      font-family:inherit;
    ">🖨️ Imprimir selecionados</button>
  `;
  lista.appendChild(printBar);

  // Grid dos QR codes
  const grid = document.createElement("div");
  grid.id = "qr-grid";
  grid.style.cssText = "display:flex; flex-wrap:wrap; gap:16px;";
  lista.appendChild(grid);

  for (let i = 1; i <= qtd; i++) {
    const url = `${dominio}?mesa=${i}`;
    const div = document.createElement("div");
    div.dataset.mesa = i;
    div.dataset.url = url;
    div.style.cssText = `
      display:flex; flex-direction:column; align-items:center; gap:8px;
      padding:16px; background:rgba(46,8,8,0.45);
      border:1px solid rgba(91,28,28,0.85); border-radius:12px;
      position:relative; cursor:pointer; transition:border-color 0.2s;
    `;

    div.innerHTML = `
      <input type="checkbox" class="qr-checkbox" data-mesa="${i}"
         style="position:absolute; bottom:10px; right:10px; z-index:2;"
        onchange="onQrCheckboxChange()" />
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}"
        alt="QR Mesa ${i}" style="border-radius:8px;" />
      <span style="color:rgba(252,228,228,0.9); font-weight:700; font-size:13px;">Mesa ${i}</span>
      <a href="${url}" target="_blank"
        style="color:rgba(249,115,115,0.8); font-size:10px; text-decoration:none;
          word-break:break-all; text-align:center; max-width:130px;"
        onclick="event.stopPropagation()">
        ${url}
      </a>
    `;

    // Clique no card seleciona/deseleciona
    div.addEventListener("click", (e) => {
      if (e.target.tagName === "A" || e.target.tagName === "INPUT") return;
      const cb = div.querySelector(".qr-checkbox");
      cb.checked = !cb.checked;
      onQrCheckboxChange();
    });

    grid.appendChild(div);
  }
}

function onQrCheckboxChange() {
  const all = document.querySelectorAll(".qr-checkbox");
  const checked = [...all].filter(cb => cb.checked);
  const selectAll = document.getElementById("select-all-qr");
  const counter = document.getElementById("qr-selected-count");

  if (selectAll) {
    selectAll.checked = checked.length === all.length;
    selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
  }

  if (counter) {
    if (checked.length > 0) {
      counter.style.display = "inline";
      counter.textContent = `${checked.length} selecionado(s)`;
    } else {
      counter.style.display = "none";
    }
  }

  // Destaca cards selecionados
  document.querySelectorAll("#qr-grid > div[data-mesa]").forEach(card => {
    const cb = card.querySelector(".qr-checkbox");
    card.style.borderColor = cb?.checked
      ? "rgba(249,115,115,0.9)"
      : "rgba(91,28,28,0.85)";
  });
}

function toggleSelectAllQr(checked) {
  document.querySelectorAll(".qr-checkbox").forEach(cb => cb.checked = checked);
  onQrCheckboxChange();
}

function imprimirQrCodes() {
  const grid = document.getElementById("qr-grid");
  if (!grid) return;

  const allCards = grid.querySelectorAll("div[data-mesa]");
  const checkedCards = [...allCards].filter(card => {
    const cb = card.querySelector(".qr-checkbox");
    return cb && cb.checked;
  });

  // Se nenhum selecionado, imprime todos
  const items = checkedCards.length > 0 ? checkedCards : allCards;

  let html = `
    <html><head><title>QR Codes - Mesas</title>
    <style>
      body { font-family: monospace; margin: 0; padding: 10px; }
      .grid { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
      .item {
        display: flex; flex-direction: column; align-items: center;
        gap: 6px; padding: 12px;
        border: 1px solid #ccc; border-radius: 8px;
        width: 160px; page-break-inside: avoid;
      }
      .item img { width: 130px; height: 130px; }
      .item .mesa { font-weight: bold; font-size: 14px; }
      .item .url { font-size: 9px; word-break: break-all; text-align: center; color: #555; }
      @media print {
        @page { margin: 10mm; }
        body { padding: 0; }
      }
    </style></head>
    <body><div class="grid">
  `;

  items.forEach(item => {
    const mesa = item.dataset.mesa;
    const url = item.dataset.url;
    html += `
      <div class="item">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(url)}" />
        <span class="mesa">Mesa ${mesa}</span>
        <span class="url">${url}</span>
      </div>
    `;
  });

  html += `</div>
    <script>window.onload = function(){ window.print(); }<\/script>
    </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(html);
  win.document.close();
}

function toggleFidelidadeConfig() {
  const pop = document.getElementById("fidelidade-popover");
  pop.style.display = pop.style.display === "none" ? "block" : "none";
  const saved = localStorage.getItem("fidelidade_url") || "";
  document.getElementById("input-fidelidade-url").value = saved;
  setTimeout(() => {
    document.addEventListener("click", closeFidelidadeOnClickOutside, { once: true });
  }, 10);
}

function closeFidelidadeOnClickOutside(e) {
  const pop = document.getElementById("fidelidade-popover");
  const btn = document.getElementById("btn-config-fidelidade");
  if (!pop?.contains(e.target) && !btn?.contains(e.target)) {
    if (pop) pop.style.display = "none";
  }
}

function salvarFidelidadeUrl() {
  const val = document.getElementById("input-fidelidade-url")?.value.trim();
  if (!val) { alert("Digite o domínio antes de salvar."); return; }

  const hostname = val.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
  localStorage.setItem("fidelidade_url", hostname);

  fetch(`${API_BASE}/api/v1/restaurante/${getRestaurantId()}/dominio`, {
    method: "PATCH",
    headers: buildHeaders(),
    body: JSON.stringify({ dominio: hostname })
  });

  document.getElementById("fidelidade-popover").style.display = "none";
  const btn = document.getElementById("btn-config-fidelidade");
  btn.textContent = "✓";
  btn.style.color = "rgba(34,197,94,1)";
  setTimeout(() => { btn.textContent = "⋯"; btn.style.color = "rgba(252,228,228,0.7)"; }, 1500);
}

// ========================================
// ⭐ FIDELIDADE
// ========================================
async function initFidelidade() {
  setupFidelidadeTabs();
  await fetchFidelidadeClientes();
}

function setupFidelidadeTabs() {
  const tabClientes = document.getElementById("tab-fid-clientes");
  const tabPremios = document.getElementById("tab-fid-premios");
  const painelClientes = document.getElementById("painel-fid-clientes");
  const painelPremios = document.getElementById("painel-fid-premios");

  tabClientes?.addEventListener("click", () => {
    tabClientes.classList.add("active");
    tabPremios.classList.remove("active");
    painelClientes.classList.remove("hidden");
    painelPremios.classList.add("hidden");
    fetchFidelidadeClientes();
  });

  tabPremios?.addEventListener("click", () => {
    tabPremios.classList.add("active");
    tabClientes.classList.remove("active");
    painelPremios.classList.remove("hidden");
    painelClientes.classList.add("hidden");
    fetchFidelidadePremios();
  });
}

async function fetchFidelidadeClientes() {
  const rid = getRestaurantId();
  const painel = document.getElementById("painel-fid-clientes");
  if (!rid || !painel) return;

  painel.innerHTML = `<p style="color:var(--muted); text-align:center; padding:40px 0;">Carregando...</p>`;

  try {
    const resp = await fetch(`${API_BASE}/api/v1/fidelidade/${rid}/clientes`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);

    if (!data.length) {
      painel.innerHTML = `<p style="color:var(--muted); text-align:center; padding:40px 0;">Nenhum cliente com pontos ainda.</p>`;
      return;
    }

    const table = document.createElement("table");
    table.className = "crm-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Cliente</th>
          <th>Telefone</th>
          <th>Pontos</th>
          <th>Resgatados</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(c => `
          <tr>
            <td>${escapeHtml(c.nome || "—")}</td>
            <td>${escapeHtml(c.numero || "—")}</td>
            <td style="color:rgba(251,191,36,1); font-weight:800;">⭐ ${c.pontos || 0}</td>
            <td style="color:var(--muted);">${c.pontos_resgatados || 0}</td>
          </tr>
        `).join("")}
      </tbody>
    `;
    painel.innerHTML = "";
    painel.appendChild(table);
  } catch (e) {
    painel.innerHTML = `<p style="color:#ef4444; text-align:center; padding:40px 0;">Erro ao carregar clientes.</p>`;
  }
}

async function fetchFidelidadePremios() {
  const rid = getRestaurantId();
  const painel = document.getElementById("painel-fid-premios");
  if (!rid || !painel) return;

  painel.innerHTML = `<p style="color:var(--muted); text-align:center; padding:40px 0;">Carregando...</p>`;

  try {
    const resp = await fetch(`${API_BASE}/api/v1/fidelidade/${rid}/premios`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);

    painel.innerHTML = `
      <button class="primary-button" id="btn-novo-premio" style="margin-bottom:20px;">+ Novo Prêmio</button>
      <div id="lista-premios">
        ${data.length === 0 
          ? `<p style="color:var(--muted); text-align:center; padding:40px 0;">Nenhum prêmio cadastrado ainda.</p>`
          : data.map(p => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:rgba(46,8,8,0.45); border:1px solid rgba(91,28,28,0.85); border-radius:12px; margin-bottom:8px;">
              <div>
                <div style="color:rgba(252,228,228,0.95); font-weight:700; font-size:14px;">${escapeHtml(p.nome)}</div>
                ${p.descricao ? `<div style="color:var(--muted); font-size:12px;">${escapeHtml(p.descricao)}</div>` : ""}
                <div style="color:rgba(251,191,36,1); font-weight:800; font-size:13px; margin-top:4px;">⭐ ${p.pontos_necessarios} pontos</div>
              </div>
              <div style="display:flex; gap:8px;">
                <button onclick="openPremioModal(${JSON.stringify(p).replace(/"/g, '&quot;')})" style="padding:6px 10px; border-radius:8px; border:1px solid rgba(91,28,28,0.85); background:transparent; color:rgba(252,228,228,0.7); cursor:pointer; font-size:11px;">Editar</button>
                <button onclick="deletarPremio('${p.id}')" style="padding:6px 10px; border-radius:8px; border:1px solid rgba(239,68,68,0.5); background:transparent; color:rgba(239,68,68,0.8); cursor:pointer; font-size:11px;">Excluir</button>
              </div>
            </div>
          `).join("")}
      </div>
    `;

    document.getElementById("btn-novo-premio")?.addEventListener("click", () => openPremioModal());
  } catch (e) {
    painel.innerHTML = `<p style="color:#ef4444; text-align:center; padding:40px 0;">Erro ao carregar prêmios.</p>`;
  }
}

function removerFotoPremio() {
  document.getElementById("premio-foto").value = "";
  const dropzone = document.getElementById("premio-dropzone");
  dropzone.innerHTML = `
    <div style="font-size:22px;">📷</div>
    <div style="color:rgba(252,228,228,0.4); font-size:10px;">Foto do prêmio</div>
    <input type="file" id="premio-file" accept="image/*" style="
      position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%;
    " />
  `;
  document.getElementById("premio-file").addEventListener("change", async function() {
    if (this.files[0]) await handlePremioFileUpload(this.files[0]);
  });
}

async function handlePremioFileUpload(file) {
  const croppedBlob = await openCropModal(file);
  if (!croppedBlob) return;

  const croppedUrl = URL.createObjectURL(croppedBlob);
  const dropzone = document.getElementById("premio-dropzone");

  dropzone.innerHTML = `
    <img src="${croppedUrl}" style="width:100%; height:70px; object-fit:cover; border-radius:8px;" />
    <button type="button" onclick="removerFotoPremio()" style="
      position:absolute; top:4px; right:4px; width:20px; height:20px;
      border-radius:50%; border:none; background:rgba(239,68,68,0.9);
      color:white; font-size:11px; cursor:pointer; line-height:1;
    ">×</button>
    <input type="file" id="premio-file" accept="image/*" style="
      position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%;
    " />
  `;
  document.getElementById("premio-file").addEventListener("change", async function() {
    if (this.files[0]) await handlePremioFileUpload(this.files[0]);
  });

  try {
    const formData = new FormData();
    formData.append('file', croppedBlob, 'foto.jpg');
    const resp = await fetch(`${API_BASE}/api/v1/upload-image`, { method: 'POST', body: formData });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erro no upload');
    document.getElementById("premio-foto").value = data.url;
    dropzone.querySelector('img').src = data.url;
  } catch (e) {
    alert('Erro ao enviar imagem: ' + e.message);
    document.getElementById("premio-foto").value = "";
  }
}

function openPremioModal(premio = null) {
  const existing = document.getElementById("premio-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "premio-modal";
  modal.className = "modal-backdrop open";

  modal.innerHTML = `
    <div class="modal confirm-modal">
      <div class="modal-header">
        <h3>${premio ? "✏️ Editar Prêmio" : "🎁 Novo Prêmio"}</h3>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:12px;">
        <label style="color:rgba(252,228,228,0.8); font-size:13px;">Nome *
          <input id="premio-nome" value="${premio ? escapeHtml(premio.nome) : ""}" placeholder="Ex: Hambúrguer grátis"
            style="width:100%; margin-top:6px; padding:10px 14px; border-radius:10px; border:1px solid rgba(91,28,28,0.85); background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:14px; outline:none;" />
        </label>
        <label style="color:rgba(252,228,228,0.8); font-size:13px;">Descrição
          <input id="premio-descricao" value="${premio ? escapeHtml(premio.descricao || "") : ""}" placeholder="Ex: Um hambúrguer clássico à sua escolha"
            style="width:100%; margin-top:6px; padding:10px 14px; border-radius:10px; border:1px solid rgba(91,28,28,0.85); background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:14px; outline:none;" />
        </label>
       <label style="color:rgba(252,228,228,0.8); font-size:13px;">Foto do Prêmio
          <div style="margin-top:8px; position:relative;">
            <div id="premio-dropzone" style="
              border:2px dashed rgba(249,115,115,0.5); border-radius:12px; padding:12px;
              text-align:center; cursor:pointer; background:rgba(46,8,8,0.3); position:relative;
              min-height:90px; display:flex; flex-direction:column;
              align-items:center; justify-content:center; gap:6px;
            ">
              ${premio?.foto_url ? `
                <img src="${escapeHtml(premio.foto_url)}" style="width:100%; height:70px; object-fit:cover; border-radius:8px;" />
                <button type="button" onclick="removerFotoPremio()" style="
                  position:absolute; top:4px; right:4px; width:20px; height:20px;
                  border-radius:50%; border:none; background:rgba(239,68,68,0.9);
                  color:white; font-size:11px; cursor:pointer; line-height:1;">×</button>
              ` : `
                <div style="font-size:22px;">📷</div>
                <div style="color:rgba(252,228,228,0.4); font-size:10px;">Foto do prêmio</div>
              `}
              <input type="file" id="premio-file" accept="image/*" style="
                position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%;" />
            </div>
            <input type="hidden" id="premio-foto" value="${premio?.foto_url || ''}" />
          </div>
        </label>
        <label style="color:rgba(252,228,228,0.8); font-size:13px;">Pontos necessários *
          <input id="premio-pontos" type="number" value="${premio ? premio.pontos_necessarios : ""}" placeholder="Ex: 500"
            style="width:100%; margin-top:6px; padding:10px 14px; border-radius:10px; border:1px solid rgba(91,28,28,0.85); background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:14px; outline:none;" />
        </label>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" id="premio-cancel">Cancelar</button>
        <button class="primary-button" id="premio-save">Salvar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById("premio-file")?.addEventListener("change", async function() {
    if (this.files[0]) await handlePremioFileUpload(this.files[0]);
  });
  document.getElementById("premio-cancel").addEventListener("click", () => modal.remove());
  document.getElementById("premio-save").addEventListener("click", () => salvarPremio(premio?.id));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

async function salvarPremio(id = null) {
  const rid = getRestaurantId();
  const nome = document.getElementById("premio-nome").value.trim();
  const descricao = document.getElementById("premio-descricao").value.trim();
  const pontos_necessarios = parseInt(document.getElementById("premio-pontos").value) || 0;

  if (!nome || !pontos_necessarios) { alert("Nome e pontos são obrigatórios."); return; }
  const foto_url = document.getElementById("premio-foto")?.value.trim() || null;

  try {
    if (id) {
      await fetch(`${API_BASE}/api/v1/fidelidade/premios/${id}`, {
        method: "PATCH", headers: buildHeaders(),
        body: JSON.stringify({ nome, descricao, pontos_necessarios, foto_url })
      });
    } else {
      await fetch(`${API_BASE}/api/v1/fidelidade/premios`, {
        method: "POST", headers: buildHeaders(),
        body: JSON.stringify({ restaurant_id: rid, nome, descricao, pontos_necessarios, foto_url })
      });
    }
    document.getElementById("premio-modal")?.remove();
    await fetchFidelidadePremios();
  } catch (e) {
    alert("Erro ao salvar prêmio.");
  }
}

async function deletarPremio(id) {
  showConfirmModal("Tem certeza que deseja excluir este prêmio?", async () => {
    await fetch(`${API_BASE}/api/v1/fidelidade/premios/${id}`, {
      method: "DELETE", headers: buildHeaders()
    });
    await fetchFidelidadePremios();
  });
}

// ===== INICIALIZA =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
