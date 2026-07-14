// 認証まわり:LINE IDトークンの検証と、アプリ内セッショントークンの発行/検証
const crypto = require('crypto');

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12時間

// ローカル開発専用:LINEログインなしで名前だけでログインできるモード
const DEV_MODE = process.env.ALLOW_INSECURE_DEV === '1';

function base64url(buf) {
    return Buffer.from(buf).toString('base64url');
}

function sign(data) {
    return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}

// セッショントークン発行: base64url(JSONペイロード) + "." + HMAC署名
function issueToken(user) {
    const payload = base64url(JSON.stringify({
        userId: user.userId,
        name: user.name,
        admin: !!user.admin,
        exp: Date.now() + TOKEN_TTL_MS,
    }));
    return `${payload}.${sign(payload)}`;
}

// 検証OKなら { userId, name, admin } を返し、無効なら null
function verifyToken(token) {
    if (typeof token !== 'string') return null;
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = sign(payload);
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    let data;
    try {
        data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (!data.userId || !data.exp || data.exp < Date.now()) return null;
    return { userId: data.userId, name: data.name || '名前未設定', admin: !!data.admin };
}

// LIFFのIDトークンをLINEの検証エンドポイントで確認し、プロフィールを返す
async function verifyLineIdToken(idToken) {
    const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
    if (!channelId) {
        throw new Error('LINE_LOGIN_CHANNEL_ID is not configured');
    }
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`LINE ID token verify failed: ${res.status} ${body}`);
    }
    const data = await res.json();
    return { userId: data.sub, name: data.name || '名前未設定' };
}

module.exports = { DEV_MODE, issueToken, verifyToken, verifyLineIdToken };
