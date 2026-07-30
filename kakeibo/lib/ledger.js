// 集計と残高照合。スプレッドシートでやっていた「日次の残高突き合わせ(Adjust列)」を
// 通知に載っている ยอดเงินที่ใช้ได้(利用可能残高)で自動化する。
const C = require('../shared/constants');
const { TZ_OFFSET } = require('./scb');

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// 'YYYY-MM' → タイ時間での月初・翌月初(UTCのISO文字列)
function monthRange(month) {
    const m = MONTH_RE.exec(String(month || ''));
    if (!m) return null;
    const year = Number(m[1]);
    const mon = Number(m[2]);
    const next = mon === 12 ? { y: year + 1, m: 1 } : { y: year, m: mon + 1 };
    const pad = (n) => String(n).padStart(2, '0');
    return {
        from: new Date(`${m[1]}-${pad(mon)}-01T00:00:00${TZ_OFFSET}`).toISOString(),
        to: new Date(`${next.y}-${pad(next.m)}-01T00:00:00${TZ_OFFSET}`).toISOString(),
    };
}

// タイ時間での 'YYYY-MM-DD'(日別の集計・CSV用)
function localDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function round2(n) {
    return Math.round(Number(n) * 100) / 100;
}

function signedAmount(t) {
    return t.type === 'income' ? Number(t.amount) : -Number(t.amount);
}

function summarize(transactions) {
    const byCategory = { income: {}, expense: {} };
    let income = 0;
    let expense = 0;
    for (const t of transactions) {
        const amount = Number(t.amount) || 0;
        const bucket = t.type === 'income' ? byCategory.income : byCategory.expense;
        const key = t.category || '(未分類)';
        bucket[key] = round2((bucket[key] || 0) + amount);
        if (t.type === 'income') income += amount;
        else expense += amount;
    }
    return {
        income: round2(income),
        expense: round2(expense),
        net: round2(income - expense),
        count: transactions.length,
        byCategory,
    };
}

// 銀行取引(残高付き)だけを時系列に並べ、前の残高+今回の増減 が 今回の残高に
// 一致するかを見る。ズレていれば「まだ取り込んでいない銀行取引」がある。
function findBalanceGaps(transactions) {
    const bank = transactions
        .filter((t) => t.balanceAfter !== null && t.balanceAfter !== undefined)
        .sort((a, b) => (a.occurredAt === b.occurredAt ? a.id - b.id : (a.occurredAt < b.occurredAt ? -1 : 1)));
    const gaps = [];
    for (let i = 1; i < bank.length; i += 1) {
        const prev = bank[i - 1];
        const curr = bank[i];
        const expected = Number(prev.balanceAfter) + signedAmount(curr);
        const diff = round2(Number(curr.balanceAfter) - expected);
        if (Math.abs(diff) > C.BALANCE_EPSILON) {
            gaps.push({
                afterId: prev.id,
                beforeId: curr.id,
                from: prev.occurredAt,
                to: curr.occurredAt,
                // diff > 0 なら記録漏れの入金、diff < 0 なら記録漏れの出金
                diff,
                missingType: diff > 0 ? 'income' : 'expense',
                missingAmount: Math.abs(diff),
            });
        }
    }
    return gaps;
}

// 最後に通知で確認できた銀行残高
function latestBankBalance(transactions) {
    let latest = null;
    for (const t of transactions) {
        if (t.balanceAfter === null || t.balanceAfter === undefined) continue;
        if (!latest || t.occurredAt > latest.occurredAt
            || (t.occurredAt === latest.occurredAt && t.id > latest.id)) {
            latest = t;
        }
    }
    return latest ? { balance: Number(latest.balanceAfter), at: latest.occurredAt, id: latest.id } : null;
}

module.exports = { monthRange, localDate, summarize, findBalanceGaps, latestBankBalance, signedAmount, round2 };
