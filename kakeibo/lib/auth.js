// 認証まわり:合言葉(パスコード)の照合と、アプリ内セッショントークンの発行/検証。
// 使うのは本人1人だけなのでLINEログインは使わず、URL+合言葉で入れるようにしている。
const crypto = require('crypto');

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12時間

// ローカル開発専用:合言葉なしでログインできるモード
const DEV_MODE = process.env.ALLOW_INSECURE_DEV === '1';

// 合言葉の総当たり対策(1つのIPからの連続失敗を制限する)
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map(); // ip -> { count, firstAt }

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
        exp: Date.now() + TOKEN_TTL_MS,
    }));
    return `${payload}.${sign(payload)}`;
}

// 検証OKなら { userId, name } を返し、無効なら null
function verifyToken(token) {
    if (typeof token !== 'string') return null;
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(sign(payload));
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    let data;
    try {
        data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (!data.userId || !data.exp || data.exp < Date.now()) return null;
    return { userId: data.userId, name: data.name || 'owner' };
}

function passcodeConfigured() {
    return !!process.env.APP_PASSCODE;
}

function checkPasscode(input) {
    const expected = process.env.APP_PASSCODE || '';
    if (!expected) return false;
    const a = Buffer.from(String(input || ''));
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function attemptState(ip) {
    const entry = attempts.get(ip);
    if (!entry) return null;
    if (Date.now() - entry.firstAt > ATTEMPT_WINDOW_MS) {
        attempts.delete(ip);
        return null;
    }
    return entry;
}

function isLockedOut(ip) {
    const entry = attemptState(ip);
    return !!entry && entry.count >= MAX_ATTEMPTS;
}

function registerFailure(ip) {
    const entry = attemptState(ip);
    if (entry) entry.count += 1;
    else attempts.set(ip, { count: 1, firstAt: Date.now() });
}

function clearFailures(ip) {
    attempts.delete(ip);
}

module.exports = {
    DEV_MODE,
    issueToken,
    verifyToken,
    passcodeConfigured,
    checkPasscode,
    isLockedOut,
    registerFailure,
    clearFailures,
};
