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
    basic: 1200,
    pro: 2500,
    advanced: 4000
  };
  return prices[plan.toLowerCase()] || 1200;
}

function applyAccessUI() {
  const plan = restaurantPlan.toLowerCase();
  restaurantPlanPrice = getPlanPrice(plan);
  
  if (plan === "basic") {
    features.crm = false;
    features.results = false;
    features.roi = false;
    features.forecast = false;
  } else if (plan === "pro") {
    features.crm = true;
    features.results = false;
    features.roi = false;
    features.forecast = false;
  } else if (plan === "advanced") {
    features.crm = true;
    features.results = true;
    features.roi = true;
    features.forecast = true;
  }
  
  drawerCrmBtn?.classList.toggle("locked", !features.crm);
  drawerResultsBtn?.classList.toggle("locked", !features.results);
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
  
  if (requiredPlan === "pro") {
    planDisplay = "PRO";
    planPrice = "R$ 2.500/mês";
    featuresList = [
      "CRM completo de clientes",
      "Recuperação de carrinho abandonado",
      "Link de rastreio em tempo real",
      "Relatórios PDF via WhatsApp (quinzenais)",
      "Integração PDV manual"
    ];
  } else if (requiredPlan === "advanced") {
    planDisplay = "ADVANCED";
    planPrice = "R$ 4.000/mês";
    featuresList = [
      "Tudo do plano PRO",
      "Dashboard de ROI em tempo real",
      "Sincronização PDV automática",
      "Previsão de demanda por IA",
      "Automação de campanhas",
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
    showUpgradeModal("advanced", "Dashboard de Resultados");
    return;
  }
  board?.classList.add("hidden");
  crmView?.classList.add("hidden");
  resultsView?.classList.remove("hidden");
  hideTabsBar();
  closeDrawer();
  
  // ✅ Configura os botões de período (só na primeira vez)
  if (!resultsState.uiReady) {
    setupPeriodButtons();
    resultsState.uiReady = true;
  }
  
  fetchAndRenderMetrics();
}

function showAutoatendimento() {
  board?.classList.add("hidden");
  crmView?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  document.getElementById("autoatendimento-view")?.classList.remove("hidden");
  hideTabsBar();
  closeDrawer();
  initAutoatendimento();
}

// ✅ ADICIONE esta função NOVA aqui (antes de "CORE LOGIC"):
function setupPeriodButtons() {
  const periodButtons = document.querySelectorAll('.period-btn');
  
  periodButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active de todos
      periodButtons.forEach(b => b.classList.remove('active'));
      
      // Adiciona active no clicado
      btn.classList.add('active');
      
      // Atualiza o período e busca novos dados
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
    } else {
      renderBoard();
    }
  } catch (e) {
    console.error("Polling Error:", e);
  } finally {
    isFetching = false;
  }
}

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
    anota_ai: "Anota Aí",
    anotaai: "Anota Aí",
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
${order.origin ? `<div class="order-origin-tag">${getOriginLabel(order.origin)}</div>` : ""}
  `;

  card.addEventListener("click", () => openOrderModal(order.id));
  return card;
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
      const li = document.createElement("li");
      const name = it?.name || it?.nome || "Item";
      const qty = it?.qty || it?.quantidade || 1;
      const price = it?.price || it?.preco || 0;
      li.textContent = qty > 1
        ? `${name} x${qty}${price > 0 ? ` - ${formatCurrency(price * qty)}` : ""}`
        : `${name}${price > 0 ? ` - ${formatCurrency(price)}` : ""}`;
      modalItems.appendChild(li);
    });
  }

  if (modalNotes) modalNotes.textContent = order.notes || "";

  modalPrevBtn?.classList.toggle("hidden", ["cancelado", "finalizado", "recebido"].includes(order._frontStatus));
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

    await fetch(`${API_BASE}/api/v1/pedidos`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ order_id: orderId, payment_method: metodo, restaurant_id: getRestaurantId(), client_name: "x" })
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
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  
  // Fecha o drawer se estiver aberto
  closeDrawer();
  
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

  // 🔥 LIMPA O CAMPO DE VALOR TOTAL
  const totalPriceField = document.getElementById("new-total-price");
  if (totalPriceField) totalPriceField.value = "";

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
  const rid = getRestaurantId();
  const client = String(newCustomer?.value || "").trim();
  const itens = parseItems(newItems?.value);

  const isDelivery = !!newDelivery?.checked;
  const service_type = isDelivery ? "delivery" : "local";
  const address = String(newAddress?.value || "").trim();
  const payment_method = String(newPayment?.value || "").trim();

  const phoneRaw = String(newPhone?.value || "").trim();
  const client_phone = phoneRaw ? phoneRaw : null;

  // 🔥 CONVERTE O VALOR FORMATADO PARA NÚMERO
  const totalPriceFormatted = document.getElementById("new-total-price")?.value || '0';
  const total_price = parseFloat(totalPriceFormatted.replace(/\./g, '').replace(',', '.')) || 0;

  if (!rid || !client) {
    alert("Preencha o nome do cliente.");
    return;
  }

  if (!itens || itens.length === 0) {
    alert("Preencha os itens do pedido.");
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
      total_price,
      origin: "balcao"
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

    orders.push({ ...data.order, _frontStatus: toFrontStatus(data.order.status) });
    closeCreateModal();
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
          <button class="icon-button" id="close-client-details">×</button>
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

// Logout
if (logoutBtn) logoutBtn.addEventListener("click", logout);
if (unauthClose) unauthClose.addEventListener("click", () => closeBackdrop(unauthorizedModal));

// Polling de pedidos
setInterval(fetchOrders, 5000);
fetchOrders();
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
const anotaaiOrders = data.orders_by_origin?.anota_ai || 0;

  if (originChartInstance) {
    originChartInstance.destroy();
  }

  originChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
    labels: [' IA WhatsApp', ' iFood', ' Aiqfome', ' Anota Aí', ' Balcão'],
datasets: [{
  data: [iaOrders, ifoodOrders, aiqfomeOrders, anotaaiOrders, balcaoOrders],
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
  await fetchCardapio();
  setupAutoatendimentoTabs();
}

function setupAutoatendimentoTabs() {
  const tabCardapio = document.getElementById("tab-cardapio");
  const tabMesas = document.getElementById("tab-mesas");
  const painelCardapio = document.getElementById("painel-cardapio");
  const painelMesas = document.getElementById("painel-mesas");

  tabCardapio?.addEventListener("click", () => {
    tabCardapio.classList.add("active");
    tabMesas.classList.remove("active");
    painelCardapio.classList.remove("hidden");
    painelMesas.classList.add("hidden");
  });

  tabMesas?.addEventListener("click", () => {
    tabMesas.classList.add("active");
    tabCardapio.classList.remove("active");
    painelMesas.classList.remove("hidden");
    painelCardapio.classList.add("hidden");
  });

  document.getElementById("btn-novo-item")?.addEventListener("click", () => openItemModal());
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
  const lista = document.getElementById("lista-cardapio");
  if (!lista) return;

  if (cardapioItems.length === 0) {
    lista.innerHTML = `<p style="color:rgba(252,228,228,0.5); text-align:center; padding:40px 0;">Nenhum item cadastrado. Clique em "+ Novo Item" para começar.</p>`;
    return;
  }

  // Agrupa por categoria
  const categorias = {};
  cardapioItems.forEach(item => {
    const cat = item.categoria || "Geral";
    if (!categorias[cat]) categorias[cat] = [];
    categorias[cat].push(item);
  });

  lista.innerHTML = Object.entries(categorias).map(([cat, itens]) => `
    <div style="margin-bottom:24px;">
      <h4 style="color:rgba(252,228,228,0.6); font-size:12px; text-transform:uppercase; letter-spacing:2px; margin-bottom:12px;">${cat}</h4>
      ${itens.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:rgba(46,8,8,0.45); border:1px solid rgba(91,28,28,0.85); border-radius:12px; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:10px; height:10px; border-radius:50%; background:${item.ativo ? 'rgba(34,197,94,1)' : 'rgba(107,114,128,1)'}"></div>
            <div>
              <div style="color:rgba(252,228,228,0.95); font-weight:700; font-size:14px;">${escapeHtml(item.nome)}</div>
              ${item.descricao ? `<div style="color:rgba(252,228,228,0.5); font-size:12px;">${escapeHtml(item.descricao)}</div>` : ""}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="color:rgba(251,191,36,1); font-weight:900; font-size:16px;">${formatCurrency(item.preco)}</span>
            <button onclick="toggleAtivo('${item.id}', ${item.ativo})" style="padding:6px 10px; border-radius:8px; border:1px solid rgba(91,28,28,0.85); background:transparent; color:rgba(252,228,228,0.7); cursor:pointer; font-size:11px;">
              ${item.ativo ? "Desativar" : "Ativar"}
            </button>
            <button onclick="openItemModal(${JSON.stringify(item).replace(/"/g, '&quot;')})" style="padding:6px 10px; border-radius:8px; border:1px solid rgba(91,28,28,0.85); background:transparent; color:rgba(252,228,228,0.7); cursor:pointer; font-size:11px;">
              Editar
            </button>
            <button onclick="deletarItem('${item.id}')" style="padding:6px 10px; border-radius:8px; border:1px solid rgba(239,68,68,0.5); background:transparent; color:rgba(239,68,68,0.8); cursor:pointer; font-size:11px;">
              Excluir
            </button>
          </div>
        </div>
      `).join("")}
    </div>
  `).join("");
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
      <div class="modal-body" style="display:flex; flex-direction:column; gap:12px;">
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
       <label style="color:rgba(252,228,228,0.8); font-size:13px;">Foto do Item
  <div id="foto-dropzone" style="
    margin-top:8px; border:2px dashed rgba(249,115,115,0.5);
    border-radius:12px; padding:24px; text-align:center;
    cursor:pointer; transition:all 0.2s ease;
    background:rgba(46,8,8,0.3); position:relative;
  ">
    <div id="foto-preview-wrap" style="display:none; margin-bottom:12px;">
      <img id="foto-preview" style="max-height:120px; border-radius:10px; object-fit:cover;" />
    </div>
    <div id="foto-placeholder">
      <div style="font-size:32px; margin-bottom:8px;">🖼️</div>
      <div style="color:rgba(252,228,228,0.7); font-size:13px; font-weight:700;">
        Arraste uma imagem ou clique para selecionar
      </div>
      <div style="color:rgba(252,228,228,0.4); font-size:11px; margin-top:4px;">
        JPG, PNG, WEBP — máx. 5MB
      </div>
    </div>
    <input type="file" id="foto-file-input" accept="image/*" style="
      position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%;
    " />
  </div>
  <input type="hidden" id="item-foto" value="${item ? escapeHtml(item.foto_url || '') : ''}" />
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
  setupFotoDropzone(item?.foto_url || "");
  document.getElementById("item-cancel").addEventListener("click", () => modal.remove());
  document.getElementById("item-save").addEventListener("click", () => salvarItem(item?.id));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
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

  async function handleFileUpload(file) {
    if (!file.type.startsWith("image/")) {
      alert("Selecione uma imagem válida.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Imagem muito grande. Máximo 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      preview.src = e.target.result;
      previewWrap.style.display = "block";
      placeholder.style.display = "none";
    };
    reader.readAsDataURL(file);

    dropzone.style.opacity = "0.6";
    dropzone.style.pointerEvents = "none";

    try {
      const formData = new FormData();
      formData.append("file", file);

      const resp = await fetch(`${API_BASE}/api/v1/upload-image`, {
        method: "POST",
        body: formData
      });

      const data = await resp.json();
      if (!resp.ok || !data.url) throw new Error(data.error || "Erro no upload");

      hiddenInput.value = data.url;
      console.log("✅ Imagem enviada:", data.url);
    } catch (e) {
      console.error("❌ Erro upload:", e);
      alert("Erro ao enviar imagem: " + e.message);
    } finally {
      dropzone.style.opacity = "1";
      dropzone.style.pointerEvents = "auto";
    }
  }
}

async function salvarItem(id = null) {
  const rid = getRestaurantId();
  const nome = document.getElementById("item-nome").value.trim();
  const descricao = document.getElementById("item-descricao").value.trim();
  const precoRaw = document.getElementById("item-preco").value;
  const preco = parseFloat(precoRaw.replace(/\./g, "").replace(",", ".")) || 0;
  const categoria = document.getElementById("item-categoria").value.trim() || "Geral";
const foto_url = document.getElementById("item-foto").value.trim() || null;
  
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
        body: JSON.stringify({ restaurant_id: rid, nome, descricao, preco, categoria })
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

function gerarQrCodes() {
  const qtd = parseInt(document.getElementById("input-mesas").value) || 10;
  const rid = getRestaurantId();
  const lista = document.getElementById("lista-qrcodes");
  if (!lista) return;

  const baseUrl = window.location.origin;
  lista.innerHTML = "";

  for (let i = 1; i <= qtd; i++) {
    const url = `${baseUrl}/mesa/${rid}/${i}`;
    const div = document.createElement("div");
    div.style.cssText = "display:flex; flex-direction:column; align-items:center; gap:8px; padding:16px; background:rgba(46,8,8,0.45); border:1px solid rgba(91,28,28,0.85); border-radius:12px;";
    div.innerHTML = `
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(url)}" alt="QR Mesa ${i}" style="border-radius:8px;" />
      <span style="color:rgba(252,228,228,0.9); font-weight:700; font-size:13px;">Mesa ${i}</span>
      <a href="${url}" target="_blank" style="color:rgba(249,115,115,0.8); font-size:10px; text-decoration:none;">Ver link</a>
    `;
    lista.appendChild(div);
  }
}

// Garante que init() só roda depois do DOM estar pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
