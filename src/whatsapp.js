const express = require("express");
const router = express.Router();
const { handleUserMessage } = require("./llm");
const twilio = require("twilio");

const userCarts = {};
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";


function formatProductsForWhatsApp(products) {
  if (!products || products.length === 0) return "No encontré productos.";

  const firstFive = products.slice(0, 5);
  const lines = firstFive.map((p, idx) => {
    return `${idx + 1}. ${p.name} - $${p.price} - ${p.color || 'sin color'}`;
  });

  return "Productos encontrados:\n" + lines.join("\n");
}

function formatCartForWhatsApp(cart) {
  console.log("carto", cart)
  if (!cart || !cart.items || cart.items.length === 0) {
    return `Tu carrito${cart?.id ? " (id " + cart.id + ")" : ""} está vacío.`;
  }

  const lines = cart.items.map((item, idx) => {
    return `${idx + 1}. ${item.product?.name || "Producto"} x${item.qty} - $${item.product?.price || "?"}`;
  });

  return `🛒 Carrito (id ${cart.id}) con ${cart.items.length} items:\n` + lines.join("\n");
}

router.post("/whatsapp", async (req, res) => {
  console.log("Incoming WhatsApp message:", req.body);
  const incomingMsg = req.body.Body;
  const from = req.body.From;


  try {
    const responseText = await handleUserMessage(incomingMsg, from, userCarts);

    let messageToSend = responseText.text;
    if (responseText.raw) {
      if (responseText.action === "list_products") {
        messageToSend = formatProductsForWhatsApp(responseText.raw);
      } else if (["create_cart", "get_cart"].includes(responseText.action)) {
        messageToSend = formatCartForWhatsApp(responseText.raw);
      } else if (responseText.action === "ask_specifications") {
        messageToSend = `❓ ${responseText.text}\nOpciones disponibles:\n` +
          responseText.raw[0].options.map((p, idx) => `${idx + 1}. ${p.name} - $${p.price}`).join("\n");
      }
    }
    await client.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to: from,
      body: messageToSend
    });

  } catch (err) {
    console.error("Error en /whatsapp:", err);
    try {
      await client.messages.create({
        from: TWILIO_WHATSAPP_NUMBER,
        to: from,
        body: "⚠️ Ocurrió un error procesando tu mensaje. Intenta de nuevo."
      });
    } catch (e) {
      console.error("Error enviando mensaje de fallo:", e);
    }

  }
});

module.exports = router;
