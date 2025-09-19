// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const app = express();
app.use(cors());
app.use(express.json());

/** GET /products?q=  */
app.get('/products', async (req, res) => {
    try {
        const q = req.query.q;
        const where = q ? {
            OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } }
            ]
        } : {};
        const products = await prisma.product.findMany({ where });
        res.json(products);
    } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

/** GET /products/:id */
app.get('/products/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const product = await prisma.product.findUnique({ where: { id } });
        if (!product) return res.status(404).json({ error: 'product not found' });
        res.json(product);
    } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

/** POST /carts  Body: { items:[{product_id, qty}] } */
app.post('/carts', async (req, res) => {
    try {
        const items = req.body.items || [];
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items required' });

        // validate products exist & stock
        const productIds = items.map(i => i.product_id);
        const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
        if (products.length !== productIds.length) return res.status(404).json({ error: 'one or more products not found' });

        for (const it of items) {
            const p = products.find(pp => pp.id === it.product_id);
            if (!p) return res.status(404).json({ error: `product ${it.product_id} not found` });
            if (p.stock < it.qty) return res.status(400).json({ error: `insufficient stock for product ${p.id}` });
        }

        const cart = await prisma.cart.create({ data: {} });

        for (const it of items) {
            await prisma.cartItem.create({
                data: { cartId: cart.id, productId: it.product_id, qty: it.qty }
            });
        }

        const created = await prisma.cart.findUnique({
            where: { id: cart.id },
            include: { items: { include: { product: true } } }
        });

        res.status(201).json(created);
    } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

/** PATCH /carts/:id Body: { items:[{product_id, qty}] } - if qty=0 -> remove */
app.patch('/carts/:id', async (req, res) => {
    try {
        const cartId = parseInt(req.params.id);
        const items = req.body.items || [];
        const cart = await prisma.cart.findUnique({ where: { id: cartId } });
        if (!cart) return res.status(404).json({ error: 'cart not found' });

        for (const it of items) {
            const product = await prisma.product.findUnique({ where: { id: it.product_id } });
            if (!product) return res.status(404).json({ error: `product ${it.product_id} not found` });

            if (it.qty === 0) {
                await prisma.cartItem.deleteMany({ where: { cartId, productId: it.product_id } });
            } else {
                const existing = await prisma.cartItem.findFirst({ where: { cartId, productId: it.product_id } });
                if (existing) {
                    await prisma.cartItem.update({ where: { id: existing.id }, data: { qty: it.qty } });
                } else {
                    await prisma.cartItem.create({ data: { cartId, productId: it.product_id, qty: it.qty } });
                }
            }
        }

        const updated = await prisma.cart.findUnique({
            where: { id: cartId },
            include: { items: { include: { product: true } } }
        });

        res.json(updated);
    } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
