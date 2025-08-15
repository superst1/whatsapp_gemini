import express from 'express';
import serverless from 'serverless-http';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(express.json());

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// ✅ Ruta raíz del archivo, no /api/whatsapp
app.get('/', (req, res) => {
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === WHATSAPP_VERIFY_TOKEN
  ) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.status(403).send('Token de verificación incorrecto');
  }
});

app.post('/', async (req, res) => {
  const entry = req.body.entry?.[0];
  const change = entry?.changes?.[0];
  const messageData = change?.value?.messages?.[0];

  if (messageData?.type !== 'text' || !WHATSAPP_TOKEN) {
    return res.sendStatus(200);
  }

  const from = messageData.from;
  const userMessage = messageData.text.body;

  try {
    const result = await model.generateContent(userMessage);
    const response = await result.response;
    let geminiResponse = response.text();
    geminiResponse = geminiResponse.replace(/\*/g, '_');

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

    res.sendStatus(200);
  } catch (error) {
    console.error('Error al procesar el mensaje:', error.response ? error.response.data : error.message);
    res.sendStatus(500);
  }
});

// ✅ Exportación correcta para Vercel
export default serverless(app);
