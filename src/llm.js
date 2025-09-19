// llm.js
const axios = require('axios');
const fetch = global.fetch || require('node-fetch');
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const API_BASE = process.env.API_BASE || 'http://localhost:3000';


async function askLLM(userText) {

    const system = `
Eres un asistente que interpreta mensajes de usuario para un e-commerce.
Devuelve solo JSON en este formato:
Acciones posibles:
- "list_products": listar productos (mostrar todos los resultados, aunque haya muchos).
- "get_product": ver un producto por id.
- "create_cart": crear un carrito con productos exactos.
- "update_cart": cuando el usuario ya tiene un carrito y quiere agregar más productos.
- "get_cart": mostrar el carrito existente.
- "ask_specifications": pedir aclaración cuando el usuario intenta agregar al carrito un producto ambiguo (ej: "quiero una remera" y hay muchas remeras).

Reglas:
- Usa "ask_specifications" solo si la intención es agregar al carrito y hay más de una coincidencia.
- En ese caso, devuelve en params.items[0].name el producto genérico (ej: "pantalón").

`;
    const body = {
        model: "gpt-3.5-turbo",
        messages: [
            { role: "system", content: system },
            { role: "user", content: userText }
        ],
        temperature: 0
    };

    try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`
            },
            body: JSON.stringify(body)
        });

        const raw = await res.text();
        if (!res.ok) return { action: "unknown", params: { message: raw } };

        let data;
        try { data = JSON.parse(raw); } catch {
            console.log("res", raw)
            return { action: "unknown", params: { message: "Respuesta no es JSON: " + raw } };
        }

        const text = data.choices?.[0]?.message?.content;
        try { return JSON.parse(text); } catch {
            console.log("res", raw)
            return { action: "unknown", params: { message: "LLM did not return parseable JSON" } };
        }
    } catch (err) {
        return { action: "unknown", params: { message: err.message } };
    }
}



async function doAction(parsed, from, userCarts) {
    const a = parsed.action;
    const p = parsed.params || {};

    if (a === 'list_products') {
        const queryParam = p.q ? `?q=${encodeURIComponent(p.q)}` : '';
        const r = await axios.get(`${API_BASE}/products${queryParam}`);
        return {
            action: a,
            text: `Encontré ${r.data.length} productos. Primeros 5: ${JSON.stringify(r.data.slice(0, 5))}`,
            raw: r.data
        };
    }

    if (a === 'get_product') {
        if (!p.id) return { action: a, text: "Necesito el id del producto.", raw: null };
        const r = await axios.get(`${API_BASE}/products/${p.id}`);
        return {
            action: a,
            text: `Producto: ${r.data.name} - $${r.data.price}`,
            raw: r.data
        };
    }

    if (a === 'create_cart') {
        const itemsWithIds = [];
        let ambiguousMatches = [];

        for (let item of p.items) {
            const res = await axios.get(`${API_BASE}/products?q=${encodeURIComponent(item.name)}`);
            if (res.data.length === 1) {
                itemsWithIds.push({ product_id: res.data[0].id, qty: item.qty });
            } else if (res.data.length > 1) {
                ambiguousMatches.push({ name: item.name, options: res.data });
            }
        }

        if (ambiguousMatches.length > 0) {
            return {
                action: "ask_specifications",
                text: `Encontré varias opciones para ${ambiguousMatches.map(m => m.name).join(", ")}. ¿Podés aclarar modelo, color o talla?`,
                raw: ambiguousMatches
            };
        }

        if (itemsWithIds.length === 0) {
            return { action: a, text: "No pude encontrar ninguno de los productos que mencionaste.", raw: [] };
        }

        // Crear carrito nuevo
        const r = await axios.post(`${API_BASE}/carts`, { items: itemsWithIds });
        userCarts[from] = r.data.id; // asociar carrito al usuario
        return {
            action: a,
            text: `Carrito creado (id ${r.data.id}) con ${r.data.items?.length || itemsWithIds.length} items`,
            raw: r.data
        };
    }

    if (a === 'update_cart') {
        if (!p.id) {
            return { action: a, text: "Necesito el id de tu carrito para agregar productos.", raw: null };
        }

        const itemsWithIds = [];
        let ambiguousMatches = [];

        for (let item of p.items) {
            const res = await axios.get(`${API_BASE}/products?q=${encodeURIComponent(item.name)}`);
            if (res.data.length === 1) {
                itemsWithIds.push({ product_id: res.data[0].id, qty: item.qty });
            } else if (res.data.length > 1) {
                ambiguousMatches.push({ name: item.name, options: res.data });
            }
        }

        if (ambiguousMatches.length > 0) {
            const msgs = ambiguousMatches.map(m => {
                const opciones = m.options
                    .slice(0, 5) // mostramos hasta 5 para no saturar
                    .map((p, idx) => `${idx + 1}. ${p.name} - $${p.price}`)
                    .join("\n");

                return `Para "${m.name}" encontré varias opciones:\n${opciones}`;
            });

            return {
                action: "ask_specifications",
                text: msgs.join("\n\n") + "\n\n❓ ¿Cuál de estas opciones querés agregar al carrito? (Responde con el número)",
                raw: ambiguousMatches
            };
        }

        if (itemsWithIds.length === 0) {
            return { action: a, text: "No encontré productos para agregar.", raw: [] };
        }

        // Agregar productos al carrito existente
        const r = await axios.put(`${API_BASE}/carts/${p.id}`, { items: itemsWithIds });
        return {
            action: a,
            text: `Carrito (id ${p.id}) actualizado con ${itemsWithIds.length} productos más`,
            raw: r.data
        };
    }

    if (a === 'get_cart') {
        if (!p.id) {
            return { action: a, text: "Necesito el id de tu carrito para mostrarlo.", raw: null };
        }
        const r = await axios.get(`${API_BASE}/carts/${p.id}`);
        if (!r.data || !r.data.items?.length) {
            return { action: a, text: `Tu carrito (id ${p.id}) está vacío.`, raw: r.data };
        }
        return {
            action: a,
            text: `Tu carrito (id ${p.id}) tiene ${r.data.items.length} productos: ${JSON.stringify(r.data.items)}`,
            raw: r.data
        };
    }

    return { action: "unknown", text: `No pude entender la acción. Detalle: ${JSON.stringify(p)}` };
}
// ---------- Función principal ----------

async function handleUserMessage(userMessage, from, userCarts) {
    const parsed = await askLLM(userMessage);

    if (parsed.action === "create_cart" && userCarts[from]) {
        parsed.action = "update_cart";
        parsed.params.id = userCarts[from];
    }

    return doAction(parsed);
}

module.exports = { handleUserMessage };
