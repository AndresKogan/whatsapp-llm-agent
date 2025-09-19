// src/agent.js
require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const whatsappRouter = require("./whatsapp"); // importa el router
app.use("/", whatsappRouter);




// HTTP endpoint for testing the agent via Postman
app.post('/agent', async (req, res) => {
    try {
        const userText = req.body.text;
        const parsed = await askLLM(userText);
        const result = await doAction(parsed);
        res.json({ parsed, result });
    } catch (err) {
        console.error(err); res.status(500).json({ error: 'agent error' });
    }
});

const PORT = process.env.AGENT_PORT || 4000;
app.listen(PORT, () => console.log(`Agent listening on ${PORT}`));
