// SCB Connect の入出金通知を解析して家計簿の下書き(draft)に変換する。
// スクショ解析(lib/vision.js)とテキスト貼り付けの両方が、最終的にこの buildDraft を通る。
const C = require('../shared/constants');

// タイの現地時間。通知に書かれている時刻はこのオフセットで解釈する
const TZ_OFFSET = '+07:00';

// 通知カードのラベル(SCB Connect は項目名が固定)
const LABELS = [
    { key: 'from', re: /จากบัญชี|from\s*account/i },
    { key: 'to', re: /เข้าบัญชี|to\s*account/i },
    { key: 'datetime', re: /วันที่\s*\/?\s*เวลา|date\s*\/?\s*time/i },
    { key: 'balance', re: /ยอดเงินที่ใช้ได้|available\s*balance/i },
];

const IN_RE = /เงินเข้า|money\s*in|deposit/i;
const OUT_RE = /เงินออก|money\s*out|withdraw/i;

// マスクされた口座番号(X-4211 / xxx-x-x4211 / *4211 など)
const ACCOUNT_RE = /(?:x|\*|×|ｘ)[\sx*×ｘ-]*(\d{3,4})\b/i;
const AMOUNT_RE = /([+\-−–])?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:บาท|THB|฿)/i;
const DATE_RE = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:[\s,]+(\d{1,2}):(\d{2}))?/;

function collapse(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function toNumber(s) {
    const n = Number(String(s || '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
}

// 通知テキストをラベルで区切り、各項目の生文字列を取り出す。
// 値が次の行に折り返していても、次のラベルまでをまとめて拾うので問題ない。
function sliceByLabels(text) {
    const hits = [];
    for (const label of LABELS) {
        const m = text.match(label.re);
        if (m && m.index >= 0) hits.push({ key: label.key, start: m.index, end: m.index + m[0].length });
    }
    hits.sort((a, b) => a.start - b.start);
    const fields = { header: '', from: '', to: '', datetime: '', balance: '' };
    fields.header = collapse(hits.length ? text.slice(0, hits[0].start) : text);
    hits.forEach((hit, i) => {
        const stop = i + 1 < hits.length ? hits[i + 1].start : text.length;
        fields[hit.key] = collapse(text.slice(hit.end, stop));
    });
    return fields;
}

// 「นาง จันทรัตน์ X-8110 ออมสิน」→ { name, account, bank }
function splitAccountLine(line) {
    const s = collapse(line).replace(/^[:：]\s*/, '');
    if (!s) return { name: '', account: '', bank: '' };
    const m = s.match(ACCOUNT_RE);
    if (!m) return { name: s.slice(0, C.MAX_NAME_LENGTH), account: '', bank: '' };
    return {
        name: s.slice(0, m.index).trim().slice(0, C.MAX_NAME_LENGTH),
        account: `X-${m[1]}`,
        bank: s.slice(m.index + m[0].length).trim().slice(0, 60),
    };
}

// 口座番号の表記ゆれを X-4211 の形に揃える(設定に登録された自分の口座との比較用)
function normalizeAccount(value) {
    const m = String(value || '').match(ACCOUNT_RE) || String(value || '').match(/(\d{3,4})\s*$/);
    return m ? `X-${m[1]}` : '';
}

function parseAmount(text) {
    const m = String(text || '').match(AMOUNT_RE);
    if (!m) {
        // 「บาท」が読み取れなかった場合の保険:小数2桁の数値を金額とみなす
        const alt = String(text || '').match(/([+\-−–])?\s*(\d{1,3}(?:,\d{3})*\.\d{2})/);
        if (!alt) return null;
        return { sign: alt[1] || '', value: toNumber(alt[2]) };
    }
    return { sign: m[1] || '', value: toNumber(m[2]) };
}

// 「28/07/2026 21:05」→ ISO文字列。仏暦(2569 等)で来た場合は西暦に直す
function parseDateTime(text) {
    const m = String(text || '').match(DATE_RE);
    if (!m) return null;
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year >= 2400) year -= 543;
    const hour = m[4] === undefined ? 0 : Number(m[4]);
    const minute = m[5] === undefined ? 0 : Number(m[5]);
    if (month < 1 || month > 12 || hour > 23 || minute > 59) return null;
    // 「31/02」のような存在しない日付を弾く
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > daysInMonth) return null;
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    const iso = `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${TZ_OFFSET}`;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

function detectType(fields) {
    const header = fields.header || '';
    if (OUT_RE.test(header)) return 'expense';
    if (IN_RE.test(header)) return 'income';
    const amount = parseAmount(header);
    if (amount && (amount.sign === '-' || amount.sign === '−' || amount.sign === '–')) return 'expense';
    if (amount && amount.sign === '+') return 'income';
    return null;
}

// 自分の口座でない側を相手として採用する。判別できないときは入出金の向きで決める
function pickCounterparty(from, to, type, myAccounts) {
    const mine = (myAccounts || []).map(normalizeAccount).filter(Boolean);
    const fromIsMine = !!from.account && mine.includes(from.account);
    const toIsMine = !!to.account && mine.includes(to.account);
    if (fromIsMine && !toIsMine) return { side: to, myAccount: from.account };
    if (toIsMine && !fromIsMine) return { side: from, myAccount: to.account };
    if (type === 'income') return { side: from, myAccount: to.account };
    if (type === 'expense') return { side: to, myAccount: from.account };
    return { side: { name: '', account: '', bank: '' }, myAccount: '' };
}

function bankShortName(bank) {
    const s = collapse(bank);
    if (!s) return '';
    for (const [thai, short] of Object.entries(C.BANK_SHORT_NAMES)) {
        if (s.includes(thai)) return short;
    }
    return s;
}

// 解析結果(テキスト/スクショ共通)を家計簿の下書きに変換する。
// fields: { header, from, to, datetime, balance } の生文字列
function buildDraft(fields, options = {}) {
    const warnings = [];
    const f = {
        header: collapse(fields.header),
        from: collapse(fields.from),
        to: collapse(fields.to),
        datetime: collapse(fields.datetime),
        balance: collapse(fields.balance),
    };

    const amount = parseAmount(f.header);
    if (!amount || !amount.value || amount.value <= 0) {
        return { ok: false, error: '金額を読み取れませんでした', fields: f };
    }

    const type = detectType(f);
    if (!type) warnings.push('入金・出金の区別を読み取れませんでした(出金として扱います)');

    const from = splitAccountLine(f.from);
    const to = splitAccountLine(f.to);
    const picked = pickCounterparty(from, to, type || 'expense', options.myAccounts);

    const occurredAt = parseDateTime(f.datetime);
    if (!occurredAt) warnings.push('日時を読み取れませんでした(現在時刻を入れています)');

    const balance = parseAmount(f.balance);
    if (!balance) warnings.push('残高を読み取れませんでした');

    if (!picked.side.account && !picked.side.name) warnings.push('相手口座を読み取れませんでした');
    if (!picked.myAccount) warnings.push('自分の口座を特定できませんでした(設定で口座を登録してください)');

    return {
        ok: true,
        fields: f,
        warnings,
        draft: {
            occurredAt: occurredAt || new Date().toISOString(),
            type: type || 'expense',
            amount: Math.round(amount.value * 100) / 100,
            counterparty: picked.side.name,
            counterpartyAccount: picked.side.account,
            counterpartyBank: bankShortName(picked.side.bank),
            balanceAfter: balance ? balance.value : null,
            myAccount: picked.myAccount,
        },
    };
}

// 通知テキストの貼り付けから下書きを作る(スクショが撮れないときの手入力経路)
function parseNotificationText(text, options = {}) {
    const raw = String(text || '');
    if (!raw.trim()) return { ok: false, error: 'テキストが空です' };
    return buildDraft(sliceByLabels(raw), options);
}

// 同じ通知を二重に取り込まないための照合キー(日時(分)+金額+相手口座)
function dedupeKey(t) {
    const at = new Date(t.occurredAt);
    const minute = Number.isNaN(at.getTime()) ? '' : at.toISOString().slice(0, 16);
    const amount = Math.round(Number(t.amount) * 100);
    return `${minute}|${t.type}|${amount}|${t.counterpartyAccount || t.counterparty || ''}`;
}

module.exports = {
    TZ_OFFSET,
    buildDraft,
    parseNotificationText,
    sliceByLabels,
    splitAccountLine,
    normalizeAccount,
    parseAmount,
    parseDateTime,
    detectType,
    bankShortName,
    dedupeKey,
};
