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
- "ask_specifications": pedir aclaración cuando el usuario intenta agregar al carrito un producto ambiguo (ej: "quiero una remera" y hay muchas remeras). SOLO para agregar al carrito se puede usar esta acción
Querys posibles en params:
    -ID, 
    -TIPO_PRENDA, 
    -TALLA, 
    -COLOR,
    -CANTIDAD_DISPONIBLE,
    -PRECIO_50_U, 
    -PRECIO_100_U, 
    -PRECIO_200_U,
    -DISPONIBLE, 
    -CATEGORÍA, 
    -DESCRIPCIÓN

Reglas:
- Usa "ask_specifications" solo si la intención es agregar al carrito y hay más de una coincidencia.
- En ese caso, devuelve en params.items[0].tipoPrenda el producto genérico (ej: "pantalón").
- Para filtrar los productos debes usar los nombres de las columnas de la base de datos que son: 
    -ID, 
    -TIPO_PRENDA, 
    -TALLA, 
    -COLOR,
    -CANTIDAD_DISPONIBLE,
    -PRECIO_50_U, 
    -PRECIO_100_U, 
    -PRECIO_200_U,
    -DISPONIBLE, 
    -CATEGORÍA, 
    -DESCRIPCIÓN
-el color siempre es singular masculino (ej: "rojo", "azul", "verde").

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
            return { action: "unknown", params: { message: "Respuesta no es JSON: " + raw } };
        }

        const text = data.choices?.[0]?.message?.content;
        try { return JSON.parse(text); } catch {
            console.log("res", raw)
            return { action: "unknown", params: { message: "LLM did not return parseable JSON" } };
        }
    } catch (err) {
        console.log("Aaaaaa")
        return { action: "unknown", params: { message: err.message } };
    }
}

async function doAction(parsed, from, userCarts) {
    const a = parsed.action;
    const p = parsed.params || {};

    console.log("doAction -> action:", a, "params:", p);

    // ---------------- LIST PRODUCTS ----------------
    if (a === 'list_products') {
        const queryParts = [];
        for (const key in p) {
            if (p[key]) {
                queryParts.push(`${encodeURIComponent(key.toLowerCase())}=${encodeURIComponent(p[key])}`);
            }
        }
        const queryParam = queryParts.length > 0 ? `?${queryParts.join("&")}` : '';
        console.log("queryParam", queryParam);

        const r = await axios.get(`${API_BASE}/products${queryParam}`);
        console.log("r", r.data);

        return {
            action: a,
            text: `Encontré ${r.data.length} productos. Primeros 5: ${JSON.stringify(r.data.slice(0, 5))}`,
            raw: r.data
        };

    }

    // ---------------- GET PRODUCT ----------------
    if (a === 'get_product') {
        if (!p.id) return { action: a, text: "Necesito el id del producto.", raw: null };
        const r = await axios.get(`${API_BASE}/products/${p.id}`);
        return {
            action: a,
            text: `Producto: ${r.data.tipoPrenda} - $${r.data.price50}`,
            raw: r.data
        };
    }

    // ---------------- CREATE CART ----------------
    if (a === 'create_cart') {
        const itemsWithIds = [];
        const ambiguousMatches = [];

        for (let item of p.items || []) {
            const res = await axios.get(`${API_BASE}/products?q=${encodeURIComponent(item.tipoPrenda)}`);
            const matches = res.data.filter(prod => {
                // Filtra por color, talla y precio si están en params
                if (item.color && prod.color?.toLowerCase() !== item.color.toLowerCase()) return false;
                if (item.talla && prod.talla?.toLowerCase() !== item.talla.toLowerCase()) return false;
                if (item.price50 && prod.price50 !== item.price50) return false;
                return true;
            });

            if (matches.length === 1) {
                itemsWithIds.push({ product_id: matches[0].id, qty: item.qty });
            } else if (matches.length > 1) {
                ambiguousMatches.push({ tipoPrenda: item.tipoPrenda, options: matches });
            }
        }

        if (ambiguousMatches.length > 0) {
            return {
                action: "ask_specifications",
                text: `Encontré varias opciones para ${ambiguousMatches.map(m => m.tipoPrenda).join(", ")}. ¿Podés aclarar modelo, color o talla?`,
                raw: ambiguousMatches
            };
        }

        if (itemsWithIds.length === 0) {
            return { action: a, text: "No pude encontrar ninguno de los productos que mencionaste.", raw: [] };
        }

        const r = await axios.post(`${API_BASE}/carts`, { items: itemsWithIds });
        userCarts[from] = r.data.id;
        return {
            action: a,
            text: `Carrito creado (id ${r.data.id}) con ${r.data.items?.length || itemsWithIds.length} items`,
            raw: r.data
        };
    }

    // ---------------- UPDATE CART ----------------
    if (a === 'update_cart') {
        if (!p.id) return { action: a, text: "Necesito el id de tu carrito para agregar productos.", raw: null };

        const itemsWithIds = [];
        const ambiguousMatches = [];

        for (let item of p.items || []) {
            const res = await axios.get(`${API_BASE}/products?q=${encodeURIComponent(item.tipoPrenda)}`);
            const matches = res.data.filter(prod => {
                if (item.color && prod.color?.toLowerCase() !== item.color.toLowerCase()) return false;
                if (item.talla && prod.talla?.toLowerCase() !== item.talla.toLowerCase()) return false;
                if (item.price50 && prod.price50 !== item.price50) return false;
                return true;
            });

            if (matches.length === 1) {
                itemsWithIds.push({ product_id: matches[0].id, qty: item.qty });
            } else if (matches.length > 1) {
                ambiguousMatches.push({ tipoPrenda: item.tipoPrenda, options: matches });
            }
        }

        if (ambiguousMatches.length > 0) {
            const msgs = ambiguousMatches.map(m => {
                const opciones = m.options
                    .slice(0, 5)
                    .map((p, idx) => `${idx + 1}. ${p.tipoPrenda} - $${p.price50} - ${p.color || "sin color"} - ${p.talla || "sin talla"}`)
                    .join("\n");
                return `Para "${m.tipoPrenda}" encontré varias opciones:\n${opciones}`;
            });

            return {
                action: "ask_specifications",
                text: msgs.join("\n\n") + "\n\n❓ ¿Cuál de estas opciones querés agregar al carrito? (Responde con el número)",
                raw: ambiguousMatches
            };
        }

        if (itemsWithIds.length === 0) return { action: a, text: "No encontré productos para agregar.", raw: [] };

        const r = await axios.put(`${API_BASE}/carts/${p.id}`, { items: itemsWithIds });
        return {
            action: a,
            text: `Carrito (id ${p.id}) actualizado con ${itemsWithIds.length} productos más`,
            raw: r.data
        };
    }

    // ---------------- GET CART ----------------
    if (a === 'get_cart') {
        if (!p.id) return { action: a, text: "Necesito el id de tu carrito para mostrarlo.", raw: null };
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

    // ---------------- ASK SPECIFICATIONS ----------------
    if (a === 'ask_specifications') {
        return {
            action: a,
            text: p.text || "Necesito que especifiques el producto que querés agregar al carrito.",
            raw: p.items || []
        };
    }

    // ---------------- UNKNOWN ----------------
    return { action: "unknown", text: `No pude entender la acción. Detalle: ${JSON.stringify(p)}` };
}



// ---------- Función principal ----------

async function handleUserMessage(userMessage, from, userCarts) {
    const parsed = await askLLM(userMessage);
    console.log("userMessage", userMessage);
    if (parsed.action === "create_cart" && userCarts[from]) {
        parsed.action = "update_cart";
        parsed.params.id = userCarts[from];
    }

    return doAction(parsed);
}

module.exports = { handleUserMessage, askLLM, doAction };
