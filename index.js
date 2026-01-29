require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ============================================
// Configuration
// ============================================

const lineConfig = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// Create LINE client
const lineClient = new line.messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// Create Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// Express app
const app = express();

// ============================================
// Conversation History Management
// ============================================

// Store conversation history (in-memory, reset on restart)
// Key: unique ID (groupId or oderId)
// Value: array of messages { role: 'user'|'model', parts: [{ text: string }] }
const conversationHistory = new Map();

// Maximum messages to keep per conversation
const MAX_HISTORY_LENGTH = 20;

// Get or create conversation history
function getHistory(conversationId) {
    if (!conversationHistory.has(conversationId)) {
        conversationHistory.set(conversationId, []);
    }
    return conversationHistory.get(conversationId);
}

// Add message to history
function addToHistory(conversationId, role, content) {
    const history = getHistory(conversationId);
    history.push({ role, parts: [{ text: content }] });

    // Trim history if too long
    if (history.length > MAX_HISTORY_LENGTH) {
        history.splice(0, history.length - MAX_HISTORY_LENGTH);
    }
}

// Clear conversation history
function clearHistory(conversationId) {
    conversationHistory.delete(conversationId);
}

// ============================================
// Gemini AI Integration
// ============================================

async function getChatResponse(conversationId, userMessage) {
    const history = getHistory(conversationId);

    try {
        const chat = model.startChat({
            history: history,
            generationConfig: {
                maxOutputTokens: 1024,
            },
            systemInstruction: `あなたは親切で役立つAIアシスタントです。
日本語で簡潔に、わかりやすく回答してください。
LINEでの会話なので、長すぎる返答は避けてください。
絵文字を適度に使用して、フレンドリーな雰囲気を心がけてください。`,
        });

        const result = await chat.sendMessage(userMessage);
        const response = await result.response;
        const assistantMessage = response.text();

        // Add messages to history
        addToHistory(conversationId, 'user', userMessage);
        addToHistory(conversationId, 'model', assistantMessage);

        return assistantMessage;
    } catch (error) {
        console.error('Gemini API error:', error);
        throw error;
    }
}

// ============================================
// LINE Webhook Handler
// ============================================

app.post('/webhook', line.middleware(lineConfig), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error('Webhook error:', err);
            res.status(500).end();
        });
});

// Health check endpoint
app.get('/', (req, res) => {
    res.send('LINE AI Chatbot is running! 🤖 (Powered by Gemini)');
});

// ============================================
// Event Handler
// ============================================

async function handleEvent(event) {
    console.log('Event received:', JSON.stringify(event, null, 2));

    // Only handle text messages
    if (event.type !== 'message' || event.message.type !== 'text') {
        return null;
    }

    const userMessage = event.message.text;

    // Determine conversation ID (group or 1:1)
    const conversationId = event.source.groupId ||
        event.source.roomId ||
        event.source.userId;

    // Special commands
    if (userMessage === 'リセット' || userMessage === '/reset') {
        clearHistory(conversationId);
        return lineClient.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: 'text',
                text: '会話履歴をリセットしました！🔄\n新しい会話を始めましょう！'
            }]
        });
    }

    if (userMessage === 'ヘルプ' || userMessage === '/help') {
        return lineClient.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: 'text',
                text: '🤖 LINE AI Chatbot (Gemini)\n\n' +
                    '話しかけるとAIが応答します！\n\n' +
                    '【コマンド】\n' +
                    '・リセット - 会話履歴をクリア\n' +
                    '・ヘルプ - この説明を表示\n\n' +
                    '何でも聞いてください！😊'
            }]
        });
    }

    try {
        // Get AI response
        const aiResponse = await getChatResponse(conversationId, userMessage);

        // Split long messages (LINE limit is 5000 chars)
        const messages = splitMessage(aiResponse, 4500);

        return lineClient.replyMessage({
            replyToken: event.replyToken,
            messages: messages.map(text => ({ type: 'text', text }))
        });
    } catch (error) {
        console.error('Error processing message:', error);

        return lineClient.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: 'text',
                text: '申し訳ありません、エラーが発生しました。🙇\nしばらくしてからもう一度お試しください。'
            }]
        });
    }
}

// ============================================
// Utility Functions
// ============================================

// Split long message into chunks
function splitMessage(text, maxLength) {
    if (text.length <= maxLength) {
        return [text];
    }

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        // Find a good break point
        let breakPoint = remaining.lastIndexOf('\n', maxLength);
        if (breakPoint === -1 || breakPoint < maxLength / 2) {
            breakPoint = remaining.lastIndexOf('。', maxLength);
        }
        if (breakPoint === -1 || breakPoint < maxLength / 2) {
            breakPoint = remaining.lastIndexOf(' ', maxLength);
        }
        if (breakPoint === -1 || breakPoint < maxLength / 2) {
            breakPoint = maxLength;
        }

        chunks.push(remaining.substring(0, breakPoint + 1));
        remaining = remaining.substring(breakPoint + 1);
    }

    return chunks;
}

// ============================================
// Start Server
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🤖 LINE AI Chatbot is running on port ${PORT}`);
    console.log('Powered by Google Gemini');
    console.log('Webhook URL: https://your-app.onrender.com/webhook');
    console.log('');
    console.log('Commands:');
    console.log('  リセット - Clear conversation history');
    console.log('  ヘルプ - Show help message');
});
