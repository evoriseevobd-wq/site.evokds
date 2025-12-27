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

// Results IDs
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
const modalBackdrop = document.getElementById("modal"); // backdrop inteiro
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
const newPhone = document.getElementById("new-phone"); // opcional
const newItems = document.getElementById("new-items");
const newDelivery = document.getElementById("new-delivery"); // checkbox
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

function normalizePhone(input) {
  if (input === null || input === undefined) return "";
  const digits = String(input).replace(/\D/g, "");
  return digits.trim();
}

function closeDrawer() {
  drawer?.classList.remove("open");
  drawerBackdrop?.classList.remove("open");
}

// ===== NAV (Board/CRM/Results) =====
function showBoard() {
  crmView?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  board?.classList.remove("hidden");
  closeDrawer();
}

function showCRM() {
  if (!features.crm) {
    alert("Este recurso está disponível apenas em planos superiores.");
    return;
  }
  board?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  crmView?.classList.remove("hidden");
  closeDrawer();
  fetchCRM();
}

function showResults() {
  if (!features.results) {
    alert("Este recurso está disponível apenas em planos superiores.");
    return;
  }
  board?.classList.add("hidden");
  crmView?.classList.add("hidden");
  resultsView?.classList.remove("hidden");
  closeDrawer();
  renderResults();
}

function applyAccessUI() {
  if (drawerCrmBtn) {
    drawerCrmBtn.classList.toggle("locked", !features.crm);
  }
  if (drawerResultsBtn) {
    drawerResultsBtn.classList.toggle("locked", !features.results);
  }
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

  // telefone (se existir)
  const phone = normalizePhone(order.client_phone);
  if (modalPhoneRow && modalPhone) {
    const hasPhone = !!phone;
    modalPhoneRow.style.display = hasPhone ? "" : "none";
    modalPhone.textContent = hasPhone ? phone : "";
  }

  // itens
  if (modalItems) {
    modalItems.innerHTML = "";
    const itens = Array.isArray(order.itens) ? order.itens : [];
    itens.forEach((it) => {
      const li = document.createElement("li");
      const name = it?.name || it?.nome || "Item";
      const qty = it?.qty || it?.quantidade || 1;
      li.textContent = `${name} x${qty}`;
      modalItems.appendChild(li);
    });
  }

  // observações
  if (modalNotes) {
    modalNotes.textContent = order.notes || "";
  }

  const isDelivery = String(order.service_type || "").toLowerCase() === "delivery";

  // endereço (somente delivery)
  if (modalAddressRow && modalAddress) {
    const showAddress = isDelivery && !!String(order.address || "").trim();
    modalAddressRow.style.display = showAddress ? "" : "none";
    modalAddress.textContent = showAddress ? String(order.address || "") : "";
  }

  // pagamento (somente delivery)
  if (modalPaymentRow && modalPayment) {
    const showPay = isDelivery && !!String(order.payment_method || "").trim();
    modalPaymentRow.style.display = showPay ? "" : "none";
    modalPayment.textContent = showPay ? String(order.payment_method || "") : "";
  }

  // botões de etapa
  modalPrevBtn?.classList.toggle("hidden", currentView === "cancelados");
  modalCancelBtn?.classList.toggle("hidden", currentView === "cancelados");

  // texto do botão "próximo"
  if (modalNextBtn) {
    const s = getFrontStatus(orderId);
    const nextLabel =
      s === "recebido" ? "Ir para Preparo" :
      s === "preparo" ? "Ir para Pronto" :
      s === "pronto" ? "Ir para A Caminho" :
      s === "caminho" ? "Finalizar" :
      "OK";
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
  const s = getFrontStatus(orderId);
  const seq = ["recebido", "preparo", "pronto", "caminho", "finalizado"];
  const i = seq.indexOf(s);
  if (i === -1 || i === seq.length - 1) return;
  updateOrderStatus(orderId, seq[i + 1]);
}

function regressStatus(orderId) {
  const s = getFrontStatus(orderId);
  const seq = ["recebido", "preparo", "pronto", "caminho", "finalizado"];
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

  // 1) tenta JSON
  try {
    const obj = JSON.parse(s);
    return Array.isArray(obj) ? obj : null;
  } catch {
    // 2) tenta por vírgula (mais comum no seu input)
    if (s.includes(",")) {
      const parts = s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      if (parts.length) {
        return parts.map((name) => ({ name, qty: 1 }));
      }
    }

    // 3) fallback por linhas, aceitando "nome x2"
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
  const client_phone = phoneRaw ? phoneRaw : null; // backend vai normalizar

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
      client_phone, // ✅ opcional
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
    const data = await resp.json().catch(() => ([]));

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

// ===== RESULTS =====
function renderResults() {
  // métricas usando o array orders já carregado
  const total = orders.length;

  const delivery = orders.filter(
    (o) => String(o.service_type || "").toLowerCase() === "delivery"
  ).length;

  const local = total - delivery;

  // clientes únicos: usa telefone se tiver; senão usa nome
  const uniqueKeys = new Set();
  for (const o of orders) {
    const phone = normalizePhone(o.client_phone);
    if (phone) uniqueKeys.add(`p:${phone}`);
    else uniqueKeys.add(`n:${String(o.client_name || "").trim().toLowerCase()}`);
  }

  if (resultTotalOrdersEl) resultTotalOrdersEl.textContent = String(total);
  if (resultUniqueClientsEl) resultUniqueClientsEl.textContent = String(uniqueKeys.size);
  if (resultDeliveryOrdersEl) resultDeliveryOrdersEl.textContent = String(delivery);
  if (resultLocalOrdersEl) resultLocalOrdersEl.textContent = String(local);
}

// ===== EMPTY BALLOONS =====
function toggleNoOrdersBalloons() {
  // mantém a lógica atual do seu código
  // (não removi nada)
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

    // plano e acesso
    restaurantPlan = (data?.restaurant?.plan || "basic").toLowerCase();

    // CRM: pro+
    features.crm = ["pro", "advanced", "custom"].includes(restaurantPlan);

    // Resultados: pro+ (se quiser advanced+ depois, troque aqui)
    features.results = ["pro", "advanced", "custom"].includes(restaurantPlan);

    applyAccessUI();

    // UI
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

// Modal order
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

// Create modal
openCreateBtn?.addEventListener("click", openCreateModal);
closeCreateBtn?.addEventListener("click", closeCreateModal);
cancelCreateBtn?.addEventListener("click", closeCreateModal);
saveCreateBtn?.addEventListener("click", saveNewOrder);

createModal?.addEventListener("click", (e) => {
  if (e.target === createModal) closeCreateModal();
});

newDelivery?.addEventListener("change", updateCreateDeliveryVisibility);

// Tabs
tabAtivos?.addEventListener("click", () => changeView("ativos"));
tabFinalizados?.addEventListener("click", () => changeView("finalizados"));
tabCancelados?.addEventListener("click", () => changeView("cancelados"));
tabEntregas?.addEventListener("click", () => changeView("entregas"));

// Drawer open/close
openDrawerBtn?.addEventListener("click", () => {
  drawer?.classList.add("open");
  drawerBackdrop?.classList.add("open");
});
closeDrawerBtn?.addEventListener("click", closeDrawer);
drawerBackdrop?.addEventListener("click", closeDrawer);

// Drawer navigation
drawerOrdersBtn?.addEventListener("click", showBoard);
drawerCrmBtn?.addEventListener("click", showCRM);
drawerResultsBtn?.addEventListener("click", showResults);

// Back buttons (views)
crmBackBtn?.addEventListener("click", showBoard);
resultsBackBtn?.addEventListener("click", showBoard);

// Unauthorized
unauthClose?.addEventListener("click", () => closeBackdrop(unauthorizedModal));

// Logout
logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("restaurant_id");
  localStorage.removeItem("user");
  location.reload();
});

// ===== INIT =====
window.addEventListener("load", async () => {
  initGoogleButton();
  updateCreateDeliveryVisibility();

  // inicia na view de pedidos
  showBoard();
  changeView("ativos");

  // tenta auto-login
  const savedUserRaw = localStorage.getItem("user");
  const savedUser = savedUserRaw ? JSON.parse(savedUserRaw) : null;

  if (savedUser?.email) {
    await completeLogin(savedUser);
  } else {
    // não logado
    crmView?.classList.add("hidden");
    resultsView?.classList.add("hidden");
    board?.classList.add("hidden");
    loginScreen?.classList.remove("hidden");
  }
});
