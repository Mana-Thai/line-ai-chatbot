// 第44回 チョンブリー県内クラブ・同好会対抗 伝統テニス大会 の規則ロジック。
// ブラウザ(window.TennisRules)とNode(require)の両方から使えるUMD形式。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TennisRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TOURNAMENT = {
    name: '第44回 チョンブリー県内クラブ・同好会対抗 伝統テニス大会',
    date: '2026-11-14',
    venue: 'Greta Sport Club Pattaya',
    minPlayers: 10, // 1.3
    maxPlayers: 20,
    maxSpecial: 2, // 1.2(4)
  };

  // 2章の年齢条件。並びは 3.7 の試合順。
  // kind: 'W'=女子2人 / 'M'=男子2人 / 'X'=女子1人+男子1人
  const EVENTS = [
    { id: 'WD80', no: 1, kind: 'W', minEach: 30, minSum: 80,
      ja: '女子ダブルス(合計80歳以上)', th: 'หญิงคู่ (อายุรวม 80 ปีขึ้นไป)',
      rule: '各30歳以上・合計80歳以上' },
    { id: 'MD120', no: 2, kind: 'M', minEach: 55, minSum: 120,
      ja: '男子ダブルス(合計120歳以上)', th: 'ชายคู่ (อายุรวม 120 ปีขึ้นไป)',
      rule: '各55歳以上・合計120歳以上' },
    { id: 'MO', no: 3, kind: 'M', minEach: 25, minSum: 0,
      ja: '一般男子ダブルス', th: 'ชายคู่ทั่วไป',
      rule: '各25歳以上' },
    { id: 'XD100', no: 4, kind: 'X', minW: 40, minM: 50, minSum: 100,
      ja: '混合ダブルス(合計100歳以上)', th: 'คู่ผสม (อายุรวม 100 ปีขึ้นไป)',
      rule: '女子40歳以上・男子50歳以上・合計100歳以上' },
    { id: 'MD100', no: 5, kind: 'M', minEach: 40, minSum: 100,
      ja: '男子ダブルス(合計100歳以上)', th: 'ชายคู่ (อายุรวม 100 ปีขึ้นไป)',
      rule: '各40歳以上・合計100歳以上' },
  ];

  const ELIGIBILITY = [
    { id: 'resident', ja: '県内に住民登録6か月以上' },
    { id: 'work', ja: '県内に勤務先' },
    { id: 'veteran', ja: '過去3回以上出場' },
    { id: 'special', ja: '特別枠' },
  ];

  // 年齢は管理者が直接入力する(大会当日時点の年齢)。不正値は null
  function toAge(v) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 10 && n <= 110 ? n : null;
  }

  // 旧データ(生年月日入力)からの移行用: 大会日時点の満年齢
  function ageFromBirth(birth) {
    const m = /^(\d{4})(?:-(\d{2})-(\d{2}))?$/.exec(String(birth || '').trim());
    if (!m) return null;
    const [ty, tm, td] = TOURNAMENT.date.split('-').map(Number);
    const by = Number(m[1]);
    if (!m[2]) return ty - by;
    const bm = Number(m[2]), bd = Number(m[3]);
    return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
  }

  // 1人がその種目のどちらかの枠に入れる可能性があるか(候補絞り込み用)
  function canEnter(ev, player, age) {
    if (age == null) return false;
    if (ev.kind === 'W') return player.gender === 'F' && age >= ev.minEach;
    if (ev.kind === 'M') return player.gender === 'M' && age >= ev.minEach;
    if (player.gender === 'F') return age >= ev.minW;
    return player.gender === 'M' && age >= ev.minM;
  }

  // ペアの検証。a,b は {player, age}。errors が空なら出場可。
  function checkPair(ev, a, b) {
    const errors = [];
    if (!a || !b) return { ok: false, errors: ['2人を選んでください'] };
    if (a.player.id === b.player.id) return { ok: false, errors: ['同じ選手が2回選ばれています'] };
    for (const p of [a, b]) {
      if (p.age == null) errors.push(`${p.player.name}: 年齢が未入力`);
    }
    if (errors.length) return { ok: false, errors };
    if (ev.kind === 'X') {
      const w = [a, b].find((p) => p.player.gender === 'F');
      const m = [a, b].find((p) => p.player.gender === 'M');
      if (!w || !m) errors.push('女子1人と男子1人の組み合わせにしてください');
      else {
        if (w.age < ev.minW) errors.push(`${w.player.name}は女子${ev.minW}歳以上の条件を満たしません`);
        if (m.age < ev.minM) errors.push(`${m.player.name}は男子${ev.minM}歳以上の条件を満たしません`);
      }
    } else {
      const g = ev.kind === 'W' ? 'F' : 'M';
      for (const p of [a, b]) {
        if (p.player.gender !== g) errors.push(`${p.player.name}は${g === 'F' ? '女子' : '男子'}ではありません`);
        else if (p.age < ev.minEach) errors.push(`${p.player.name}は各${ev.minEach}歳以上の条件を満たしません`);
      }
    }
    const sum = a.age + b.age;
    if (ev.minSum && sum < ev.minSum) errors.push(`2人の合計年齢が${ev.minSum}歳に届きません`);
    return { ok: errors.length === 0, errors, sum };
  }

  // 名簿全体のチェック(1.2, 1.3)
  function checkRoster(players) {
    const errors = [], warnings = [];
    const n = players.length;
    if (n < TOURNAMENT.minPlayers) errors.push(`登録選手が${n}人です(${TOURNAMENT.minPlayers}人以上が必要)`);
    if (n > TOURNAMENT.maxPlayers) errors.push(`登録選手が${n}人です(${TOURNAMENT.maxPlayers}人以下にしてください)`);
    const special = players.filter((p) => p.eligibility === 'special');
    if (special.length > TOURNAMENT.maxSpecial) {
      errors.push(`特別枠が${special.length}人です(1チーム${TOURNAMENT.maxSpecial}人まで)`);
    }
    for (const p of players) {
      if (!p.name) warnings.push('名前が空欄の選手がいます');
      if (toAge(p.age) == null) warnings.push(`${p.name || '(名前なし)'}: 年齢が未入力(10〜110の整数)`);
      if (!p.eligibility) warnings.push(`${p.name || '(名前なし)'}: 出場資格が未選択`);
    }
    return { errors, warnings: [...new Set(warnings)] };
  }

  // 1つの対戦で5種目すべてを、1人1種目で埋める組み合わせを探す(バックトラック)。
  // fixed: { eventId: [idA, idB] } 既に決まっている枠はそのまま使う。
  // load: { playerId: 出場数 } 少ない人から優先して、出場を均等にする。
  function autoAssign(entries, fixed, load, opts) {
    const allowRepeat = opts && opts.allowRepeat;
    const used = new Set();
    const result = {};
    for (const ev of EVENTS) {
      const pair = fixed && fixed[ev.id];
      if (pair && pair[0] && pair[1]) {
        result[ev.id] = pair.slice();
        if (!allowRepeat) pair.forEach((id) => used.add(id));
      }
    }
    const score = (e) => (load[e.player.id] || 0);
    // 候補の少ない(条件の厳しい)種目から決める
    const todo = EVENTS.filter((ev) => !result[ev.id]).map((ev) => {
      const pairs = [];
      const cands = entries.filter((e) => canEnter(ev, e.player, e.age));
      for (let i = 0; i < cands.length; i++) {
        for (let j = i + 1; j < cands.length; j++) {
          if (checkPair(ev, cands[i], cands[j]).ok) pairs.push([cands[i], cands[j]]);
        }
      }
      // 出場数の少ない人 → 合計年齢が条件ぎりぎり(若い選手を温存しない)の順
      pairs.sort((p, q) => (score(p[0]) + score(p[1])) - (score(q[0]) + score(q[1]))
        || (p[0].age + p[1].age) - (q[0].age + q[1].age));
      return { ev, pairs };
    }).sort((x, y) => x.pairs.length - y.pairs.length);

    let steps = 0;
    function go(k) {
      if (k === todo.length) return true;
      if (++steps > 200000) return false;
      for (const [a, b] of todo[k].pairs) {
        if (!allowRepeat && (used.has(a.player.id) || used.has(b.player.id))) continue;
        result[todo[k].ev.id] = [a.player.id, b.player.id];
        if (!allowRepeat) { used.add(a.player.id); used.add(b.player.id); }
        if (go(k + 1)) return true;
        if (!allowRepeat) { used.delete(a.player.id); used.delete(b.player.id); }
        delete result[todo[k].ev.id];
      }
      return false;
    }
    const ok = go(0);
    return { ok, lineup: ok ? result : null };
  }

  // 参加チーム数から大会方式(3.1〜3.5)の説明と、自チームの最大試合数を返す
  function formatFor(teams) {
    teams = Number(teams);
    if (!teams || teams < 2) return null;
    if (teams <= 5) return { text: `${teams}チームの総当たり戦。合計得点で順位を決定(3.5)`, matches: teams - 1 };
    if (teams === 6) return { text: '3チームずつ2組の総当たり → 準決勝(A1対B2・B1対A2)→ 決勝/3位決定戦。各組3位は5位決定戦(3.4)', matches: 4 };
    const a = Math.ceil(teams / 2);
    if (teams === 7 || teams === 8) return { text: `A・B 2組(${a}チーム+${teams - a}チーム)の総当たり → 同順位同士で決勝・3位・5位・7位決定戦(3.1/3.2)`, matches: a };
    return { text: `A・B 2組(${a}チーム+${teams - a}チーム)の総当たり → 各組1位で決勝、2位で3位決定戦(3.3)`, matches: a };
  }

  return { TOURNAMENT, EVENTS, ELIGIBILITY, toAge, ageFromBirth, canEnter, checkPair, checkRoster, autoAssign, formatFor };
});
