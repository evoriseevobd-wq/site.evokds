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

  if (error) {
    throw new Error("Erro ao validar restaurante");
  }

  return data && data.length > 0;
}

app.post("/orders", async (req, res) => {
  try {
    const {
      restaurant_id,
      client_name,
      items,
      itens,
      notes,
      service_type,
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
    if (!exists) {
      return sendError(res, 404, "Restaurante não encontrado");
    }

    const { data: last, error: lastErr } = await supabase
      .from("orders")
      .select("order_number")
      .eq("restaurant_id", restaurant_id)
      .order("order_number", { ascending: false })
      .limit(1);

    if (lastErr) {
      console.error("Erro ao buscar último número:", lastErr);
      return sendError(res, 500, "Erro ao buscar último número");
    }

    const nextNumber =
      last && last.length > 0 && last[0].order_number
        ? Number(last[0].order_number) + 1
        : 1;

    const now = new Date().toISOString();
    const serviceType = service_type || "local"; // ⬅️ LOCAL como padrão

    const { data, error } = await supabase
      .from("orders")
      .insert([
        {
          restaurant_id,
          client_name,
          order_number: nextNumber,
          itens: normalizedItems,
          notes: notes || "",
          status: "pending",
          created_at: now,
          update_at: now,
          service_type: serviceType, // ⬅️ campo novo
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Erro ao criar pedido:", error);
      return sendError(res, 500, "Erro ao criar pedido");
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error("Erro inesperado ao criar pedido:", err);
    return sendError(res, 500, "Erro ao criar pedido");
  }
});

app.get("/orders/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    if (!restaurant_id) {
      return sendError(res, 400, "restaurant_id é obrigatório");
    }

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erro ao listar pedidos:", error);
      return sendError(res, 500, "Erro ao listar pedidos");
    }

    return res.json(data);
  } catch (err) {
    console.error("Erro inesperado ao listar pedidos:", err);
    return sendError(res, 500, "Erro ao listar pedidos");
  }
});

app.patch("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!id || !status) {
      return sendError(res, 400, "id e status são obrigatórios");
    }
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

    if (error) {
      console.error("Erro ao atualizar pedido:", error);
      return sendError(res, 500, "Erro ao atualizar pedido");
    }
    if (!data) {
      return sendError(res, 404, "Pedido não encontrado");
    }

    return res.json(data);
  } catch (err) {
    console.error("Erro inesperado ao atualizar pedido:", err);
    return sendError(res, 500, "Erro ao atualizar pedido");
  }
});

app.delete("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, 400, "id é obrigatório");
    }

    const { error } = await supabase.from("orders").delete().eq("id", id);

    if (error) {
      console.error("Erro ao deletar pedido:", error);
      return sendError(res, 500, "Erro ao deletar pedido");
    }

    return res.status(204).send();
  } catch (err) {
    console.error("Erro inesperado ao deletar pedido:", err);
    return sendError(res, 500, "Erro ao deletar pedido");
  }
});

app.post("/auth/google", async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email é obrigatório" });
    }

    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("email", email)
      .limit(1);

    if (error) {
      console.error("Erro ao buscar restaurante:", error);
      return res.status(500).json({ error: "Erro ao buscar restaurante" });
    }

    if (!data || data.length === 0) {
      return res.status(403).json({
        authorized: false,
        message:
          "Seu acesso ainda não está liberado. Entre em contato com a Everrise para agendar sua demonstração.",
        contact_link: "link site", // altere para seu WhatsApp
      });
    }

    return res.json({
      authorized: true,
      restaurant: data[0],
    });
  } catch (err) {
    console.error("Erro inesperado:", err);
    return res.status(500).json({ error: "Erro inesperado" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
