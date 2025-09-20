# Laburen E-Commerce WhatsApp Bot

Este proyecto es un bot de WhatsApp para un e-commerce, que permite listar productos, crear y actualizar carritos usando un modelo LLM (OpenRouter / GPT) y Twilio WhatsApp API.

---

## Requisitos

- Node.js >= 18
- npm o yarn
- PostgreSQL
- Cuenta de Twilio con sandbox de WhatsApp
- API Key de OpenRouter o similar (GPT)

---

## Instalación

1. Clonar el repositorio:

```bash
git clone https://github.com/tu-usuario/laburen-whatsapp-bot.git
cd laburen-whatsapp-bot

2. Instalar dependencias:
npm install
# o
yarn

3.Configurar PostgreSQL:

-- En psql o pgAdmin
CREATE USER laburen_user WITH PASSWORD 'laburen_pass';
CREATE DATABASE laburen_dev OWNER laburen_user;
GRANT ALL PRIVILEGES ON DATABASE laburen_dev TO laburen_user;

4 Ejecutar migraciones:
npx prisma migrate dev --name init

5. Configurar variables de entorno:
DATABASE_URL=postgresql://laburen_user:laburen_pass@localhost:5432/laburen_dev
PORT=4000

TWILIO_ACCOUNT_SID=XXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=XXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

OPENROUTER_API_KEY=sk-XXXXXXXXXXXXXXXXXXXXXXXX
API_BASE=http://localhost:3000

Scripts:

Levantar la API de productos y carritos:

node server.js


Levantar el bot de WhatsApp:

node src/whatsapp.js


El bot se comunica con la API de productos y carritos, y maneja carritos en memoria por usuario.


Agregar tu número al sandbox de WhatsApp de Twilio.

Enviar un mensaje de prueba, ejemplo:

"quiero 2 camisetas negras M"


El bot:

Consulta los productos disponibles

Crea un carrito o actualiza el existente

Si hay varias opciones ambiguas, pregunta cuál agregar

Estructura de carpetas
.
├─ src/
│  ├─ llm.js          # Manejo de LLM y lógica de acciones
│  ├─ whatsapp.js     # Servidor Express para Twilio WhatsApp
│  └─ ...             # Otros módulos
├─ prisma/             # Esquema y migraciones Prisma
├─ package.json
├─ README.md
└─ .env

Flujo de ejemplo

Usuario: quiero comprar camisas blancas

Bot: verifica si hay coincidencias múltiples

Bot: pregunta cuál agregar (subacción ask_specifications)

Usuario responde el número de la opción

Bot agrega al carrito y confirma

Notas

Mantener el carrito en memoria (userCarts[from]) permite no pedir ID cada vez.

ask_specifications se usa solo como subacción para resolver ambigüedad al crear o actualizar carrito.

Todos los precios y nombres de columnas deben coincidir con la base de datos.

Dependencias principales

express – Servidor HTTP

axios – Requests HTTP

twilio – WhatsApp API

prisma – ORM para PostgreSQL

node-fetch – Para llamar al LLM si no hay fetch global

Comandos rápidos resumen (copiar/pegar)
# 1. instalar deps
npm install
npm install -D prisma nodemon

# 2. configurar .env (editar manualmente)

# 3. prisma migrate
npx prisma migrate dev --name init
npx prisma generate

# 4. importar excel
node scripts/import_products.js

# 5. levantar server
npm run dev

# 6. exponer (en otra consola)
ngrok http 3000
# copiar la URL y pegar en Twilio Sandbox webhook