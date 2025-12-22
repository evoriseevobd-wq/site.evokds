// ===== CONFIG =====
const GOOGLE_CLIENT_ID =
  "872848052437-nl3lru9m1jhmfobk0imbpb2o9uk47mqi.apps.googleusercontent.com";

const API_BASE = "https://kds-backend.dahead.easypanel.host";
const API_URL = `${API_BASE}/orders`;
const AUTH_URL = `${API_BASE}/auth/google`;

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

// Unauthorized modal
const unauthorizedModal = document.getElementById("unauthorized-modal");
const unauthClose = document.getElementById("unauth-close");

// Order modal
const modalBackdrop = document.getElementById("modal");
const modalId = document.getElementById("modal-id");
const modalCustomer = document.getElementById("modal-customer");
const modalTime = document.getElementById("modal-time");
const modalItems = document.getElementById("modal-items");
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

const newCustomer = document.getElementById("new-customer");
const newItems = document.getElementById("new-items");
const newNotes = document.getElementById("new-notes");

// Delivery + address
const newDelivery = document.getElementById("new-delivery");
const deliveryAddressWrap = document.getElementById("delivery-address-wrap");
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

// ===== HELPERS =====
function toFrontStatus(back) {
  const k = String(back || "").toLowerCase();
  return STATUS_FROM_BACKEND[k] || "recebido";
}

function toBackendStatus(front) {
  const k = String(front || "").toLowerCase();
  return STATUS_TO_BACKEND[k] || "pending";
}

function getOrderId(o) {
  return o?.id ?? o?.order_id ?? o?.orderId;
}

function formatTime(iso) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function summarizeItems(list) {
  if (!Array.isArray(list)) return "";
  if (list.length <= 2) return list.join(" • ");
  return `${list.slice(0, 2).join(" • ")} +${list.length - 2}`;
}

function openBackdrop(el) { el?.classList.add("open"); }
function closeBackdrop(el) { el?.classList.remove("open"); }

// ===== DELIVERY UI (MOSTRAR/ESCONDER ENDEREÇO + PAGAMENTO) =====
function applyDeliveryUI() {
  if (!newDelivery || !deliveryAddressWrap || !newAddress) return;

  const on = newDelivery.checked;

  // endereço
  deliveryAddressWrap.classList.toggle("visible", on);
  newAddress.required = on;
  if (!on) newAddress.value = "";

  // ✅ NOVO: pagamento (mesmo processo do endereço)
  if (paymentWrap && newPayment) {
    paymentWrap.classList.toggle("visible", on);
    newPayment.required = on;
    if (!on) newPayment.value = "";
  }
}

function setupDeliveryUI() {
  if (!newDelivery) return;
  newDelivery.addEventListener("change", applyDeliveryUI);
  applyDeliveryUI();
}

// ===== BOARD RENDER =====
function renderBoard() {
  Object.values(columns).forEach((c) => c && (c.innerHTML = ""));

  const enabled = views[currentView] || [];

  document.querySelectorAll(".column").forEach((section) => {
    const st = section.dataset.status;
    if (!st) return;
    section.classList.toggle("hidden", !enabled.includes(st));
  });

  enabled.forEach((status) => {
    const col = columns[status];
    if (!col) return;

    const bucket = orders.filter((o) => o.status === status);

    if (bucket.length === 0) {
      if (currentView === "entregas" && status === "caminho") {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Nenhuma entrega em andamento no momento.";
        col.appendChild(empty);
      }
      return;
    }

    bucket.forEach((order) => col.appendChild(createCard(order)));
  });
}

function actionLabel(order) {
  if (order.status === "pronto") {
    return order.service_type === "delivery"
      ? "Enviar para entrega"
      : "Finalizar pedido";
  }
  if (order.status === "recebido") return "Aceitar";
  if (order.status === "preparo") return "Finalizar Preparo";
  if (order.status === "caminho") return "Concluir Pedido";
  return "";
}

function createCard(order) {
  const id = getOrderId(order);

  const card = document.createElement("article");
  card.className = `card ${order.status}`;
  card.dataset.id = id;

  const head = document.createElement("div");
  head.className = "card-head";

  const idEl = document.createElement("div");
  idEl.className = "order-id";
  idEl.textContent = `#${order.order_number ?? id}`;

  const timeEl = document.createElement("div");
  timeEl.className = "order-time";
  timeEl.textContent = formatTime(order.created_at);

  head.append(idEl, timeEl);

  const customer = document.createElement("p");
  customer.className = "customer";
  customer.textContent = order.client_name;

  const items = document.createElement("p");
  items.className = "items";
  items.textContent = summarizeItems(order.itens || []);

  const label = actionLabel(order);

  if (label) {
    const btn = document.createElement("button");
    btn.className = "action";
    btn.textContent = label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      advanceStatus(id);
    });
    card.append(head, customer, items, btn);
  } else {
    card.append(head, customer, items);
  }

  card.addEventListener("click", () => openOrderModal(id));
  return card;
}

// ===== STATUS FLOW =====
function nextFrontStatus(order) {
  const flow = ["recebido", "preparo", "pronto", "caminho"];

  if (order.status === "pronto") {
    return order.service_type === "delivery" ? "caminho" : "finalizado";
  }
  if (order.status === "caminho") return "finalizado";

  const idx = flow.indexOf(order.status);
  if (idx === -1) return "recebido";
  const next = flow[idx + 1];
  return next || "finalizado";
}

function prevFrontStatus(order) {
  const flow = ["recebido", "preparo", "pronto", "caminho"];
  const idx = flow.indexOf(order.status);
  if (idx <= 0) return null;
  return flow[idx - 1];
}

async function patchOrderStatus(orderId, frontStatus) {
  try {
    const resp = await fetch(`${API_URL}/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: toBackendStatus(frontStatus) }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      alert(data.error || "Erro ao atualizar status.");
      return;
    }

    await fetchOrders();
  } catch (e) {
    console.error("Erro ao atualizar:", e);
    alert("Erro de rede ao atualizar pedido.");
  }
}

async function advanceStatus(orderId) {
  const order = orders.find((o) => getOrderId(o) === orderId);
  if (!order) return;
  const next = nextFrontStatus(order);
  await patchOrderStatus(orderId, next);
  closeBackdrop(modalBackdrop);
}

async function regressStatus(orderId) {
  const order = orders.find((o) => getOrderId(o) === orderId);
  if (!order) return;
  const prev = prevFrontStatus(order);
  if (!prev) return;
  await patchOrderStatus(orderId, prev);
  openOrderModal(orderId);
}

async function cancelOrder(orderId) {
  await patchOrderStatus(orderId, "cancelado");
  closeBackdrop(modalBackdrop);
}

// ===== MODAL =====
function prettyPaymentLabel(v) {
  const x = String(v || "").toLowerCase();
  if (x === "pix") return "PIX";
  if (x === "credito") return "Cartão de crédito";
  if (x === "debito") return "Cartão de débito";
  if (x === "dinheiro") return "Dinheiro";
  return v || "";
}

function openOrderModal(orderId) {
  const order = orders.find((o) => getOrderId(o) === orderId);
  if (!order) return;

  activeOrderId = orderId;

  modalId.textContent = `#${order.order_number ?? orderId}`;
  modalCustomer.textContent = order.client_name;
  modalTime.textContent = formatTime(order.created_at);

  // endereço
  const addr = (order.address || "").trim();
  if (addr) {
    modalAddressRow.style.display = "";
    modalAddress.textContent = addr;
  } else {
    modalAddressRow.style.display = "none";
    modalAddress.textContent = "";
  }

  // ✅ NOVO: pagamento (só aparece se existir)
  const pay = (order.payment_method || "").trim();
  if (pay) {
    modalPaymentRow.style.display = "";
    modalPayment.textContent = prettyPaymentLabel(pay);
  } else {
    modalPaymentRow.style.display = "none";
    modalPayment.textContent = "";
  }

  modalItems.innerHTML = "";
  (order.itens || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    modalItems.appendChild(li);
  });

  modalNotes.textContent = (order.notes || "").trim() || "Sem observações";

  const label = actionLabel(order);
  modalNextBtn.textContent = label || "";
  modalNextBtn.classList.toggle("hidden", !label);

  const prev = prevFrontStatus(order);
  modalPrevBtn.classList.toggle("hidden", !prev);

  modalCancelBtn.classList.toggle(
    "hidden",
    order.status === "finalizado" || order.status === "cancelado"
  );

  openBackdrop(modalBackdrop);
}

function closeOrderModal() {
  activeOrderId = null;
  closeBackdrop(modalBackdrop);
}

// ===== VIEW =====
function changeView(view) {
  currentView = view;
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === view);
  });
  renderBoard();
}

// ===== CREATE MODAL =====
function openCreateModal() {
  openBackdrop(createModal);
  applyDeliveryUI();
  newCustomer?.focus();
}

function closeCreateModal() {
  closeBackdrop(createModal);
  if (newCustomer) newCustomer.value = "";
  if (newItems) newItems.value = "";
  if (newNotes) newNotes.value = "";
  if (newDelivery) newDelivery.checked = false;
  if (newAddress) newAddress.value = "";

  // ✅ NOVO: limpar pagamento também
  if (newPayment) newPayment.value = "";
  if (paymentWrap) paymentWrap.classList.remove("visible");

  applyDeliveryUI();
}

async function saveNewOrder() {
  const restaurantId = localStorage.getItem("restaurant_id");
  if (!restaurantId) {
    alert("Você precisa estar logado.");
    return;
  }

  const customer = (newCustomer?.value || "").trim();
  const items = (newItems?.value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (!customer) return alert("Informe o cliente.");
  if (items.length === 0) return alert("Informe os itens.");

  const serviceType = newDelivery?.checked ? "delivery" : "local";
  const address = (newAddress?.value || "").trim();

  // ✅ NOVO: payment_method
  const payment_method = (newPayment?.value || "").trim();

  if (serviceType === "delivery") {
    if (!address) {
      alert("Informe o endereço de entrega para pedidos de delivery.");
      newAddress?.focus();
      return;
    }
    if (!payment_method) {
      alert("Informe a forma de pagamento para pedidos de delivery.");
      newPayment?.focus();
      return;
    }
  }

  const body = {
    restaurant_id: restaurantId,
    client_name: customer,
    itens: items,
    notes: (newNotes?.value || "").trim(),
    status: "recebido",
    service_type: serviceType,
    address: serviceType === "delivery" ? address : "",
    payment_method: serviceType === "delivery" ? payment_method : "",
  };

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      alert(data.error || "Erro ao criar pedido.");
      return;
    }

    closeCreateModal();
    await fetchOrders();
  } catch (e) {
    console.error(e);
    alert("Erro de rede ao criar pedido.");
  }
}

// ===== FETCH =====
async function fetchOrders() {
  const restaurantId = localStorage.getItem("restaurant_id");
  if (!restaurantId) return;

  try {
    const resp = await fetch(`${API_URL}/${restaurantId}`);
    const data = await resp.json().catch(() => []);

    orders = Array.isArray(data)
      ? data.map((o) => ({
          ...o,
          status: toFrontStatus(o.status),
          service_type: o.service_type || "local",
          address: o.address || "",
          // ✅ NOVO: payment_method vindo do backend
          payment_method: o.payment_method || "",
        }))
      : [];

    renderBoard();
  } catch (e) {
    console.error("Erro ao carregar pedidos:", e);
  }
}

// ===== GOOGLE LOGIN =====
function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(normalized)
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
  const payload = decodeJwt(response.credential);
  const user = {
    name: payload?.name || payload?.given_name || "Usuário",
    email: payload?.email || "",
    picture: payload?.picture || "",
  };
  completeLogin(user);
}

function initGoogleButton(attempt = 0) {
  if (!window.google || !google.accounts || !google.accounts.id) {
    if (attempt < 15) setTimeout(() => initGoogleButton(attempt + 1), 250);
    return;
  }

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
  });

  if (googleBtnContainer) {
    google.accounts.id.renderButton(googleBtnContainer, {
      theme: "filled_blue",
      size: "large",
      shape: "pill",
      text: "continue_with",
      width: 320,
    });
  }
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

logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("restaurant_id");
  localStorage.removeItem("user");
  window.location.reload();
});

// Drawer
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

window.addEventListener("load", async () => {
  initGoogleButton();
  setupDeliveryUI();

  const savedUserRaw = localStorage.getItem("user");
  const savedUser = savedUserRaw ? JSON.parse(savedUserRaw) : null;

  // Se já tiver user salvo, tenta autenticar direto
  if (savedUser?.email) {
    await completeLogin(savedUser);
  }
});
