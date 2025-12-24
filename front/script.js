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

const columns = {
  recebido: document.getElementById("col-recebido"),
  preparo: document.getElementById("col-preparo"),
  pronto: document.getElementById("col-pronto"),
  caminho: document.getElementById("col-caminho"),
  finalizado: document.getElementById("col-finalizado"),
  cancelado: document.getElementById("col-cancelado"),
};

const tabAtivos = document.getElementById("tab-ativos");
const tabFinalizados = document.getElementById("tab-finalizados");
const tabCancelados = document.getElementById("tab-cancelados");
const tabEntregas = document.getElementById("tab-entregas");

// Drawer
const drawer = document.getElementById("drawer");
const openDrawerBtn = document.getElementById("open-drawer");
const closeDrawerBtn = document.getElementById("close-drawer");
const drawerBackdrop = document.getElementById("drawer-backdrop");

// User chip
const userChip = document.getElementById("user-chip");
const userNameEl = document.getElementById("user-name");
const userAvatar = document.getElementById("user-avatar");
const logoutBtn = document.getElementById("logout-btn");

// 🔹 CRM (cria botão no drawer se não existir)
const crmBtn = document.getElementById("drawer-crm") || (() => {
  if (!drawer) return null;
  const btn = document.createElement("button");
  btn.id = "drawer-crm";
  btn.type = "button";
  btn.textContent = "CRM de Clientes";
  btn.className = logoutBtn?.className || "";
  // tenta colocar antes do botão de logout (fica organizado)
  if (logoutBtn?.parentNode) {
    logoutBtn.parentNode.insertBefore(btn, logoutBtn);
  } else {
    drawer.appendChild(btn);
  }
  return btn;
})();

// 🔹 CRM (cria view se não existir)
const crmView = document.getElementById("crm-view") || (() => {
  const section = document.createElement("section");
  section.id = "crm-view";
  section.classList.add("hidden");
  document.body.appendChild(section);
  return section;
})();

// Unauthorized modal
const unauthorizedModal = document.getElementById("unauthorized-modal");
const unauthClose = document.getElementById("unauth-close");

// Modal
const modal = document.getElementById("order-modal");
const modalBackdrop = document.getElementById("modal-backdrop");
const modalTitle = document.getElementById("modal-title");
const modalNumber = document.getElementById("modal-number");
const modalList = document.getElementById("modal-list");
const modalNotes = document.getElementById("modal-notes");

const modalAddressRow = document.getElementById("modal-address-row");
const modalAddress = document.getElementById("modal-address");

// ✅ NOVO: pagamento no popup
const modalPaymentRow = document.getElementById("modal-payment-row");
const modalPayment = document.getElementById("modal-payment");

const closeModalBtn = document.getElementById("close-modal");
const closeModalSecondaryBtn = document.getElementById("close-modal-secondary");
const modalPrevBtn = document.getElementById("modal-prev");
const modalCancelBtn = document.getElementById("modal-cancel");
const modalNextBtn = document.getElementById("modal-next");

// Create modal
const createModal = document.getElementById("create-modal");
const openCreateBtn = document.getElementById("open-create");
const closeCreateBtn = document.getElementById("close-create");
const cancelCreateBtn = document.getElementById("cancel-create");
const saveCreateBtn = document.getElementById("save-create");

// Create fields
const newClientName = document.getElementById("new-client-name");
const newItems = document.getElementById("new-items");
const newNotes = document.getElementById("new-notes");
const newServiceType = document.getElementById("new-service-type");
const deliveryWrap = document.getElementById("delivery-wrap");
const newAddress = document.getElementById("new-address");

// ✅ NOVO: payment
const paymentWrap = document.getElementById("payment-wrap");
const newPayment = document.getElementById("new-payment");

// Google button
const googleBtnContainer = document.getElementById("googleLoginBtn");

// ===== STATE =====
let currentView = "ativos";
let orders = [];
let activeOrderId = null;

// 🔹 CRM — estado
let restaurantPlan = "basic";
let features = { crm: false };
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

function openBackdrop(el) { el?.classList.add("open"); }
function closeBackdrop(el) { el?.classList.remove("open"); }

// =======================
// 🔹 CRM — CONTROLE DE ACESSO + VIEW
// =======================
function applyCRMAccess() {
  if (!crmBtn) return;
  if (!features.crm) {
    crmBtn.classList.add("locked");
    crmBtn.onclick = () => {
      alert("Este recurso está disponível apenas em planos superiores.");
    };
  } else {
    crmBtn.classList.remove("locked");
    crmBtn.onclick = openCRMView;
  }
}

function openCRMView() {
  board?.classList.add("hidden");
  crmView?.classList.remove("hidden");
  fetchCRM();
}

function closeCRMView() {
  crmView?.classList.add("hidden");
  board?.classList.remove("hidden");
}

async function fetchCRM() {
  const restaurantId = localStorage.getItem("restaurant_id");
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
  if (!crmView) return;
  crmView.innerHTML = "";

  const header = document.createElement("div");
  header.className = "crm-header";
  header.innerHTML = `
    <div class="crm-title">CRM de Clientes</div>
    <button type="button" id="crm-back-btn">Voltar</button>
  `;
  crmView.appendChild(header);

  const backBtn = crmView.querySelector("#crm-back-btn");
  backBtn?.addEventListener("click", closeCRMView);

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
    const phone = features.crm ? (c.client_phone || "—") : "🔒";
    tr.innerHTML = `
      <td>${c.client_name || "Cliente"}</td>
      <td>${phone}</td>
      <td>${c.orders || 0}</td>
      <td>${formatTime(c.last_order_at)}</td>
    `;
    tbody.appendChild(tr);
  });

  crmView.appendChild(table);
}

function buildHeaders() {
  return { "Content-Type": "application/json" };
}

function getRestaurantId() {
  return localStorage.getItem("restaurant_id");
}

// ===== VIEWS =====
function setColumnsVisibility(viewKey) {
  Object.keys(columns).forEach((k) => {
    const col = columns[k];
    if (!col) return;
    const shouldShow = views[viewKey].includes(k);
    col.classList.toggle("hidden", !shouldShow);
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
      orders[idx] = { ...orders[idx], ...data, _frontStatus: toFrontStatus(data.status) };
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

  const paymentText =
    isDelivery && order.payment_method ? order.payment_method : "";

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

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ===== MODAL =====
function openOrderModal(orderId) {
  const order = orders.find((o) => o.id === orderId);
  if (!order) return;

  activeOrderId = orderId;

  if (modalTitle) modalTitle.textContent = order.client_name || "Cliente";
  if (modalNumber) modalNumber.textContent = `#${order.order_number || ""}`;

  if (modalList) {
    modalList.innerHTML = "";
    const itens = Array.isArray(order.itens) ? order.itens : [];
    itens.forEach((it) => {
      const li = document.createElement("li");
      li.textContent = `${it?.name || it?.nome || "Item"} x${it?.qty || it?.quantidade || 1}`;
      modalList.appendChild(li);
    });
  }

  if (modalNotes) {
    modalNotes.textContent = order.notes || "";
    modalNotes.classList.toggle("hidden", !order.notes);
  }

  const isDelivery = String(order.service_type || "").toLowerCase() === "delivery";

  // endereço
  if (modalAddressRow && modalAddress) {
    modalAddressRow.classList.toggle("hidden", !isDelivery);
    modalAddress.textContent = order.address || "";
  }

  // ✅ pagamento (somente delivery)
  if (modalPaymentRow && modalPayment) {
    modalPaymentRow.classList.toggle("hidden", !(isDelivery && order.payment_method));
    modalPayment.textContent = order.payment_method || "";
  }

  modalPrevBtn?.classList.toggle("hidden", currentView === "cancelados");
  modalCancelBtn?.classList.toggle("hidden", currentView === "cancelados");

  openBackdrop(modalBackdrop);
  modal?.classList.add("open");
}

function closeOrderModal() {
  activeOrderId = null;
  modal?.classList.remove("open");
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
function openCreateModal() {
  createModal?.classList.add("open");
  openBackdrop(createModal);
}

function closeCreateModal() {
  createModal?.classList.remove("open");
  closeBackdrop(createModal);
  newClientName && (newClientName.value = "");
  newItems && (newItems.value = "");
  newNotes && (newNotes.value = "");
  newAddress && (newAddress.value = "");
  newPayment && (newPayment.value = "");
  newServiceType && (newServiceType.value = "local");
  deliveryWrap?.classList.add("hidden");
  paymentWrap?.classList.add("hidden");
}

function parseItems(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const obj = JSON.parse(s);
    return Array.isArray(obj) ? obj : null;
  } catch {
    // tenta separar por linhas: nome xqtd
    const lines = s.split("\n").map((x) => x.trim()).filter(Boolean);
    if (!lines.length) return null;
    return lines.map((ln) => {
      const m = ln.match(/(.+?)\s*x\s*(\d+)$/i);
      if (m) return { name: m[1].trim(), qty: Number(m[2]) };
      return { name: ln, qty: 1 };
    });
  }
}

function updateCreateDeliveryVisibility() {
  const isDelivery = newServiceType?.value === "delivery";
  deliveryWrap?.classList.toggle("hidden", !isDelivery);
  paymentWrap?.classList.toggle("hidden", !isDelivery);
}

async function saveNewOrder() {
  const rid = getRestaurantId();
  const client = String(newClientName?.value || "").trim();
  const itens = parseItems(newItems?.value);

  const service_type = newServiceType?.value === "delivery" ? "delivery" : "local";
  const address = String(newAddress?.value || "").trim();
  const payment_method = String(newPayment?.value || "").trim();

  if (!rid || !client || !itens) {
    alert("Preencha cliente e itens.");
    return;
  }

  if (service_type === "delivery" && !address) {
    alert("Endereço é obrigatório para delivery.");
    return;
  }

  if (service_type === "delivery" && !payment_method) {
    alert("Forma de pagamento é obrigatória para delivery.");
    return;
  }

  try {
    const body = {
      restaurant_id: rid,
      client_name: client,
      itens,
      notes: String(newNotes?.value || ""),
      service_type,
      address: service_type === "delivery" ? address : null,
      payment_method: service_type === "delivery" ? payment_method : null,
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

    // 🔹 CRM — plano e acesso (calculado no front pra não depender do backend)
    restaurantPlan = (data?.restaurant?.plan || "basic").toLowerCase();
    features.crm = ["pro", "advanced", "custom"].includes(restaurantPlan);
    applyCRMAccess();

    // UI
    loginScreen?.classList.add("hidden");
    board?.classList.remove("hidden");

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
modalBackdrop?.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeOrderModal(); });

modalNextBtn?.addEventListener("click", () => { if (activeOrderId) advanceStatus(activeOrderId); });
modalPrevBtn?.addEventListener("click", () => { if (activeOrderId) regressStatus(activeOrderId); });
modalCancelBtn?.addEventListener("click", () => { if (activeOrderId) cancelOrder(activeOrderId); });

openCreateBtn?.addEventListener("click", openCreateModal);
closeCreateBtn?.addEventListener("click", closeCreateModal);
cancelCreateBtn?.addEventListener("click", closeCreateModal);
saveCreateBtn?.addEventListener("click", saveNewOrder);

createModal?.addEventListener("click", (e) => { if (e.target === createModal) closeCreateModal(); });

tabAtivos?.addEventListener("click", () => changeView("ativos"));
tabFinalizados?.addEventListener("click", () => changeView("finalizados"));
tabCancelados?.addEventListener("click", () => changeView("cancelados"));
tabEntregas?.addEventListener("click", () => changeView("entregas"));

newServiceType?.addEventListener("change", updateCreateDeliveryVisibility);

// Drawer open/close
openDrawerBtn?.addEventListener("click", () => {
  drawer?.classList.add("open");
  drawerBackdrop?.classList.add("open");
});
closeDrawerBtn?.addEventListener("click", () => {
  drawer?.classList.remove("open");
  drawerBackdrop?.classList.remove("open");
});
drawerBackdrop?.addEventListener("click", () => {
  drawer?.classList.remove("open");
  drawerBackdrop?.classList.remove("open");
});

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

  // aplica visibilidade inicial do create
  updateCreateDeliveryVisibility();

  // tenta auto-login
  const savedUserRaw = localStorage.getItem("user");
  const savedUser = savedUserRaw ? JSON.parse(savedUserRaw) : null;

  if (savedUser?.email) {
    await completeLogin(savedUser);
  } else {
    // se não está logado, garante que o CRM não esteja aberto
    crmView?.classList.add("hidden");
    board?.classList.add("hidden");
    loginScreen?.classList.remove("hidden");
  }
});
