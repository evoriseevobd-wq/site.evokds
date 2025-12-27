import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config.js";

const app = express();
const PORT = process.env.PORT || 3001;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(cors());
app.use(express.json());

const ALLOWED_STATUS = [
  "pending",
  "preparing",
  "mounting",
  "delivering",
  "finished",
  "cancelled",
  "canceled",
];

const sendError = (res, status, message) =>
  res.status(status).json({ error: message });

async function restaurantExists(restaurant_id) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id")
    .eq("id", restaurant_id)
    .limit(1);

  if (error) throw new Error("Erro ao validar restaurante");
  return data && data.length > 0;
}

/* plano e permissão de CRM */
async function getRestaurantPlan(restaurant_id) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("plan")
    .eq("id", restaurant_id)
    .single();

  if (error) return "basic";
  return (data?.plan || "basic").toLowerCase();
}

function canUseCRM(plan) {
  return ["pro", "advanced", "custom"].includes(plan);
}

/* Normaliza telefone */
function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/\D/g, "").trim();
  return digits ? digits : null;
}

/* =========================
   ORDERS
========================= */

app.post("/orders", async (req, res) => {
  try {
    const {
      restaurant_id,
      client_name,
      client_phone,
      items,
      itens,
      notes,
      service_type,
      address,
      payment_method,
    } = req.body || {};

    const normalizedItems = Array.isArray(items)
      ? items
      : Array.isArray(itens)
      ? itens
      : null;

    if (!restaurant_id || !client_name || !normalizedItems) {
      return sendError(
        res,
        400,
        "restaurant_id, client_name e items são obrigatórios"
      );
    }

    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");

    const finalServiceType =
      service_type === "delivery" ? "delivery" : "local";

    if (finalServiceType === "delivery" && (!address || !address.trim())) {
      return sendError(res, 400, "Endereço é obrigatório para pedidos de delivery");
    }

    if (
      finalServiceType === "delivery" &&
      (!payment_method || !payment_method.trim())
    ) {
      return sendError(res, 400, "Forma de pagamento é obrigatória para pedidos de delivery");
    }

    const { data: last, error: lastErr } = await supabase
      .from("orders")
      .select("order_number")
      .eq("restaurant_id", restaurant_id)
      .order("order_number", { ascending: false })
      .limit(1);

    if (lastErr) return sendError(res, 500, "Erro ao buscar último número");

    const nextNumber =
      last && last.length > 0 && last[0].order_number
        ? Number(last[0].order_number) + 1
        : 1;

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("orders")
      .insert([
        {
          restaurant_id,
          client_name,
          client_phone: normalizePhone(client_phone), // opcional
          order_number: nextNumber,
          itens: normalizedItems,
          notes: notes || "",
          status: "pending",
          service_type: finalServiceType,
          address: address || null,
          payment_method: payment_method || null,
          created_at: now,
          update_at: now,
        },
      ])
      .select()
      .single();

    if (error) return sendError(res, 500, "Erro ao criar pedido");
    return res.status(201).json(data);
  } catch (err) {
    return sendError(res, 500, "Erro ao criar pedido");
  }
});

/* ✅ ESSA ROTA ESTAVA FALTANDO (se não existir, o front dá 404) */
app.get("/orders/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .order("created_at", { ascending: true });

    if (error) return sendError(res, 500, "Erro ao listar pedidos");
    return res.json(data);
  } catch (err) {
    return sendError(res, 500, "Erro ao listar pedidos");
  }
});

app.patch("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!ALLOWED_STATUS.includes(status)) {
      return sendError(res, 400, "status inválido");
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("orders")
      .update({ status, update_at: now })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) return sendError(res, 500, "Erro ao atualizar pedido");
    return res.json(data);
  } catch (err) {
    return sendError(res, 500, "Erro ao atualizar pedido");
  }
});

app.delete("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) return sendError(res, 500, "Erro ao deletar pedido");

    return res.status(204).send();
  } catch (err) {
    return sendError(res, 500, "Erro ao deletar pedido");
  }
});

/* =========================
   CRM (com e sem telefone)
   - com telefone: agrupa por telefone
   - sem telefone: cria "anon-<orderId>" (1 por pedido)
========================= */
app.get("/crm/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;

    if (!restaurant_id) return sendError(res, 400, "restaurant_id é obrigatório");

    const plan = await getRestaurantPlan(restaurant_id);
    if (!canUseCRM(plan)) return sendError(res, 403, "Plano não permite acesso ao CRM");

    const exists = await restaurantExists(restaurant_id);
    if (!exists) return sendError(res, 404, "Restaurante não encontrado");

    const { data, error } = await supabase
      .from("orders")
      .select("id, client_name, client_phone, created_at")
      .eq("restaurant_id", restaurant_id)
      .order("created_at", { ascending: true });

    if (error) return sendError(res, 500, "Erro ao buscar CRM");

    const clients = Object.create(null);

    for (const o of data || []) {
      const phoneKey = normalizePhone(o.client_phone);
      const key = phoneKey || `anon-${o.id}`;

      if (!clients[key]) {
        clients[key] = {
          client_name: (o.client_name || "").trim() || "(Sem nome)",
          client_phone: phoneKey || "—",
          orders: 0,
          last_order_at: null,
        };
      }

      clients[key].orders += 1;

      const currTime = o.created_at ? new Date(o.created_at).getTime() : 0;
      const prevTime = clients[key].last_order_at
        ? new Date(clients[key].last_order_at).getTime()
        : 0;

      if (currTime >= prevTime) {
        clients[key].last_order_at = o.created_at || clients[key].last_order_at;
      }

      const name = String(o.client_name || "").trim();
      if (name && (currTime >= prevTime || !clients[key].client_name)) {
        clients[key].client_name = name;
      }
    }

    const result = Object.values(clients).sort((a, b) => {
      const ta = a.last_order_at ? new Date(a.last_order_at).getTime() : 0;
      const tb = b.last_order_at ? new Date(b.last_order_at).getTime() : 0;
      return tb - ta;
    });

    return res.json(result);
  } catch (err) {
    return sendError(res, 500, "Erro ao buscar CRM");
  }
});

/* =========================
   AUTH
========================= */
app.post("/auth/google", async (req, res) => {
  try {
    const { email } = req.body;

    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("email", email)
      .limit(1);

    if (error || !data || data.length === 0) {
      return res.status(403).json({ authorized: false });
    }

    return res.json({
      authorized: true,
      restaurant: data[0],
    });
  } catch (err) {
    return res.status(500).json({ error: "Erro inesperado" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
