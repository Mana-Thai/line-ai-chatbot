// スクショ解析まわりのうち、モデルを呼ばない部分(出力の受け取りと下書き変換)のテスト。
// 実際の画像解析は GEMINI_API_KEY が要るため、ここではモデルの返答を模したJSONを使う。
const test = require('node:test');
const assert = require('node:assert');
const vision = require('../lib/vision');
const scb = require('../lib/scb');

// スクショから読み取れるはずの生文字列(実際の通知カードの文面)
const MODEL_RESPONSE = JSON.stringify({
    header: 'รายการเงินออก -115.00 บาท',
    from: 'X-4211',
    to: 'SANGNAPA MANE X-4314 ไทยพาณิชย์',
    datetime: '30/07/2026 17:18',
    balance: '650.97 บาท',
    isNotification: true,
});

test('モデル出力のJSONから必要な項目だけを取り出す', () => {
    const fields = vision.pickFields(MODEL_RESPONSE);
    assert.strictEqual(fields.from, 'X-4211');
    assert.strictEqual(fields.isNotification, true);
});

test('コードブロックで囲まれた出力も読める', () => {
    const fields = vision.pickFields(`\`\`\`json\n${MODEL_RESPONSE}\n\`\`\``);
    assert.strictEqual(fields.datetime, '30/07/2026 17:18');
});

test('JSONでない出力はエラーにする', () => {
    assert.throws(() => vision.pickFields('読み取れませんでした'), /解析結果/);
});

test('欠けている項目は空文字になる(勝手に補完しない)', () => {
    const fields = vision.pickFields('{"header":"รายการเงินออก -115.00 บาท"}');
    assert.strictEqual(fields.from, '');
    assert.strictEqual(fields.balance, '');
});

test('モデル出力 → 家計簿の下書きまで通る', () => {
    const fields = vision.pickFields(MODEL_RESPONSE);
    const r = scb.buildDraft(fields, { myAccounts: ['X-4211'] });
    assert.ok(r.ok);
    assert.deepStrictEqual(r.warnings, []);
    assert.strictEqual(r.draft.type, 'expense');
    assert.strictEqual(r.draft.amount, 115);
    assert.strictEqual(r.draft.counterparty, 'SANGNAPA MANE');
    assert.strictEqual(r.draft.counterpartyAccount, 'X-4314');
    assert.strictEqual(r.draft.counterpartyBank, 'SCB');
    assert.strictEqual(r.draft.balanceAfter, 650.97);
    assert.strictEqual(r.draft.occurredAt, '2026-07-30T10:18:00.000Z');
});

test('画像でないdataURLは受け付けない', () => {
    assert.throws(() => vision.parseDataUrl('data:text/plain;base64,YWJj'), /形式/);
    assert.throws(() => vision.parseDataUrl('https://example.com/a.png'), /形式/);
});

test('小さなPNGのdataURLはMIMEとbase64に分解できる', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    assert.deepStrictEqual(vision.parseDataUrl(png), { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUg==' });
});
