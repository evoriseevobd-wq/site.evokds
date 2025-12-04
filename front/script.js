const GOOGLE_CLIENT_ID =
  "872848052437-nl3lru9m1jhmfobk0imbpb2o9uk47mqi.apps.googleusercontent.com";
const API_URL = "https://kds-backend.dahead.easypanel.host/orders";

const columns = {
  recebido: document.getElementById("col-recebido"),
  preparo: document.getElementById("col-preparo"),
  pronto: document.getElementById("col-pronto"),
  caminho: document.getElementById("col-caminho"),
  finalizado: document.getElementById("col-finalizado"),
  cancelado: document.getElementById("col-cancelado"),
};

const statusFlow = ["recebido", "preparo", "pronto", "caminho"];

const actionLabels = {
  recebido: "Aceitar",
  preparo: "Finalizar Preparo",
  pronto: "Enviar para Entrega",
  caminho: "Concluir Pedido",
};

let orders = [];

let activeOrderId = null;
const board = document.getElementById("board");
const loginScreen = document.getElementById("login-screen");
const userChip = document.getElementById("user-chip");
const userNameEl = document.getElementById("user-name");
const userAvatar = document.getElementById("user-avatar");
const logoutBtn = document.getElementById("logout-btn");
const googleBtnContainer = document.getElementById("googleLoginBtn");
const createModal = document.getElementById("create-modal");
const openCreate = document.getElementById("open-create");
const closeCreate = document.getElementById("close-create");
const cancelCreate = document.getElementById("cancel-create");
const saveCreate = document.getElementById("save-create");
const newCustomer = document.getElementById("new-customer");
const newItems = document.getElementById("new-items");
const newNotes = document.getElementById("new-notes");
const drawer = document.getElementById("drawer");
const openDrawer = document.getElementById("open-drawer");
const closeDrawerBtn = document.getElementById("close-drawer");
const drawerBackdrop = document.getElementById("drawer-backdrop");
const tabAtivos = document.getElementById("tab-ativos");
const tabFinalizados = document.getElementById("tab-finalizados");
const tabCancelados = document.getElementById("tab-cancelados");

const views = {
  ativos: ["recebido", "preparo", "pronto", "caminho"],
  finalizados: ["finalizado"],
  cancelados: ["cancelado", "cancelled", "canceled"],
};

let currentView = "ativos";

function getOrderId(order) {
  return order?.order_id ?? order?.id ?? order?.orderId;
}

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

const BACKEND_STATUS = [
  "pending",
  "preparing",
  "mounting",
  "delivering",
  "finished",
  "cancelled",
  "canceled",
];

function toBackendStatus(front) {
  const key = typeof front === "string" ? front.toLowerCase() : "";
  if (BACKEND_STATUS.includes(key)) return key;
  return STATUS_TO_BACKEND[key] || "pending";
}

function toFrontStatus(back) {
  const key = typeof back === "string" ? back.toLowerCase() : "";
  if (STATUS_FROM_BACKEND[key]) return STATUS_FROM_BACKEND[key];
  if (key.includes("cancel")) return "cancelado";
  return "recebido";
}

function formatOrderTime(order) {
  if (order.time) return order.time;
  if (order.createdAt) {
    const parsed = new Date(order.createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  if (order.created_at) {
    const parsed = new Date(order.created_at);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return "--:--";
}

function renderBoard() {
  Object.values(columns).forEach((col) => {
    if (col) col.innerHTML = "";
  });

  const enabledStatuses = views[currentView];

  document.querySelectorAll(".column").forEach((section) => {
    const status = section.dataset.status;
    if (!status) return;
    section.classList.toggle("hidden", !enabledStatuses.includes(status));
  });

  enabledStatuses.forEach((status) => {
    const bucket = orders.filter((order) => order.status === status);
    bucket.forEach((order) => {
      columns[status]?.appendChild(createCard(order));
    });
  });
}

function createCard(order) {
  const orderId = getOrderId(order);
  const displayNumber = order.display_number ?? orderId;
  const card = document.createElement("article");
  card.className = `card ${order.status}`;
  card.dataset.id = orderId;

  const head = document.createElement("div");
  head.className = "card-head";

  const idEl = document.createElement("div");
  idEl.className = "order-id";
  idEl.textContent = `#${displayNumber}`;

  const time = document.createElement("div");
  time.className = "order-time";
  time.textContent = formatOrderTime(order);

  head.append(idEl, time);

  const customer = document.createElement("p");
  customer.className = "customer";
  customer.textContent = order.customer;

  const items = document.createElement("p");
  items.className = "items";
  items.textContent = summarizeItems(order.items);

  const actionLabel = actionLabels[order.status];
  if (actionLabel) {
    const action = document.createElement("button");
    action.className = "action";
    action.textContent = actionLabel;
    action.addEventListener("click", (event) => {
      event.stopPropagation();
      advanceStatus(orderId);
    });
    card.append(head, customer, items, action);
  } else {
    card.append(head, customer, items);
  }

  card.addEventListener("click", () => openModal(orderId));

  return card;
}

function summarizeItems(list) {
  if (list.length <= 2) return list.join(" • ");
  const first = list.slice(0, 2).join(" • ");
  return `${first} +${list.length - 2}`;
}

function advanceStatus(orderId) {
  const index = orders.findIndex((order) => getOrderId(order) === orderId);
  if (index === -1) return;

  const currentStatus = orders[index].status;
  const nextIndex = statusFlow.indexOf(currentStatus) + 1;
  const nextStatus =
    nextIndex >= statusFlow.length ? "finalizado" : statusFlow[nextIndex];

  updatePedido(orderId, { status: nextStatus });

  if (activeOrderId === orderId) {
    closeModal();
  }
}

function openModal(orderId) {
  const order = orders.find((item) => getOrderId(item) === orderId);
  if (!order) return;

  activeOrderId = orderId;
  document.getElementById("modal-id").textContent = `#${
    order.display_number ?? orderId
  }`;
  document.getElementById("modal-customer").textContent = order.customer;
  document.getElementById("modal-time").textContent = formatOrderTime(order);

  const itemsList = document.getElementById("modal-items");
  itemsList.innerHTML = "";
  order.items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    itemsList.appendChild(li);
  });

  document.getElementById("modal-notes").textContent =
    order.notes?.trim() || "Sem observações";

  const modalAction = document.getElementById("modal-next");
  if (order.status === "finalizado" || order.status === "cancelado") {
    modalAction.classList.add("hidden");
  } else {
    modalAction.textContent = actionLabels[order.status];
    modalAction.disabled = false;
    modalAction.classList.remove("hidden");
  }

  const modalPrev = document.getElementById("modal-prev");
  const prevIndex = statusFlow.indexOf(order.status) - 1;
  if (prevIndex >= 0) {
    modalPrev.classList.remove("hidden");
    modalPrev.disabled = false;
  } else {
    modalPrev.classList.add("hidden");
    modalPrev.disabled = true;
  }

  const modalCancel = document.getElementById("modal-cancel");
  if (order.status === "finalizado" || order.status === "cancelado") {
    modalCancel.classList.add("hidden");
  } else {
    modalCancel.classList.remove("hidden");
  }

  document.getElementById("modal").classList.add("open");
}

function closeModal() {
  activeOrderId = null;
  document.getElementById("modal").classList.remove("open");
}

function completeLogin(user) {
async function completeLogin(user) {
  const safeUser = {
    name: user?.name || "Usuário",
    email: user?.email || "",
    picture: user?.picture || "",
  };

  // Envia email para backend verificar se existe no Supabase
  const response = await fetch(`${API_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(safeUser)
  });

  const result = await response.json();

  // Se não tiver permissão → mostrar mensagem
  if (!result.authorized) {
    alert(
      result.message +
        "\n\nFale com a Everrise:\n" +
        result.contact_link
    );
    return;
  }

  // Se estiver tudo OK -> continuar o login
  localStorage.setItem("restaurant_id", result.restaurant.id);
  localStorage.setItem("user", JSON.stringify(safeUser));

  loginScreen.classList.add("hidden");
  board.classList.remove("hidden");

  userNameEl.textContent = safeUser.name;
  userAvatar.src = safeUser.picture;
  userChip.hidden = false;
}


  localStorage.setItem("user", JSON.stringify(safeUser));

  if (userNameEl) {
    userNameEl.textContent = safeUser.name;
  }
  if (userAvatar) {
    if (safeUser.picture) {
      userAvatar.src = safeUser.picture;
      userAvatar.hidden = false;
    } else {
      userAvatar.hidden = true;
    }
  }

  loginScreen?.classList.add("hidden");
  board?.classList.remove("hidden");
  if (userChip) {
    userChip.hidden = false;
  }
}

function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);
    return JSON.parse(decoded);
  } catch (error) {
    console.warn("Falha ao decodificar JWT", error);
    return null;
  }
}

function handleCredentialResponse(response) {
  const data = decodeJwt(response.credential);
  const user = {
    name: data?.name || data?.given_name || "Usuário",
    email: data?.email || "",
    picture: data?.picture || "",
  };
  completeLogin(user);
}

function regressStatus(orderId) {
  const index = orders.findIndex((order) => getOrderId(order) === orderId);
  if (index === -1) return;

  const currentStatus = orders[index].status;
  const prevIndex = statusFlow.indexOf(currentStatus) - 1;
  if (prevIndex < 0) return;

  const prevStatus = statusFlow[prevIndex];
  updatePedido(orderId, { status: prevStatus }, () => openModal(orderId));
}

function openCreateModal() {
  createModal.classList.add("open");
  newCustomer.focus();
}

function closeCreateModal() {
  createModal.classList.remove("open");
  newCustomer.value = "";
  newItems.value = "";
  newNotes.value = "";
}

function saveNewOrder() {
  const customer = newCustomer.value.trim();
  const items = newItems.value
    .split(",")
    .map((i) => i.trim())
    .filter(Boolean);
  if (!customer || items.length === 0) return;

  const novoPedido = {
    customer,
    items,
    notes: newNotes.value.trim(),
    status: "recebido",
  };

  criarPedido(novoPedido);
}

function cancelOrder(orderId) {
  const index = orders.findIndex((order) => getOrderId(order) === orderId);
  if (index === -1) return;
  updatePedido(orderId, { status: "canceled" }, closeModal);
}

function initGoogleButton(attempt = 0) {
  if (!window.google || !google.accounts || !google.accounts.id) {
    if (attempt < 12) {
      setTimeout(() => initGoogleButton(attempt + 1), 250);
    } else {
      console.warn("Google Identity Services não carregou.");
    }
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

logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("user");
  window.location.href = "index.html";
});

document.getElementById("modal-next").addEventListener("click", () => {
  if (activeOrderId !== null) {
    advanceStatus(activeOrderId);
  }
});

document.getElementById("close-modal").addEventListener("click", closeModal);
document
  .getElementById("close-modal-secondary")
  .addEventListener("click", closeModal);

document.getElementById("modal").addEventListener("click", (event) => {
  if (event.target.id === "modal") {
    closeModal();
  }
});

document.getElementById("simulate-login").addEventListener("click", () => {
  completeLogin({
    name: "Usuário Demo",
    email: "demo@example.com",
    picture: "",
  });
});

document.getElementById("modal-prev").addEventListener("click", () => {
  if (activeOrderId !== null) {
    regressStatus(activeOrderId);
  }
});

document.getElementById("modal-cancel").addEventListener("click", () => {
  if (activeOrderId !== null) {
    cancelOrder(activeOrderId);
  }
});

openCreate?.addEventListener("click", openCreateModal);
closeCreate?.addEventListener("click", closeCreateModal);
cancelCreate?.addEventListener("click", closeCreateModal);
createModal?.addEventListener("click", (e) => {
  if (e.target.id === "create-modal") closeCreateModal();
});
saveCreate?.addEventListener("click", saveNewOrder);

openDrawer?.addEventListener("click", () => {
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

function changeView(view) {
  currentView = view;
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  renderBoard();
}

tabAtivos?.addEventListener("click", () => changeView("ativos"));
tabFinalizados?.addEventListener("click", () => changeView("finalizados"));
tabCancelados?.addEventListener("click", () => changeView("cancelados"));

window.addEventListener("load", () => {
  initGoogleButton();
  carregarPedidos();
  if (!window._kdsPoller) {
    window._kdsPoller = setInterval(() => {
      carregarPedidos();
    }, 5000);
  }
  const stored = localStorage.getItem("user");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      completeLogin(parsed);
    } catch (_) {
      localStorage.removeItem("user");
    }
  }
});

async function carregarPedidos() {
  try {
    const restaurantId = localStorage.getItem("restaurant_id");
    if (!restaurantId) {
      console.warn("restaurant_id não definido");
      return;
    }
    const response = await fetch(`${API_URL}/${restaurantId}`);
    const data = await response.json();
    renderizarKanban(data);
  } catch (error) {
    console.error("Erro ao carregar pedidos:", error);
  }
}

function renderizarKanban(lista) {
  const mapped =
    Array.isArray(lista) && lista.length
      ? lista.map((order) => ({
          ...order,
          order_id: order.id,
          display_number:
            order.order_numb ??
            order.order_number ??
            order.order_id ??
            order.orderId ??
            order.id,
          customer: order.client_name || order.customer,
          items: order.items || order.itens || [],
          notes: order.notes || "",
          status: toFrontStatus(order.status),
          createdAt: order.created_at || order.createdAt,
        }))
      : [];
  orders = mapped;
  renderBoard();
}

async function criarPedido(novoPedido) {
  try {
    const restaurantId = localStorage.getItem("restaurant_id");
    if (!restaurantId) {
      console.warn("restaurant_id não definido");
      return;
    }

    const body = {
      restaurant_id: restaurantId,
      client_name: novoPedido.customer,
      itens: novoPedido.items,
      notes: novoPedido.notes || "",
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Erro ao criar pedido");
    }
    closeCreateModal();
    await carregarPedidos();
  } catch (error) {
    console.error("Erro ao criar pedido:", error);
  }
}

async function updatePedido(orderId, payload, onSuccess) {
  try {
    const body = { ...payload };
    if (body.status) {
      body.status = toBackendStatus(body.status);
    }
    await fetch(`${API_URL}/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (typeof onSuccess === "function") onSuccess();
    await carregarPedidos();
  } catch (error) {
    console.error("Erro ao atualizar pedido:", error);
  }
}
