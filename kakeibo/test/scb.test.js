// SCB Connect 通知の解析テスト。サンプルは実際の通知スクショの文面。
// 実行: node --test kakeibo/test/
const test = require('node:test');
const assert = require('node:assert');
const scb = require('../lib/scb');
const ledger = require('../lib/ledger');

const INCOME = [
    'รายการเงินเข้า',
    '+1,600.00 บาท',
    'จากบัญชี นาง จันทรัตน์ X-8110 ออมสิน',
    'เข้าบัญชี X-4211',
    'วันที่/เวลา 28/07/2026 21:05',
    'ยอดเงินที่ใช้ได้ 3,809.41 บาท',
].join('\n');

// 銀行名がカード上で次の行に折り返しているケース(スクショどおり)
const EXPENSE_WRAPPED = [
    'รายการเงินออก',
    '-115.00 บาท',
    'จากบัญชี X-4211',
    'เข้าบัญชี SANGNAPA MANE X-4314',
    'ไทยพาณิชย์',
    'วันที่/เวลา 30/07/2026 17:18',
    'ยอดเงินที่ใช้ได้ 650.97 บาท',
].join('\n');

const EXPENSE = [
    'รายการเงินออก',
    '-40.00 บาท',
    'จากบัญชี X-4211',
    'เข้าบัญชี SUPATSA BORIR X-8972 ไทยพาณิชย์',
    'วันที่/เวลา 30/07/2026 17:23',
    'ยอดเงินที่ใช้ได้ 610.97 บาท',
].join('\n');

const OPTIONS = { myAccounts: ['X-4211'] };

test('入金通知:金額・相手口座・残高・日時を読み取る', () => {
    const r = scb.parseNotificationText(INCOME, OPTIONS);
    assert.ok(r.ok);
    assert.deepStrictEqual(r.warnings, []);
    assert.strictEqual(r.draft.type, 'income');
    assert.strictEqual(r.draft.amount, 1600);
    assert.strictEqual(r.draft.counterparty, 'นาง จันทรัตน์');
    assert.strictEqual(r.draft.counterpartyAccount, 'X-8110');
    assert.strictEqual(r.draft.counterpartyBank, 'GSB');
    assert.strictEqual(r.draft.balanceAfter, 3809.41);
    assert.strictEqual(r.draft.myAccount, 'X-4211');
    // 21:05(タイ時間)= 14:05 UTC
    assert.strictEqual(r.draft.occurredAt, '2026-07-28T14:05:00.000Z');
});

test('出金通知:銀行名が折り返していても相手を読み取れる', () => {
    const r = scb.parseNotificationText(EXPENSE_WRAPPED, OPTIONS);
    assert.ok(r.ok);
    assert.strictEqual(r.draft.type, 'expense');
    assert.strictEqual(r.draft.amount, 115);
    assert.strictEqual(r.draft.counterparty, 'SANGNAPA MANE');
    assert.strictEqual(r.draft.counterpartyAccount, 'X-4314');
    assert.strictEqual(r.draft.counterpartyBank, 'SCB');
    assert.strictEqual(r.draft.balanceAfter, 650.97);
    assert.strictEqual(r.draft.occurredAt, '2026-07-30T10:18:00.000Z');
});

test('自分の口座が未登録でも入出金の向きから相手を決められる', () => {
    const r = scb.parseNotificationText(EXPENSE, { myAccounts: [] });
    assert.ok(r.ok);
    assert.strictEqual(r.draft.counterparty, 'SUPATSA BORIR');
    assert.strictEqual(r.draft.counterpartyAccount, 'X-8972');
});

test('自分の口座が送金先側でも(入金)正しく相手を選ぶ', () => {
    const r = scb.parseNotificationText(INCOME, { myAccounts: ['X-8110'] });
    // X-8110 が自分なら、相手は X-4211 側になる
    assert.strictEqual(r.draft.counterpartyAccount, 'X-4211');
});

test('仏暦の日付を西暦に直す', () => {
    const r = scb.parseNotificationText(INCOME.replace('28/07/2026', '28/07/2569'), OPTIONS);
    assert.strictEqual(r.draft.occurredAt, '2026-07-28T14:05:00.000Z');
});

test('存在しない日付は日時なしとして扱う(金額は読み取る)', () => {
    const r = scb.parseNotificationText(INCOME.replace('28/07/2026', '31/02/2026'), OPTIONS);
    assert.ok(r.ok);
    assert.strictEqual(r.draft.amount, 1600);
    assert.ok(r.warnings.some((w) => w.includes('日時')));
});

test('金額が無い文面は失敗として返す', () => {
    const r = scb.parseNotificationText('こんにちは', OPTIONS);
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /金額/);
});

test('入出金の区別が無い場合は符号から判定する', () => {
    const r = scb.parseNotificationText(INCOME.replace('รายการเงินเข้า', ''), OPTIONS);
    assert.strictEqual(r.draft.type, 'income');
});

test('重複判定キーは同じ通知で一致し、金額違いでは一致しない', () => {
    const a = scb.parseNotificationText(EXPENSE, OPTIONS).draft;
    const b = scb.parseNotificationText(EXPENSE, OPTIONS).draft;
    const c = scb.parseNotificationText(EXPENSE.replace('-40.00', '-41.00'), OPTIONS).draft;
    assert.strictEqual(scb.dedupeKey(a), scb.dedupeKey(b));
    assert.notStrictEqual(scb.dedupeKey(a), scb.dedupeKey(c));
});

test('口座番号の表記ゆれを X-#### に揃える', () => {
    assert.strictEqual(scb.normalizeAccount('xxx-x-x4211'), 'X-4211');
    assert.strictEqual(scb.normalizeAccount('X-4211'), 'X-4211');
    assert.strictEqual(scb.normalizeAccount('4211'), 'X-4211');
});

// ---------- 残高照合 ----------

function tx(id, type, amount, balanceAfter, minute) {
    return {
        id,
        occurredAt: `2026-07-30T${String(10 + minute).padStart(2, '0')}:00:00.000Z`,
        type,
        amount,
        balanceAfter,
        category: type === 'income' ? 'Salary' : 'Food',
    };
}

test('残高が連続していればズレなしと判定する', () => {
    const rows = [tx(1, 'expense', 115, 650.97, 0), tx(2, 'expense', 40, 610.97, 1)];
    assert.deepStrictEqual(ledger.findBalanceGaps(rows), []);
});

test('取り込み漏れがあると差額と不足している向きを返す', () => {
    // 650.97 → 40 の出金なら 610.97 のはずが、実際は 510.97(100の出金が未記録)
    const rows = [tx(1, 'expense', 115, 650.97, 0), tx(2, 'expense', 40, 510.97, 1)];
    const gaps = ledger.findBalanceGaps(rows);
    assert.strictEqual(gaps.length, 1);
    assert.strictEqual(gaps[0].beforeId, 2);
    assert.strictEqual(gaps[0].missingType, 'expense');
    assert.strictEqual(gaps[0].missingAmount, 100);
});

test('現金取引(残高なし)は残高照合に影響しない', () => {
    const cash = { id: 9, occurredAt: '2026-07-30T10:30:00.000Z', type: 'expense', amount: 250, balanceAfter: null, category: 'Food' };
    const rows = [tx(1, 'expense', 115, 650.97, 0), cash, tx(2, 'expense', 40, 610.97, 1)];
    assert.deepStrictEqual(ledger.findBalanceGaps(rows), []);
});

test('月の範囲はタイ時間で切る', () => {
    const range = ledger.monthRange('2026-07');
    assert.strictEqual(range.from, '2026-06-30T17:00:00.000Z'); // 7/1 00:00 +07:00
    assert.strictEqual(range.to, '2026-07-31T17:00:00.000Z');
    assert.strictEqual(ledger.monthRange('2026-13'), null);
});

test('集計はカテゴリ別に合計する', () => {
    const rows = [
        { type: 'expense', amount: 115, category: 'Food' },
        { type: 'expense', amount: 40, category: 'Food' },
        { type: 'income', amount: 1600, category: 'Salary' },
    ];
    const s = ledger.summarize(rows);
    assert.strictEqual(s.income, 1600);
    assert.strictEqual(s.expense, 155);
    assert.strictEqual(s.net, 1445);
    assert.strictEqual(s.byCategory.expense.Food, 155);
});
