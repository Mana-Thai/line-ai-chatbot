// グッズ注文とりまとめアプリ(LINEグループ用・Bot不使用)
// LIFF(LINEログイン)で本人確認し、注文リストをリアルタイム共有する
require('dotenv').config();
const express = require('express');
const path = require('path');
const { CHEST_LOGOS, BACK_PRINTS, SIZES, COLORS, MAX_QTY, MAX_NOTE_LENGTH } = require('./shared/constants');
const { createStore } = require('./lib/store');
const auth = require('./lib/auth');

const app = express();
app.use(express.json());

const store = createStore();

// ============================================
// SSE(リアルタイム配信)
// ============================================

const sseClients = new Set();

function broadcast(event) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
        client.write(payload);
    }
}

// ============================================
// 編集ロック(全体で1人だけ編集可能)
// ============================================

const LOCK_TTL_MS = 30 * 1000;
let editLock = null; // { userId, name, expiresAt }

function currentLock() {
    if (editLock && editLock.expiresAt < Date.now()) {
        editLock = null;
        broadcast(lockEvent());
    }
    return editLock;
}

function lockEvent() {
    return {
        type: 'lock',
        locked: !!editLock,
        holderName: editLock ? editLock.name : null,
        holderId: editLock ? editLock.userId : null,
    };
}

// 期限切れロックの解放を定期チェック(誰もAPIを叩かなくても banner が消えるように)
setInterval(currentLock, 5 * 1000);

// ============================================
// 認証
// ============================================

function requireAuth(req, res, next) {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token || '');
    const user = auth.verifyToken(token);
    if (!user) {
        return res.status(401).json({ error: 'unauthorized', message: 'ログインの有効期限が切れました。再読み込みしてください。' });
    }
    req.user = user;
    next();
}

app.get('/api/config', (req, res) => {
    res.json({
        title: process.env.APP_TITLE || 'グッズ注文とりまとめ',
        liffId: process.env.LIFF_ID || null,
        passcodeRequired: !!process.env.APP_PASSCODE,
        adminEnabled: !!process.env.ADMIN_PASSCODE,
        devMode: auth.DEV_MODE,
    });
});

app.post('/api/auth', async (req, res) => {
    const { idToken, devUser, passcode } = req.body || {};

    if (process.env.APP_PASSCODE && passcode !== process.env.APP_PASSCODE) {
        return res.status(401).json({ error: 'passcode', message: '合言葉が違います' });
    }

    try {
        let profile;
        if (idToken) {
            profile = await auth.verifyLineIdToken(idToken);
        } else if (auth.DEV_MODE && devUser && devUser.userId) {
            profile = { userId: String(devUser.userId), name: String(devUser.name || 'テストユーザー').slice(0, 50) };
        } else {
            return res.status(400).json({ error: 'no_credentials', message: 'LINEログイン情報が取得できませんでした' });
        }
        const user = { userId: profile.userId, name: profile.name, admin: false };
        res.json({ token: auth.issueToken(user), user });
    } catch (err) {
        console.error('[Auth] verify failed:', err.message);
        res.status(401).json({ error: 'verify_failed', message: 'LINEログインの検証に失敗しました。開き直してお試しください。' });
    }
});

// 管理者モード解除(管理者パスコードで自分のセッションに admin 権限を付与)
app.post('/api/admin', requireAuth, (req, res) => {
    if (!process.env.ADMIN_PASSCODE) {
        return res.status(403).json({ message: '管理者パスコードが設定されていません' });
    }
    if ((req.body || {}).adminPasscode !== process.env.ADMIN_PASSCODE) {
        return res.status(401).json({ message: '管理者パスコードが違います' });
    }
    const user = { ...req.user, admin: true };
    res.json({ token: auth.issueToken(user), user });
});

// ============================================
// 注文 API
// ============================================

function parseOrderInput(body) {
    const b = body || {};
    if (!CHEST_LOGOS.includes(b.chestLogo)) return { error: '胸ロゴを選択してください' };
    if (!BACK_PRINTS.includes(b.backPrint)) return { error: 'バックプリントを選択してください' };
    if (!SIZES.includes(b.size)) return { error: 'サイズを選択してください' };
    if (!b.quantities || typeof b.quantities !== 'object' || Array.isArray(b.quantities)) {
        return { error: '数量の形式が不正です' };
    }
    const quantities = {};
    for (const [color, val] of Object.entries(b.quantities)) {
        if (!COLORS.includes(color)) return { error: `不明なカラーです: ${color}` };
        const n = Number(val);
        if (!Number.isInteger(n) || n < 0 || n > MAX_QTY) {
            return { error: `数量は0〜${MAX_QTY}の整数で入力してください` };
        }
        if (n > 0) quantities[color] = n;
    }
    if (Object.keys(quantities).length === 0) return { error: '数量を1色以上入力してください' };
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, MAX_NOTE_LENGTH) : '';
    return { value: { chestLogo: b.chestLogo, backPrint: b.backPrint, size: b.size, quantities, note } };
}

app.get('/api/orders', requireAuth, async (req, res) => {
    res.json({ orders: await store.list() });
});

app.post('/api/orders', requireAuth, async (req, res) => {
    const parsed = parseOrderInput(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const order = await store.create({
        ...parsed.value,
        userId: req.user.userId,
        displayName: req.user.name,
        updatedBy: req.user.name,
    });
    broadcast({ type: 'orders' });
    res.json({ order });
});

// 本人または管理者のみ操作可能な注文を取得する共通処理
async function loadEditableOrder(req, res) {
    const id = Number(req.params.id);
    const order = Number.isInteger(id) ? await store.get(id) : null;
    if (!order) {
        res.status(404).json({ message: '注文が見つかりません(削除された可能性があります)' });
        return null;
    }
    if (order.userId !== req.user.userId && !req.user.admin) {
        res.status(403).json({ message: '自分の注文のみ編集できます' });
        return null;
    }
    return order;
}

app.put('/api/orders/:id', requireAuth, async (req, res) => {
    const order = await loadEditableOrder(req, res);
    if (!order) return;
    const parsed = parseOrderInput(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const updated = await store.update(order.id, { ...parsed.value, updatedBy: req.user.name });
    broadcast({ type: 'orders' });
    res.json({ order: updated });
});

app.delete('/api/orders/:id', requireAuth, async (req, res) => {
    const order = await loadEditableOrder(req, res);
    if (!order) return;
    await store.remove(order.id);
    broadcast({ type: 'orders' });
    res.json({ ok: true });
});

// ============================================
// 編集ロック API
// ============================================

// 取得または延長(ハートビート)。他の人が保持中なら 409
app.post('/api/lock', requireAuth, (req, res) => {
    const lock = currentLock();
    if (lock && lock.userId !== req.user.userId) {
        return res.status(409).json({ holderName: lock.name, message: `${lock.name}さんが編集中です` });
    }
    const isNew = !lock;
    editLock = { userId: req.user.userId, name: req.user.name, expiresAt: Date.now() + LOCK_TTL_MS };
    if (isNew) broadcast(lockEvent());
    res.json({ ok: true, ttl: LOCK_TTL_MS });
});

app.delete('/api/lock', requireAuth, (req, res) => {
    const lock = currentLock();
    if (lock && (lock.userId === req.user.userId || req.user.admin)) {
        editLock = null;
        broadcast(lockEvent());
    }
    res.json({ ok: true });
});

// ============================================
// SSE ストリーム(EventSource はヘッダーを送れないため token はクエリで受ける)
// ============================================

app.get('/api/stream', requireAuth, (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(lockEvent())}\n\n`);
    sseClients.add(res);

    const heartbeat = setInterval(() => res.write(':hb\n\n'), 25 * 1000);
    req.on('close', () => {
        clearInterval(heartbeat);
        sseClients.delete(res);
    });
});

// ============================================
// 静的ファイル・ヘルスチェック
// ============================================

app.get('/healthz', (req, res) => res.send('OK'));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// 起動
// ============================================

const PORT = process.env.PORT || 3000;

store.init()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🛒 Order app is running on port ${PORT}`);
            if (!process.env.LIFF_ID) console.warn('[Config] LIFF_ID is not set');
            if (!process.env.APP_PASSCODE) console.warn('[Config] APP_PASSCODE is not set (anyone with the URL can access)');
        });
    })
    .catch((err) => {
        console.error('Failed to initialize store:', err);
        process.exit(1);
    });
