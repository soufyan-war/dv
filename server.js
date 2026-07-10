require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();

// ⚠️ مهم جداً: express.json() خاصو يكون باش يقرا الـ body
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

// ============================================
// 1. Webhook Verification (GET)
// ============================================
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified');
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});

// ============================================
// 2. استقبال وإعادة توجيه بدون أي تعديل (POST)
// ============================================
app.post('/webhook', async (req, res) => {
    // ⚡ رد فوراً بـ 200 باش Meta ما تعيدش الإرسال
    res.sendStatus(200);

    // الـ body كما وصل بالضبط من WhatsApp
    const rawBody = req.body;

    console.log('📥 Webhook received:', JSON.stringify(rawBody, null, 2));

    // التوزيع على الجوج روابط بنفس البيانات الأصلية
    const endpoints = [
        process.env.ENDPOINT_ORDERS,
        process.env.ENDPOINT_MESSAGES,
    ];

    const forwardPromises = endpoints.map(async (url) => {
        if (!url) return;

        try {
            await axios.post(url, rawBody, {
                headers: {
                    'Content-Type': 'application/json',
                    // نقل Headers الأصلية من Meta (اختياري)
                    'X-Hub-Signature-256': req.headers['x-hub-signature-256'] || '',
                },
                timeout: 5000,
            });
            console.log(`✅ Forwarded → ${url}`);
        } catch (error) {
            console.error(`❌ Failed → ${url}:`, error.message);
        }
    });

    // تنفيذ التوازي بدون انتظار النتيجة
    Promise.allSettled(forwardPromises);
});

app.listen(PORT, () => {
    console.log(`🚀 Proxy Webhook Server on port ${PORT}`);
    console.log(`🔗 Orders:   ${process.env.ENDPOINT_ORDERS}`);
    console.log(`💬 Messages: ${process.env.ENDPOINT_MESSAGES}`);
});
