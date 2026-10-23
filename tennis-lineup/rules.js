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
    fee: 6000, // 5. 参加費(1チーム・バーツ)
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

  // 全対戦をまとめて決める: 各対戦のチーム勝率の平均を高く保ちつつ、選手ごとの出場回数を
  // できるだけそろえる。各対戦の上位候補(suggestLineups)から1案ずつ選び、
  // 「平均勝率 − λ × 出場回数のばらつき(平均からの差の2乗の平均)」が最大になるよう
  // 対戦ごとに選び直す(座標降下)を数回くり返す。
  function balancedLineups(entries, oppLevels, opts) {
    const o = Object.assign({ allowRepeat: false, lambda: 0.08, passes: 6 }, opts || {});
    const M = oppLevels.length;
    const first = oppLevels.map((opp) => suggestLineups(entries, opp, { allowRepeat: o.allowRepeat, top: 1 })[0]);
    if (!M || first.some((c) => !c)) return null;
    // 出場できる可能性のある選手(どれかの種目に出られる人)だけで出場回数をそろえる
    const active = entries.filter((e) => EVENTS.some((ev) => canEnter(ev, e.player, e.age))).map((e) => e.player.id);
    const ideal = (10 * M) / active.length;
    const ids = (lu) => Object.values(lu).flat();
    const pick = first.slice();
    const evaluate = () => {
      const counts = {};
      active.forEach((id) => (counts[id] = 0));
      pick.forEach((c) => ids(c.lineup).forEach((id) => (counts[id] = (counts[id] || 0) + 1)));
      const spread = active.reduce((a, id) => a + (counts[id] - ideal) ** 2, 0) / active.length;
      const avgP = pick.reduce((a, c) => a + c.p, 0) / M;
      return { total: avgP - o.lambda * spread, avgP, counts };
    };
    let cur = evaluate().total;
    for (let pass = 0; pass < o.passes; pass++) {
      let changed = false;
      for (let m = 0; m < M; m++) {
        // ほかの対戦での出場回数から、この対戦で各選手を使うときの追加コストを出す
        const others = {};
        active.forEach((id) => (others[id] = 0));
        pick.forEach((c, i) => { if (i !== m) ids(c.lineup).forEach((id) => (others[id] = (others[id] || 0) + 1)); });
        const raw = {};
        active.forEach((id) => (raw[id] = (o.lambda * M / active.length) * ((others[id] + 1 - ideal) ** 2 - (others[id] - ideal) ** 2)));
        const minRaw = Math.min(...Object.values(raw));
        const penalty = {};
        active.forEach((id) => (penalty[id] = raw[id] - minRaw)); // 全員に同じ定数を足しても順位は変わらない
        const cand = suggestLineups(entries, oppLevels[m], { allowRepeat: o.allowRepeat, top: 1, penalty })[0];
        if (!cand) continue;
        const keep = pick[m];
        pick[m] = cand;
        const t = evaluate().total;
        if (t > cur + 1e-9) { cur = t; changed = true; } else pick[m] = keep;
      }
      if (!changed) break;
    }
    const r = evaluate();
    return { lineups: pick.map((c) => c.lineup), probs: pick.map((c) => c.p), avgP: r.avgP, counts: r.counts };
  }

  // 出場回数の均等を最優先にした全対戦の組み合わせ(勝率は同じくらい均等な案どうしの比較にだけ効く)
  function fairLineups(entries, oppLevels, opts) {
    return balancedLineups(entries, oppLevels, Object.assign({ lambda: 50, passes: 12 }, opts || {}));
  }

  // 参加チーム数から、自チームが戦う対戦カードを大会規則3章どおりに作る。
  // 組の大きさが違うとき(7・9チーム)は、多い方の組に入った場合(試合数が最大)で作る。
  function matchPlan(teams) {
    teams = Number(teams);
    if (!teams || teams < 2 || teams > 10) return [];
    const cards = [];
    if (teams <= 5) {
      for (let i = 1; i < teams; i++) cards.push({ label: `総当たり 第${i}試合`, note: `${teams}チームの総当たり(3.5)。合計得点で順位を決定` });
      return cards;
    }
    const g = Math.ceil(teams / 2); // 自チームの組のチーム数(最大)
    for (let i = 1; i < g; i++) cards.push({ label: `予選 第${i}試合`, note: `組内の総当たり(${g}チームの組・3.2)` });
    if (teams === 6) {
      cards.push({ label: '準決勝 / 5位決定戦', note: '組1位はもう一方の組の2位と、組2位はもう一方の組の1位と準決勝。組3位は5位決定戦(3.4)' });
      cards.push({ label: '決勝 / 3位決定戦', note: '準決勝の勝者は決勝、敗者は3位決定戦。組3位はこの試合なし(3.4)' });
    } else if (teams <= 8) {
      cards.push({ label: '順位決定戦', note: `両組の同順位どうしで対戦。1位:決勝、2位:3位決定戦、3位:5位決定戦、4位:7位決定戦(3.1/3.2)${teams === 7 ? '。7チームのときB組は3チームのため、A組4位はこの試合なし' : ''}` });
    } else {
      cards.push({ label: '決勝 / 3位決定戦', note: '組1位どうしで決勝、組2位どうしで3位決定戦。組3位以下はこの試合なし(3.3)' });
    }
    return cards;
  }

  // 参加費を出場回数(種目への出場数)に比例して分ける。1バーツ単位で、合計がちょうど total になるよう
  // 端数は小数部の大きい人から1バーツずつ足す(最大剰余法)。全員0回なら全員0。
  function splitFee(total, counts) {
    const names = Object.keys(counts);
    const sum = names.reduce((a, k) => a + counts[k], 0);
    const out = {};
    if (!sum) { names.forEach((k) => (out[k] = 0)); return out; }
    const raw = names.map((k, i) => ({ k, i, v: (total * counts[k]) / sum }));
    raw.forEach((r) => (out[r.k] = Math.floor(r.v)));
    let rest = total - raw.reduce((a, r) => a + out[r.k], 0);
    raw.sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)) || a.i - b.i);
    for (const r of raw) { if (rest <= 0) break; out[r.k]++; rest--; }
    return out;
  }

  // ---------- 勝率予測(管理者のみ) ----------
  // レベルは1〜10。ペアの強さ=2人の平均。相手ペアの強さとの差からロジスティック曲線で
  // その種目の勝率を推定する(差1で約65%、差2で約77%、差3で約86%)。
  const LEVEL_DEFAULT = 5;
  const LEVEL_K = 0.6;
  const toLevel = (v) => {
    const n = Number(v);
    return v !== '' && v != null && Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
  };
  function eventWinProb(ourLevels, oppLevel) {
    const our = ourLevels.reduce((a, b) => a + b, 0) / ourLevels.length;
    return 1 / (1 + Math.exp(-LEVEL_K * (our - oppLevel)));
  }
  // 5種目中3勝以上する確率(各種目は独立と仮定)
  function teamWinProb(ps) {
    let dist = [1];
    for (const p of ps) {
      const next = new Array(dist.length + 1).fill(0);
      dist.forEach((q, k) => { next[k] += q * (1 - p); next[k + 1] += q * p; });
      dist = next;
    }
    const need = Math.floor(ps.length / 2) + 1;
    return dist.slice(need).reduce((a, b) => a + b, 0);
  }

  // チーム勝率が高い組み合わせを上位 top 件まで探す(分枝限定法)。
  // entries: [{player, age, level}] / oppLevel: 相手の強さ(数値 or {eventId: 数値})
  function suggestLineups(entries, oppLevel, opts) {
    const allowRepeat = opts && opts.allowRepeat;
    const top = (opts && opts.top) || 3;
    const opp = (ev) => (typeof oppLevel === 'object' ? oppLevel[ev.id] : oppLevel) ?? LEVEL_DEFAULT;
    const lv = (e) => e.level ?? LEVEL_DEFAULT;
    const lists = EVENTS.map((ev) => {
      const cands = entries.filter((e) => canEnter(ev, e.player, e.age));
      const pairs = [];
      for (let i = 0; i < cands.length; i++) {
        for (let j = i + 1; j < cands.length; j++) {
          if (checkPair(ev, cands[i], cands[j]).ok) {
            pairs.push({ ids: [cands[i].player.id, cands[j].player.id], p: eventWinProb([lv(cands[i]), lv(cands[j])], opp(ev)) });
          }
        }
      }
      pairs.sort((a, b) => b.p - a.p);
      return { ev, pairs };
    });
    if (lists.some((l) => !l.pairs.length)) return [];
    // opts.penalty: {選手id: 0以上の値}。順位は「チーム勝率 − 選んだ選手のpenaltyの合計」で決める
    // (出場回数をそろえるために balancedLineups が使う。未指定なら勝率だけ)
    const pen = (opts && opts.penalty) || {};
    const penOf = (pair) => (pen[pair.ids[0]] || 0) + (pen[pair.ids[1]] || 0);
    if (opts && opts.penalty) lists.forEach((l) => l.pairs.sort((a, b) => (b.p - penOf(b)) - (a.p - penOf(a))));
    // 候補の少ない種目から決める
    const order = lists.slice().sort((a, b) => a.pairs.length - b.pairs.length);
    const best = [];
    const used = new Set();
    const chosen = [];
    let steps = 0;
    const floor = () => (best.length < top ? -Infinity : best[best.length - 1].s);
    let penSoFar = 0;
    function go(k) {
      if (++steps > 300000) return;
      if (k === order.length) {
        const ps = chosen.map((c) => c.p);
        const p = teamWinProb(ps);
        const s = p - penSoFar;
        if (s <= floor()) return;
        const lineup = {}, eventP = {};
        order.forEach((l, i) => { lineup[l.ev.id] = chosen[i].ids.slice(); eventP[l.ev.id] = chosen[i].p; });
        best.push({ lineup, eventP, p, s });
        best.sort((a, b) => b.s - a.s);
        if (best.length > top) best.pop();
        return;
      }
      // 上限: 残りの種目に最強ペアを置けたとしても上位に入らないなら打ち切る
      // (penalty は0以上なので、これまでの合計を引いた値が上限になる)
      const bound = teamWinProb([...chosen.map((c) => c.p), ...order.slice(k).map((l) => Math.max(...l.pairs.map((x) => x.p)))]) - penSoFar;
      if (bound <= floor()) return;
      for (const pair of order[k].pairs) {
        if (!allowRepeat && (used.has(pair.ids[0]) || used.has(pair.ids[1]))) continue;
        chosen.push(pair);
        penSoFar += penOf(pair);
        if (!allowRepeat) pair.ids.forEach((id) => used.add(id));
        go(k + 1);
        penSoFar -= penOf(pair);
        chosen.pop();
        if (!allowRepeat) pair.ids.forEach((id) => used.delete(id));
      }
    }
    go(0);
    return best;
  }

  return { fairLineups, balancedLineups, matchPlan, LEVEL_DEFAULT, toLevel, eventWinProb, teamWinProb, suggestLineups, TOURNAMENT, splitFee, EVENTS, ELIGIBILITY, toAge, ageFromBirth, canEnter, checkPair, checkRoster, autoAssign, formatFor };
});
