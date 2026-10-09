// 伝統テニス大会 オーダー表(静的アプリ・データは端末のlocalStorageに保存)
(function () {
  const R = window.TennisRules;
  const KEY = 'tennis-lineup-v1';
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const blank = () => ({
    settings: { teamName: '', fee: R.TOURNAMENT.fee, teams: 8, oneEvent: true, rosterLang: 'ja' },
    players: [],
    matches: [],
  });

  let state = load();

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.players)) return migrate(s);
    } catch (e) { /* 保存領域が使えない環境でも動かす */ }
    return blank();
  }
  // 旧形式(生年月日入力)のデータを、年齢入力+備考に移す
  function migrate(s) {
    const out = { ...blank(), ...s, settings: { ...blank().settings, ...s.settings } };
    delete out.settings.ageMode;
    out.players = s.players.map((p) => {
      if (!('birth' in p)) return { note: '', ...p };
      const { birth, ...rest } = p;
      const a = R.ageFromBirth(birth);
      return { ...rest, age: rest.age ?? (a == null ? '' : a), note: rest.note || (birth ? `生年月日 ${birth}` : '') };
    });
    return out;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* noop */ }
  }

  const age = (p) => R.toAge(p.age);
  const entries = () => state.players.filter((p) => p.name).map((p) => ({ player: p, age: age(p) }));
  const byId = (id) => state.players.find((p) => p.id === id);
  const entryOf = (id) => { const p = byId(id); return p ? { player: p, age: age(p) } : null; };
  // 確認ダイアログ(confirm)が使えない環境もあるので、同じボタンを2回押して確定する方式にする
  function armed(btn, msg) {
    if (btn.dataset.armed) return true;
    const orig = btn.textContent;
    btn.dataset.armed = '1';
    btn.textContent = msg;
    btn.classList.add('armed');
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = orig; btn.classList.remove('armed'); } }, 4000);
    return false;
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 6000);
  }
  const label = (p) => (p ? `${p.name}${p.eligibility === 'special' ? '(特)' : ''}` : '');

  // ---------- 選手名簿 ----------
  function renderPlayers() {
    const list = $('#playerList');
    list.innerHTML = '';
    const tpl = $('#playerTpl');
    for (const p of state.players) {
      const el = tpl.content.firstElementChild.cloneNode(true);
      el.dataset.id = p.id;
      const elig = $('.p-elig', el);
      for (const e of R.ELIGIBILITY) elig.insertAdjacentHTML('beforeend', `<option value="${e.id}">${esc(e.ja)}</option>`);
      $('.p-name', el).value = p.name;
      $('.p-gender', el).value = p.gender;
      $('.p-age', el).value = p.age ?? '';
      $('.p-note', el).value = p.note || '';
      elig.value = p.eligibility;
      list.appendChild(el);
    }
    refreshDerived();
  }

  function refreshDerived() {
    for (const el of $$('#playerList .player')) {
      const p = byId(el.dataset.id);
      $('.p-age', el).classList.toggle('invalid', !!p && p.age !== '' && age(p) == null);
    }
    const n = state.players.length;
    $('#loadSample').hidden = n > 0;
    $('#rosterCount').textContent = `${n}人(男${state.players.filter((p) => p.gender === 'M').length}・女${state.players.filter((p) => p.gender === 'F').length})`;
    const { errors, warnings } = R.checkRoster(state.players);
    $('#rosterCheck').innerHTML = (errors.length || warnings.length)
      ? `<div class="card alert">${errors.map((e) => `<p class="err">✕ ${esc(e)}</p>`).join('')}${warnings.map((w) => `<p class="warn">! ${esc(w)}</p>`).join('')}</div>`
      : '<div class="card ok">✓ 名簿は規則(10〜20人・特別枠2人まで)を満たしています</div>';
    renderCoverage();
    save();
  }

  function renderCoverage() {
    const es = entries();
    $('#coverage').innerHTML = R.EVENTS.map((ev) => {
      const c = es.filter((e) => R.canEnter(ev, e.player, e.age));
      let possible = false;
      for (let i = 0; i < c.length && !possible; i++) for (let j = i + 1; j < c.length && !possible; j++) possible = R.checkPair(ev, c[i], c[j]).ok;
      const names = c.sort((a, b) => b.age - a.age).map((e) => `${esc(e.player.name)}<small>${e.age}</small>`).join('、');
      return `<div class="cov ${possible ? '' : 'bad'}">
        <div><b>${ev.no}. ${esc(ev.ja)}</b> <small>${esc(ev.rule)}</small></div>
        <div>${possible ? '✓' : '✕ 組めるペアがありません'} ${names || '<span class="muted">該当者なし</span>'}</div>
      </div>`;
    }).join('');
  }

  $('#playerList').addEventListener('input', (ev) => {
    const row = ev.target.closest('.player');
    const p = row && byId(row.dataset.id);
    if (!p) return;
    const t = ev.target;
    if (t.classList.contains('p-name')) p.name = t.value.trim();
    if (t.classList.contains('p-gender')) p.gender = t.value;
    if (t.classList.contains('p-age')) p.age = t.value === '' ? '' : Number(t.value);
    if (t.classList.contains('p-note')) p.note = t.value;
    if (t.classList.contains('p-elig')) p.eligibility = t.value;
    refreshDerived();
  });
  $('#playerList').addEventListener('change', (ev) => ev.target.dispatchEvent(new Event('input', { bubbles: true })));
  $('#playerList').addEventListener('click', (ev) => {
    if (!ev.target.classList.contains('p-del')) return;
    const id = ev.target.closest('.player').dataset.id;
    const p = byId(id);
    const usedIn = state.matches.filter((m) => Object.values(m.lineup).some((pair) => pair.includes(id))).length;
    if (!armed(ev.target, usedIn ? `削除(${usedIn}試合から外れます)` : '削除する')) return;
    toast(`${p.name || '選手'}を削除しました`);
    state.players = state.players.filter((x) => x.id !== id);
    for (const m of state.matches) for (const k in m.lineup) m.lineup[k] = m.lineup[k].map((x) => (x === id ? '' : x));
    renderPlayers();
  });
  $('#loadSample').addEventListener('click', () => {
    const sample = [['佐藤 花子', 'F', 36], ['鈴木 恵子', 'F', 51], ['高橋 由美', 'F', 46], ['田中 健', 'M', 31],
      ['伊藤 翔', 'M', 28], ['渡辺 誠', 'M', 59], ['山本 茂', 'M', 66], ['中村 浩', 'M', 53],
      ['小林 大輔', 'M', 48], ['加藤 正', 'M', 61], ['Somchai', 'M', 41]];
    state.settings.teamName = state.settings.teamName || 'サンプルクラブ';
    state.players = sample.map(([name, gender, a], i) => ({ id: uid(), name, gender, age: a, eligibility: i === 10 ? 'special' : 'work', note: '' }));
    state.matches = [1, 2, 3].map((n) => ({ id: uid(), label: `予選${n}`, opponent: ['Sriracha TC', 'Bang Saen', 'Jomtien'][n - 1], lineup: {} }));
    totals = {};
    for (const m of state.matches) {
      const r = R.autoAssign(entries(), {}, loadCount(m.id), {});
      if (r.ok) m.lineup = r.lineup;
    }
    renderAll();
    toast('サンプルを入れました。「すべて消去」で消せます');
  });
  $('#addPlayer').addEventListener('click', () => {
    state.players.push({ id: uid(), name: '', gender: 'M', age: '', eligibility: '', note: '' });
    renderPlayers();
    const rows = $$('#playerList .p-name');
    rows[rows.length - 1].focus();
  });

  // ---------- 対戦オーダー ----------
  function loadCount(exceptMatchId) {
    const load = {};
    for (const m of state.matches) {
      if (m.id === exceptMatchId) continue;
      for (const pair of Object.values(m.lineup)) for (const id of pair) if (id) load[id] = (load[id] || 0) + 1;
    }
    return load;
  }

  let totals = {};
  function slotOptions(ev, slot, selected) {
    const es = entries().filter((e) => {
      if (ev.kind === 'X') return e.player.gender === (slot === 0 ? 'F' : 'M');
      return e.player.gender === (ev.kind === 'W' ? 'F' : 'M');
    }).sort((a, b) => Number(R.canEnter(ev, b.player, b.age)) - Number(R.canEnter(ev, a.player, a.age)));
    // 出場回数ごとにグループ分け(少ない順)。グループ内は出場条件を満たす人が先
    const groups = new Map();
    for (const e of es) {
      const n = totals[e.player.id] || 0;
      if (!groups.has(n)) groups.set(n, []);
      groups.get(n).push(e);
    }
    const opts = [...groups.keys()].sort((a, b) => a - b).map((n) => `<optgroup label="出場${n}試合">${groups.get(n).map((e) => {
      const fit = R.canEnter(ev, e.player, e.age);
      return `<option value="${e.player.id}" ${e.player.id === selected ? 'selected' : ''}>${fit ? '' : '× '}${esc(label(e.player))}(${n}試合)</option>`;
    }).join('')}</optgroup>`);
    const ph = ev.kind === 'X' ? (slot === 0 ? '女子を選択' : '男子を選択') : '選手を選択';
    return `<option value="">${ph}</option>${opts.join('')}`;
  }

  function matchIssues(m) {
    const out = {};
    const seen = {};
    for (const ev of R.EVENTS) {
      const pair = m.lineup[ev.id] || ['', ''];
      for (const id of new Set(pair)) if (id) (seen[id] = seen[id] || []).push(ev.no);
    }
    for (const ev of R.EVENTS) {
      const pair = m.lineup[ev.id] || ['', ''];
      if (!pair[0] && !pair[1]) { out[ev.id] = { state: 'empty', msgs: [] }; continue; }
      const res = R.checkPair(ev, entryOf(pair[0]), entryOf(pair[1]));
      const msgs = [...res.errors];
      const warns = [];
      if (state.settings.oneEvent) {
        for (const id of pair) if (id && seen[id].length > 1) warns.push(`${byId(id).name}は種目${seen[id].join('・')}に重複`);
      }
      out[ev.id] = { state: res.ok ? (warns.length ? 'warn' : 'ok') : 'err', msgs: [...msgs, ...[...new Set(warns)]] };
    }
    return out;
  }

  function renderMatches() {
    totals = loadCount(null);
    const f = R.formatFor(state.settings.teams);
    $('#formatText').textContent = f ? `${f.text}。自チームの試合数は最大${f.matches}試合。` : '';
    $('#matchList').innerHTML = state.matches.map((m, i) => {
      const issues = matchIssues(m);
      const done = R.EVENTS.filter((ev) => issues[ev.id].state === 'ok').length;
      return `<div class="card match" data-id="${m.id}">
        <div class="mhead">
          <input class="m-label" value="${esc(m.label)}" placeholder="例:予選1">
          <span>vs</span>
          <input class="m-opp" value="${esc(m.opponent)}" placeholder="相手チーム">
          <span class="badge ${done === 5 ? 'okb' : ''}">${done}/5</span>
        </div>
        ${R.EVENTS.map((ev) => {
          const pair = m.lineup[ev.id] || ['', ''];
          const is = issues[ev.id];
          return `<div class="ev ${is.state}" data-ev="${ev.id}">
            <div class="evh"><b>${ev.no}. ${esc(ev.ja)}</b><small>${esc(ev.rule)}</small></div>
            <div class="slots">
              <select data-slot="0">${slotOptions(ev, 0, pair[0])}</select>
              <select data-slot="1">${slotOptions(ev, 1, pair[1])}</select>
            </div>
            ${is.msgs.map((t) => `<p class="msg">${esc(t)}</p>`).join('')}
          </div>`;
        }).join('')}
        <div class="mbtns">
          <button data-act="auto">空き枠を自動で埋める</button>
          ${i > 0 ? '<button data-act="copy">前の対戦をコピー</button>' : ''}
          <button data-act="clear">クリア</button>
          <button data-act="del" class="danger">対戦を削除</button>
        </div>
      </div>`;
    }).join('') || '<div class="card muted">まだ対戦がありません。「+ 対戦を追加」で作成してください。</div>';
    save();
  }

  $('#matchList').addEventListener('change', (e) => {
    const card = e.target.closest('.match');
    const m = card && state.matches.find((x) => x.id === card.dataset.id);
    if (!m) return;
    if (e.target.matches('select[data-slot]')) {
      const evId = e.target.closest('.ev').dataset.ev;
      const pair = (m.lineup[evId] || ['', '']).slice();
      pair[Number(e.target.dataset.slot)] = e.target.value;
      m.lineup[evId] = pair;
      renderMatches();
    }
  });
  $('#matchList').addEventListener('input', (e) => {
    const card = e.target.closest('.match');
    const m = card && state.matches.find((x) => x.id === card.dataset.id);
    if (!m) return;
    if (e.target.classList.contains('m-label')) m.label = e.target.value;
    if (e.target.classList.contains('m-opp')) m.opponent = e.target.value;
    save();
  });
  $('#matchList').addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    const idx = state.matches.findIndex((x) => x.id === e.target.closest('.match').dataset.id);
    const m = state.matches[idx];
    if (act === 'del') {
      if (!armed(e.target, 'もう一度押すと削除')) return;
      state.matches.splice(idx, 1);
    }
    if (act === 'clear') m.lineup = {};
    if (act === 'copy') m.lineup = JSON.parse(JSON.stringify(state.matches[idx - 1].lineup));
    if (act === 'auto') {
      // 正しく組めている種目は残し、それ以外を埋め直す
      const issues = matchIssues(m);
      const fixed = {};
      for (const ev of R.EVENTS) if (issues[ev.id].state === 'ok') fixed[ev.id] = m.lineup[ev.id];
      const r = R.autoAssign(entries(), fixed, loadCount(m.id), { allowRepeat: !state.settings.oneEvent });
      if (!r.ok) {
        toast('条件を満たす組み合わせが見つかりませんでした。名簿の「種目ごとの出場可能な選手」を確認するか、決まっている枠を外してから再実行してください。');
        return;
      }
      m.lineup = r.lineup;
    }
    renderMatches();
  });
  $('#addMatch').addEventListener('click', () => {
    state.matches.push({ id: uid(), label: `予選${state.matches.length + 1}`, opponent: '', lineup: {} });
    renderMatches();
  });

  // ---------- 出場状況 ----------
  // 出場回数+参加費分担の表(管理者画面・メンバー画面で共用。年齢は扱わない)
  // ms: [{ label, pairs: [[名前,名前] × 5種目] }]
  function statsHtml(names, ms, fee) {
    const counts = {};
    const cellsOf = {};
    for (const name of names) {
      counts[name] = 0;
      cellsOf[name] = ms.map((m) => {
        const evs = R.EVENTS.filter((ev, i) => (m.pairs[i] || []).includes(name));
        counts[name] += evs.length;
        return `<td>${evs.map((ev) => ev.no).join('・')}</td>`;
      }).join('');
    }
    const share = R.splitFee(Number(fee) || 0, counts);
    const rows = names.map((name) => `<tr class="${counts[name] ? '' : 'zero'}"><th>${esc(name)}</th>${cellsOf[name]}<td><b>${counts[name]}</b></td><td class="fee">${share[name].toLocaleString()}</td></tr>`).join('');
    const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);
    return `<div class="scroll"><table class="stats">
      <thead><tr><th>選手</th>${ms.map((m) => `<th>${esc(m.label || '対戦')}</th>`).join('')}<th>計</th><th>参加費</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th>合計</th>${ms.map(() => '<td></td>').join('')}<td><b>${totalCount}</b></td><td class="fee">${totalCount ? Number(fee).toLocaleString() : 0}</td></tr></tfoot>
      </table></div>
      <p class="hint">数字は種目番号(1女子D / 2男子D120 / 3一般男子D / 4混合D / 5男子D100)。
        参加費${Number(fee).toLocaleString()}バーツを出場回数に比例して分担(1バーツ単位・端数は合計が合うよう調整)。</p>`;
  }
  const adminMatches = () => state.matches.map((m) => ({
    label: m.label,
    pairs: R.EVENTS.map((ev) => (m.lineup[ev.id] || []).map((id) => (byId(id) || {}).name || '')),
  }));
  const namedPlayers = () => state.players.filter((p) => p.name).sort((a, b) => (a.gender === b.gender ? 0 : a.gender === 'F' ? -1 : 1));
  function feeShares() {
    const counts = {};
    for (const p of namedPlayers()) counts[p.name] = 0;
    for (const m of adminMatches()) for (const pair of m.pairs) for (const n of pair) if (n in counts) counts[n]++;
    return { counts, share: R.splitFee(Number(state.settings.fee) || 0, counts) };
  }
  function renderStats() {
    $('#fee').value = state.settings.fee;
    if (!state.players.length) { $('#statsTable').innerHTML = '<p class="muted">選手がいません</p>'; return; }
    $('#statsTable').innerHTML = statsHtml(namedPlayers().map((p) => p.name), adminMatches(), state.settings.fee);
  }

  // ---------- 書き出し ----------
  function rosterText() {
    const th = state.settings.rosterLang === 'th';
    const sorted = (g) => state.players.filter((p) => p.gender === g && p.name).sort((a, b) => (age(a) ?? 999) - (age(b) ?? 999));
    const line = (p, i) => `${i + 1}. ${p.name}  ${age(p) ?? '?'}${th ? ' ปี' : '歳'}${p.eligibility === 'special' ? (th ? '  (พิเศษ)' : '  特別枠') : ''}`;
    const team = state.settings.teamName || (th ? '(ชื่อทีม)' : '(チーム名)');
    return [
      th ? `รายชื่อนักกีฬา ทีม ${team}` : `選手名簿 ${team}`,
      '',
      th ? '【ชาย】' : '【男子】', ...sorted('M').map(line),
      '',
      th ? '【หญิง】' : '【女子】', ...sorted('F').map(line),
    ].join('\n');
  }
  function feeText() {
    const { counts, share } = feeShares();
    const names = Object.keys(counts);
    if (!names.length || !state.matches.length) return '';
    return [`■ 参加費の分担(合計${Number(state.settings.fee).toLocaleString()}バーツ・出場回数に比例)`,
      ...names.map((n) => `${n}  ${counts[n]}回  ${share[n].toLocaleString()}バーツ`)].join('\n');
  }
  function lineupText() {
    return [lineupOnlyText(), feeText()].filter(Boolean).join('\n\n');
  }
  function lineupOnlyText() {
    return state.matches.map((m) => {
      const head = `■ ${m.label || '対戦'}${m.opponent ? ` vs ${m.opponent}` : ''}`;
      const lines = R.EVENTS.map((ev) => {
        const pair = (m.lineup[ev.id] || []).map(byId).filter(Boolean);
        return `${ev.no}. ${ev.ja}\n   ${pair.length ? pair.map((p) => p.name).join(' / ') : '(未定)'}`;
      });
      return [head, ...lines].join('\n');
    }).join('\n\n') || '(対戦がありません)';
  }
  // メンバー用閲覧リンク: 名前と種目だけをURLの#以降に入れる(年齢・資格・備考は入れない)
  function shareData() {
    return {
      t: state.settings.teamName,
      f: Number(state.settings.fee) || 0,
      n: state.players.filter((p) => p.name).sort((a, b) => (a.gender === b.gender ? 0 : a.gender === 'F' ? -1 : 1)).map((p) => p.name),
      m: state.matches.map((m) => ({
        l: m.label, o: m.opponent,
        p: R.EVENTS.map((ev) => (m.lineup[ev.id] || []).map((id) => (byId(id) || {}).name || '')),
      })),
    };
  }
  function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(str) {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  }
  function shareUrl() {
    return `${location.href.split('#')[0]}#view=${encode(shareData())}`;
  }

  function renderExport() {
    const url = shareUrl();
    $('#shareUrl').value = url;
    $('#shareOpen').href = url;
    $('#rosterText').value = rosterText();
    $('#lineupText').value = lineupText();
    $('#previewViewer').addEventListener('click', () => renderViewer(shareData(), true));
  $$('[data-rlang]').forEach((b) => b.classList.toggle('on', b.dataset.rlang === state.settings.rosterLang));
  }
  $$('[data-rlang]').forEach((b) => b.addEventListener('click', () => { state.settings.rosterLang = b.dataset.rlang; save(); renderExport(); }));
  $$('.copy').forEach((b) => b.addEventListener('click', async () => {
    const ta = $('#' + b.dataset.copy);
    try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand('copy'); }
    b.textContent = 'コピーしました';
    setTimeout(() => (b.textContent = 'コピー'), 1500);
  }));
  $('#saveFile').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tennis-lineup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#loadFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const s = JSON.parse(await file.text());
      if (!Array.isArray(s.players) || !Array.isArray(s.matches)) throw new Error('形式が違います');
      state = migrate(s);
      renderAll();
      toast('ファイルを読み込みました');
    } catch (err) {
      toast('読み込めませんでした: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });
  $('#resetAll').addEventListener('click', (e) => {
    if (!armed(e.target, 'もう一度押すとすべて消去')) return;
    state = blank();
    renderAll();
    toast('すべて消去しました');
  });

  // ---------- 共通 ----------
  function renderSettings() {
    $('#teamName').value = state.settings.teamName;
    $('#teams').value = state.settings.teams;
    $('#oneEvent').checked = state.settings.oneEvent;
  }
  $('#teamName').addEventListener('input', (e) => { state.settings.teamName = e.target.value; save(); });
  $('#fee').addEventListener('input', (e) => { state.settings.fee = Math.max(0, Math.round(Number(e.target.value) || 0)); save(); renderStats(); });
  $('#teams').addEventListener('input', (e) => { state.settings.teams = Number(e.target.value) || ''; renderMatches(); });
  $('#oneEvent').addEventListener('change', (e) => { state.settings.oneEvent = e.target.checked; renderMatches(); });

  const tabRenderers = { roster: renderPlayers, matches: renderMatches, stats: renderStats, export: renderExport };
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    $$('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
    tabRenderers[b.dataset.tab]();
    window.scrollTo(0, 0);
  }));

  function renderAll() {
    renderSettings();
    renderPlayers();
    renderMatches();
    renderStats();
    renderExport();
  }

  // メンバー用の閲覧画面(読み取り専用・年齢なし)
  function renderViewer(data, preview) {
    document.body.classList.add('viewer-mode');
    $('#app').hidden = true;
    $('.tabs').hidden = true;
    const v = $('#viewer');
    v.hidden = false;
    const matches = (data.m || []).map((m) => `<div class="card">
      <h2>${esc(m.l || '対戦')}${m.o ? ` <span class="vs">vs ${esc(m.o)}</span>` : ''}</h2>
      ${R.EVENTS.map((ev, i) => {
        const names = ((m.p || [])[i] || []).filter(Boolean);
        return `<div class="vrow"><div class="vev">${ev.no}. ${esc(ev.ja)}<small>${esc(ev.th)}</small></div>
          <div class="vnames">${names.length ? names.map(esc).join(' / ') : '<span class="muted">未定</span>'}</div></div>`;
      }).join('')}
    </div>`).join('');
    // 出場回数: 名簿の名前(年齢なし)+オーダーに出てくる名前
    const ms = data.m || [];
    const names = [...new Set([...(data.n || []), ...ms.flatMap((m) => (m.p || []).flat()).filter(Boolean)])];
    const stats = names.length && ms.length
      ? `<div class="card"><h2>出場回数と参加費の分担</h2>${statsHtml(names, ms.map((m) => ({ label: m.l, pairs: m.p || [] })), data.f ?? R.TOURNAMENT.fee)}</div>` : '';
    v.innerHTML = `${data.t ? `<p class="vteam">${esc(data.t)}</p>` : ''}${matches || '<div class="card muted">オーダーはまだありません</div>'}${stats}
      <p class="hint">この画面は閲覧専用です。オーダーの変更は管理者が行います。</p>
      ${preview ? '<div class="previewbar"><span>メンバー画面のプレビュー</span><button id="closePreview">管理画面に戻る</button></div>' : ''}`;
    if (preview) {
      window.scrollTo(0, 0);
      $('#closePreview').addEventListener('click', () => {
        v.hidden = true;
        $('#app').hidden = false;
        $('.tabs').hidden = false;
        document.body.classList.remove('viewer-mode');
      });
    }
  }

  const T = R.TOURNAMENT;
  $('#tourInfo').textContent = `${T.date.replace(/-/g, '/')}(土) ${T.venue}`;
  const viewParam = /^#view=(.+)$/.exec(location.hash);
  if (viewParam) {
    try { renderViewer(decode(viewParam[1])); } catch (e) { renderViewer({ m: [] }); }
  } else {
    renderAll();
  }
})();
