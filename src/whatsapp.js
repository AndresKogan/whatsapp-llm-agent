// whatsapp.js
const express = require("express");
const router = express.Router();
const { handleUserMessage } = require("./llm");
const twilio = require("twilio");

const userCarts = {}; // Guarda el carrito por usuario
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";

// ---------- Funciones de formato ----------
function formatProductsForWhatsApp(products) {
    if (!products || products.length === 0) return "No encontré productos.";

    const firstFive = products.slice(0, 5);
    const lines = firstFive.map((p, idx) => {
        return `${idx + 1}. ${p.tipoPrenda} - $${p.price50 || "?"} - ${p.color || "sin color"} - ${p.talla || "sin talla"}`;
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

        if (responseText) {
            // ---------- LIST PRODUCTS ----------
            if (responseText.action === "list_products" && responseText.raw) {
                messageToSend = formatProductsForWhatsApp(responseText.raw);
            }

            // ---------- CREATE CART / GET CART ----------
            else if (["create_cart", "get_cart"].includes(responseText.action) && responseText.raw) {
                messageToSend = formatCartForWhatsApp(responseText.raw);
            }

            // ---------- ASK SPECIFICATIONS ----------
            if (responseText.subaction === "ask_specifications") {
                const lines = responseText.params.items.map((item) => {
                    return item.options
                        .slice(0, 5)
                        .map((p, idx) => `${idx + 1}. ${p.tipoPrenda} - $${p.price50} - ${p.color || "sin color"} - ${p.talla || "sin talla"}`)
                        .join("\n");
                });

                messageToSend = `❓ ${responseText.text}\nOpciones disponibles:\n` + lines.join("\n\n");
            }
        }

        // ---------- Enviar mensaje por Twilio ----------
        await client.messages.create({
            from: TWILIO_WHATSAPP_NUMBER,
            to: from,
            body: messageToSend
        });

        // Responder OK a Twilio
        res.set("Content-Type", "text/xml");
        res.send(`<Response></Response>`);

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

        res.set("Content-Type", "text/xml");
        res.send(`<Response></Response>`);
    }
});

module.exports = router;
