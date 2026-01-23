// ===== CONFIG =====
const GOOGLE_CLIENT_ID =
  "872848052437-nl3lru9m1jhmfobk0imbpb2o9uk47mqi.apps.googleusercontent.com";

const API_BASE = "https://kds-backend.dahead.easypanel.host";
const API_URL = `${API_BASE}/orders`;
const AUTH_URL = `${API_BASE}/auth/google`;
const CRM_URL = `${API_BASE}/crm`;

// 🔥 NOVAS ROTAS V1 - MELHORADAS
const METRICS_URL = `${API_BASE}/api/v1/analytics/roi`;
const FORECAST_URL = `${API_BASE}/api/v1/analytics/demand-forecast`;
const CART_RECOVERY_URL = `${API_BASE}/api/v1/cart-recovery/pending`;
const PDV_ORDERS_URL = `${API_BASE}/api/v1/pdv/orders`;

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

let restaurantPlan = "essential";
let features = { 
  crm: false, 
  results: false, 
  roi: false, 
  forecast: false,
  pdv_sync: false,
  cart_recovery: false
};

let crmClients = [];

const resultsState = {
  period: "30d",
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

// ===== PLAN FEATURES =====
function applyAccessUI() {
  const plan = restaurantPlan.toLowerCase();
  
  // Essential: nada bloqueado, mas recursos limitados
  // Advanced: CRM, Results, Cart Recovery, PDV Manual
  // Executive: Tudo + ROI, Forecast, PDV Auto
  
  features.crm = ["advanced", "executive", "custom"].includes(plan);
  features.results = ["advanced", "executive", "custom"].includes(plan);
  features.roi = ["executive", "custom"].includes(plan);
  features.forecast = ["executive", "custom"].includes(plan);
  features.pdv_sync = ["advanced", "executive", "custom"].includes(plan);
  features.cart_recovery = ["advanced", "executive", "custom"].includes(plan);
  
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
  
  if (requiredPlan === "advanced") {
    planDisplay = "ADVANCED";
    planPrice = "R$ 2.500/mês";
    featuresList = [
      "CRM completo de clientes",
      "Recuperação de carrinho abandonado",
      "Link de rastreio em tempo real",
      "Integração PDV manual (MarketUP)",
      "Relatórios executivos"
    ];
  } else if (requiredPlan === "executive") {
    planDisplay = "EXECUTIVE";
    planPrice = "R$ 4.500/mês";
    featuresList = [
      "Dashboard de ROI em tempo real",
      "Previsão de demanda por IA",
      "Sincronização PDV 100% automática",
      "Campanhas ativas automatizadas",
      "Análise financeira completa"
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
        <button class="upgrade-btn" onclick="window.open('https://wa.me/5514997194089?text=Quero fazer upgrade para o plano ${requiredPlan}!', '_blank')">
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
    showUpgradeModal("advanced", "CRM de Clientes");
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

    orders = newOrders.map((o) => ({
      ...o,
      _frontStatus: toFrontStatus(o.status),
    }));

    if (!crmView?.classList.contains("hidden")) {
      // Não renderiza board se estiver no CRM
    } else if (!resultsView?.classList.contains("hidden")) {
      renderResultsExecutive();
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
    const resp = await fetch(`${API_URL}/${orderId}`, {
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
  
  // Exibe valor do pedido se disponível
  const priceTag = order.total_price 
    ? `<div class="order-price-tag">${formatCurrency(order.total_price)}</div>` 
    : "";

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
    ${priceTag}
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
      const price = it?.price || it?.preco || 0;
      li.textContent = qty > 1 
        ? `${name} x${qty}${price > 0 ? ` - ${formatCurrency(price * qty)}` : ''}` 
        : `${name}${price > 0 ? ` - ${formatCurrency(price)}` : ''}`;
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
      total_price: 0 
    };

    const resp = await fetch(`${API_BASE}/api/v1/pedidos`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || "Erro ao criar pedido");

    orders.push({ ...data.order, _frontStatus: toFrontStatus(data.order.status) });
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
      <td>${escapeHtml(phone)}</td>
      <td>${Number(c.orders || 0)}</td>
      <td>${formatCurrency(totalSpent)}</td>
      <td>${escapeHtml(formatDateTime(c.last_order_at))}</td>
    `;
    tbody.appendChild(tr);
  });

  crmContent.appendChild(table);
}

// ===== RESULTS EXECUTIVE =====
function initResultsUI() {
  const container = resultsView;
  if (!container) return;

  container.innerHTML = "";

  const root = document.createElement("div");
  root.className = "results-exec-root";
  root.innerHTML = `
    <div class="results-exec-head">
      <div>
        <h2 class="results-exec-title">💎 Inteligência Financeira Executive</h2>
        <p class="results-exec-subtitle">Dashboard completo de performance e ROI</p>
      </div>
      <div class="results-exec-filters">
        <select id="results-period" class="results-pill">
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
        </select>
      </div>
    </div>

    <!-- 🔥 ROI CARD (EXECUTIVE) -->
    <div id="roi-container" class="roi-grid ${!features.roi ? 'hidden' : ''}">
      <div class="roi-card premium">
        <div class="roi-label">💰 Faturamento Total</div>
        <div id="roi-total-sales" class="roi-value">R$ 0,00</div>
        <div class="roi-sub">Receita do período</div>
      </div>
      
      <div class="roi-card premium">
        <div class="roi-label">📈 ROI do Sistema</div>
        <div id="roi-multiplier" class="roi-value">0x</div>
        <div id="roi-message" class="roi-sub">Calculando...</div>
      </div>
      
      <div class="roi-card premium">
        <div class="roi-label">🤖 Receita via IA</div>
        <div id="roi-ia-revenue" class="roi-value">R$ 0,00</div>
        <div class="roi-sub" id="roi-ia-percent">0% do total</div>
      </div>
      
      <div class="roi-card premium">
        <div class="roi-label">🎯 Ticket Médio</div>
        <div id="roi-avg-ticket" class="roi-value">R$ 0,00</div>
        <div class="roi-sub">Por pedido</div>
      </div>
    </div>

    <!-- 🔥 ALERTA DE DEMANDA (EXECUTIVE) -->
    <div id="demand-alert" class="demand-alert-box hidden">
      <div>
        <div class="demand-icon">⚡</div>
      </div>
      <div>
        <div class="demand-title" id="demand-title">Alta Demanda Detectada!</div>
        <div class="demand-text" id="demand-message">Volume acima da média histórica.</div>
      </div>
    </div>

    <!-- 🔥 RECUPERAÇÃO DE CARRINHO (ADVANCED/EXECUTIVE) -->
    <div id="cart-recovery-box" class="cart-recovery-box ${!features.cart_recovery ? 'hidden' : ''}">
      <div class="cart-recovery-header">
        <h3>🛒 Carrinhos Abandonados</h3>
        <button id="refresh-cart-btn" class="ghost-button small">Atualizar</button>
      </div>
      <div id="cart-recovery-content">
        <p class="muted">Carregando...</p>
      </div>
    </div>

    <!-- MÉTRICAS BÁSICAS -->
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

    <!-- GRÁFICO -->
    <div class="results-exec-chart">
      <div class="chart-header">
        <h3>Volume de Pedidos no Período</h3>
        <div class="results-exec-legend">
          <span class="legend-item"><span class="legend-dot legend-total"></span> Total</span>
          <span class="legend-item"><span class="legend-dot legend-delivery"></span> Delivery</span>
          <span class="legend-item"><span class="legend-dot legend-local"></span> Local</span>
        </div>
      </div>
      <div class="chart-wrapper">
        <svg id="results-chart-svg" viewBox="0 0 1000 320" preserveAspectRatio="none"></svg>
      </div>
    </div>

    <!-- INSIGHTS -->
    <div class="results-exec-insights">
      <div class="insights-head">
        <div>
          <h3 class="insights-title">Insights do Período</h3>
          <p class="insights-subtitle">Análise detalhada de performance</p>
        </div>
      </div>

      <div class="insights-grid">
        <div class="insight-card">
          <div class="insight-label">Crescimento</div>
          <div class="insight-value" data-insight="deltaTotal">0%</div>
          <div class="insight-note">vs período anterior</div>
        </div>

        <div class="insight-card">
          <div class="insight-label">Picos de Horário</div>
          <div class="insight-value" data-insight="peaks">—</div>
          <div class="insight-note" data-insight-note="peaks">Analisando...</div>
        </div>

        <div class="insight-card">
          <div class="insight-label">Top itens</div>
          <div class="insight-value" data-insight="topItems">—</div>
          <div class="insight-note" data-insight-note="topItems">Calculando...</div>
        </div>

        <div class="insight-card">
          <div class="insight-label">Taxa de Conversão</div>
          <div class="insight-value" data-insight="conversionRate">0%</div>
          <div class="insight-note" data-insight-note="conversionRate">Pedidos finalizados</div>
        </div>
      </div>

      ${!features.roi ? `
        <div class="insights-locked">
          <h4 class="locked-title">Recursos Exclusivos do Plano Executive</h4>
          <div class="locked-list">
            <div class="locked-item">Dashboard de ROI em tempo real</div>
            <div class="locked-item">Previsão de demanda por IA</div>
            <div class="locked-item">Sincronização automática com PDV</div>
            <div class="locked-item">Campanhas ativas automatizadas</div>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  container.appendChild(root);

  const periodSel = root.querySelector("#results-period");
  if (periodSel) {
    periodSel.value = resultsState.period;
    periodSel.addEventListener("change", () => {
      resultsState.period = periodSel.value;
      renderResultsExecutive();
    });
  }

  const refreshCartBtn = root.querySelector("#refresh-cart-btn");
  if (refreshCartBtn) {
    refreshCartBtn.addEventListener("click", fetchCartRecovery);
  }

  resultsState.uiReady = true;
}

// ===== CART RECOVERY =====
async function fetchCartRecovery() {
  if (!features.cart_recovery) return;
  
  const rid = getRestaurantId();
  if (!rid) return;

  try {
    const resp = await fetch(`${CART_RECOVERY_URL}/${rid}`);
    const data = await resp.json();

    const container = document.getElementById("cart-recovery-content");
    if (!container) return;

    if (!data.abandoned_carts || data.abandoned_carts.length === 0) {
      container.innerHTML = `
        <p class="muted">✅ Nenhum carrinho abandonado no momento!</p>
      `;
      return;
    }

    container.innerHTML = `
      <div class="cart-stats">
        <div class="cart-stat">
          <strong>${data.total_abandoned}</strong> carrinho(s) abandonado(s)
        </div>
        <div class="cart-stat">
          <strong>${formatCurrency(data.recovery_opportunity)}</strong> em oportunidade de recuperação
        </div>
      </div>
      <div class="cart-list">
        ${data.abandoned_carts.map(cart => `
          <div class="cart-item">
            <div class="cart-phone">${cart.client_phone}</div>
            <div class="cart-time">${formatDateTime(cart.last_interaction)}</div>
            <div class="cart-messages">${cart.message_count} mensagens</div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    console.error("Erro ao buscar carrinhos:", e);
  }
}

// ===== RENDER RESULTS =====
async function renderResultsExecutive() {
  if (!resultsState.uiReady) return;

  const rid = getRestaurantId();
  if (!rid) return;

  // Métricas básicas locais
  const filtered = orders;

  const metrics = {
    total: filtered.length,
    unique: new Set(filtered.map((o) => o.client_phone || o.client_name)).size,
    delivery: filtered.filter((o) => o.service_type === "delivery").length,
    local: filtered.filter((o) => o.service_type === "local" || !o.service_type).length,
  };

  document.querySelectorAll("[data-metric]").forEach((el) => {
    const k = el.dataset.metric;
    if (metrics[k] !== undefined) el.textContent = metrics[k];
  });

  // ROI Executive
  if (features.roi) {
    try {
      const roiResp = await fetch(`${METRICS_URL}/${rid}?period=${resultsState.period}`);
      if (roiResp.ok) {
        const roi = await roiResp.json();
        
        const salesEl = document.getElementById("roi-total-sales");
        const multEl = document.getElementById("roi-multiplier");
        const msgEl = document.getElementById("roi-message");
        const iaRevEl = document.getElementById("roi-ia-revenue");
        const iaPercentEl = document.getElementById("roi-ia-percent");
        const avgTicketEl = document.getElementById("roi-avg-ticket");
        
        if (salesEl) salesEl.textContent = formatCurrency(roi.total_revenue);
        if (multEl) multEl.textContent = `${roi.multiplier}x`;
        if (msgEl) msgEl.textContent = roi.message;
        if (iaRevEl) iaRevEl.textContent = formatCurrency(roi.ia_revenue);
        if (avgTicketEl) avgTicketEl.textContent = formatCurrency(roi.avg_ticket_overall);
        
        if (iaPercentEl) {
          const percent = roi.total_revenue > 0 
            ? ((roi.ia_revenue / roi.total_revenue) * 100).toFixed(1) 
            : 0;
          iaPercentEl.textContent = `${percent}% do total`;
        }
      }
    } catch (e) {
      console.error("ROI Error:", e);
    }

    // Demand Forecast
    try {
      const demandResp = await fetch(`${FORECAST_URL}/${rid}`);
      if (demandResp.ok) {
        const demand = await demandResp.json();
        const alertBox = document.getElementById("demand-alert");
        const titleEl = document.getElementById("demand-title");
        const msgEl = document.getElementById("demand-message");
        
        if (alertBox && demand.is_high_demand) {
          alertBox.classList.remove("hidden");
          if (titleEl) titleEl.textContent = "🚀 Alta Demanda Detectada!";
          if (msgEl) msgEl.textContent = demand.alert_message;
        } else if (alertBox) {
          alertBox.classList.add("hidden");
        }
      }
    } catch (e) {
      console.error("Demand Error:", e);
    }
  }

  // Cart Recovery
  if (features.cart_recovery) {
    fetchCartRecovery();
  }

  // Insights
  const finishedOrders = filtered.filter(o => o.status === 'finished').length;
  const conversionRate = filtered.length > 0 ? (finishedOrders / filtered.length) * 100 : 0;
  const convEl = document.querySelector('[data-insight="conversionRate"]');
  if (convEl) convEl.textContent = `${Math.round(conversionRate)}%`;

  // Simples gráfico (placeholder - você pode melhorar)
  const svg = document.getElementById("results-chart-svg");
  if (svg) {
    svg.innerHTML = `
      <text x="500" y="160" text-anchor="middle" font-size="14" fill="rgba(255,255,255,0.6)">
        Gráfico será renderizado com dados reais
      </text>
    `;
  }
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
      localStorage.setItem("restaurant_plan", data.restaurant.plan || "essential");
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

  restaurantPlan = localStorage.getItem("restaurant_plan") || "essential";
  applyAccessUI();

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

  // Polling
  fetchOrders();
  setInterval(fetchOrders, 15000);
}

document.addEventListener("DOMContentLoaded", init);
