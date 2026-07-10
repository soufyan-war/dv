require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

// ============================================
// 1. التحقق من الـ Webhook (مطلوب من Meta)
// ============================================
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified successfully');
        return res.status(200).send(challenge);
    }

    console.log('❌ Webhook verification failed');
    return res.sendStatus(403);
});

// ============================================
// 2. استقبال وتوزيع أحداث WhatsApp
// ============================================
app.post('/webhook', async (req, res) => {
    // ⚡ رد بـ 200 فوراً باش Meta ما تعيدش الإرسال
    res.sendStatus(200);

    try {
        const body = req.body;

        if (body.object !== 'whatsapp_business_account') {
            console.log('⏭️ تجاهل حدث غير تابع لـ WhatsApp');
            return;
        }

        // استخراج جميع التغييرات من الـ payload
        const changes = body.entry?.flatMap(entry => entry.changes) || [];

        for (const change of changes) {
            const value = change.value;

            // توزيع حسب نوع الحدث
            if (value.messages || value.contacts) {
                // 📨 رسائل واردة من العملاء
                await forwardToEndpoint(
                    process.env.ENDPOINT_MESSAGES,
                    'messages',
                    value
                );
            }

            if (value.statuses) {
                // 📊 تحديثات حالة الرسائل (sent, delivered, read, failed)
                await forwardToEndpoint(
                    process.env.ENDPOINT_ORDERS,
                    'statuses',
                    value
                );
            }

            if (value.errors) {
                // ❌ أخطاء API
                console.error('⚠️ WhatsApp API Error:', value.errors);
            }
        }

    } catch (error) {
        console.error('❌ Error processing webhook:', error.message);
    }
});

// ============================================
// 3. دالة التوزيع (Forwarding Function)
// ============================================
async function forwardToEndpoint(url, eventType, data) {
    if (!url) {
        console.warn(`⚠️ Endpoint غير محدد للحدث: ${eventType}`);
        return;
    }

    try {
        const response = await axios.post(url, {
            event_type: eventType,
            timestamp: new Date().toISOString(),
            data: data,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Secret': process.env.WEBHOOK_VERIFY_TOKEN,
            },
            timeout: 5000,
        });

        console.log(`✅ تم توجيه [${eventType}] → ${url} (${response.status})`);

    } catch (error) {
        console.error(
            `❌ فشل توجيه [${eventType}] → ${url}:`,
            error.response?.status || error.message
        );
    }
}

// ============================================
// 4. تشغيل السيرفر
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Webhook Server running on port ${PORT}`);
    console.log(`📡 GET  /webhook → Verification`);
    console.log(`📥 POST /webhook → Receive & Distribute`);
    console.log(`🔗 Orders Endpoint: ${process.env.ENDPOINT_ORDERS}`);
    console.log(`💬 Messages Endpoint: ${process.env.ENDPOINT_MESSAGES}`);
});
