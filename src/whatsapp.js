// whatsapp.js
const express = require("express");
const router = express.Router();
const { handleUserMessage } = require("./llm");

const userCarts = {}; // Guarda el carrito por número de usuario

// ---------- Funciones de formato ----------
function formatProductsForWhatsApp(products) {
  if (!products || products.length === 0) return "No encontré productos.";

  const firstFive = products.slice(0, 5);
  const lines = firstFive.map((p, idx) => {
    return `${idx + 1}. ${p.tipoPrenda} - $${p.price50} - ${p.color || "sin color"}`;
  });

  return "Productos encontrados:\n" + lines.join("\n");
}

function formatCartForWhatsApp(cart) {
  if (!cart || !cart.items || cart.items.length === 0) {
    return `Tu carrito${cart?.id ? " (id " + cart.id + ")" : ""} está vacío.`;
  }

  const lines = cart.items.map((item, idx) => {
    return `${idx + 1}. ${item.product?.tipoPrenda || "Producto"} x${item.qty} - $${item.product?.price50 || "?"}`;
  });

  return `🛒 Carrito (id ${cart.id}) con ${cart.items.length} items:\n` + lines.join("\n");
}

// ---------- Endpoint /whatsapp ----------
router.post("/whatsapp", async (req, res) => {
  console.log("Incoming WhatsApp message:", req.body);

  const incomingMsg = req.body.Body ?? req.body.body;
  const from = req.body.From ?? req.body.from;


  try {
    const responseText = await handleUserMessage(incomingMsg, from, userCarts);

    let messageToSend = responseText.text;
    console.log("Response from LLM:", responseText);
    if (responseText.raw) {
      if (responseText.action === "list_products") {
        messageToSend = formatProductsForWhatsApp(responseText.raw);
      } else if (["create_cart", "get_cart"].includes(responseText.action)) {
        messageToSend = formatCartForWhatsApp(responseText.raw);
      } else if (responseText.action === "ask_specifications") {
        if (responseText.raw[0]?.options) {
          messageToSend = `❓ ${responseText.text}\nOpciones disponibles:\n` +
            responseText.raw[0].options
              .map((p, idx) => `${idx + 1}. ${p.tipoPrenda} - $${p.price50}`)
              .join("\n");
        } else {
          // fallback si no hay options
          messageToSend = `❓ ${responseText.text}`;
        }
      }

    }

    // 🔹 Respuesta en TwiML (simula Twilio)
    res.set("Content-Type", "text/xml");
    res.send(`<Response><Message>${messageToSend}</Message></Response>`);
  } catch (err) {
    console.error("Error en /whatsapp:", err);
    res.set("Content-Type", "text/xml");
    res.send(`<Response><Message>⚠️ Ocurrió un error procesando tu mensaje. Intenta de nuevo.</Message></Response>`);
  }
});

module.exports = router;
