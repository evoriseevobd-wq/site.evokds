// ===== CONFIG =====
const GOOGLE_CLIENT_ID =
  "872848052437-nl3lru9m1jhmfobk0imbpb2o9uk47mqi.apps.googleusercontent.com";

const API_BASE = "https://kds-backend.dahead.easypanel.host";
const API_URL = `${API_BASE}/orders`;
const AUTH_URL = `${API_BASE}/auth/google`;

// 🔹 CRM
const CRM_URL = `${API_BASE}/crm`;

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

// 🔹 plano/features
let restaurantPlan = "basic";
let features = { crm: false, results: false };

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
  return plan === "pro" || plan === "advanced" || plan === "custom";
}

function canUseResults(plan) {
  return plan === "advanced" || plan === "custom";
}

function canUseOrders(plan) {
  // Todos os planos têm acesso à gestão de pedidos
  return true;
}

function applyAccessUI() {
  const plan = restaurantPlan.toLowerCase();
  
  // Atualiza features baseado no plano
  features.crm = canUseCRM(plan);
  features.results = canUseResults(plan);
  
  // Controla visibilidade no menu lateral
  drawerCrmBtn?.classList.toggle("locked", !features.crm);
  drawerResultsBtn?.classList.toggle("locked", !features.results);
}

function closeDrawer() {
  drawer?.classList.remove("open");
  drawerBackdrop?.classList.remove("open");
}

// ===== TABS VISIBILITY (Ativos/Finalizados/Cancelados/Entrega) =====
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
  // Remove modal existente se houver
  const existing = document.getElementById("upgrade-modal-backdrop");
  if (existing) existing.remove();

  // Cria backdrop
  const backdrop = document.createElement("div");
  backdrop.id = "upgrade-modal-backdrop";
  backdrop.className = "upgrade-modal-backdrop open";

  // Define features baseado no plano
  let features = [];
  let planDisplay = "";
  
  if (requiredPlan === "pro") {
    planDisplay = "PRO ou ADVANCED";
    features = [
      "CRM completo de clientes",
      "Histórico de pedidos por cliente",
      "Análise de frequência de compra",
      "Suporte prioritário"
    ];
  } else if (requiredPlan === "advanced") {
    planDisplay = "ADVANCED";
    features = [
      "Relatórios executivos avançados",
      "Gráficos e insights detalhados",
      "Análise de picos e tendências",
      "Exportação de dados",
      "Suporte premium"
    ];
  }

  backdrop.innerHTML = `
    <div class="upgrade-modal">
      <button class="upgrade-dismiss" onclick="this.closest('.upgrade-modal-backdrop').remove()">×</button>
      
      <div class="upgrade-icon">🔒</div>
      
      <h2 class="upgrade-title">Recurso Premium</h2>
      
      <p class="upgrade-message">
        O recurso <strong>${featureName}</strong> está disponível apenas no plano:
      </p>
      
      <div class="upgrade-plan">${planDisplay}</div>
      
      <div class="upgrade-features">
        <div class="upgrade-features-title">O que você ganha:</div>
        <ul>
          ${features.map(f => `<li>${f}</li>`).join("")}
        </ul>
      </div>
      
      <div class="upgrade-actions">
        <button class="upgrade-btn" onclick="window.open('https://wa.me/5514998053245?text=Quero%20fazer%20upgrade%20do%20meu%20plano', '_blank')">
          Fazer Upgrade
        </button>
        <button class="upgrade-close-btn" onclick="this.closest('.upgrade-modal-backdrop').remove()">
          Agora não
        </button>
      </div>
    </div>
  `;

  // Fecha ao clicar no backdrop
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  document.body.appendChild(backdrop);
}

// ===== NAV (Board/CRM/Results) =====
function showBoard() {
  crmView?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  board?.classList.remove("hidden");
  showTabsBar();
  closeDrawer();
}

function showCRM() {
  if (!features.crm) {
    showUpgradeModal("pro", "CRM de Clientes");
    return;
  }

  hideTabsBar();
  board?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  crmView?.classList.remove("hidden");
  closeDrawer();

  fetchCRM();
}

function showResults() {
  if (!features.results) {
    showUpgradeModal("advanced", "Resultados Executivos");
    return;
  }

  hideTabsBar();
  board?.classList.add("hidden");
  crmView?.classList.add("hidden");
  resultsView?.classList.remove("hidden");
  closeDrawer();

  ensureResultsExecutiveUI();
  renderResultsExecutive();
}

// ===== VIEWS (Kanban Tabs) =====
function setColumnsVisibility(viewKey) {
  Object.keys(columns).forEach((k) => {
    const colBody = columns[k];
    if (!colBody) return;
    const section = colBody.closest(".column") || colBody.parentElement;
    const shouldShow = views[viewKey].includes(k);
    section?.classList.toggle("hidden", !shouldShow);
  });
}

function changeView(viewKey) {
  currentView = viewKey;
  tabAtivos?.classList.toggle("active", viewKey === "ativos");
  tabFinalizados?.classList.toggle("active", viewKey === "finalizados");
  tabCancelados?.classList.toggle("active", viewKey === "cancelados");
  tabEntregas?.classList.toggle("active", viewKey === "entregas");
  setColumnsVisibility(viewKey);
  renderBoard();
}

// ===== ORDERS API =====
async function fetchOrders() {
  const rid = getRestaurantId();
  if (!rid) return;

  try {
    const resp = await fetch(`${API_URL}/${rid}`);
    const data = await resp.json().catch(() => []);
    if (!resp.ok) throw new Error(data?.error || "Erro ao buscar pedidos");

    orders = (Array.isArray(data) ? data : []).map((o) => ({
      ...o,
      _frontStatus: toFrontStatus(o.status),
    }));

    renderBoard();
  } catch (e) {
    console.error(e);
    alert("Erro ao buscar pedidos.");
  }
}

async function updateOrderStatus(orderId, newFrontStatus) {
  try {
    const resp = await fetch(`${API_URL}/${orderId}`, {
      method: "PATCH",
      headers: buildHeaders(),
      body: JSON.stringify({ status: toBackStatus(newFrontStatus) }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || "Erro ao atualizar");

    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx !== -1) {
      orders[idx] = {
        ...orders[idx],
        ...data,
        _frontStatus: toFrontStatus(data.status),
      };
    }

    renderBoard();
    if (activeOrderId === orderId) openOrderModal(orderId);
  } catch (e) {
    console.error(e);
    alert("Erro ao atualizar pedido.");
  }
}

async function deleteOrder(orderId) {
  try {
    const resp = await fetch(`${API_URL}/${orderId}`, { method: "DELETE" });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data?.error || "Erro ao deletar");
    }
    orders = orders.filter((o) => o.id !== orderId);
    closeOrderModal();
    renderBoard();
  } catch (e) {
    console.error(e);
    alert("Erro ao deletar pedido.");
  }
}

// ===== BOARD RENDER =====
function renderBoard() {
  Object.keys(columns).forEach((k) => {
    const col = columns[k];
    if (!col) return;
    col.innerHTML = "";
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

  modalPrevBtn?.classList.toggle("hidden", currentView === "cancelados");
  modalCancelBtn?.classList.toggle("hidden", currentView === "cancelados");

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
function getLocalDayStartMs(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function getPeriodRange(periodKey) {
  const now = new Date();
  const nowMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (periodKey === "hoje") {
    return {
      bucket: "hour",
      startMs: getLocalDayStartMs(now),
      endMs: nowMs,
      label: "Hoje",
      days: 1,
    };
  }

  const n =
    periodKey === "3d" ? 3 : periodKey === "7d" ? 7 : periodKey === "30d" ? 30 : null;

  if (n) {
    const start = new Date(nowMs - (n - 1) * dayMs);
    return {
      bucket: "day",
      startMs: getLocalDayStartMs(start),
      endMs: nowMs,
      label: `${n} dias`,
      days: n,
    };
  }

  let min = nowMs;
  for (const o of orders) {
    const t = new Date(o.created_at).getTime();
    if (!Number.isNaN(t) && t < min) min = t;
  }
  return {
    bucket: "day",
    startMs: Number.isFinite(min) ? min : nowMs,
    endMs: nowMs,
    label: "Tudo",
    days: Math.max(1, Math.ceil((nowMs - min) / dayMs)),
  };
}

function filterOrdersForResults(range, typeKey) {
  const filtered = orders.filter((o) => {
    const t = new Date(o.created_at).getTime();
    if (Number.isNaN(t)) return false;
    if (t < range.startMs || t > range.endMs) return false;

    const st = String(o.service_type || "").toLowerCase();
    if (typeKey === "delivery") return st === "delivery";
    if (typeKey === "local") return st !== "delivery";
    return true;
  });

  return filtered;
}

function uniqueClientsCount(list) {
  const set = new Set();
  for (const o of list) {
    const phone = normalizePhone(o.client_phone);
    if (phone) set.add(`p:${phone}`);
    else set.add(`anon:${o.id}`);
  }
  return set.size;
}

function computeSummary(list) {
  const total = list.length;
  const delivery = list.filter((o) => String(o.service_type || "").toLowerCase() === "delivery").length;
  const local = total - delivery;
  const unique = uniqueClientsCount(list);

  const cancelled = list.filter((o) => {
    const s = o._frontStatus || toFrontStatus(o.status);
    return s === "cancelado";
  }).length;

  return { total, delivery, local, unique, cancelled };
}

function pctChange(curr, prev) {
  const c = Number(curr) || 0;
  const p = Number(prev) || 0;
  if (p === 0 && c === 0) return 0;
  if (p === 0) return 100;
  return ((c - p) / p) * 100;
}

function formatPct(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "0%";
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n)}%`;
}

function bucketKeyDay(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildSeries(range, list) {
  const map = new Map();

  if (range.bucket === "hour") {
    for (let h = 0; h < 24; h++) map.set(String(h), { total: 0, delivery: 0, local: 0 });
  } else {
    const start = new Date(range.startMs);
    const end = new Date(range.endMs);
    const cur = new Date(getLocalDayStartMs(start));
    const endDay = new Date(getLocalDayStartMs(end));

    while (cur.getTime() <= endDay.getTime()) {
      map.set(bucketKeyDay(cur), { total: 0, delivery: 0, local: 0 });
      cur.setDate(cur.getDate() + 1);
    }
  }

  for (const o of list) {
    const t = new Date(o.created_at);
    const st = String(o.service_type || "").toLowerCase();
    const isDelivery = st === "delivery";

    const key =
      range.bucket === "hour" ? String(t.getHours()) : bucketKeyDay(t);

    if (!map.has(key)) map.set(key, { total: 0, delivery: 0, local: 0 });

    const b = map.get(key);
    b.total += 1;
    if (isDelivery) b.delivery += 1;
    else b.local += 1;
  }

  const labels = Array.from(map.keys());
  const total = labels.map((k) => map.get(k).total);
  const delivery = labels.map((k) => map.get(k).delivery);
  const local = labels.map((k) => map.get(k).local);

  return { labels, total, delivery, local };
}

function niceStep(maxVal) {
  const max = Math.max(1, Number(maxVal) || 1);
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;

  let step = 1;
  if (n <= 2) step = 0.5;
  else if (n <= 5) step = 1;
  else step = 2;

  return step * pow;
}

function ensureResultsExecutiveUI() {
  if (!resultsView) return;

  let container = resultsView.querySelector(".results-content");
  if (!container) {
    container = document.createElement("div");
    container.className = "results-content";
    resultsView.appendChild(container);
  }

  let root = container.querySelector(".results-exec-root");
  if (root) {
    resultsState.uiReady = true;
    return;
  }

  root = document.createElement("div");
  root.className = "results-exec-root";

  root.innerHTML = `
    <div class="results-exec-head">
      <div class="results-exec-title">Resultados</div>
      <div class="results-exec-filters">
        <select class="results-pill" id="results-period">
          <option value="hoje">Hoje</option>
          <option value="3d">Últimos 3 dias</option>
          <option value="7d" selected>Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="tudo">Tudo</option>
        </select>
        <select class="results-pill" id="results-type">
          <option value="all" selected>Todos</option>
          <option value="delivery">Somente delivery</option>
          <option value="local">Somente balcão</option>
        </select>
      </div>
    </div>

    <div class="results-exec-chart">
      <svg id="results-chart-svg" viewBox="0 0 1000 320" preserveAspectRatio="none" aria-label="Gráfico de pedidos"></svg>
      <div class="results-exec-legend">
        <span class="legend-item"><i class="legend-dot legend-total"></i>Total (barras)</span>
        <span class="legend-item"><i class="legend-dot legend-delivery"></i>Delivery (linha)</span>
        <span class="legend-item"><i class="legend-dot legend-local"></i>Balcão (linha)</span>
      </div>
    </div>

    <div class="results-exec-cards">
      <div class="metric-card">
        <div class="metric-label">Total de pedidos</div>
        <div class="metric-value" data-metric="total">0</div>
        <div class="metric-sub" data-sub="total"></div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Clientes únicos</div>
        <div class="metric-value" data-metric="unique">0</div>
        <div class="metric-sub" data-sub="unique"></div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Pedidos de delivery</div>
        <div class="metric-value" data-metric="delivery">0</div>
        <div class="metric-sub" data-sub="delivery"></div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Pedidos de balcão</div>
        <div class="metric-value" data-metric="local">0</div>
        <div class="metric-sub" data-sub="local"></div>
      </div>
    </div>

    <div class="results-exec-insights">
      <div class="insights-head">
        <div class="insights-title">Insights</div>
        <div class="insights-subtitle">Comparado ao período anterior</div>
      </div>

      <div class="insights-grid">
        <div class="insight-card">
          <div class="insight-label">Variação de pedidos</div>
          <div class="insight-value" data-insight="deltaTotal">0%</div>
          <div class="insight-note" data-insight-note="deltaTotal"></div>
        </div>

        <div class="insight-card">
          <div class="insight-label">Picos de horário</div>
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

      <div class="insights-locked">
        <div class="locked-title">Recursos avançados (Custom)</div>
        <div class="locked-list">
          <div class="locked-item">🔒 Dashboard personalizado por meta e KPIs</div>
          <div class="locked-item">🔒 Alertas automáticos e playbooks</div>
          <div class="locked-item">🔒 Relatórios por unidade / multiunidade</div>
          <div class="locked-item">🔒 Integrações sob demanda</div>
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

  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const val = (maxY * i) / ticks;
    const yy = y(val);
    parts.push(`<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="rgba(255,255,255,0.08)" />`);
    parts.push(
      `<text x="${padL - 10}" y="${yy + 4}" text-anchor="end" font-size="12" fill="rgba(255,255,255,0.6)">${Math.round(val)}</text>`
    );
  }

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

function renderResultsExecutive() {
  ensureResultsExecutiveUI();

  const range = getPeriodRange(resultsState.period);
  const list = filterOrdersForResults(range, resultsState.type);

  const curr = computeSummary(list);

  const span = Math.max(1, range.endMs - range.startMs);
  const prevRange = {
    ...range,
    startMs: range.startMs - span,
    endMs: range.startMs - 1,
  };
  const prevList = filterOrdersForResults(prevRange, resultsState.type);
  const prev = computeSummary(prevList);

  if (resultTotalOrdersEl) resultTotalOrdersEl.textContent = String(curr.total);
  if (resultUniqueClientsEl) resultUniqueClientsEl.textContent = String(curr.unique);
  if (resultDeliveryOrdersEl) resultDeliveryOrdersEl.textContent = String(curr.delivery);
  if (resultLocalOrdersEl) resultLocalOrdersEl.textContent = String(curr.local);

  const root = resultsView?.querySelector(".results-exec-root");
  if (root) {
    const setMetric = (key, val) => {
      const el = root.querySelector(`[data-metric="${key}"]`);
      if (el) el.textContent = String(val);
    };

    setMetric("total", curr.total);
    setMetric("unique", curr.unique);
    setMetric("delivery", curr.delivery);
    setMetric("local", curr.local);

    const subs = {
      total: formatPct(pctChange(curr.total, prev.total)),
      unique: formatPct(pctChange(curr.unique, prev.unique)),
      delivery: formatPct(pctChange(curr.delivery, prev.delivery)),
      local: formatPct(pctChange(curr.local, prev.local)),
    };

    Object.keys(subs).forEach((k) => {
      const el = root.querySelector(`[data-sub="${k}"]`);
      if (el) el.textContent = `Comparado ao período anterior: ${subs[k]}`;
    });

    const series = buildSeries(range, list);
    const svg = root.querySelector("#results-chart-svg");
    renderChartSVG(svg, range, series);

    const deltaTotal = formatPct(pctChange(curr.total, prev.total));
    const deltaTotalEl = root.querySelector(`[data-insight="deltaTotal"]`);
    const deltaTotalNote = root.querySelector(`[data-insight-note="deltaTotal"]`);
    if (deltaTotalEl) deltaTotalEl.textContent = deltaTotal;
    if (deltaTotalNote) deltaTotalNote.textContent = `Total no período: ${curr.total} | Anterior: ${prev.total}`;

    const peaks = computePeaks(list);
    const peaksEl = root.querySelector(`[data-insight="peaks"]`);
    const peaksNote = root.querySelector(`[data-insight-note="peaks"]`);
    if (peaksEl) peaksEl.textContent = peaks.text;
    if (peaksNote) peaksNote.textContent = peaks.note;

    const topItems = computeTopItems(list);
    const topItemsEl = root.querySelector(`[data-insight="topItems"]`);
    const topItemsNote = root.querySelector(`[data-insight-note="topItems"]`);
    if (topItemsEl) topItemsEl.textContent = topItems.text;
    if (topItemsNote) topItemsNote.textContent = topItems.note;

    const cancelRate = curr.total > 0 ? (curr.cancelled / curr.total) * 100 : 0;
    const prevCancelRate = prev.total > 0 ? (prev.cancelled / prev.total) * 100 : 0;

    const cancelEl = root.querySelector(`[data-insight="cancelRate"]`);
    const cancelNote = root.querySelector(`[data-insight-note="cancelRate"]`);
    if (cancelEl) cancelEl.textContent = `${Math.round(cancelRate)}%`;
    if (cancelNote)
      cancelNote.textContent = `Cancelados: ${curr.cancelled} (${formatPct(cancelRate - prevCancelRate)} em relação ao período anterior)`;
  }
}

function renderResults() {
  renderResultsExecutive();
}

function toggleNoOrdersBalloons() {
  const col = columns?.caminho;
  if (!col) return;

  const existing = document.getElementById("no-deliveries-balloon");
  if (existing) existing.remove();

  if (currentView !== "entregas") return;

  const hasDeliveries = orders.some((o) => o._frontStatus === "caminho");
  if (hasDeliveries) return;

  const balloon = document.createElement("div");
  balloon.id = "no-deliveries-balloon";
  balloon.className = "empty-balloon";
  balloon.textContent = "Sem entregas no momento.";

  col.appendChild(balloon);
}

// ===== GOOGLE AUTH =====
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function completeLogin(user) {
  try {
    const resp = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, name: user.name }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      alert(data.error || "Erro ao autenticar.");
      return;
    }

    if (!data.authorized) {
      if (unauthorizedModal) openBackdrop(unauthorizedModal);
      return;
    }

    localStorage.setItem("restaurant_id", data.restaurant.id);
    localStorage.setItem("user", JSON.stringify(user));

    restaurantPlan = (data?.restaurant?.plan || "basic").toLowerCase();

    applyAccessUI();

    loginScreen?.classList.add("hidden");
    showBoard();

    if (userChip) userChip.hidden = false;
    if (userNameEl) userNameEl.textContent = user.name || "Usuário";

    if (userAvatar) {
      if (user.picture) {
        userAvatar.src = user.picture;
        userAvatar.hidden = false;
      } else {
        userAvatar.hidden = true;
      }
    }

    await fetchOrders();
  } catch (e) {
    console.error(e);
    alert("Erro ao fazer login.");
  }
}

function handleCredentialResponse(response) {
  const payload = parseJwt(response.credential);
  if (!payload?.email) {
    alert("Falha no login.");
    return;
  }
  const user = {
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
  completeLogin(user);
}

function initGoogleButton(attempt = 0) {
  if (!window.google || !googleBtnContainer) {
    if (attempt < 15) setTimeout(() => initGoogleButton(attempt + 1), 250);
    return;
  }

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
  });

  google.accounts.id.renderButton(googleBtnContainer, {
    theme: "filled_blue",
    size: "large",
    shape: "pill",
    text: "continue_with",
    width: 320,
  });
}

// ===== EVENTS =====

closeModalBtn?.addEventListener("click", closeOrderModal);
closeModalSecondaryBtn?.addEventListener("click", closeOrderModal);
modalBackdrop?.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeOrderModal();
});

modalNextBtn?.addEventListener("click", () => {
  if (activeOrderId) advanceStatus(activeOrderId);
});
modalPrevBtn?.addEventListener("click", () => {
  if (activeOrderId) regressStatus(activeOrderId);
});
modalCancelBtn?.addEventListener("click", () => {
  if (activeOrderId) cancelOrder(activeOrderId);
});

openCreateBtn?.addEventListener("click", openCreateModal);
closeCreateBtn?.addEventListener("click", closeCreateModal);
cancelCreateBtn?.addEventListener("click", closeCreateModal);
saveCreateBtn?.addEventListener("click", saveNewOrder);

createModal?.addEventListener("click", (e) => {
  if (e.target === createModal) closeCreateModal();
});

newDelivery?.addEventListener("change", updateCreateDeliveryVisibility);

tabAtivos?.addEventListener("click", () => changeView("ativos"));
tabFinalizados?.addEventListener("click", () => changeView("finalizados"));
tabCancelados?.addEventListener("click", () => changeView("cancelados"));
tabEntregas?.addEventListener("click", () => changeView("entregas"));

openDrawerBtn?.addEventListener("click", () => {
  drawer?.classList.add("open");
  drawerBackdrop?.classList.add("open");
});
closeDrawerBtn?.addEventListener("click", closeDrawer);
drawerBackdrop?.addEventListener("click", closeDrawer);

drawerOrdersBtn?.addEventListener("click", showBoard);
drawerCrmBtn?.addEventListener("click", showCRM);
drawerResultsBtn?.addEventListener("click", showResults);

crmBackBtn?.addEventListener("click", showBoard);
resultsBackBtn?.addEventListener("click", showBoard);

unauthClose?.addEventListener("click", () => closeBackdrop(unauthorizedModal));

logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("restaurant_id");
  localStorage.removeItem("user");
  location.reload();
});

// ===== INIT =====
window.addEventListener("load", async () => {
  initGoogleButton();
  updateCreateDeliveryVisibility();

  showBoard();
  changeView("ativos");

  const savedUserRaw = localStorage.getItem("user");
  const savedUser = savedUserRaw ? JSON.parse(savedUserRaw) : null;

  if (savedUser?.email) {
    await completeLogin(savedUser);
  } else {
    crmView?.classList.add("hidden");
    resultsView?.classList.add("hidden");
    board?.classList.add("hidden");
    loginScreen?.classList.remove("hidden");
  }
});
