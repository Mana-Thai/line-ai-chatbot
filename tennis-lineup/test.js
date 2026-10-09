// node tennis-lineup/test.js — 規則ロジックの簡易テスト
const assert = require('assert');
const R = require('./rules.js');
const ev = (id) => R.EVENTS.find((e) => e.id === id);
const P = (id, gender, ageNow) => ({ player: { id, name: id, gender }, age: ageNow });

assert.strictEqual(R.toAge('52'), 52);
assert.strictEqual(R.toAge(''), null);
assert.strictEqual(R.toAge('5'), null);
assert.strictEqual(R.toAge('45.5'), null);
assert.strictEqual(R.ageFromBirth('1976-11-14'), 50);
assert.strictEqual(R.ageFromBirth('1976-11-15'), 49);
assert.strictEqual(R.ageFromBirth(''), null);
// オーダー画面に出るメッセージに実年齢が含まれないこと
const msgs = R.checkPair(ev('WD80'), P('a', 'F', 29), P('b', 'F', 37)).errors.join(' ');
assert.ok(!/29|37|66/.test(msgs), msgs);

assert.ok(R.checkPair(ev('WD80'), P('a', 'F', 30), P('b', 'F', 50)).ok);
assert.ok(!R.checkPair(ev('WD80'), P('a', 'F', 30), P('b', 'F', 49)).ok); // 合計79
assert.ok(!R.checkPair(ev('WD80'), P('a', 'F', 29), P('b', 'F', 60)).ok); // 30歳未満
assert.ok(R.checkPair(ev('XD100'), P('w', 'F', 40), P('m', 'M', 60)).ok);
assert.ok(!R.checkPair(ev('XD100'), P('w', 'F', 45), P('m', 'M', 49)).ok); // 男子50未満
assert.ok(!R.checkPair(ev('XD100'), P('w', 'F', 40), P('m', 'M', 59)).ok); // 合計99
assert.ok(!R.checkPair(ev('XD100'), P('w', 'M', 60), P('m', 'M', 60)).ok);
assert.ok(R.checkPair(ev('MO'), P('a', 'M', 25), P('b', 'M', 25)).ok);
assert.ok(!R.checkPair(ev('MD120'), P('a', 'M', 55), P('b', 'M', 64)).ok); // 合計119
assert.ok(R.checkPair(ev('MD120'), P('a', 'M', 55), P('b', 'M', 65)).ok);
assert.ok(!R.checkPair(ev('MD100'), P('a', 'M', 39), P('b', 'M', 70)).ok);

// 名簿
const roster = (n, special) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'p' + i, gender: 'M', age: 56, eligibility: i < special ? 'special' : 'work' }));
assert.strictEqual(R.checkRoster(roster(9, 0)).errors.length, 1);
assert.strictEqual(R.checkRoster(roster(10, 2)).errors.length, 0);
assert.strictEqual(R.checkRoster(roster(21, 3)).errors.length, 2);

// 自動割り当て: 女3人・男7人で1人1種目の5種目が組めること
const es = [P('w1', 'F', 35), P('w2', 'F', 50), P('w3', 'F', 45),
  P('m1', 'M', 30), P('m2', 'M', 28), P('m3', 'M', 58), P('m4', 'M', 66),
  P('m5', 'M', 52), P('m6', 'M', 48), P('m7', 'M', 60)];
const r = R.autoAssign(es, {}, {}, {});
assert.ok(r.ok, 'auto assign should succeed');
const used = Object.values(r.lineup).flat();
assert.strictEqual(new Set(used).size, 10);
const get = (id) => es.find((e) => e.player.id === id);
for (const e of R.EVENTS) assert.ok(R.checkPair(e, ...r.lineup[e.id].map(get)).ok, e.id);
// 人数不足なら失敗を返す
assert.ok(!R.autoAssign(es.slice(0, 9), {}, {}, {}).ok);
assert.ok(R.autoAssign(es.slice(0, 9), {}, {}, { allowRepeat: true }).ok);

assert.strictEqual(R.formatFor(8).matches, 4);
assert.strictEqual(R.formatFor(10).matches, 5);
assert.strictEqual(R.formatFor(6).matches, 4);
assert.strictEqual(R.formatFor(5).matches, 4);
// 参加費の分担
const f = R.splitFee(6000, { a: 3, b: 3, c: 2, d: 1, e: 0 });
assert.deepStrictEqual(f, { a: 2000, b: 2000, c: 1333, d: 667, e: 0 });
const g = R.splitFee(6000, { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 });
assert.strictEqual(Object.values(g).reduce((x, y) => x + y, 0), 6000);
assert.deepStrictEqual(R.splitFee(6000, { a: 0 }), { a: 0 });
console.log('all tests passed');
