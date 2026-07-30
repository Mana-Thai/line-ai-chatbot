// SCB Connect の通知スクリーンショットから項目を読み取る。
// モデルには「カードに書かれている文字列をそのまま返す」ことだけをさせ、
// 意味の解釈(入出金・相手口座の判定など)は lib/scb.js の決定的な処理に任せる。
// → モデルを差し替えても家計簿側のロジックは変わらない。
const C = require('../shared/constants');

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const EXTRACTION_PROMPT = `You are reading a screenshot of a Thai bank (SCB Connect) transaction notification card sent on LINE.

Transcribe the card fields EXACTLY as printed. Do not translate, do not reformat numbers, do not fill in anything you cannot see.

Return ONLY a JSON object with these string keys (use "" when the field is not visible):
{
  "header": "the title line and the signed amount, e.g. \\"รายการเงินออก -115.00 บาท\\"",
  "from": "the value next to จากบัญชี (name + masked account + bank, e.g. \\"SANGNAPA MANE X-4314 ไทยพาณิชย์\\")",
  "to": "the value next to เข้าบัญชี",
  "datetime": "the value next to วันที่/เวลา, e.g. \\"30/07/2026 17:18\\"",
  "balance": "the value next to ยอดเงินที่ใช้ได้, e.g. \\"650.97 บาท\\"",
  "isNotification": true if this image really is a bank transaction notification card, otherwise false
}

Keep Thai text in Thai script. Keep the +/- sign of the amount.`;

const FIELD_KEYS = ['header', 'from', 'to', 'datetime', 'balance'];

class VisionError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

function isEnabled() {
    return !!process.env.GEMINI_API_KEY;
}

// dataURL(data:image/jpeg;base64,....)を base64 と MIME に分解する
function parseDataUrl(dataUrl) {
    const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw new VisionError('画像の形式が不正です(PNG/JPEG/WebPのみ)', 'bad_image');
    if (dataUrl.length > C.MAX_IMAGE_DATAURL_LENGTH) {
        throw new VisionError('画像が大きすぎます(縮小して再度お試しください)', 'image_too_large');
    }
    return { mimeType: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], data: m[2] };
}

// モデル出力(JSON文字列)から、必要なキーだけを文字列として取り出す
function pickFields(text) {
    const trimmed = String(text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        throw new VisionError('解析結果を読み取れませんでした', 'bad_response');
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new VisionError('解析結果を読み取れませんでした', 'bad_response');
    }
    const fields = {};
    for (const key of FIELD_KEYS) {
        fields[key] = typeof parsed[key] === 'string' ? parsed[key] : '';
    }
    fields.isNotification = parsed.isNotification !== false;
    return fields;
}

async function callGemini(dataUrl) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new VisionError('GEMINI_API_KEY が設定されていません', 'not_configured');
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const image = parseDataUrl(dataUrl);
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: DEFAULT_MODEL,
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    const result = await model.generateContent(
        [{ inlineData: { data: image.data, mimeType: image.mimeType } }, EXTRACTION_PROMPT],
        { timeout: 30000 },
    );
    return pickFields(result.response.text());
}

// スクショ1枚 → 通知カードの生文字列(意味の解釈はしない)
async function extractFields(dataUrl) {
    return callGemini(dataUrl);
}

module.exports = { isEnabled, extractFields, parseDataUrl, pickFields, VisionError, EXTRACTION_PROMPT, DEFAULT_MODEL };
