// 家計簿アプリ(SCB Connect通知連携)
// 銀行のLINE通知スクショから自動記帳し、現金の買い物は手動で足す。使うのは本人1人。
require('dotenv').config();
const express = require('express');
const path = require('path');
const C = require('./shared/constants');
const { createStore } = require('./lib/store');
const auth = require('./lib/auth');
const scb = require('./lib/scb');
const vision = require('./lib/vision');
const ledger = require('./lib/ledger');

const app = express();
app.set('trust proxy', 1); // Render のリバースプロキシ越しに実IPを取るため
app.use(express.json({ limit: '16mb' })); // 通知スクショ(dataURL)を複数枚受けるため

const store = createStore();

const OWNER = { userId: 'owner', name: 'owner' };

const DEFAULT_SETTINGS = {
    myAccounts: [],            // 自分の口座(例: ['X-4211'])。相手口座の判定に使う
    customCategories: { income: [], expense: [] },
    counterpartyRules: {},     // 相手 → カテゴリ の学習辞書
};

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
        title: process.env.APP_TITLE || '家計簿',
        passcodeRequired: auth.passcodeConfigured(),
        devMode: auth.DEV_MODE,
        visionEnabled: vision.isEnabled(),
        currency: C.CURRENCY,
    });
});

app.post('/api/auth', (req, res) => {
    if (!auth.passcodeConfigured() && !auth.DEV_MODE) {
        return res.status(503).json({ message: 'APP_PASSCODE が設定されていません。サーバーの環境変数を確認してください。' });
    }
    const ip = req.ip || 'unknown';
    if (auth.isLockedOut(ip)) {
        return res.status(429).json({ message: '合言葉の入力を何度も間違えました。しばらく待ってからお試しください。' });
    }
    const { passcode } = req.body || {};
    // 合言葉が設定されていれば、開発モードでも必ず照合する
    if (auth.passcodeConfigured() && !auth.checkPasscode(passcode)) {
        auth.registerFailure(ip);
        return res.status(401).json({ message: '合言葉が違います' });
    }
    auth.clearFailures(ip);
    res.json({ token: auth.issueToken(OWNER), user: OWNER });
});

// ============================================
// 設定(自分の口座・カテゴリ・学習辞書)
// ============================================

async function loadSettings() {
    const saved = (await store.getSetting('app')) || {};
    return {
        ...DEFAULT_SETTINGS,
        ...saved,
        customCategories: { ...DEFAULT_SETTINGS.customCategories, ...(saved.customCategories || {}) },
        counterpartyRules: { ...(saved.counterpartyRules || {}) },
    };
}

function categoriesFor(type, settings) {
    const base = type === 'income' ? C.INCOME_CATEGORIES : C.EXPENSE_CATEGORIES;
    const custom = (settings.customCategories || {})[type] || [];
    return [...base, ...custom.filter((c) => !base.includes(c))];
}

function parseStringList(value, { max, maxLength, normalize }) {
    if (!Array.isArray(value)) return { error: '形式が不正です' };
    if (value.length > max) return { error: `登録できるのは${max}件までです` };
    const out = [];
    for (const raw of value) {
        if (typeof raw !== 'string') return { error: '形式が不正です' };
        const v = normalize ? normalize(raw) : raw.trim().slice(0, maxLength);
        if (v && !out.includes(v)) out.push(v);
    }
    return { value: out };
}

app.get('/api/settings', requireAuth, async (req, res) => {
    const settings = await loadSettings();
    res.json({
        settings,
        categories: { income: categoriesFor('income', settings), expense: categoriesFor('expense', settings) },
    });
});

app.put('/api/settings', requireAuth, async (req, res) => {
    const body = req.body || {};
    const current = await loadSettings();
    const next = { ...current };

    if (body.myAccounts !== undefined) {
        const parsed = parseStringList(body.myAccounts, {
            max: C.MAX_ACCOUNTS,
            normalize: (s) => scb.normalizeAccount(s) || s.trim().slice(0, 20),
        });
        if (parsed.error) return res.status(400).json({ message: `自分の口座: ${parsed.error}` });
        next.myAccounts = parsed.value;
    }

    if (body.customCategories !== undefined) {
        const cc = body.customCategories || {};
        const out = {};
        for (const type of C.TYPES) {
            const parsed = parseStringList(cc[type] || [], {
                max: 50,
                maxLength: C.MAX_CATEGORY_LENGTH,
            });
            if (parsed.error) return res.status(400).json({ message: `カテゴリ: ${parsed.error}` });
            out[type] = parsed.value;
        }
        next.customCategories = out;
    }

    if (body.counterpartyRules !== undefined) {
        const rules = body.counterpartyRules;
        if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
            return res.status(400).json({ message: '学習辞書の形式が不正です' });
        }
        const out = {};
        for (const [key, value] of Object.entries(rules).slice(0, 500)) {
            if (typeof value !== 'string') continue;
            out[String(key).slice(0, C.MAX_NAME_LENGTH)] = value.slice(0, C.MAX_CATEGORY_LENGTH);
        }
        next.counterpartyRules = out;
    }

    await store.setSetting('app', next);
    broadcast({ type: 'settings' });
    res.json({
        settings: next,
        categories: { income: categoriesFor('income', next), expense: categoriesFor('expense', next) },
    });
});

// 相手 → カテゴリ の学習辞書。同じ相手からの次の取引でカテゴリが自動で入る
function ruleKey(t) {
    return t.counterpartyAccount || t.counterparty || '';
}

async function rememberCategory(t) {
    const key = ruleKey(t);
    if (!key || !t.category || t.category === C.ADJUST_CATEGORY) return;
    const settings = await loadSettings();
    if (settings.counterpartyRules[key] === t.category) return;
    settings.counterpartyRules[key] = t.category;
    await store.setSetting('app', settings);
}

// ============================================
// 取引の入力チェック
// ============================================

// 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm'(タイ時間)/ ISO文字列 を受け付ける
function parseOccurredAt(value) {
    const s = String(value || '').trim();
    if (!s) return null;
    let iso = s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = `${s}T00:00:00${scb.TZ_OFFSET}`;
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) iso = `${s}:00${scb.TZ_OFFSET}`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const year = d.getUTCFullYear();
    if (year < 2000 || year > 2100) return null;
    return d.toISOString();
}

function parseAmountInput(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return { error: '金額は0より大きい数値で入力してください' };
    if (n > C.MAX_AMOUNT) return { error: '金額が大きすぎます' };
    return { value: Math.round(n * 100) / 100 };
}

function parseTransactionInput(body, settings) {
    const b = body || {};

    const occurredAt = parseOccurredAt(b.occurredAt);
    if (!occurredAt) return { error: '日付を正しく入力してください' };

    if (!C.TYPES.includes(b.type)) return { error: '収入・支出を選択してください' };

    const amount = parseAmountInput(b.amount);
    if (amount.error) return { error: amount.error };

    const category = typeof b.category === 'string' ? b.category.trim() : '';
    if (!category) return { error: 'カテゴリを選択してください' };
    if (!categoriesFor(b.type, settings).includes(category)) {
        return { error: `カテゴリが不正です: ${category}` };
    }

    const source = C.SOURCES.includes(b.source) ? b.source : 'cash';

    let balanceAfter = null;
    if (b.balanceAfter !== null && b.balanceAfter !== undefined && b.balanceAfter !== '') {
        const n = Number(b.balanceAfter);
        if (!Number.isFinite(n) || Math.abs(n) > C.MAX_AMOUNT) {
            return { error: '残高は数値で入力してください' };
        }
        balanceAfter = Math.round(n * 100) / 100;
    }

    const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

    return {
        value: {
            occurredAt,
            type: b.type,
            amount: amount.value,
            category,
            source,
            counterparty: str(b.counterparty, C.MAX_NAME_LENGTH),
            counterpartyAccount: str(b.counterpartyAccount, 20),
            counterpartyBank: str(b.counterpartyBank, 60),
            balanceAfter,
            memo: str(b.memo, C.MAX_MEMO_LENGTH),
        },
    };
}

// 同じ通知の二重取り込みを検出する(前後2日の範囲で照合)
async function findDuplicate(t) {
    if (t.source === 'cash' || t.source === 'adjust') return null;
    const at = new Date(t.occurredAt).getTime();
    const window = 2 * 24 * 60 * 60 * 1000;
    const near = await store.list({
        from: new Date(at - window).toISOString(),
        to: new Date(at + window).toISOString(),
    });
    const key = scb.dedupeKey(t);
    return near.find((x) => scb.dedupeKey(x) === key) || null;
}

// ============================================
// 取引 API
// ============================================

app.get('/api/transactions', requireAuth, async (req, res) => {
    const range = req.query.month ? ledger.monthRange(req.query.month) : null;
    if (req.query.month && !range) {
        return res.status(400).json({ message: '月の指定が不正です(YYYY-MM)' });
    }
    res.json({ transactions: await store.list(range || {}) });
});

app.post('/api/transactions', requireAuth, async (req, res) => {
    const settings = await loadSettings();
    const parsed = parseTransactionInput(req.body, settings);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    if (!(req.body || {}).force) {
        const dup = await findDuplicate(parsed.value);
        if (dup) {
            return res.status(409).json({
                error: 'duplicate',
                message: '同じ内容の取引がすでに登録されています',
                existing: dup,
            });
        }
    }

    const created = await store.create(parsed.value);
    await rememberCategory(created);
    broadcast({ type: 'transactions' });
    res.json({ transaction: created });
});

app.put('/api/transactions/:id', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? await store.get(id) : null;
    if (!existing) return res.status(404).json({ message: '取引が見つかりません' });

    const settings = await loadSettings();
    const parsed = parseTransactionInput({ source: existing.source, ...req.body }, settings);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const updated = await store.update(id, parsed.value);
    await rememberCategory(updated);
    broadcast({ type: 'transactions' });
    res.json({ transaction: updated });
});

app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? await store.get(id) : null;
    if (!existing) return res.status(404).json({ message: '取引が見つかりません' });
    await store.remove(id);
    broadcast({ type: 'transactions' });
    res.json({ ok: true });
});

// 残高のズレ(取り込み漏れ)を Adjust 取引で埋める
app.post('/api/transactions/adjust', requireAuth, async (req, res) => {
    const beforeId = Number((req.body || {}).beforeId);
    if (!Number.isInteger(beforeId)) return res.status(400).json({ message: '対象の取引が不正です' });

    const all = await store.list();
    const gap = ledger.findBalanceGaps(all).find((g) => g.beforeId === beforeId);
    if (!gap) return res.status(404).json({ message: '対象の残高差額が見つかりません(すでに解消されています)' });

    const prev = all.find((t) => t.id === gap.afterId);
    const created = await store.create({
        // 差額の原因となった取引は前後の間にあったはずなので、後ろ側の1分前に入れる
        occurredAt: new Date(new Date(gap.to).getTime() - 60 * 1000).toISOString(),
        type: gap.missingType,
        amount: Math.round(gap.missingAmount * 100) / 100,
        category: C.ADJUST_CATEGORY,
        source: 'adjust',
        counterparty: '',
        counterpartyAccount: '',
        counterpartyBank: '',
        balanceAfter: ledger.round2(Number(prev.balanceAfter) + gap.diff),
        memo: '残高照合による自動調整',
    });
    broadcast({ type: 'transactions' });
    res.json({ transaction: created });
});

// ============================================
// 集計・残高照合
// ============================================

app.get('/api/summary', requireAuth, async (req, res) => {
    const range = req.query.month ? ledger.monthRange(req.query.month) : null;
    if (req.query.month && !range) {
        return res.status(400).json({ message: '月の指定が不正です(YYYY-MM)' });
    }
    const all = await store.list();
    const inRange = range
        ? all.filter((t) => t.occurredAt >= range.from && t.occurredAt < range.to)
        : all;
    const gaps = ledger.findBalanceGaps(all);
    res.json({
        month: req.query.month || null,
        summary: ledger.summarize(inRange),
        bankBalance: ledger.latestBankBalance(all),
        // 表示は対象月の差額だけに絞る(過去分まで警告し続けないため)
        gaps: range ? gaps.filter((g) => g.to >= range.from && g.to < range.to) : gaps,
        gapCount: gaps.length,
    });
});

// ============================================
// 通知の取り込み(プレビューのみ。登録は POST /api/transactions)
// ============================================

// 学習辞書からカテゴリを補完する
function suggestCategory(draft, settings) {
    const key = ruleKey(draft);
    const category = key ? settings.counterpartyRules[key] : '';
    if (!category) return '';
    return categoriesFor(draft.type, settings).includes(category) ? category : '';
}

async function toPreview(result, settings, source) {
    if (!result.ok) return { ok: false, error: result.error, fields: result.fields || null };
    const draft = { ...result.draft, source, category: suggestCategory(result.draft, settings) };
    const duplicate = await findDuplicate(draft);
    return {
        ok: true,
        draft,
        warnings: result.warnings,
        fields: result.fields,
        duplicate: duplicate || null,
    };
}

app.post('/api/import/text', requireAuth, async (req, res) => {
    const text = String((req.body || {}).text || '');
    if (!text.trim()) return res.status(400).json({ message: '通知のテキストを貼り付けてください' });
    if (text.length > C.MAX_TEXT_LENGTH) return res.status(400).json({ message: 'テキストが長すぎます' });
    const settings = await loadSettings();
    const result = scb.parseNotificationText(text, { myAccounts: settings.myAccounts });
    res.json({ results: [await toPreview(result, settings, 'text')] });
});

app.post('/api/import/images', requireAuth, async (req, res) => {
    if (!vision.isEnabled()) {
        return res.status(503).json({
            error: 'vision_disabled',
            message: 'スクショ解析が無効です(GEMINI_API_KEY を設定してください)。通知テキストの貼り付けか手動入力をお使いください。',
        });
    }
    const images = (req.body || {}).images;
    if (!Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ message: '画像が選択されていません' });
    }
    if (images.length > C.MAX_IMAGES_PER_REQUEST) {
        return res.status(400).json({ message: `一度に取り込めるのは${C.MAX_IMAGES_PER_REQUEST}枚までです` });
    }

    const settings = await loadSettings();
    const results = [];
    for (const image of images) {
        try {
            const fields = await vision.extractFields(image);
            if (fields.isNotification === false) {
                results.push({ ok: false, error: '銀行の通知として読み取れませんでした' });
                continue;
            }
            const parsed = scb.buildDraft(fields, { myAccounts: settings.myAccounts });
            results.push(await toPreview(parsed, settings, 'screenshot'));
        } catch (err) {
            console.error('[Import] image analysis failed:', err.message);
            const known = err instanceof vision.VisionError;
            results.push({ ok: false, error: known ? err.message : '画像の解析に失敗しました' });
        }
    }
    res.json({ results });
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
    res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
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

const PORT = process.env.PORT || 3100;

if (require.main === module) {
    store.init()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`💰 Kakeibo app is running on port ${PORT}`);
                if (!auth.passcodeConfigured()) {
                    console.warn('[Config] APP_PASSCODE is not set — login is disabled until it is configured');
                }
                if (!vision.isEnabled()) {
                    console.warn('[Config] GEMINI_API_KEY is not set — screenshot import is disabled');
                }
                if (!process.env.DATABASE_URL) {
                    console.warn('[Config] DATABASE_URL is not set — data will be lost on redeploy');
                }
            });
        })
        .catch((err) => {
            console.error('Failed to initialize store:', err);
            process.exit(1);
        });
}

module.exports = { app, store };
