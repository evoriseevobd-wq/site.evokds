// ===== CONFIG =====
const GOOGLE_CLIENT_ID =
  "872848052437-nl3lru9m1jhmfobk0imbpb2o9uk47mqi.apps.googleusercontent.com";

const API_BASE = "https://backend.evoriseai.com.br";
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
var _fetchController = null;
let editingOrderId = null;
let socket = null;
let searchTerm = "";

let restaurantPlan = "basic";
try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch(e) {}
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
  const normalized = iso.includes('Z') || iso.includes('+') ? iso : iso + 'Z';
  const d = new Date(normalized);
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
  document.getElementById("tabs-bar")?.classList.remove("hidden"); // ← aqui
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
  document.getElementById("fidelidade-view")?.classList.add("hidden");  // adiciona
  document.getElementById("cardapio-view")?.classList.add("hidden");    // adiciona
  document.getElementById("tabs-bar")?.classList.add("hidden");
  hideTabsBar();
  closeDrawer();
  loadSettingsData();
}

async function loadSettingsData() {
  const rid = getRestaurantId();
  if (!rid) return;

  // Impressora
  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/impressora`);
    const data = await resp.json();
    if (data.api_key)
      document.getElementById("settings-printnode-key").value = data.api_key;
    if (Array.isArray(data.impressoras)) {
      impressorasConfig = data.impressoras;
      renderImpressoras();
    }
  } catch (e) {
    console.error("Erro ao carregar impressora:", e);
  }

  // Fiscal
  try {
    const respFiscal = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/fiscal`);
    const dataFiscal = await respFiscal.json();
    if (dataFiscal.focusnfe_token)
      document.getElementById("settings-focusnfe-token").value = dataFiscal.focusnfe_token;
    if (dataFiscal.cnpj)
      document.getElementById("settings-cnpj").value = dataFiscal.cnpj;
    if (dataFiscal.inscricao_estadual)
      document.getElementById("settings-ie").value = dataFiscal.inscricao_estadual;
    if (dataFiscal.regime_tributario)
      document.getElementById("settings-regime").value = dataFiscal.regime_tributario;
  } catch (e) {
    console.error("Erro ao carregar fiscal:", e);
  }

  // Marketplace
  try {
    const mktResp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/marketplace`);
    const mktData = await mktResp.json();
    if (mktData.ifood_api_key)
      document.getElementById("settings-ifood-key").value = mktData.ifood_api_key;
    if (mktData.aiqfome_api_key)
      document.getElementById("settings-aiqfome-key").value = mktData.aiqfome_api_key;
  } catch (e) {
    console.error("Erro ao carregar marketplace:", e);
  }

  // Link de rastreio
  try {
    const respTracking = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/tracking-url`);
    const dataTracking = await respTracking.json();
    if (dataTracking.tracking_url)
      document.getElementById("settings-tracking-url").value = dataTracking.tracking_url;
    else {
      const local = localStorage.getItem("tracking_url") || "https://rastreio.evoriseai.com.br";
      document.getElementById("settings-tracking-url").value = local;
    }
  } catch (e) {
    const local = localStorage.getItem("tracking_url") || "https://rastreio.evoriseai.com.br";
    document.getElementById("settings-tracking-url").value = local;
  }

  // Webhook satisfação
  try {
    const whResp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/webhook-satisfaction`);
    const whData = await whResp.json();
    if (whData.webhook_url)
      document.getElementById("settings-webhook-satisfaction").value = whData.webhook_url;
  } catch (e) {
    console.error("Erro ao carregar webhook:", e);
  }

  // Maquininha
  try {
    const mpResp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/integracao/maquininha`);
    const mpData = await mpResp.json();
    if (mpData.configurado && mpData.dados) {
      const tipo = mpData.dados.tipo || "mercadopago";
      document.getElementById("settings-maquininha-tipo").value = tipo;
      onMaquininhaChange(tipo);
      if (mpData.dados.mp_access_token)
        document.getElementById("settings-mp-token").value = mpData.dados.mp_access_token;
      if (mpData.dados.mp_device_id)
        document.getElementById("settings-mp-device").value = mpData.dados.mp_device_id;
    }
  } catch (e) {
    console.error("Erro ao carregar maquininha:", e);
  }
  // Webhook fechamento de caixa
try {
  const whFechResp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/webhook-fechamento`);
  const whFechData = await whFechResp.json();
  if (whFechData.webhook_url)
    document.getElementById("settings-webhook-fechamento").value = whFechData.webhook_url;
} catch (e) {
  console.error("Erro ao carregar webhook fechamento:", e);
}
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

  // ===== SALVAR IFOOD =====
document.getElementById("btn-salvar-ifood")?.addEventListener("click", async () => {
  const rid = getRestaurantId();
  const key = document.getElementById("settings-ifood-key")?.value?.trim();
  const status = document.getElementById("settings-ifood-status");
  if (!key) { if (status) status.textContent = "❌ Informe a chave do iFood."; return; }
  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/marketplace`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ platform: "ifood", api_key: key })
    });
    const data = await resp.json();
    if (status) status.textContent = data.success ? "✅ Chave iFood salva!" : "❌ Erro ao salvar.";
  } catch (e) {
    if (status) status.textContent = "❌ Erro de conexão.";
  }
});

// ===== SALVAR AIQFOME =====
document.getElementById("btn-salvar-aiqfome")?.addEventListener("click", async () => {
  const rid = getRestaurantId();
  const key = document.getElementById("settings-aiqfome-key")?.value?.trim();
  const status = document.getElementById("settings-aiqfome-status");
  if (!key) { if (status) status.textContent = "❌ Informe a chave do AiqFome."; return; }
  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/marketplace`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ platform: "aiqfome", api_key: key })
    });
    const data = await resp.json();
    if (status) status.textContent = data.success ? "✅ Chave AiqFome salva!" : "❌ Erro ao salvar.";
  } catch (e) {
    if (status) status.textContent = "❌ Erro de conexão.";
  }
});

// ===== SALVAR WEBHOOK SATISFAÇÃO =====
document.getElementById("btn-salvar-webhook")?.addEventListener("click", async () => {
  const rid = getRestaurantId();
  const url = document.getElementById("settings-webhook-satisfaction")?.value?.trim();
  const status = document.getElementById("settings-webhook-status");
  if (!url) { if (status) status.textContent = "❌ Informe a URL do webhook."; return; }
  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/webhook-satisfaction`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ webhook_url: url })
    });
    const data = await resp.json();
    if (status) status.textContent = data.success ? "✅ Webhook salvo!" : "❌ Erro ao salvar.";
  } catch (e) {
    if (status) status.textContent = "❌ Erro de conexão.";
  }
});


// ===== SALVAR WEBHOOK FECHAMENTO DE CAIXA =====
document.getElementById("btn-salvar-webhook-fechamento")?.addEventListener("click", async () => {
  const rid = getRestaurantId();
  const url = document.getElementById("settings-webhook-fechamento")?.value?.trim();
  const status = document.getElementById("settings-webhook-fechamento-status");
  if (!url) { if (status) status.textContent = "❌ Informe a URL do webhook."; return; }
  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/webhook-fechamento`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ webhook_url: url })
    });
    const data = await resp.json();
    if (status) status.textContent = data.success ? "✅ Webhook salvo!" : "❌ Erro ao salvar.";
  } catch (e) {
    if (status) status.textContent = "❌ Erro de conexão.";
  }
});

// ===== CORE LOGIC =====
async function fetchOrders() {
  const rid = getRestaurantId();
  if (!rid || isFetching) return;

 isFetching = true;
if (_fetchController) _fetchController.abort();
_fetchController = new AbortController();
try {
    const resp = await fetch(`${API_URL}/${rid}`, { signal: _fetchController.signal });
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
    if (e.name !== "AbortError") console.error("Polling Error:", e);
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
  }
}

function renderBoard() {
  if (!board || board.classList.contains("hidden")) return;

  // Cancela todos os timers antes de limpar o DOM
  Object.keys(_autoTimers).forEach(id => {
    clearInterval(_autoTimers[id]);
    delete _autoTimers[id];
  });

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

 const filtered = orders.filter((o) => {
  if (!visibleStatuses.includes(o._frontStatus)) return false;
  if (!searchTerm) return true;
  const num = String(o.order_number || "").toLowerCase();
  const name = String(o.client_name || "").toLowerCase();
  const notes = String(o.notes || "").toLowerCase();
  return num.includes(searchTerm) || name.includes(searchTerm) || notes.includes(searchTerm);
});

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
  const mesaLabel = order.table_number ? `· Mesa ${order.table_number}` : "";
  const isDelivery = String(order.service_type || "").toLowerCase() === "delivery";
  const paymentText = isDelivery && order.payment_method ? order.payment_method : "";

  card.innerHTML = `
    <div class="order-top">
      <div class="order-number">#${order.order_number || ""} ${mesaLabel}</div>
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

  // Semáforo
  const waitColor = getWaitColor(order._frontStatus, order.created_at);
  if (waitColor) {
    card.style.borderLeft = `4px solid ${waitColor}`;
    card.style.borderRadius = "0 14px 14px 0";
  }

  // Timer automático (só em recebido)
  // Timer automático (só em recebido)
  if (order._frontStatus === "recebido") {
    const timerEl = document.createElement("div");
    timerEl.id = `timer-${order.id}`;
    timerEl.style.cssText = `
      font-size:12px; font-weight:800; font-family:'Space Grotesk',sans-serif;
      position:absolute; bottom:10px; right:32px;
    `;
    timerEl.textContent = "⏱ 1:30";
    card.style.position = "relative";
    card.appendChild(timerEl);
    setTimeout(() => startAutoTimer(order.id, order.created_at), 50);
  }

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
  document.querySelectorAll(".col-action-bar").forEach(b => b.remove());
  document.getElementById("selection-bottom-bar")?.remove();
  
  if (selectedOrderIds.size === 0) return;

  // Calcula total dos pedidos selecionados
  const pedidosSelecionados = [...selectedOrderIds].map(id => orders.find(x => x.id === id)).filter(Boolean);
  const totalGeral = pedidosSelecionados.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
  const temNaoLocal = pedidosSelecionados.some(o => String(o.service_type || "").toLowerCase() === "delivery");

  // Barra no rodapé
  const bar = document.createElement("div");
  bar.id = "selection-bottom-bar";
  bar.style.cssText = `
    position:fixed; bottom:0; left:0; right:0; z-index:999;
    background:rgba(20,3,3,0.97); border-top:1px solid rgba(91,28,28,0.85);
    padding:14px 24px; display:flex; align-items:center; justify-content:space-between;
    gap:12px; flex-wrap:wrap;
    box-shadow:0 -4px 24px rgba(0,0,0,0.4);
  `;
  bar.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px;">
      <span style="color:rgba(252,228,228,0.6); font-size:13px; font-weight:700;">
        ${selectedOrderIds.size} pedido(s) selecionado(s)
      </span>
      <span style="color:rgba(251,191,36,1); font-size:16px; font-weight:900;">
        ${formatCurrency(totalGeral)}
      </span>
    </div>
    <div style="display:flex; gap:10px;">
      <button onclick="clearSelection()" style="
        padding:10px 16px; border-radius:10px; border:1px solid rgba(91,28,28,0.85);
        background:transparent; color:rgba(252,228,228,0.6); font-size:13px;
        font-weight:700; cursor:pointer; font-family:inherit;">
        Cancelar
      </button>
      <button onclick="imprimirResumosSelecionados()" style="
        padding:10px 16px; border-radius:10px; border:1px solid rgba(249,115,115,0.5);
        background:transparent; color:rgba(249,115,115,0.9); font-size:13px;
        font-weight:700; cursor:pointer; font-family:inherit;">
        🖨️ Imprimir resumos
      </button>
      ${!temNaoLocal ? `
      <button onclick="cobrarJuntos()" style="
        padding:10px 20px; border-radius:10px; border:none;
        background:rgba(34,197,94,0.9); color:#fff; font-size:13px;
        font-weight:700; cursor:pointer; font-family:inherit;">
        💳 Cobrar juntos ${formatCurrency(totalGeral)}
      </button>` : ""}
    </div>
  `;
  document.body.appendChild(bar);
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
  // Só mostra o método de pagamento se o pedido já foi finalizado
  modalPaymentEl.textContent = order._frontStatus === "finalizado" 
    ? String(order.payment_method || "—") 
    : "Aguardando pagamento...";
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
          <span style="color:rgba(252,228,228,0.3); font-size:12px;">—</span>
          <span style="color:rgba(252,228,228,0.5); font-size:13px; font-weight:700;">${qty} un</span>
        </div>
        <div style="display:flex; align-items:center; flex-shrink:0;">
          ${price > 0 ? `<span style="color:rgba(251,191,36,0.85); font-size:14px; font-weight:700; white-space:nowrap;">R$${(price * qty).toFixed(2)}</span>` : ""}
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
// Botão reimprimir — só aparece em "preparo"
let reimprimirBtn = document.getElementById("modal-reimprimir-btn");
if (!reimprimirBtn) {
  reimprimirBtn = document.createElement("button");
  reimprimirBtn.id = "modal-reimprimir-btn";
  reimprimirBtn.className = "ghost-button";
  reimprimirBtn.innerHTML = "🖨️ Reimprimir";
  modalNextBtn?.parentElement?.insertBefore(reimprimirBtn, modalNextBtn);
}
reimprimirBtn.onclick = () => reimprimirPedido(activeOrderId);
reimprimirBtn.classList.toggle("hidden", order._frontStatus !== "preparo");
  
// Botão imprimir resumo
let resumoBtn = document.getElementById("modal-resumo-btn");
if (!resumoBtn) {
  resumoBtn = document.createElement("button");
  resumoBtn.id = "modal-resumo-btn";
  resumoBtn.className = "ghost-button";
  resumoBtn.innerHTML = "🖨️ Imprimir Resumo";
  modalNextBtn?.parentElement?.insertBefore(resumoBtn, modalNextBtn);
}
resumoBtn.onclick = () => imprimirResumo(activeOrderId);
const isDeliveryOrder = String(order.service_type || "").toLowerCase() === "delivery";
resumoBtn.classList.toggle("hidden",
  order._frontStatus !== "pronto" || isDeliveryOrder
);

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
  editBtn.classList.toggle("hidden", order._frontStatus !== "recebido" && order._frontStatus !== "pronto");
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

function regressStatus(orderId) {
  const o = orders.find((x) => x.id === orderId);
  if (!o) return;

  const s = getFrontStatus(orderId);
  const isDelivery = String(o.service_type || "").toLowerCase() === "delivery";

  const seq = isDelivery
    ? ["recebido", "preparo", "pronto", "caminho", "finalizado"]
    : ["recebido", "preparo", "pronto", "finalizado"];

  const i = seq.indexOf(s);
  if (i <= 0) return; // já está no início, não volta

  updateOrderStatus(orderId, seq[i - 1]);
  closeOrderModal();
}

function showPaymentModal(orderId) {
  const existing = document.getElementById("payment-modal");
  if (existing) existing.remove();

  const o = orders.find((x) => x.id === orderId);
  if (!o) return;

  const totalPedido = parseFloat(o.total_price || 0);
  let pagamentos = [{ metodo: "", valor: totalPedido }];

  const modal = document.createElement("div");
  modal.id = "payment-modal";
  modal.className = "modal-backdrop open";

  function calcRestante() {
  return totalPedido - pagamentos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
}

  function renderModal() {
    modal.innerHTML = `
      <div class="modal confirm-modal" style="display:flex; flex-direction:column; max-height:85vh;">
        <div class="modal-header" style="flex-shrink:0;">
          <h3>💳 Forma de Pagamento</h3>
        </div>
        <div class="modal-body" style="flex:1; overflow-y:auto; padding-bottom:8px;">
          <div style="background:rgba(46,8,8,0.45); border:1px solid rgba(91,28,28,0.85); border-radius:12px; padding:12px 14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
            <span style="color:rgba(252,228,228,0.7); font-weight:700;">Valor Total</span>
            <span style="color:rgba(252,228,228,1); font-size:18px; font-weight:900;">${formatCurrency(totalPedido)}</span>
          </div>

          <div id="pagamentos-lista">
            ${pagamentos.map((p, idx) => {
              const isUltimo = idx === pagamentos.length - 1;
              const valorRestante = totalPedido - pagamentos.slice(0, idx).reduce((s, x) => s + (parseFloat(x.valor) || 0), 0);
              return `
               <div style="margin-bottom:10px; padding:10px 0; ${idx > 0 ? 'border-top:1px solid rgba(91,28,28,0.4);' : ''}">
                  <div style="font-size:11px; font-weight:700; color:rgba(252,228,228,0.4); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px;">
                    Pagamento ${idx + 1}
                    ${isUltimo && pagamentos.length > 1 ? `<span style="color:rgba(249,115,115,0.8); margin-left:6px;">Restante: ${formatCurrency(valorRestante)}</span>` : ''}
                  </div>
                  <div style="display:flex; gap:8px; align-items:center;">
                    <select id="metodo-${idx}" style="flex:1; padding:10px 12px; border-radius:10px; border:1px solid rgba(91,28,28,0.85); background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:14px; font-family:inherit; outline:none;">
                      <option value="">Selecione...</option>
                      <option value="pix" ${p.metodo === 'pix' ? 'selected' : ''}>PIX</option>
                      <option value="credito" ${p.metodo === 'credito' ? 'selected' : ''}>Cartão de crédito</option>
                      <option value="debito" ${p.metodo === 'debito' ? 'selected' : ''}>Cartão de débito</option>
                      <option value="dinheiro" ${p.metodo === 'dinheiro' ? 'selected' : ''}>Dinheiro</option>
                    </select>
                    <input type="number" id="valor-${idx}" value="${parseFloat(p.valor).toFixed(2)}" min="0.01" max="${valorRestante}" step="0.01"
  style="width:110px; padding:10px 12px; border-radius:10px; border:1px solid rgba(91,28,28,0.85); background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:14px; font-family:inherit; outline:none;"
  onblur="onValorInput(${idx}, this.value)"
/>
                    ${pagamentos.length > 1
                      ? `<button onclick="removerPagamento(${idx})" style="padding:8px 10px; border-radius:8px; border:1px solid rgba(239,68,68,0.4); background:transparent; color:rgba(239,68,68,0.8); cursor:pointer; font-size:13px; flex-shrink:0;">✕</button>`
                      : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div id="payment-status-msg" style="margin-top:10px; text-align:center; font-size:14px; font-weight:700; color:rgba(252,228,228,0.7); display:none;"></div>
        </div>
        <div class="modal-actions" style="flex-shrink:0;">
          <button class="ghost-button" id="payment-cancel">Cancelar</button>
          <button class="primary-button" id="payment-confirm" ${Math.abs(calcRestante()) > 0.009 ? 'disabled' : ''}>Finalizar Pedido</button>
        </div>
      </div>
    `;

    // Eventos fixos
    document.getElementById("payment-cancel").addEventListener("click", () => {
      if (pollingInterval) clearInterval(pollingInterval);
      modal.remove();
    });

    document.getElementById("payment-confirm").addEventListener("click", async () => {
      for (let i = 0; i < pagamentos.length; i++) {
        const metodo = document.getElementById(`metodo-${i}`)?.value;
        if (!metodo) { alert(`Selecione o método do Pagamento ${i + 1}`); return; }
        pagamentos[i].metodo = metodo;
      }
      pagamentos[pagamentos.length - 1].valor = calcRestante();

      const paymentStr = pagamentos.length === 1
        ? pagamentos[0].metodo
        : pagamentos.map(p => `${p.metodo} R$${parseFloat(p.valor).toFixed(2)}`).join(' + ');

      const confirmBtn = document.getElementById("payment-confirm");
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Finalizando...";

      try {
        await fetch(`${API_BASE}/api/v1/pedidos/${orderId}/payment`, {
          method: "PATCH",
          headers: buildHeaders(),
          body: JSON.stringify({ payment_method: paymentStr })
        });

        await fetch(`${API_URL}/${orderId}/status`, {
          method: "PATCH",
          headers: buildHeaders(),
          body: JSON.stringify({ status: "finished" })
        });

        const idx = orders.findIndex(x => x.id === orderId);
        if (idx !== -1) orders[idx]._frontStatus = "finalizado";
        modal.remove();
        await fetchOrders();
        renderBoard();
      } catch (err) {
        console.error("Erro ao finalizar:", err);
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Finalizar Pedido";
      }
    });

    // Sync selects
    pagamentos.forEach((p, idx) => {
      const sel = document.getElementById(`metodo-${idx}`);
      if (sel) sel.addEventListener("change", () => { pagamentos[idx].metodo = sel.value; });
    });
  }

  window.onValorInput = (idx, valor) => {
  const valorNum = parseFloat(valor) || 0;
  const maxValor = totalPedido - pagamentos.slice(0, idx).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);

  pagamentos[idx].valor = Math.min(valorNum, maxValor);

  const restante = totalPedido - pagamentos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);

  if (restante > 0.009) {
    if (idx === pagamentos.length - 1) {
      // Era o último, abre novo campo
      pagamentos.push({ metodo: "", valor: restante });
      renderModal();
      // Foca no select do novo campo
      const novoSelect = document.getElementById(`metodo-${pagamentos.length - 1}`);
      if (novoSelect) novoSelect.focus();
    } else {
      // Atualiza o último silenciosamente
      pagamentos[pagamentos.length - 1].valor = restante;
      const ultimoInput = document.getElementById(`valor-${pagamentos.length - 1}`);
      if (ultimoInput) ultimoInput.value = restante.toFixed(2);
    }
  } else {
    // Zerou — remove campos extras
    pagamentos = pagamentos.slice(0, idx + 1);
    pagamentos[idx].valor = maxValor;
    if (pagamentos.length > 1) renderModal();
  }
};

  window.removerPagamento = (idx) => {
    pagamentos.splice(idx, 1);
    const restante = totalPedido - pagamentos.slice(0, -1).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
    pagamentos[pagamentos.length - 1].valor = restante;
    renderModal();
  };

  document.body.appendChild(modal);

  const rid = getRestaurantId();
  let pollingInterval = null;

  renderModal();

  // ===== POLLING MAQUININHA (não mexer) =====
  function iniciarPolling(metodo) {
    let tentativas = 0;
    const MAX_TENTATIVAS = 60;
    pollingInterval = setInterval(async () => {
      tentativas++;
      if (tentativas > MAX_TENTATIVAS) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        document.getElementById("payment-status-msg").style.color = "rgba(239,68,68,0.9)";
        document.getElementById("payment-status-msg").textContent = "⏰ Tempo esgotado. Verifique a maquininha.";
        habilitarRetry(metodo);
        return;
      }
      try {
        const ordersResp = await fetch(`${API_URL}/${rid}`);
        const allOrders = await ordersResp.json();
        const updated = allOrders.find(x => x.id === orderId);
        if (!updated) return;
        const frontStatus = toFrontStatus(updated.status);
        if (frontStatus === "finalizado") {
          clearInterval(pollingInterval);
          pollingInterval = null;
          const idx = orders.findIndex(x => x.id === orderId);
          if (idx !== -1) orders[idx] = { ...updated, _frontStatus: "finalizado" };
          modal.remove();
          renderBoard();
          return;
        }
        if (frontStatus === "cancelado") {
          clearInterval(pollingInterval);
          pollingInterval = null;
          document.getElementById("payment-status-msg").style.color = "rgba(239,68,68,0.9)";
          document.getElementById("payment-status-msg").textContent = "❌ Pagamento cancelado ou recusado na maquininha.";
          await fetch(`${API_URL}/${orderId}/status`, {
            method: "PATCH",
            headers: buildHeaders(),
            body: JSON.stringify({ status: toBackStatus(o._frontStatus) })
          });
          const idx = orders.findIndex(x => x.id === orderId);
          if (idx !== -1) orders[idx].status = toBackStatus(o._frontStatus);
          habilitarRetry(metodo);
          return;
        }
      } catch (e) { console.warn("Erro no polling:", e); }
    }, 2000);
  }

  function habilitarRetry(metodo) {
    const confirmBtn = document.getElementById("payment-confirm");
    const cancelBtn = document.getElementById("payment-cancel");
    confirmBtn.disabled = false;
    confirmBtn.textContent = "🔄 Tentar novamente";
    cancelBtn.disabled = false;
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    const novoBtn = document.getElementById("payment-confirm");
    novoBtn.addEventListener("click", () => enviarParaMaquininha(metodo));
  }

  async function enviarParaMaquininha(metodo) {
    const confirmBtn = document.getElementById("payment-confirm");
    const cancelBtn = document.getElementById("payment-cancel");
    const statusMsg = document.getElementById("payment-status-msg");
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Aguardando...";
    cancelBtn.disabled = true;
    statusMsg.style.display = "block";
    statusMsg.style.color = "rgba(252,228,228,0.7)";
    statusMsg.textContent = "📲 Enviando para a maquininha...";
    try {
      await fetch(`${API_BASE}/api/v1/pedidos/${orderId}/payment`, {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify({ payment_method: metodo })
      });
      const cobrarResp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/mp/cobrar`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ order_id: orderId, valor: parseFloat(o.total_price || 0), metodo: metodo })
      });
      const cobrarData = await cobrarResp.json();
      if (!cobrarResp.ok || !cobrarData.success) throw new Error(cobrarData.error || "Erro ao enviar para maquininha");
      statusMsg.textContent = "💳 Aguardando pagamento na maquininha...";
      iniciarPolling(metodo);
    } catch (err) {
      console.error("Erro maquininha:", err);
      statusMsg.style.color = "rgba(239,68,68,0.9)";
      statusMsg.textContent = `❌ ${err.message}`;
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Tentar novamente";
      cancelBtn.disabled = false;
    }
  }
}

async function imprimirPedido(orderId) {
  updateOrderStatus(orderId, 'preparo');
  closeOrderModal();
}

async function imprimirResumo(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  const rid = getRestaurantId();

  try {
    // Busca impressora com "todos"
    const respConfig = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/impressora`);
    const config = await respConfig.json();

    const impressoraTodos = (config.impressoras || []).find(imp => imp.caixa);

    if (!impressoraTodos) {
      alert("Nenhuma impressora do caixa configurada.");
      return;
    }

    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/imprimir-pedido`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ 
        order_id: orderId,
        printer_id_override: impressoraTodos.printer_id
      })
    });

    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data.error || 'Erro ao imprimir');

    console.log('✅ Resumo impresso!');

  } catch (e) {
    console.error('Erro ao imprimir resumo:', e);
    alert('Erro ao imprimir resumo: ' + e.message);
  }
}

async function reimprimirPedido(orderId) {
  const rid = getRestaurantId();
  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/reimprimir-pedido`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ order_id: orderId })
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data.error || 'Erro ao reimprimir');
    console.log('✅ Reimpresso!');
  } catch(e) {
    alert('Erro ao reimprimir: ' + e.message);
  }
}

async function imprimirResumosSelecionados() {
  const ids = [...selectedOrderIds];
  const rid = getRestaurantId();
  
  try {
    const respConfig = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/impressora`);
    const config = await respConfig.json();
    const impressoraCaixa = (config.impressoras || []).find(imp => imp.caixa || imp.is_caixa);
    
    if (!impressoraCaixa) {
      alert("Nenhuma impressora do caixa configurada.");
      return;
    }

    for (const orderId of ids) {
      await fetch(`${API_BASE}/api/v1/restaurante/${rid}/imprimir-pedido`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ 
          order_id: orderId,
          printer_id_override: impressoraCaixa.printer_id
        })
      });
    }
    console.log(`✅ ${ids.length} resumos impressos!`);
  } catch(e) {
    console.error('Erro ao imprimir resumos:', e);
    alert('Erro ao imprimir resumos: ' + e.message);
  }
}

  async function cobrarJuntos() {
  const ids = [...selectedOrderIds];
  const pedidos = ids.map(id => orders.find(x => x.id === id)).filter(Boolean);
  const totalGeral = pedidos.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);

  const existing = document.getElementById("payment-modal");
  if (existing) existing.remove();

  let pagamentos = [{ metodo: "", valor: totalGeral }];

  const modal = document.createElement("div");
  modal.id = "payment-modal";
  modal.className = "modal-backdrop open";

  function calcRestante() {
    return totalGeral - pagamentos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
  }

  function renderModal() {
    modal.innerHTML = `
      <div class="modal confirm-modal" style="display:flex; flex-direction:column; max-height:85vh;">
        <div class="modal-header" style="flex-shrink:0;">
          <h3>💳 Cobrar Juntos</h3>
        </div>
        <div class="modal-body" style="flex:1; overflow-y:auto; padding-bottom:8px;">
          
          <div style="margin-bottom:12px;">
            ${pedidos.map(o => `
              <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(91,28,28,0.3);">
                <span style="color:rgba(252,228,228,0.7); font-size:13px;">Pedido #${o.order_number} — ${escapeHtml(o.client_name || "")}</span>
                <span style="color:rgba(251,191,36,1); font-size:13px; font-weight:700;">${formatCurrency(o.total_price)}</span>
              </div>
            `).join("")}
          </div>

          <div style="background:rgba(46,8,8,0.45); border:1px solid rgba(91,28,28,0.85); border-radius:12px; padding:12px 14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
            <span style="color:rgba(252,228,228,0.7); font-weight:700;">Total Geral</span>
            <span style="color:rgba(252,228,228,1); font-size:18px; font-weight:900;">${formatCurrency(totalGeral)}</span>
          </div>

          <div id="pagamentos-lista">
            ${pagamentos.map((p, idx) => {
              const isUltimo = idx === pagamentos.length - 1;
              const valorRestante = totalGeral - pagamentos.slice(0, idx).reduce((s, x) => s + (parseFloat(x.valor) || 0), 0);
              return `
                <div style="margin-bottom:10px; padding:10px 0; ${idx > 0 ? 'border-top:1px solid rgba(91,28,28,0.4);' : ''}">
                  <div style="font-size:11px; font-weight:700; color:rgba(252,228,228,0.4); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px;">
                    Pagamento ${idx + 1}
                    ${isUltimo && pagamentos.length > 1 ? `<span style="color:rgba(249,115,115,0.8); margin-left:6px;">Restante: ${formatCurrency(valorRestante)}</span>` : ''}
                  </div>
                  <div style="display:flex; gap:8px; align-items:center;">
                    <select id="metodo-${idx}" style="flex:1; padding:10px 12px; border-radius:10px; border:1px solid rgba(91,28,28,0.85); background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:14px; font-family:inherit; outline:none;">
                      <option value="">Selecione...</option>
                      <option value="pix" ${p.metodo === 'pix' ? 'selected' : ''}>PIX</option>
                      <option value="credito" ${p.metodo === 'credito' ? 'selected' : ''}>Cartão de crédito</option>
                      <option value="debito" ${p.metodo === 'debito' ? 'selected' : ''}>Cartão de débito</option>
                      <option value="dinheiro" ${p.metodo === 'dinheiro' ? 'selected' : ''}>Dinheiro</option>
                    </select>
                    <input type="number" id="valor-${idx}" value="${parseFloat(p.valor).toFixed(2)}" min="0.01" max="${valorRestante}" step="0.01"
                      style="width:110px; padding:10px 12px; border-radius:10px; border:1px solid rgba(91,28,28,0.85); background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:14px; font-family:inherit; outline:none;"
                      onblur="onValorInputJuntos(${idx}, this.value)"
                    />
                    ${pagamentos.length > 1 ? `
                    <button onclick="removerPagamentoJuntos(${idx})" style="padding:8px 10px; border-radius:8px; border:1px solid rgba(239,68,68,0.4); background:transparent; color:rgba(239,68,68,0.8); cursor:pointer; font-size:13px; flex-shrink:0;">✕</button>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <div id="payment-status-msg" style="margin-top:10px; text-align:center; font-size:14px; font-weight:700; color:rgba(252,228,228,0.7); display:none;"></div>
        </div>
        <div class="modal-actions" style="flex-shrink:0;">
          <button class="ghost-button" id="payment-cancel">Cancelar</button>
          <button class="primary-button" id="payment-confirm" ${Math.abs(calcRestante()) > 0.009 ? 'disabled' : ''}>Finalizar Todos</button>
        </div>
      </div>
    `;

    document.getElementById("payment-cancel").addEventListener("click", () => modal.remove());
    document.getElementById("payment-confirm").addEventListener("click", async () => {
      for (let i = 0; i < pagamentos.length; i++) {
        const metodo = document.getElementById(`metodo-${i}`)?.value;
        if (!metodo) { alert(`Selecione o método do Pagamento ${i + 1}`); return; }
        pagamentos[i].metodo = metodo;
      }
      pagamentos[pagamentos.length - 1].valor = calcRestante();

      const paymentStr = pagamentos.length === 1
        ? pagamentos[0].metodo
        : pagamentos.map(p => `${p.metodo} R$${parseFloat(p.valor).toFixed(2)}`).join(' + ');

      const confirmBtn = document.getElementById("payment-confirm");
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Finalizando...";

      try {
        for (const o of pedidos) {
          await fetch(`${API_BASE}/api/v1/pedidos/${o.id}/payment`, {
            method: "PATCH",
            headers: buildHeaders(),
            body: JSON.stringify({ payment_method: paymentStr })
          });
          await fetch(`${API_URL}/${o.id}/status`, {
            method: "PATCH",
            headers: buildHeaders(),
            body: JSON.stringify({ status: "finished" })
          });
        }
        modal.remove();
        clearSelection();
        await fetchOrders();
        renderBoard();
      } catch(err) {
        console.error("Erro ao finalizar:", err);
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Finalizar Todos";
      }
    });

    pagamentos.forEach((p, idx) => {
      const sel = document.getElementById(`metodo-${idx}`);
      if (sel) sel.addEventListener("change", () => { pagamentos[idx].metodo = sel.value; });
    });
  }

  window.onValorInputJuntos = (idx, valor) => {
    const valorNum = parseFloat(valor) || 0;
    const maxValor = totalGeral - pagamentos.slice(0, idx).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
    pagamentos[idx].valor = Math.min(valorNum, maxValor);
    const restante = totalGeral - pagamentos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
    if (restante > 0.009) {
      if (idx === pagamentos.length - 1) {
        pagamentos.push({ metodo: "", valor: restante });
        renderModal();
      } else {
        pagamentos[pagamentos.length - 1].valor = restante;
        const ultimoInput = document.getElementById(`valor-${pagamentos.length - 1}`);
        if (ultimoInput) ultimoInput.value = restante.toFixed(2);
      }
    } else {
      pagamentos = pagamentos.slice(0, idx + 1);
      pagamentos[idx].valor = maxValor;
      if (pagamentos.length > 1) renderModal();
    }
  };

  window.removerPagamentoJuntos = (idx) => {
    pagamentos.splice(idx, 1);
    const restante = totalGeral - pagamentos.slice(0, -1).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
    pagamentos[pagamentos.length - 1].valor = restante;
    renderModal();
  };

  document.body.appendChild(modal);
  renderModal();
}
  
function cancelOrder(orderId) {
  updateOrderStatus(orderId, "cancelado");
}

// ===== TIMER AUTOMÁTICO 3 MINUTOS =====
const _autoTimers = {};

// ↓ COLA AQUI
let _audioCtx = null;

function tocarBip() {
  try {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume().then(() => _bipOscilador());
      return;
    }
    _bipOscilador();
    return;
  } catch(e) {
    console.warn('Web Audio API falhou:', e);
  }
  _tentarVibrar();
}

function _bipOscilador() {
  try {
    [0, 0.3].forEach(delay => {
      const osc  = _audioCtx.createOscillator();
      const gain = _audioCtx.createGain();
      osc.connect(gain);
      gain.connect(_audioCtx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      const t = _audioCtx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.6, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  } catch(e) {}
}

function _tentarVibrar() {
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200]);
  }
}
// ↓ TERMINA AQUI

function startAutoTimer(orderId, createdAt) {
  if (_autoTimers[orderId]) return;
  const LIMIT_MS = 1.5 * 60 * 1000; // ← muda de 3 para 1.5 min

  function tick() {
   const rawDate = createdAt.includes('Z') || createdAt.includes('+') ? createdAt : createdAt + 'Z';
const elapsed = Date.now() - new Date(rawDate).getTime();
    const remaining = LIMIT_MS - elapsed;
    const el = document.getElementById(`timer-${orderId}`);
    if (!el) { clearInterval(_autoTimers[orderId]); delete _autoTimers[orderId]; return; }

    if (remaining <= 0) {
      clearInterval(_autoTimers[orderId]);
      delete _autoTimers[orderId];
      el.textContent = "⏰ 0:00";
      el.style.color = "rgba(239,68,68,1)";
      const order = orders.find(o => o.id === orderId);
if (order && order._frontStatus === "recebido") {
  tocarBip();
  updateOrderStatus(orderId, 'preparo');
}
      
      return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    el.textContent = `⏱ ${mins}:${String(secs).padStart(2, "0")}`;
    const pct = remaining / LIMIT_MS;
    if (pct > 0.5) el.style.color = "rgba(34,197,94,1)";
    else if (pct > 0.2) el.style.color = "rgba(251,191,36,1)";
    else el.style.color = "rgba(239,68,68,1)";
  }

  tick();
  _autoTimers[orderId] = setInterval(tick, 1000);
}

// ===== SEMÁFORO DE ESPERA POR COLUNA =====
const WAIT_THRESHOLDS = {
  recebido:   null,
  preparo:    { green: 10, yellow: 15 },
  pronto:     { green: 14, yellow: 20 },
  caminho:    { green: 20, yellow: 30 },
  finalizado: null,
  cancelado:  null,
};

function getWaitColor(frontStatus, createdAt) {
  const threshold = WAIT_THRESHOLDS[frontStatus];
  if (!threshold) return null;
  const mins = (Date.now() - new Date(createdAt).getTime()) / 60000;
  if (mins < threshold.green)  return "rgba(34,197,94,1)";
  if (mins < threshold.yellow) return "rgba(251,191,36,1)";
  return "rgba(239,68,68,1)";
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

let isSavingOrder = false; // ← adiciona no topo do arquivo, perto das outras variáveis globais

async function saveNewOrder() {
  if (isSavingOrder) return;
  isSavingOrder = true;
  if (saveCreateBtn) { saveCreateBtn.disabled = true; saveCreateBtn.textContent = "Salvando..."; }

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

  if (!rid || !client) { alert("Preencha o nome do cliente."); isSavingOrder = false; if (saveCreateBtn) { saveCreateBtn.disabled = false; saveCreateBtn.textContent = "Salvar"; } return; }
  if (!itens || itens.length === 0) { alert("Preencha os itens do pedido."); isSavingOrder = false; if (saveCreateBtn) { saveCreateBtn.disabled = false; saveCreateBtn.textContent = "Salvar"; } return; }
  if (isDelivery && !address) { alert("Endereço é obrigatório para delivery."); isSavingOrder = false; if (saveCreateBtn) { saveCreateBtn.disabled = false; saveCreateBtn.textContent = "Salvar"; } return; }
  if (isDelivery && !payment_method) { alert("Forma de pagamento é obrigatória para delivery."); isSavingOrder = false; if (saveCreateBtn) { saveCreateBtn.disabled = false; saveCreateBtn.textContent = "Salvar"; } return; }

  try {
   const orderAtual = editOrderId ? orders.find(o => o.id === editOrderId) : null;

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
  ...(editOrderId ? { 
    order_id: editOrderId,
    status: toBackStatus(orderAtual?._frontStatus || "recebido")
  } : {})
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
  if (idx !== -1) {
    const statusAtual = orders[idx]._frontStatus;
    orders[idx] = { 
      ...orders[idx], 
      ...data.order, 
      _frontStatus: statusAtual,
      status: toBackStatus(statusAtual)
    };
  }
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
  } finally {
    isSavingOrder = false;
    if (saveCreateBtn) {
      saveCreateBtn.disabled = false;
      saveCreateBtn.textContent = "Salvar";
    }
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
    const phoneNorm = normalizePhone(client.client_phone);
    const resp = await fetch(`${API_BASE}/api/v1/pedidos-cliente?restaurant_id=${rid}&phone=${phoneNorm}`);
    const clientOrders = await resp.json();

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
    destroyAllCharts();
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

// ===== AUTH =====
function decodeJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(window.atob(base64));
  } catch (e) { 
  console.error("Erro ao decodificar JWT:", e);
  return null; 
}
}

async function handleCredentialResponse(response) {
  const payload = decodeJwt(response.credential);
  if (!payload?.email) {
    alert("Email não encontrado no login Google");
    return;
  }

  try {
    const resp = await fetch(AUTH_URL, {
  method: "POST",
  headers: buildHeaders(),
  body: JSON.stringify({ 
    credential: response.credential,
    email: payload.email
  })
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
  const resumoDiaBtn = document.getElementById("drawer-resumo-dia");
if (resumoDiaBtn) resumoDiaBtn.addEventListener("click", () => { closeDrawer(); showCaixa(); });
  const cardapioBtn = document.getElementById("drawer-cardapio");
if (cardapioBtn) cardapioBtn.addEventListener("click", showCardapio);

const fidelidadeBtn = document.getElementById("drawer-fidelidade");
if (fidelidadeBtn) fidelidadeBtn.addEventListener("click", showFidelidade);

const autoatendimentoBtn = document.getElementById("drawer-autoatendimento");
if (autoatendimentoBtn) autoatendimentoBtn.addEventListener("click", showAutoatendimento);

  console.log("✅ Drawer totalmente configurado!");
}

function toggleAccordion(id) {
  const body = document.getElementById(`accordion-${id}`);
  const arrow = document.getElementById(`arrow-${id}`);
  const isOpen = body.style.display === 'flex';
  body.style.display = isOpen ? 'none' : 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '12px';
  body.style.padding = '0 24px 24px 24px';
  arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
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
  ['click', 'touchstart', 'keydown'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume();
    }
  }, { once: true });
});
  
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

window.alterarQtd = function(index, delta) {
  itensPedido[index].qty += delta;
  itensPedido[index].quantidade = itensPedido[index].qty;
  if (itensPedido[index].qty <= 0) {
    itensPedido.splice(index, 1);
  }
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
        const qNorm = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const resp = await fetch(`${API_BASE}/api/v1/cardapio/${rid}/busca?q=${encodeURIComponent(qNorm)}`);
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
  document.querySelectorAll("[id^='cat-dropdown-']").forEach(d => {
    if (!d.contains(e.target) && !e.target.id?.startsWith("cat-input-")) {
      d.style.display = "none";
    }
  });
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
document.getElementById("btn-salvar-nfe")?.addEventListener("click", () => salvarFiscal());
document.getElementById("btn-salvar-marketplace")?.addEventListener("click", salvarMarketplace);
  document.getElementById("btn-remover-mp")?.addEventListener("click", async () => {
  const rid = getRestaurantId();
  const status = document.getElementById("settings-mp-status");
  showConfirmModal("Tem certeza que deseja remover a configuração da maquininha?", async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/integracao/maquininha`, {
        method: "DELETE",
        headers: buildHeaders()
      });
      const data = await resp.json();
      if (data.success) {
        status.textContent = "✅ Maquininha removida!";
        status.style.color = "rgba(34,197,94,0.9)";
        document.getElementById("settings-maquininha-tipo").value = "";
        onMaquininhaChange("");
      } else {
        throw new Error();
      }
    } catch(e) {
      status.textContent = "❌ Erro ao remover.";
      status.style.color = "rgba(239,68,68,0.9)";
    }
  });
});
  document.getElementById("btn-salvar-mp")?.addEventListener("click", async () => {
  const rid = getRestaurantId();
  const tipo = document.getElementById("settings-maquininha-tipo")?.value;
  const status = document.getElementById("settings-mp-status");

  if (!tipo) { if (status) status.textContent = "❌ Selecione a maquininha."; return; }

  let dados = { tipo };

  if (tipo === "mercadopago") {
    dados.mp_access_token = document.getElementById("settings-mp-token")?.value?.trim();
    dados.mp_device_id = document.getElementById("settings-mp-device")?.value?.trim();
    if (!dados.mp_access_token || !dados.mp_device_id) {
      if (status) status.textContent = "❌ Preencha Access Token e Device ID.";
      return;
    }
  } else if (tipo === "cielo") {
    dados.client_id = document.getElementById("settings-cielo-client-id")?.value?.trim();
    dados.access_token = document.getElementById("settings-cielo-token")?.value?.trim();
    dados.serial_number = document.getElementById("settings-cielo-serial")?.value?.trim();
  } else if (tipo === "stone") {
    dados.stone_code = document.getElementById("settings-stone-code")?.value?.trim();
    dados.token = document.getElementById("settings-stone-token")?.value?.trim();
  } else if (tipo === "pagseguro") {
    dados.token = document.getElementById("settings-pagseguro-token")?.value?.trim();
    dados.email = document.getElementById("settings-pagseguro-email")?.value?.trim();
  } else if (tipo === "outra") {
    dados.webhook_url = document.getElementById("settings-outra-webhook")?.value?.trim();
  }

  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/integracao/maquininha`, {
      method: "PATCH",
      headers: buildHeaders(),
      body: JSON.stringify({ dados, ativo: true })
    });
    const data = await resp.json();
    if (status) status.textContent = data.success ? "✅ Maquininha salva!" : "❌ Erro ao salvar.";
  } catch (e) {
    if (status) status.textContent = "❌ Erro de conexão.";
  }
});
  
// Logout
if (logoutBtn) logoutBtn.addEventListener("click", logout);
if (unauthClose) unauthClose.addEventListener("click", () => closeBackdrop(unauthorizedModal));



setInterval(() => {
  if (!isFetching) fetchOrders();
}, 20000);
fetchOrders();
// Busca no board
document.getElementById("search-order")?.addEventListener("input", function() {
  searchTerm = this.value.toLowerCase().trim();
  renderBoard();
});
  
// Conecta WebSocket
socket = io(API_BASE, { transports: ["websocket"] });

socket.on("connect", () => {
  const rid = getRestaurantId();
  if (rid) {
    socket.emit("join_restaurant", rid);
    console.log("🔌 WebSocket conectado");
  }
});

socket.on("order_updated", (order) => {
  const idx = orders.findIndex(o => o.id === order.id);
  if (idx !== -1) {
    orders[idx] = { ...order, _frontStatus: toFrontStatus(order.status) };
  } else {
    orders.push({ ...order, _frontStatus: toFrontStatus(order.status) });
  }
  if (!modalBackdrop?.classList.contains("open") && !createModal?.classList.contains("open")) {
    renderBoard();
  }
});

socket.on("disconnect", () => {
  console.log("❌ WebSocket desconectado");
});
  
// Atualiza semáforo a cada 60s
setInterval(() => {
  orders.forEach(o => {
    const cardEl = document.querySelector(`.order-card[data-id="${o.id}"]`);
    if (!cardEl) return;
    const waitColor = getWaitColor(o._frontStatus, o.created_at);
    if (waitColor) {
      cardEl.style.borderLeft = `4px solid ${waitColor}`;
    } else {
      cardEl.style.borderLeft = "";
    }
  });
}, 60000);

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

function destroyAllCharts() {
  [
    originChartInstance, serviceChartInstance,
    clientsChartInstance, statusChartInstance,
    insightsChartInstance, timingChartInstance,
    topProductsChartInstance, peakHoursChartInstance
  ].forEach(c => { if (c) { c.destroy(); } });
  originChartInstance = null;
  serviceChartInstance = null;
  clientsChartInstance = null;
  statusChartInstance = null;
  insightsChartInstance = null;
  timingChartInstance = null;
  topProductsChartInstance = null;
  peakHoursChartInstance = null;
}

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
  const { medias, metas } = data;

  const etapas = [
    { key: 'confirmacao', meta: metas.confirmacao, val: medias.confirmacao },
    { key: 'preparo',     meta: metas.preparo,     val: medias.preparo     },
    { key: 'montagem',    meta: metas.montagem,     val: medias.montagem    },
    { key: 'entrega',     meta: metas.entrega,      val: medias.entrega     },
  ];

  etapas.forEach(({ key, meta, val }) => {
    const card = document.getElementById(`timing-card-${key}`);
    const valEl = document.getElementById(`timing-val-${key}`);
    if (!card || !valEl) return;

    const dentro = val <= meta;
    valEl.textContent = val > 0 ? `${val.toFixed(1)} min` : '—';

    card.style.background = dentro
      ? 'rgba(34,197,94,0.1)'
      : 'rgba(239,68,68,0.1)';
    card.style.borderColor = dentro
      ? 'rgba(34,197,94,0.3)'
      : 'rgba(239,68,68,0.3)';
    valEl.style.color = dentro
      ? 'rgba(34,197,94,1)'
      : 'rgba(239,68,68,1)';
  });
}

// 🏆 PRODUTOS MAIS VENDIDOS
function normalizarNome(nome) {
  return String(nome || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

async function renderTopProductsChart() {
  const canvas = document.getElementById("topProductsChart");
  if (!canvas) return;
  const rid = getRestaurantId();
  if (!rid) return;
  try {
    const resp = await fetch(`${METRICS_URL}/${rid}/top-products?period=${resultsState.period}`);
    const data = await resp.json();
    if (!resp.ok || !data.length) return;
    const labels = data.map(i => i.nome);
    const valores = data.map(i => i.qty);
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
  } catch(e) { console.error("Erro top products:", e); }
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
  position: 'right',
  labels: {
    color: 'rgba(252, 228, 228, 0.9)',
    font: { size: 12, family: 'Space Grotesk', weight: '600' },
    padding: 12,
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
  // Comparações com período anterior
renderComparison("delta-revenue", data.comparison?.revenue?.growth || 0);
renderComparison("delta-roi",     data.comparison?.revenue?.growth || 0);
renderComparison("delta-ticket",  data.comparison?.ticket?.growth  || 0);
renderComparison("delta-orders",  data.comparison?.orders?.growth  || 0);
  // Novos cards de retenção
safeSetText("card-retorno",    `${(data.taxa_retorno || 0).toFixed(1)}%`);
safeSetText("card-frequencia", `${(data.frequencia_media || 0).toFixed(1)}x`);
safeSetText("inativos-7",      data.clientes_inativos?.dias_7  || 0);
safeSetText("inativos-15",     data.clientes_inativos?.dias_15 || 0);
safeSetText("inativos-30",     data.clientes_inativos?.dias_30 || 0);
  
// Novos vs recorrentes
const totalClients = data.unique_clients || 0;
const newClients = data.client_base?.new_clients || 0;
const recurringClients = data.client_base?.recurring_clients || 0;
const newPct = totalClients > 0 ? ((newClients / totalClients) * 100).toFixed(0) : 0;
const recurringPct = totalClients > 0 ? ((recurringClients / totalClients) * 100).toFixed(0) : 0;

safeSetText("card-new-clients", newClients);
safeSetText("card-new-clients-pct", `(${newPct}%)`);
safeSetText("card-recurring-clients", recurringClients);
safeSetText("card-recurring-pct", `(${recurringPct}%)`);

// Faturamento recorrente
safeSetText("card-recurring-revenue", formatCurrency(data.recurring_revenue || 0));
const recurringRevenuePct = data.total_revenue > 0
  ? ((data.recurring_revenue || 0) / data.total_revenue * 100).toFixed(0)
  : 0;
safeSetText("card-recurring-revenue-pct", `${recurringRevenuePct}% do total`);
  
renderComparison("delta-retorno",    data.comparison?.taxa_retorno?.growth  || 0);
renderComparison("delta-frequencia", data.comparison?.frequencia?.growth    || 0);
  safeSetText("card-plan-price", formatCurrency(restaurantPlanPrice));
  
// Gráficos
 // Gráficos
  console.log("🎨 Renderizando gráficos...");
  renderAllCharts(data);
  fetchAndRenderInsights();
  console.log("✅ Métricas renderizadas com sucesso!");
  fetchAndRenderTiming();
renderTopProductsChart();
  renderPeakHoursChart(orders);

  // Performance IA
  safeSetText("ia-orders", data.ia_performance?.orders || 0);
  safeSetText("ia-revenue", formatCurrency(data.ia_performance?.revenue || 0));
  safeSetText("ia-percentage", `${(data.ia_performance?.percentage || 0).toFixed(1)}%`);

  const iaPedidosPct = data.total_orders > 0
    ? ((data.ia_performance?.orders || 0) / data.total_orders * 100).toFixed(1)
    : 0;
  safeSetText("ia-orders-pct", `${iaPedidosPct}%`);
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

// ========================================
// 📱 AUTOATENDIMENTO
// ========================================
let cardapioItems = [];

async function initAutoatendimento() {
  setupAutoatendimentoTabs();
  document.getElementById("painel-mesas")?.classList.remove("hidden");

  // 🔥 ADICIONE ISTO:
  const dominioSalvo = localStorage.getItem("cardapio_url") || "";
const el = document.getElementById("input-dominio-cardapio");
if (el) el.value = dominioSalvo;
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
  if (!rid) {
    console.error("❌ restaurant_id não encontrado ao carregar cardápio");
    return;
  }
  try {
    const resp = await fetch(`${API_BASE}/api/v1/cardapio/${rid}`);
    if (!resp.ok) {
      console.error("❌ Erro HTTP cardápio:", resp.status);
      return;
    }
    const data = await resp.json();
    console.log("✅ Cardápio recebido:", data);
    cardapioItems = Array.isArray(data) ? data : [];
    await renderCardapio();
  } catch (e) {
    console.error("❌ Erro ao buscar cardápio:", e);
    const lista = document.getElementById("lista-cardapio-view");
    if (lista) lista.innerHTML = `<p style="color:#ef4444; text-align:center; padding:40px 0;">Erro ao carregar cardápio. Tente novamente.</p>`;
  }
}

// Ordem das categorias salva localmente
let categoriasOrdem = [];

async function renderCardapio() {
   const rid = getRestaurantId();

  // 🔥 BUSCA ORDEM SALVA ANTES DE RENDERIZAR
  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/config`);
    const config = await resp.json();
    if (Array.isArray(config?.categorias_ordem) && config.categorias_ordem.length > 0) {
      categoriasOrdem = config.categorias_ordem;
    }
  } catch(e) {}
  const lista = document.getElementById("lista-cardapio-view") || document.getElementById("lista-cardapio");
  if (!lista) {
    console.error("❌ Elemento da lista do cardápio não encontrado no HTML.");
    return;
  }
 

  if (cardapioItems.length === 0) {
    lista.innerHTML = `<p style="color:rgba(252,228,228,0.5); text-align:center; padding:40px 0;">Nenhum item cadastrado. Clique em "+ Novo Item" para começar.</p>`;
    return;
  }

  const categoriasMap = {};
  cardapioItems.forEach(item => {
    const cat = item.categoria || "Geral";
    if (!categoriasMap[cat]) categoriasMap[cat] = [];
    categoriasMap[cat].push(item);
  });

  // Mantém ordem salva, adiciona novas categorias no fim
  const todasCats = Object.keys(categoriasMap);
  todasCats.forEach(c => { if (!categoriasOrdem.includes(c)) categoriasOrdem.push(c); });
  categoriasOrdem = categoriasOrdem.filter(c => todasCats.includes(c));

  lista.innerHTML = `
    <div id="categorias-container">
      ${categoriasOrdem.map((cat, catIndex) => {
        const itens = categoriasMap[cat];
        const collapsed = true;
        return `
          <div class="categoria-bloco" data-cat="${escapeHtml(cat)}" draggable="true" style="margin-bottom:24px;">
            <div onclick="toggleCategoria('${escapeHtml(cat)}')" style="
              display:flex; align-items:center; justify-content:space-between;
              cursor:pointer; padding:8px 4px; user-select:none;
              border-bottom:1px solid rgba(91,28,28,0.4); margin-bottom:12px;
            ">
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="cat-drag-handle" style="cursor:grab; font-size:18px; color:rgba(252,228,228,0.2);">⠿</span>
                <h4 style="color:rgba(252,228,228,0.6); font-size:12px; text-transform:uppercase; letter-spacing:2px; margin:0;">${escapeHtml(cat)}</h4>
                <span style="color:rgba(252,228,228,0.3); font-size:11px;">(${itens.length})</span>
              </div>
              <span id="arrow-cat-${escapeHtml(cat)}" style="color:rgba(252,228,228,0.4); font-size:14px; transition:transform 0.2s; transform:rotate(-90deg);">▼</span>
            </div>
            <div id="itens-cat-${escapeHtml(cat)}" class="sortable-list" data-categoria="${escapeHtml(cat)}" style="display:none;">
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
        `;
      }).join("")}
    </div>
  `;

  // Drag and drop dos itens dentro de cada categoria
  document.querySelectorAll('.sortable-list').forEach(list => setupDragDrop(list));
  // Drag and drop das categorias entre si
  setupCategoriaDragDrop();
}

function toggleCategoria(cat) {
  const painel = document.getElementById(`itens-cat-${cat}`);
  const arrow = document.getElementById(`arrow-cat-${cat}`);
  if (!painel) return;
  const collapsed = painel.style.display === "none";
  painel.style.display = collapsed ? "" : "none";
  if (arrow) arrow.style.transform = collapsed ? "" : "rotate(-90deg)";
}

function setupCategoriaDragDrop() {
  const container = document.getElementById("categorias-container");
  if (!container) return;
  let dragCat = null;

  container.querySelectorAll(".categoria-bloco").forEach(bloco => {
    // Desabilita draggable por padrão, só ativa quando segura o handle
    bloco.draggable = false;

    const handle = bloco.querySelector(".cat-drag-handle");
    if (handle) {
      handle.addEventListener("mousedown", () => {
        bloco.draggable = true;
      });
      handle.addEventListener("mouseup", () => {
        bloco.draggable = false;
      });
    }

    bloco.addEventListener("dragstart", (e) => {
      dragCat = bloco;
      setTimeout(() => bloco.style.opacity = "0.4", 0);
    });

    bloco.addEventListener("dragend", () => {
      bloco.style.opacity = "1";
      bloco.draggable = false;
      dragCat = null;
     // linha 3450
categoriasOrdem = [...container.querySelectorAll(".categoria-bloco")].map(b => b.dataset.cat);

// 🔥 ADICIONA AQUI (linha 3451 em diante)
const rid = getRestaurantId();
if (rid) {
  fetch(`${API_BASE}/api/v1/cardapio/${rid}/ordem-categorias`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ordem: categoriasOrdem })
  }).catch(e => console.error("Erro ao salvar ordem:", e));
}  
    });

    bloco.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!dragCat || dragCat === bloco) return;
      const rect = bloco.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        container.insertBefore(dragCat, bloco);
      } else {
        container.insertBefore(dragCat, bloco.nextSibling);
      }
    });
  });
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
   <div class="modal confirm-modal" style="width:560px; max-width:95vw;">
      <div class="modal-header">
        <h3>${item ? "✏️ Editar Item" : "➕ Novo Item"}</h3>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:12px; max-height:75vh; overflow-y:auto; padding-right:4px;">
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
      <div style="margin-top:4px;">
          <div style="color:rgba(252,228,228,0.8); font-size:13px; margin-bottom:8px;">Variações <span style="color:rgba(252,228,228,0.3); font-size:11px;">(opcional)</span></div>
          <div id="variacoes-lista" style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;"></div>
          <button type="button" onclick="adicionarVariacao()" style="
            padding:7px 14px; border-radius:8px; border:1px dashed rgba(249,115,115,0.4);
            background:transparent; color:rgba(249,115,115,0.8); font-size:12px; cursor:pointer;
          ">+ Adicionar variação</button>
        </div>
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

 const variacoes = item?.opcoes ? (Array.isArray(item.opcoes) ? item.opcoes : JSON.parse(item.opcoes)) : [];
variacoes.forEach(v => adicionarVariacao(v.nome || v.name, v.preco, v.texto_livre || false, v.filtro || ""));
}

function adicionarVariacao(nome = "", preco = "", textoLivre = false, filtro = "") {
  const lista = document.getElementById("variacoes-lista");
  if (!lista) return;
  const row = document.createElement("div");
  row.style.cssText = "display:flex; gap:8px; align-items:center; flex-wrap:wrap;";
  row.innerHTML = `
    <input placeholder="Ex: Grande, Com leite..." value="${escapeHtml(String(nome))}"
      style="flex:2; min-width:120px; padding:8px 12px; border-radius:8px; border:1px solid rgba(91,28,28,0.85);
      background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:13px; outline:none;"
      class="variacao-nome" />
    <input placeholder="0,00" value="${preco}" inputmode="decimal"
      style="flex:1; min-width:70px; padding:8px 12px; border-radius:8px; border:1px solid rgba(91,28,28,0.85);
      background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:13px; outline:none;"
      class="variacao-preco" />
    <label style="display:flex; align-items:center; gap:4px; color:rgba(252,228,228,0.6); font-size:11px; white-space:nowrap; cursor:pointer;">
      <input type="checkbox" class="variacao-texto-livre" ${textoLivre ? 'checked' : ''}
        style="width:14px; height:14px; accent-color:#f97373; cursor:pointer;" />
      2 sabores
    </label>
    <input placeholder="Filtrar (ex: grande)" value="${escapeHtml(String(filtro))}"
      style="flex:1; min-width:90px; padding:8px 12px; border-radius:8px; border:1px solid rgba(91,28,28,0.85);
      background:rgba(46,8,8,0.45); color:rgba(252,228,228,1); font-size:11px; outline:none;"
      class="variacao-filtro" />
    <button type="button" onclick="this.parentElement.remove()" style="
      width:28px; height:28px; border-radius:50%; border:none;
      background:rgba(239,68,68,0.2); color:rgba(239,68,68,0.8);
      font-size:16px; cursor:pointer; flex-shrink:0; line-height:1;">×</button>
  `;
  lista.appendChild(row);
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

  // Coleta variações
  const opcoes = [];
  document.querySelectorAll("#variacoes-lista > div").forEach(row => {
  const nomeV = row.querySelector(".variacao-nome")?.value.trim();
  const precoV = parseFloat(row.querySelector(".variacao-preco")?.value.replace(/\./g,"").replace(",",".")) || 0;
  const textoLivre = row.querySelector(".variacao-texto-livre")?.checked || false;
  const filtro = row.querySelector(".variacao-filtro")?.value.trim() || "";
  if (nomeV && precoV) opcoes.push({ nome: nomeV, preco: precoV, texto_livre: textoLivre, filtro });
});

  if (!nome) { alert("Nome é obrigatório."); return; }

  try {
    if (id) {
      await fetch(`${API_BASE}/api/v1/cardapio/${id}`, {
        method: "PATCH", headers: buildHeaders(),
        body: JSON.stringify({ nome, descricao, preco, categoria, foto_url, opcoes: opcoes.length > 0 ? opcoes : null })
      });
    } else {
      await fetch(`${API_BASE}/api/v1/cardapio`, {
        method: "POST", headers: buildHeaders(),
        body: JSON.stringify({ restaurant_id: rid, nome, descricao, preco, categoria, foto_url, opcoes: opcoes.length > 0 ? opcoes : null })
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

let impressorasConfig = [];

let _categoriasCache = null;

async function fetchCategoriasCardapio() {
  if (_categoriasCache) return _categoriasCache;
  const rid = getRestaurantId();
  if (!rid) return [];
  try {
    const resp = await fetch(`${API_BASE}/api/v1/cardapio/${rid}`);
    const data = await resp.json();
    const cats = [...new Set((data || []).map(i => i.categoria).filter(Boolean))];
    _categoriasCache = cats;
    return cats;
  } catch(e) {
    return [];
  }
}

function renderImpressoras() {
  const container = document.getElementById("impressoras-container");
  if (!container) return;
  container.innerHTML = impressorasConfig.map((imp, i) => {
    const tags = imp.categorias
      ? imp.categorias.split(",").map(c => c.trim()).filter(Boolean)
      : [];
    return `
      <div style="background:rgba(46,8,8,0.45); border:1px solid rgba(91,28,28,0.85); border-radius:12px; padding:16px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span style="color:rgba(252,228,228,0.8); font-weight:700; font-size:13px;">Impressora ${i + 1}</span>
          <button onclick="removerImpressora(${i})" style="background:none; border:none; color:rgba(239,68,68,0.8); font-size:18px; cursor:pointer;">×</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <input placeholder="Printer ID" value="${imp.printer_id || ""}"
            oninput="impressorasConfig[${i}].printer_id = this.value"
            style="padding:10px 14px; border-radius:10px; border:1px solid rgba(91,28,28,0.85); background:rgba(20,3,3,0.4); color:rgba(252,228,228,1); font-size:13px; outline:none; width:100%;" />

          <!-- CAMPO DE TAGS — oculto se for caixa -->
          <div style="display:${imp.caixa ? 'none' : 'flex'}; flex-direction:column; gap:8px;">
            <div id="tags-box-${i}" style="
              display:flex; flex-wrap:wrap; align-items:center; gap:6px;
              padding:8px 12px; border-radius:10px;
              border:1px solid rgba(91,28,28,0.85);
              background:rgba(20,3,3,0.4);
              cursor:text; min-height:44px; position:relative;
            " onclick="document.getElementById('cat-input-${i}').focus()">
              ${tags.map(tag => `
                <span style="
                  display:inline-flex; align-items:center; gap:4px;
                  background:rgba(249,115,115,0.2); border:1px solid rgba(249,115,115,0.5);
                  color:rgba(252,228,228,0.95); font-size:12px; font-weight:700;
                  padding:4px 10px; border-radius:999px;
                ">
                  ${tag}
                  <button onclick="removerTag(${i}, '${tag}')" style="
                    background:none; border:none; color:rgba(249,115,115,0.8);
                    font-size:14px; cursor:pointer; padding:0; line-height:1;
                  ">×</button>
                </span>
              `).join("")}
              <input id="cat-input-${i}" placeholder="${tags.length === 0 ? 'Categorias...' : ''}"
                style="
                  flex:1; min-width:80px; border:none; background:transparent;
                  color:rgba(252,228,228,1); font-size:13px; outline:none;
                  font-family:inherit; padding:4px 0;
                "
                oninput="onCatInput(${i}, this.value)"
                onfocus="onCatInput(${i}, this.value)"
                onkeydown="onCatKeydown(event, ${i})"
                autocomplete="off"
              />
            </div>
            <div id="cat-dropdown-${i}" style="
              display:none; position:relative; z-index:999;
              background:rgba(30,6,6,0.98); border:1px solid rgba(91,28,28,0.85);
              border-radius:12px; max-height:180px; overflow-y:auto;
              box-shadow:0 8px 32px rgba(0,0,0,0.6); margin-top:-4px;
            "></div>
          </div>

          ${imp.caixa ? `<p style="color:rgba(252,228,228,0.4); font-size:12px; margin:0;">Imprime todos os itens automaticamente</p>` : ""}

          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:4px;">
            <input type="checkbox" ${imp.caixa ? "checked" : ""}
              onchange="impressorasConfig[${i}].caixa = this.checked; renderImpressoras();"
              style="width:16px; height:16px; accent-color:#f97373; cursor:pointer;" />
            <span style="color:rgba(252,228,228,0.7); font-size:13px; font-weight:700;">É impressora do caixa?</span>
          </label>

        </div>
      </div>
    `;
  }).join("");
}

async function onCatInput(index, value) {
  const dropdown = document.getElementById(`cat-dropdown-${index}`);
  if (!dropdown) return;

  const q = value.trim().toLowerCase();
  const todas = await fetchCategoriasCardapio();

  // Filtra categorias que já foram selecionadas
  const jaAdicionadas = (impressorasConfig[index].categorias || "")
    .split(",").map(c => c.trim().toLowerCase()).filter(Boolean);

  const filtradas = todas.filter(cat =>
    cat.toLowerCase().includes(q) && !jaAdicionadas.includes(cat.toLowerCase())
  );

  if (!q && filtradas.length === 0) {
    dropdown.style.display = "none";
    return;
  }

  // Mostra todas se campo vazio, filtra se digitando
  const opcoes = q === "" ? todas.filter(c => !jaAdicionadas.includes(c.toLowerCase())) : filtradas;

  if (opcoes.length === 0) {
    dropdown.style.display = "none";
    return;
  }

  dropdown.innerHTML = opcoes.map(cat => `
    <div onclick="adicionarTag(${index}, '${cat}')" style="
      padding:10px 16px; cursor:pointer; font-size:13px; font-weight:700;
      color:rgba(252,228,228,0.9); border-bottom:1px solid rgba(91,28,28,0.3);
      transition:background 0.15s;
    "
    onmouseover="this.style.background='rgba(91,28,28,0.5)'"
    onmouseout="this.style.background='transparent'">
      ${cat}
    </div>
  `).join("");

  dropdown.style.display = "block";
}

function onCatKeydown(event, index) {
  const input = document.getElementById(`cat-input-${index}`);
  if (!input) return;

  // Enter ou vírgula — adiciona tag digitada manualmente
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    const val = input.value.replace(",", "").trim();
    if (val) adicionarTag(index, val);
  }

  // Backspace sem texto — remove última tag
  if (event.key === "Backspace" && input.value === "") {
    const tags = (impressorasConfig[index].categorias || "")
      .split(",").map(c => c.trim()).filter(Boolean);
    if (tags.length > 0) {
      tags.pop();
      impressorasConfig[index].categorias = tags.join(", ");
      renderImpressoras();
    }
  }
}

function adicionarTag(index, cat) {
  const tags = (impressorasConfig[index].categorias || "")
    .split(",").map(c => c.trim()).filter(Boolean);

  if (!tags.includes(cat)) {
    tags.push(cat);
    impressorasConfig[index].categorias = tags.join(", ");
  }

  renderImpressoras();

  // Foca o input depois de renderizar
  setTimeout(() => {
    document.getElementById(`cat-input-${index}`)?.focus();
  }, 50);
}

function removerTag(index, cat) {
  const tags = (impressorasConfig[index].categorias || "")
    .split(",").map(c => c.trim()).filter(Boolean)
    .filter(t => t !== cat);

  impressorasConfig[index].categorias = tags.join(", ");
  renderImpressoras();
}

function adicionarImpressora() {
  impressorasConfig.push({ printer_id: "", categorias: "" });
  renderImpressoras();
}

function removerImpressora(index) {
  impressorasConfig.splice(index, 1);
  renderImpressoras();
}

async function salvarImpressora() {
  const rid = getRestaurantId();
  const key = document.getElementById("settings-printnode-key").value.trim();
  const status = document.getElementById("settings-printer-status");

  if (!key) {
    status.textContent = "❌ Preencha a API Key.";
    status.style.color = "rgba(239,68,68,0.9)";
    return;
  }

  const impressorasValidas = impressorasConfig.filter(i => i.printer_id.trim());
  if (impressorasValidas.length === 0) {
    status.textContent = "❌ Adicione pelo menos uma impressora com Printer ID.";
    status.style.color = "rgba(239,68,68,0.9)";
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/impressora`, {
      method: "PATCH",
      headers: buildHeaders(),
      body: JSON.stringify({ api_key: key, impressoras: impressorasValidas })
    });
    if (!resp.ok) throw new Error();
    status.textContent = "✅ Impressoras salvas com sucesso!";
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

async function salvarMarketplace() {
  const rid = getRestaurantId();
  const ifood_api_key = document.getElementById("settings-ifood-key").value.trim();
  const aiqfome_api_key = document.getElementById("settings-aiqfome-key").value.trim();
  const status = document.getElementById("settings-marketplace-status");

  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/marketplace`, {
      method: "PATCH",
      headers: buildHeaders(),
      body: JSON.stringify({ ifood_api_key, aiqfome_api_key })
    });
    status.textContent = resp.ok ? "✅ Chaves salvas com sucesso!" : "❌ Erro ao salvar.";
    status.style.color = resp.ok ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)";
  } catch (e) {
    status.textContent = "❌ Erro de conexão.";
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

async function salvarFiscal() {
  const rid = getRestaurantId();
  const focusnfe_token = document.getElementById("settings-focusnfe-token").value.trim();
  const cnpj = document.getElementById("settings-cnpj").value.trim();
  const inscricao_estadual = document.getElementById("settings-ie").value.trim();
  const regime_tributario = document.getElementById("settings-regime").value;
  const status = document.getElementById("settings-nfe-status");

  try {
    const resp = await fetch(`${API_BASE}/api/v1/restaurante/${rid}/fiscal`, {
      method: "PATCH",
      headers: buildHeaders(),
      body: JSON.stringify({ focusnfe_token, cnpj, inscricao_estadual, regime_tributario })
    });
    status.textContent = resp.ok ? "✅ Configuração fiscal salva!" : "❌ Erro ao salvar.";
    status.style.color = resp.ok ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)";
  } catch (e) {
    status.textContent = "❌ Erro de conexão.";
    status.style.color = "rgba(239,68,68,0.9)";
  }
}

// ===== FECHAMENTO DE CAIXA =====
// ===== MÓDULO DE CAIXA - FLUXON =====
// Substitua as funções showResumoDia() e exportarFechamentoPDF() por este arquivo completo.

// ---------- ESTADO LOCAL DO TURNO ----------
let _caixaState = {
  aberto: false,
  operador: "",
  turno: "",
  horaAbertura: null,
  fundoInicial: 0,
  obs: ""
};

function _salvarCaixaState() {
  localStorage.setItem("fluxon_caixa", JSON.stringify(_caixaState));
}

function _carregarCaixaState() {
  try {
    const s = localStorage.getItem("fluxon_caixa");
    if (s) _caixaState = JSON.parse(s);
  } catch (e) {}
}

_carregarCaixaState();

// ---------- UTILITÁRIOS ----------
function _fmtCurrency(v) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function _fmtDuracao(inicio) {
  const diff = Math.floor((Date.now() - new Date(inicio).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function _cardStyle(r, g, b) {
  return `background:rgba(${r},${g},${b},0.12); border:1px solid rgba(${r},${g},${b},0.35); border-radius:14px; padding:16px; text-align:center;`;
}

function _labelStyle(r, g, b) {
  return `font-size:10px; font-weight:700; color:rgba(${r},${g},${b},0.8); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;`;
}

function _sectionStyle() {
  return `background:rgba(46,8,8,0.45); border:1px solid rgba(91,28,28,0.85); border-radius:14px; padding:16px; margin-bottom:0;`;
}

function _sectionTitle(icon, label) {
  return `<div style="font-size:11px; font-weight:700; color:rgba(252,228,228,0.5); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">${icon} ${label}</div>`;
}

// ---------- TELA 1: ABERTURA DE CAIXA ----------
function showAberturaCaixa() {
  const existing = document.getElementById("caixa-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "caixa-modal";
  modal.className = "modal-backdrop open";
  modal.innerHTML = `
    <div class="modal confirm-modal" style="max-width:480px;">
      <div class="modal-header">
        <div>
          <h3 style="margin:0;">Abrir Caixa</h3>
          <p style="color:var(--muted); font-size:12px; margin:4px 0 0 0;">
            ${new Date().toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" })}
          </p>
        </div>
        <button class="icon-button" onclick="document.getElementById('caixa-modal').remove()">×</button>
      </div>
      <div class="modal-body" style="gap:14px;">

        <div style="${_sectionStyle()}">
          ${_sectionTitle("👤", "Operador")}
          <input id="cx-operador" type="text" placeholder="Nome do caixeiro..."
            style="width:100%; background:rgba(255,255,255,0.06); border:1px solid rgba(91,28,28,0.85); border-radius:10px; padding:10px 14px; color:rgba(252,228,228,0.95); font-size:14px; outline:none;" />
        </div>

        <div style="${_sectionStyle()}">
          ${_sectionTitle("🕐", "Turno")}
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;" id="cx-turno-btns">
            ${["Manhã","Tarde","Noite"].map(t => `
              <button onclick="_selecionarTurno('${t}')" id="cx-turno-${t}"
                style="padding:10px; border-radius:10px; border:1px solid rgba(91,28,28,0.85); background:rgba(255,255,255,0.04); color:rgba(252,228,228,0.7); font-size:13px; font-weight:700; cursor:pointer; transition:all .15s;">
                ${t}
              </button>`).join("")}
          </div>
          <input id="cx-turno-custom" type="text" placeholder="Ou digite um turno personalizado..."
            style="width:100%; margin-top:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(91,28,28,0.85); border-radius:10px; padding:10px 14px; color:rgba(252,228,228,0.95); font-size:13px; outline:none;" />
        </div>

        <div style="${_sectionStyle()}">
          ${_sectionTitle("💵", "Fundo de Caixa Inicial")}
          <div style="position:relative;">
            <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:rgba(252,228,228,0.4); font-size:13px;">R$</span>
            <input id="cx-fundo" type="number" min="0" step="0.01" placeholder="0,00"
              style="width:100%; background:rgba(255,255,255,0.06); border:1px solid rgba(91,28,28,0.85); border-radius:10px; padding:10px 14px 10px 36px; color:rgba(252,228,228,0.95); font-size:14px; outline:none;" />
          </div>
        </div>

      </div>
      <div class="modal-actions" style="justify-content:space-between;">
        <button class="ghost-button" onclick="document.getElementById('caixa-modal').remove()">Cancelar</button>
        <button class="ghost-button" onclick="_confirmarAbertura()" style="border-color:rgba(34,197,94,0.5); color:rgba(34,197,94,1);">Abrir Caixa</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
}

let _turnoSelecionado = "";
function _selecionarTurno(t) {
  _turnoSelecionado = t;
  document.getElementById("cx-turno-custom").value = "";
  ["Manhã","Tarde","Noite"].forEach(x => {
    const btn = document.getElementById(`cx-turno-${x}`);
    if (btn) {
      btn.style.background = x === t ? "rgba(251,191,36,0.18)" : "rgba(255,255,255,0.04)";
      btn.style.borderColor = x === t ? "rgba(251,191,36,0.6)" : "rgba(91,28,28,0.85)";
      btn.style.color = x === t ? "rgba(251,191,36,1)" : "rgba(252,228,228,0.7)";
    }
  });
}

async function _confirmarAbertura() {
  const operador = document.getElementById("cx-operador").value.trim();
  const turnoCustom = document.getElementById("cx-turno-custom").value.trim();
  const turno = turnoCustom || _turnoSelecionado;
  const fundo = parseFloat(document.getElementById("cx-fundo").value) || 0;

  if (!operador) { alert("Informe o nome do operador."); return; }
  if (!turno) { alert("Selecione ou informe o turno."); return; }

  const rid = getRestaurantId();
  try {
    const resp = await fetch(`${API_BASE}/api/v1/caixa/${rid}/abrir`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ operador, turno, fundo_inicial: fundo })
    });
    const data = await resp.json();
    if (!resp.ok) { alert(data.error || "Erro ao abrir caixa"); return; }

    _caixaState = { aberto: true, operador, turno, horaAbertura: new Date().toISOString(), fundoInicial: fundo, obs: "", caixa_id: data.caixa.id };
    _salvarCaixaState();
    _turnoSelecionado = "";
    document.getElementById("caixa-modal").remove();
    showCaixa();
  } catch(e) {
    alert("Erro ao abrir caixa: " + e.message);
  }
}

// ---------- TELA 2: CAIXA ABERTO (hub principal) ----------
async function showCaixa() {
  _carregarCaixaState();

  if (!_caixaState.aberto) {
    showAberturaCaixa();
    return;
  }

  const rid = getRestaurantId();
  if (!rid) return;

  let d;
  try {
    const resp = await fetch(`${API_BASE}/api/v1/metrics/${rid}/resumo-dia`);
    d = await resp.json();
    if (!resp.ok) throw new Error();
  } catch(e) {
    console.error("Erro ao carregar caixa:", e);
    return;
  }

  const hoje = new Date(d.data);
  const existing = document.getElementById("caixa-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "caixa-modal";
  modal.className = "modal-backdrop open";
  modal.innerHTML = `
    <div class="modal confirm-modal" style="max-width:600px; max-height:92vh; overflow-y:auto;">
      <div class="modal-header">
        <div>
          <h3 style="margin:0;">Caixa</h3>
          <p style="color:var(--muted); font-size:12px; margin:4px 0 0 0;">
            ${hoje.toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" })}
          </p>
        </div>
        <button class="icon-button" onclick="document.getElementById('caixa-modal').remove()">×</button>
      </div>

      <div class="modal-body" style="gap:14px;">

        <!-- STATUS DO TURNO -->
        <div style="${_sectionStyle()} display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <div style="font-size:10px; font-weight:700; color:rgba(34,197,94,0.8); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Turno aberto</div>
            <div style="font-size:15px; font-weight:700; color:rgba(252,228,228,0.95);">${_caixaState.operador}</div>
            <div style="font-size:12px; color:rgba(252,228,228,0.4); margin-top:2px;">${_caixaState.turno} · ${_fmtDuracao(_caixaState.horaAbertura)} em andamento</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px; color:rgba(252,228,228,0.4); margin-bottom:2px;">Fundo inicial</div>
            <div style="font-size:18px; font-weight:900; color:rgba(251,191,36,1); font-family:'Space Grotesk',sans-serif;">${_fmtCurrency(_caixaState.fundoInicial)}</div>
          </div>
        </div>

        <!-- MÉTRICAS -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div style="${_cardStyle(34,197,94)}">
            <div style="${_labelStyle(34,197,94)}">Pedidos</div>
            <div style="font-size:34px; font-weight:900; color:rgba(34,197,94,1); font-family:'Space Grotesk',sans-serif;">${d.total_pedidos}</div>
          </div>
          <div style="${_cardStyle(251,191,36)}">
            <div style="${_labelStyle(251,191,36)}">Faturamento</div>
            <div style="font-size:26px; font-weight:900; color:rgba(251,191,36,1); font-family:'Space Grotesk',sans-serif;">${_fmtCurrency(d.faturamento)}</div>
          </div>
          <div style="${_cardStyle(59,130,246)}">
            <div style="${_labelStyle(59,130,246)}">Ticket Médio</div>
            <div style="font-size:26px; font-weight:900; color:rgba(59,130,246,1); font-family:'Space Grotesk',sans-serif;">${_fmtCurrency(d.ticket_medio)}</div>
          </div>
          <div style="${_cardStyle(239,68,68)}">
            <div style="${_labelStyle(239,68,68)}">Cancelados</div>
            <div style="font-size:34px; font-weight:900; color:rgba(239,68,68,1); font-family:'Space Grotesk',sans-serif;">${d.cancelados}</div>
          </div>
        </div>

        <!-- TIPO DE PEDIDO -->
        <div style="${_sectionStyle()}">
          ${_sectionTitle("🚚", "Tipo de Pedido")}
          <div style="display:flex; gap:10px;">
            <div style="flex:1; text-align:center; padding:10px; background:rgba(251,191,36,0.1); border-radius:10px; border:1px solid rgba(251,191,36,0.3);">
              <div style="font-size:10px; color:rgba(251,191,36,0.8); font-weight:700; margin-bottom:4px;">DELIVERY</div>
              <div style="font-size:24px; font-weight:900; color:rgba(251,191,36,1);">${d.delivery}</div>
            </div>
            <div style="flex:1; text-align:center; padding:10px; background:rgba(139,92,246,0.1); border-radius:10px; border:1px solid rgba(139,92,246,0.3);">
              <div style="font-size:10px; color:rgba(139,92,246,0.8); font-weight:700; margin-bottom:4px;">LOCAL</div>
              <div style="font-size:24px; font-weight:900; color:rgba(139,92,246,1);">${d.local}</div>
            </div>
          </div>
        </div>

        <!-- PAGAMENTOS -->
        <div style="${_sectionStyle()}">
          ${_sectionTitle("💳", "Por Forma de Pagamento")}
          ${Object.keys(d.por_pagamento).length === 0
            ? `<p style="color:var(--muted); font-size:13px;">Nenhum pedido finalizado ainda.</p>`
            : Object.entries(d.por_pagamento).map(([metodo, info]) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(91,28,28,0.4);">
                <div>
                  <span style="font-weight:700; font-size:14px; color:rgba(252,228,228,0.95); text-transform:capitalize;">${metodo}</span>
                  <span style="color:var(--muted); font-size:12px; margin-left:8px;">${info.qtd} pedido(s)</span>
                </div>
                <span style="font-weight:800; font-size:15px; color:rgba(251,191,36,1);">${_fmtCurrency(info.valor)}</span>
              </div>
            `).join("") + `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0 0;">
              <span style="font-weight:900; font-size:14px; color:rgba(252,228,228,0.95);">Total</span>
              <span style="font-weight:900; font-size:16px; color:rgba(34,197,94,1);">${_fmtCurrency(d.faturamento)}</span>
            </div>`
          }
        </div>

        <!-- TOP ITENS -->
        ${d.top_itens && d.top_itens.length > 0 ? `
        <div style="${_sectionStyle()}">
          ${_sectionTitle("🏆", "Itens Mais Vendidos")}
          ${d.top_itens.map(({ nome, qty }, i) => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(91,28,28,0.3);">
              <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:11px; font-weight:900; color:rgba(252,228,228,0.3); width:16px;">${i + 1}</span>
                <span style="font-weight:700; font-size:14px; color:rgba(252,228,228,0.9);">${nome}</span>
              </div>
              <span style="font-weight:800; font-size:13px; color:rgba(249,115,115,1);">${qty}x</span>
            </div>
          `).join("")}
        </div>` : ""}

      </div>

      <div class="modal-actions" style="justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <button class="ghost-button" onclick="document.getElementById('caixa-modal').remove()">Minimizar</button>
        <button class="ghost-button" onclick="_showFechamentoCaixa()" style="border-color:rgba(239,68,68,0.5); color:rgba(239,68,68,1);">Fechar Caixa</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
}

// ---------- TELA 3: FECHAMENTO (conferência + obs) ----------
async function _showFechamentoCaixa() {
  const rid = getRestaurantId();
  if (!rid) return;

  let d;
  try {
    const resp = await fetch(`${API_BASE}/api/v1/metrics/${rid}/resumo-dia`);
    d = await resp.json();
    if (!resp.ok) throw new Error();
  } catch(e) { return; }

  const dinheiroEntradas = (() => {
    const pagDinheiro = d.por_pagamento["dinheiro"] || d.por_pagamento["Dinheiro"] || null;
    return pagDinheiro ? pagDinheiro.valor : 0;
  })();
  const dinheiroEsperado = _caixaState.fundoInicial + dinheiroEntradas;

  const existing = document.getElementById("caixa-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "caixa-modal";
  modal.className = "modal-backdrop open";
  modal.innerHTML = `
    <div class="modal confirm-modal" style="max-width:520px; max-height:92vh; overflow-y:auto;">
      <div class="modal-header">
        <div>
          <h3 style="margin:0;">Fechar Caixa</h3>
          <p style="color:var(--muted); font-size:12px; margin:4px 0 0 0;">
            ${_caixaState.operador} · Turno ${_caixaState.turno} · ${_fmtDuracao(_caixaState.horaAbertura)}
          </p>
        </div>
        <button class="icon-button" onclick="showCaixa()">←</button>
      </div>
      <div class="modal-body" style="gap:14px;">

        <!-- RESUMO RÁPIDO -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div style="${_cardStyle(34,197,94)}">
            <div style="${_labelStyle(34,197,94)}">Faturamento</div>
            <div style="font-size:22px; font-weight:900; color:rgba(34,197,94,1); font-family:'Space Grotesk',sans-serif;">${_fmtCurrency(d.faturamento)}</div>
          </div>
          <div style="${_cardStyle(251,191,36)}">
            <div style="${_labelStyle(251,191,36)}">Pedidos</div>
            <div style="font-size:34px; font-weight:900; color:rgba(251,191,36,1); font-family:'Space Grotesk',sans-serif;">${d.total_pedidos}</div>
          </div>
        </div>

        <!-- CONFERÊNCIA DE CAIXA -->
        <div style="${_sectionStyle()}">
          ${_sectionTitle("🔍", "Conferência de Caixa")}
          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(91,28,28,0.4);">
            <span style="font-size:13px; color:rgba(252,228,228,0.6);">Fundo inicial</span>
            <span style="font-size:13px; font-weight:700; color:rgba(252,228,228,0.9);">${_fmtCurrency(_caixaState.fundoInicial)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(91,28,28,0.4);">
            <span style="font-size:13px; color:rgba(252,228,228,0.6);">Entradas em dinheiro</span>
            <span style="font-size:13px; font-weight:700; color:rgba(252,228,228,0.9);">${_fmtCurrency(dinheiroEntradas)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(91,28,28,0.4);">
            <span style="font-size:13px; color:rgba(252,228,228,0.6);">Esperado na gaveta</span>
            <span style="font-size:14px; font-weight:900; color:rgba(251,191,36,1);">${_fmtCurrency(dinheiroEsperado)}</span>
          </div>
          <div style="margin-top:12px;">
            <div style="font-size:11px; color:rgba(252,228,228,0.5); margin-bottom:6px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Dinheiro contado na gaveta</div>
            <div style="position:relative;">
              <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:rgba(252,228,228,0.4); font-size:13px;">R$</span>
              <input id="cx-contado" type="number" min="0" step="0.01" placeholder="0,00"
                oninput="_atualizarDiferenca(${dinheiroEsperado})"
                style="width:100%; background:rgba(255,255,255,0.06); border:1px solid rgba(91,28,28,0.85); border-radius:10px; padding:10px 14px 10px 36px; color:rgba(252,228,228,0.95); font-size:14px; outline:none;" />
            </div>
          </div>
          <div id="cx-diferenca" style="margin-top:10px; padding:10px 14px; border-radius:10px; background:rgba(255,255,255,0.04); font-size:13px; color:rgba(252,228,228,0.5); text-align:center;">
            Informe o valor contado para ver a diferença
          </div>
        </div>

        <!-- OBSERVAÇÕES -->
        <div style="${_sectionStyle()}">
          ${_sectionTitle("📝", "Observações do Caixeiro")}
          <textarea id="cx-obs" rows="3" placeholder="Ex: falta de troco às 14h, sistema lento no pico, cliente reclamou do pedido #42..."
            style="width:100%; background:rgba(255,255,255,0.06); border:1px solid rgba(91,28,28,0.85); border-radius:10px; padding:10px 14px; color:rgba(252,228,228,0.95); font-size:13px; outline:none; resize:none; line-height:1.5;">${_caixaState.obs || ""}</textarea>
        </div>

      </div>
      <div class="modal-actions" style="justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <button class="ghost-button" onclick="exportarFechamentoPDF()">📄 Exportar PDF</button>
        <button class="ghost-button" onclick="_confirmarFechamento()" style="border-color:rgba(239,68,68,0.5); color:rgba(239,68,68,1);">Confirmar Fechamento</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
}

function _atualizarDiferenca(esperado) {
  const contado = parseFloat(document.getElementById("cx-contado").value) || 0;
  const diff = contado - esperado;
  const el = document.getElementById("cx-diferenca");
  if (!el) return;
  if (contado === 0) {
    el.style.background = "rgba(255,255,255,0.04)";
    el.style.color = "rgba(252,228,228,0.5)";
    el.innerHTML = "Informe o valor contado para ver a diferença";
    return;
  }
  if (Math.abs(diff) < 0.01) {
    el.style.background = "rgba(34,197,94,0.12)";
    el.style.color = "rgba(34,197,94,1)";
    el.innerHTML = "Caixa conferido — sem diferença";
  } else if (diff > 0) {
    el.style.background = "rgba(59,130,246,0.12)";
    el.style.color = "rgba(59,130,246,1)";
    el.innerHTML = `Sobra de <strong>${_fmtCurrency(diff)}</strong>`;
  } else {
    el.style.background = "rgba(239,68,68,0.12)";
    el.style.color = "rgba(239,68,68,1)";
    el.innerHTML = `Falta de <strong>${_fmtCurrency(Math.abs(diff))}</strong>`;
  }
}

async function _confirmarFechamento() {
  const obs = (document.getElementById("cx-obs")?.value || "").trim();
  const contado = parseFloat(document.getElementById("cx-contado")?.value) || 0;
  _caixaState.obs = obs;
  _caixaState.contado = contado;
  _salvarCaixaState();

  const rid = getRestaurantId();
  try {
    const resp = await fetch(`${API_BASE}/api/v1/caixa/${rid}/fechar`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ valor_informado: contado, obs })
    });
    const data = await resp.json();
    if (!resp.ok) { alert(data.error || "Erro ao fechar caixa"); return; }
  } catch(e) {
    alert("Erro ao fechar caixa: " + e.message);
    return;
  }

  await exportarFechamentoPDF();
  _caixaState = { aberto: false, operador: "", turno: "", horaAbertura: null, fundoInicial: 0, obs: "" };
  _salvarCaixaState();
  const modal = document.getElementById("caixa-modal");
  if (modal) modal.remove();
}

// ---------- EXPORTAR PDF + WHATSAPP ----------
async function exportarFechamentoPDF() {
  const rid = getRestaurantId();
  if (!rid) return;

  let d;
  try {
    const resp = await fetch(`${API_BASE}/api/v1/metrics/${rid}/resumo-dia`);
    d = await resp.json();
    if (!resp.ok) throw new Error();
  } catch(e) { console.error("Erro ao exportar PDF:", e); return; }

  const hoje = new Date(d.data);
  const dataStr = hoje.toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
  const nomeRestaurante = d.restaurant_name || localStorage.getItem("restaurant_name") || "Restaurante";

  const dinheiroEntradas = (() => {
    const p = d.por_pagamento["dinheiro"] || d.por_pagamento["Dinheiro"] || null;
    return p ? p.valor : 0;
  })();
  const esperado = _caixaState.fundoInicial + dinheiroEntradas;
  const contado = _caixaState.contado || 0;
  const diff = contado - esperado;
  const diffStr = Math.abs(diff) < 0.01
    ? "Caixa conferido — sem diferença"
    : diff > 0
      ? `Sobra: R$ ${diff.toFixed(2).replace(".", ",")}`
      : `Falta: R$ ${Math.abs(diff).toFixed(2).replace(".", ",")}`;
  const diffColor = Math.abs(diff) < 0.01 ? "#16a34a" : diff > 0 ? "#2563eb" : "#dc2626";

  const horaAbertura = _caixaState.horaAbertura
    ? new Date(_caixaState.horaAbertura).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })
    : "—";
  const horaFechamento = new Date().toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
  const duracao = _caixaState.horaAbertura ? _fmtDuracao(_caixaState.horaAbertura) : "—";

  const html = `
    <html><head><title>Fechamento de Caixa - ${dataStr}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; color: #111; padding: 32px; background: #fff; font-size: 14px; }
      .header { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
      .header h1 { font-size: 22px; font-weight: 900; }
      .header .sub { color: #666; font-size: 13px; margin-top: 4px; }
      .turno-info { display: flex; gap: 24px; background: #f9f9f9; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; flex-wrap: wrap; }
      .turno-info div { flex: 1; min-width: 120px; }
      .turno-info .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 3px; }
      .turno-info .val { font-size: 15px; font-weight: 700; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
      .card { border: 1px solid #e5e5e5; border-radius: 10px; padding: 14px; text-align: center; }
      .card .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px; }
      .card .val { font-size: 24px; font-weight: 900; }
      h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #444; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
      th { text-align: left; padding: 8px 12px; background: #f5f5f5; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #ddd; }
      td { padding: 9px 12px; border-bottom: 1px solid #eee; }
      .total-row td { font-weight: 900; background: #f9f9f9; }
      .conferencia { background: #f9f9f9; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; }
      .conf-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
      .conf-row.resultado { font-weight: 900; margin-top: 8px; padding-top: 10px; border-top: 1px solid #ddd; }
      .obs-box { background: #fffbeb; border: 1px solid #fbbf24; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; }
      .obs-box .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #92400e; margin-bottom: 6px; font-weight: 700; }
      .obs-box p { font-size: 13px; color: #78350f; line-height: 1.6; }
      .footer { margin-top: 32px; text-align: center; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 16px; }
      @media print { @page { margin: 15mm; } }
    </style></head>
    <body>
      <div class="header">
        <h1>Fechamento de Caixa</h1>
        <div class="sub">${nomeRestaurante} · ${dataStr}</div>
      </div>

      <div class="turno-info">
        <div><div class="lbl">Operador</div><div class="val">${_caixaState.operador || "—"}</div></div>
        <div><div class="lbl">Turno</div><div class="val">${_caixaState.turno || "—"}</div></div>
        <div><div class="lbl">Abertura</div><div class="val">${horaAbertura}</div></div>
        <div><div class="lbl">Fechamento</div><div class="val">${horaFechamento}</div></div>
        <div><div class="lbl">Duração</div><div class="val">${duracao}</div></div>
      </div>

      <div class="grid">
        <div class="card"><div class="lbl">Pedidos Finalizados</div><div class="val">${d.total_pedidos}</div></div>
        <div class="card"><div class="lbl">Faturamento Total</div><div class="val" style="font-size:20px;">${_fmtCurrency(d.faturamento)}</div></div>
        <div class="card"><div class="lbl">Ticket Médio</div><div class="val" style="font-size:20px;">${_fmtCurrency(d.ticket_medio)}</div></div>
        <div class="card"><div class="lbl">Cancelados</div><div class="val" style="color:#dc2626;">${d.cancelados}</div></div>
      </div>

      <h2>Por Forma de Pagamento</h2>
      <table>
        <thead><tr><th>Método</th><th>Pedidos</th><th>Valor</th></tr></thead>
        <tbody>
          ${Object.entries(d.por_pagamento).map(([m, i]) => `
            <tr><td style="text-transform:capitalize">${m}</td><td>${i.qtd}</td><td>${_fmtCurrency(i.valor)}</td></tr>
          `).join("")}
          <tr class="total-row"><td>Total</td><td>${d.total_pedidos}</td><td>${_fmtCurrency(d.faturamento)}</td></tr>
        </tbody>
      </table>

      <h2>Conferência de Caixa</h2>
      <div class="conferencia">
        <div class="conf-row"><span>Fundo inicial</span><span>${_fmtCurrency(_caixaState.fundoInicial)}</span></div>
        <div class="conf-row"><span>Entradas em dinheiro</span><span>${_fmtCurrency(dinheiroEntradas)}</span></div>
        <div class="conf-row"><span>Esperado na gaveta</span><span><strong>${_fmtCurrency(esperado)}</strong></span></div>
        <div class="conf-row"><span>Dinheiro contado</span><span><strong>${_fmtCurrency(contado)}</strong></span></div>
        <div class="conf-row resultado"><span>Resultado</span><span style="color:${diffColor};">${diffStr}</span></div>
      </div>

      ${d.top_itens && d.top_itens.length > 0 ? `
      <h2>Top Itens do Dia</h2>
      <table>
        <thead><tr><th>#</th><th>Item</th><th>Qtd</th></tr></thead>
        <tbody>
          ${d.top_itens.map(({ nome, qty }, i) => `<tr><td>${i+1}</td><td>${nome}</td><td>${qty}x</td></tr>`).join("")}
        </tbody>
      </table>` : ""}

      ${_caixaState.obs ? `
      <div class="obs-box">
        <div class="lbl">Observações do Caixeiro</div>
        <p>${_caixaState.obs.replace(/\n/g, "<br>")}</p>
      </div>` : ""}

      <div class="footer">
        Gerado pelo FluxON · ${new Date().toLocaleString("pt-BR")}
      </div>
      <script>window.onload = function(){ window.print(); }<\/script>
    </body></html>
  `;

const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }

  if (d.webhook_fechamento) {
    try {
      const htmlBase64 = btoa(unescape(encodeURIComponent(html)));
      await fetch(`${API_BASE}/api/v1/caixa/${rid}/webhook-fechamento`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          html_base64: htmlBase64,
          operador: _caixaState.operador,
          turno: _caixaState.turno,
          fundo_inicial: _caixaState.fundoInicial,
          faturamento: d.faturamento,
          total_pedidos: d.total_pedidos,
          por_pagamento: d.por_pagamento,
          esperado: esperado,
          contado: contado,
          diferenca: diffStr,
          obs: _caixaState.obs || ""
        })
      });
    } catch(e) {
      console.error("Erro ao disparar webhook fechamento:", e);
    }
  }
}
// ---------- PONTO DE ENTRADA PÚBLICO ----------
// Chame showCaixa() onde antes você chamava showResumoDia()
// Se o caixa estiver fechado, abre a tela de abertura automaticamente.
// Se estiver aberto, mostra o painel completo.

function gerarQrCodes() {
  const qtd = parseInt(document.getElementById("input-mesas").value) || 10;
  const lista = document.getElementById("lista-qrcodes");
  if (!lista) return;

  let dominioRaw = (document.getElementById("input-dominio-cardapio")?.value || localStorage.getItem("cardapio_url") || "").trim();
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

function onMaquininhaChange(tipo) {
  const todos = ['mercadopago', 'cielo', 'stone', 'pagseguro', 'outra'];
  todos.forEach(t => {
    const el = document.getElementById(`fields-${t}`);
    if (el) el.style.display = t === tipo ? 'flex' : 'none';
  });
}

// ===== INICIALIZA =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
