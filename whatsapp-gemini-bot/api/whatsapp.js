JavaScript
// Importar las librerías necesarias
const express = require('express');
const serverless = require('serverless-http'); // 👈 Esta línea es nueva
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inicializar Express
const app = express();
app.use(express.json());

// --- CONFIGURACIÓN DE VARIABLES DE ENTORNO ---
// Estas variables se configurarán en Vercel, no aquí directamente.
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Inicializar el cliente de Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// --- RUTA PARA LA VERIFICACIÓN DEL WEBHOOK DE WHATSAPP ---
// Esta ruta se usa solo una vez, cuando configuras el webhook en Meta.
app.get('/api/whatsapp', (req, res) => {
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === WHATSAPP_VERIFY_TOKEN
  ) {
    res.send(req.query['hub.challenge']);
  } else {
    res.status(400).send('Error, token de verificación no coincide');
  }
});

// --- RUTA PARA RECIBIR MENSAJES DE WHATSAPP ---
// Esta es la ruta principal que se ejecutará cada vez que un usuario envíe un mensaje.
app.post('/api/whatsapp', async (req, res) => {
  const entry = req.body.entry?.[0];
  const change = entry?.changes?.[0];
  const messageData = change?.value?.messages?.[0];

  // Si no es un mensaje de texto o el token no está configurado, no hacemos nada.
  if (messageData?.type !== 'text' || !WHATSAPP_TOKEN) {
    return res.sendStatus(200); // Respondemos OK para que WhatsApp no reintente
  }

  const from = messageData.from; // Número de teléfono del usuario
  const userMessage = messageData.text.body; // Mensaje del usuario

  try {
    // 1. Enviar el mensaje del usuario a Gemini
    const result = await model.generateContent(userMessage);
    const response = await result.response;
    let geminiResponse = response.text();

    // Limpieza básica de la respuesta de Gemini (opcional pero recomendado)
    geminiResponse = geminiResponse.replace(/\*/g, '_'); // Reemplaza asteriscos para evitar formato no deseado

    // 2. Enviar la respuesta de Gemini de vuelta al usuario por WhatsApp
    await axios.post(
      `https://graph.facebook.com/v19.0/${change.value.metadata.phone_number_id}/messages`,
      {
        messaging_product: 'whatsapp',
        to: from,
        text: { body: geminiResponse },
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Respondemos OK a WhatsApp para confirmar que recibimos el mensaje.
    res.sendStatus(200);

  } catch (error) {
    console.error('Error al procesar el mensaje:', error.response ? error.response.data : error.message);
    res.sendStatus(500); // Informamos un error en el servidor
  }
});

// Exportar la app para que Vercel la pueda usar
module.exports = serverless(app); //👈 Esta línea reemplaza el antiguo `module.exports = app`
