// 伝統テニス大会 オーダー表(静的アプリ)
// 保存先: claude.ai で開いたときはアカウントごとの非公開ストア(db の data/users/<id>/)、
// それ以外ではこの端末の localStorage。どちらの場合も localStorage にも控えを置く。
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
  // ---------- 保存 ----------
  let remote = null;      // アカウント保存先のドキュメント参照(使えないときは null)
  let lastSaved = '';     // 最後に保存した内容(変化がなければ書かない)
  let saveTimer = null, writing = false, again = false;
  function setSync(text, cls) {
    const el = $('#syncStatus');
    el.textContent = text;
    el.className = 'sync ' + (cls || '');
  }
  let memberMode = false; // 閲覧のみのメンバー(年齢・レベル等を含まない公開用データを表示するだけ)
  function save() {
    if (memberMode) return;
    const json = JSON.stringify(state);
    if (json === lastSaved) return;
    try { localStorage.setItem(KEY, json); } catch (e) { /* noop */ }
    if (!remote) return;
    dirty = true;
    setSync('保存中…', 'busy');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  }
  async function flush() {
    if (!remote) return;
    if (writing) { again = true; return; }
    writing = true;
    const json = JSON.stringify(state);
    try {
      const savedAt = Math.max(Date.now(), latestSavedAt + 1);
      latestSavedAt = savedAt;
      await remote.set({ state: JSON.parse(json), savedAt, by: clientId });
      if (publicRef) await publicRef.set({ view: shareData(), pub: publicState(), savedAt });
      lastSaved = json;
      if (JSON.stringify(state) === json) dirty = false;
      setSync('☁ 保存済み(管理者で共有)', 'ok');
    } catch (e) {
      setSync('⚠ 保存できませんでした(この端末には保存済み)', 'err');
      if (e && e.status === 409 && editLock) { writing = false; dirty = false; lockLost(e.message); return; }
    }
    writing = false;
    if (again) { again = false; flush(); }
  }
  // ---------- claude.ai での共有と権限 ----------
  // 共有メニューの「編集者(Editor)」以上 = 管理者と同じ権限: admin/state(全データ)を読み書き
  // それ以外(閲覧者など) = 閲覧のみ: public/order(名前・オーダー・回数・参加費だけ)を読む
  // ※ アクセス制御は db のルール(admin は admin 以上のみ読める)で行う
  const clientId = uid();
  let publicRef = null, dirty = false;
  let latestSavedAt = 0; // 自分が書いた/取り込んだ中で最新の保存時刻。これより古い通知は無視する
  const hasData = (s) => !!s && ((s.players || []).length + (s.matches || []).length > 0);
  function setRole(text) {
    const el = $('#roleBadge');
    el.textContent = text;
    el.hidden = !text;
  }
  function showApp() {
    $('#viewer').hidden = true;
    $('#app').hidden = false;
    $('.tabs').hidden = false;
    document.body.classList.remove('viewer-mode');
  }
  function startLocal() {
    setSync('この端末に保存されます', '');
    showApp();
  }
  // メンバーに見せてよい内容だけを取り出す(名前・性別・不参加・対戦カードとオーダー・チーム数・参加費)
  function publicState() {
    const s = state.settings;
    return {
      settings: { teamName: s.teamName, teams: s.teams, fee: s.fee, oneEvent: s.oneEvent, cardsFor: s.cardsFor || 0 },
      players: state.players.map((p) => ({ id: p.id, name: p.name, gender: p.gender, absent: !!p.absent })),
      matches: state.matches.map((m) => ({ id: m.id, label: m.label, note: m.note || '', opponent: m.opponent || '', lineup: m.lineup })),
    };
  }
  function startMember(db) {
    setRole('閲覧のみ');
    setSync('', '');
    $('#syncStatus').hidden = true;
    memberMode = true;
    document.body.classList.add('member-mode');
    renderViewer({ m: [] });
    $('#viewer').innerHTML = '<div class="card muted">読み込み中…</div>';
    db.doc('public/order').onSnapshot((snap) => {
      const d = snap.exists && snap.data();
      const view = d && d.view;
      if (d && d.pub) {
        // 管理者画面と同じタブ構成で、見るだけ(紫の管理者用部分と操作ボタンは出さない)
        state = migrate(d.pub);
        showApp();
        if ($('.tabs [data-tab="export"]').classList.contains('on')) $('.tabs [data-tab="roster"]').click();
        renderAll();
      } else if (view) renderViewer(view);
      else $('#viewer').innerHTML = '<div class="card"><h2>オーダー表</h2><p>まだオーダーが公開されていません。管理者が入力すると、ここに自動で表示されます。</p></div>';
    }, () => {
      $('#viewer').innerHTML = '<div class="card"><p>オーダーを読み込めませんでした。ページを開き直してください。</p></div>';
    });
  }
  // ---------- 編集ロック(Cloudflare版の管理者どうし) ----------
  // 編集は全体で1人だけ。入力を始めると自動で「編集中」になり、ほかの管理者の画面は
  // 「〇〇さんが編集中です」と表示して見るだけにする。3分間操作がなければ自動で終了。
  // 守っているのはサーバー(ロックを持たない保存は409で断る)。画面側は分かりやすく見せるだけ。
  // 見るだけの状態: 名簿・オーダー・参加費の入力欄とボタンだけを止める(画面全体を止めると表を横にスライドできなくなるため)
  const lockedArea = '#tab-roster, #tab-matches, #tab-stats';
  function lockControls(on) { $('#app').classList.toggle('controls-locked', !!on); }
  const controlsLocked = () => $('#app').classList.contains('controls-locked');
  for (const ev of ['beforeinput', 'keydown', 'paste', 'drop', 'change', 'click']) {
    $('#app').addEventListener(ev, (e) => {
      if (!controlsLocked() || !e.target.closest(lockedArea) || !e.target.closest('input, select, textarea, button, label')) return;
      if (ev === 'keydown' && e.key === 'Tab') return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  }
  const LOCK_RENEW_MS = 10000, LOCK_IDLE_MS = 3 * 60000, LOCK_POLL_MS = 4000;
  let editLock = null; // {api, ref, mine, holder, lastActive, renewTimer, acquiring}
  function applyEditable() {
    const ro = !!editLock && !editLock.mine && !!editLock.holder;
    lockControls(ro);
    for (const id of ['resetAll', 'loadFile', 'loadSample']) { const el = document.getElementById(id); if (el) el.disabled = ro; }
    $('#app').classList.toggle('readonly', ro);
    const bar = $('#lockBar');
    bar.hidden = false;
    if (editLock.mine) {
      bar.className = 'lockbar mine';
      bar.innerHTML = '<span>✏️ あなたが編集中です(ほかの管理者は見るだけになります)</span><button id="lockEnd">編集を終える</button>';
    } else if (editLock.holder) {
      bar.className = 'lockbar busy';
      bar.innerHTML = `<span>🔒 ${esc(editLock.holder.name || '他の管理者')}さんが編集中です。編集が終わるまでお待ちください(画面は自動で最新になります)</span>`;
    } else {
      bar.className = 'lockbar';
      bar.innerHTML = '<span>入力を始めると自動で「編集中」になり、ほかの管理者は同時に編集できなくなります。</span>';
    }
  }
  async function reloadFromServer() {
    const d = (await editLock.ref.get()).data();
    if (d && d.state) {
      state = migrate(d.state);
      latestSavedAt = d.savedAt || latestSavedAt;
      lastSaved = JSON.stringify(state);
      renderAll();
    }
  }
  function lockLost(message) {
    clearInterval(editLock.renewTimer);
    editLock.mine = false;
    toast(message || '編集の権利が切れました');
    reloadFromServer().catch(() => {});
    pollLock();
  }
  async function pollLock() {
    if (!editLock || editLock.mine) return;
    try {
      const s = await editLock.api.status();
      editLock.holder = s.holder && !s.mine ? s.holder : null;
    } catch (e) { /* 次の確認で */ }
    applyEditable();
  }
  async function beginEditing() {
    if (editLock.mine || editLock.acquiring || editLock.holder) { if (editLock.mine) editLock.lastActive = Date.now(); return; }
    editLock.acquiring = true;
    try {
      const r = await editLock.api.acquire();
      if (r.ok) {
        editLock.mine = true; editLock.holder = null; editLock.lastActive = Date.now();
        clearInterval(editLock.renewTimer);
        editLock.renewTimer = setInterval(renewLock, LOCK_RENEW_MS);
      } else {
        editLock.holder = r.holder || { name: '他の管理者' };
        toast(`${editLock.holder.name}さんが編集中です`);
        if (dirty) { dirty = false; clearTimeout(saveTimer); await reloadFromServer(); }
      }
    } catch (e) { /* 通信エラー: 次の操作で再挑戦 */ }
    editLock.acquiring = false;
    applyEditable();
  }
  async function renewLock() {
    if (!editLock.mine) return;
    if (Date.now() - editLock.lastActive > LOCK_IDLE_MS) { await endEditing(); toast('3分間操作がなかったので編集を終えました'); return; }
    const r = await editLock.api.acquire().catch(() => null);
    if (r && !r.ok) lockLost(`${(r.holder && r.holder.name) || '他の管理者'}さんが編集を始めました`);
  }
  async function endEditing() {
    if (!editLock.mine) return;
    clearInterval(editLock.renewTimer);
    clearTimeout(saveTimer);
    if (dirty) await flush(); // 未保存の変更を先に保存してから手放す
    editLock.mine = false;
    await editLock.api.release();
    applyEditable();
  }
  function startEditLock(api, ref) {
    editLock = { api, ref, mine: false, holder: null, lastActive: 0, renewTimer: null, acquiring: false };
    // 名簿・オーダー・参加費の画面と、読み込み/消去のボタンに触れたら編集開始
    const touch = (e) => {
      if (!e.target.closest('#tab-roster, #tab-matches, #tab-stats, #loadFile, #resetAll, .filebtn')) return;
      beginEditing();
    };
    for (const ev of ['pointerdown', 'keydown', 'focusin']) $('#app').addEventListener(ev, touch, true);
    $('#lockBar').addEventListener('click', (e) => { if (e.target.id === 'lockEnd') endEditing(); });
    window.addEventListener('pagehide', () => { if (editLock.mine) editLock.api.release({ keepalive: true }); });
    setInterval(pollLock, LOCK_POLL_MS);
    pollLock();
  }

  async function connectRemote() {
    const use = window.claude && window.claude.use;
    if (!use) { startLocal(); return; }
    try {
      const [db, user] = await Promise.all([use('db'), use('user')]);
      if (!db || !user) { startLocal(); return; }
      // 所有者は必ず管理者画面(canEdit が取れない環境でも閲覧専用にしない)
      const isAdmin = (await user.canEdit()) || (await user.isOwner());
      if (!isAdmin) { startMember(db); return; }
      setRole('管理者');
      const ref = db.doc('admin/state');
      publicRef = db.doc('public/order');
      let saved = (await ref.get()).data();
      latestSavedAt = (saved && saved.savedAt) || 0;
      saved = saved && saved.state;
      let moved = false;
      if (!hasData(saved) && (await user.isOwner())) {
        // 以前の保存先(所有者だけの非公開領域)から共有の管理者用データへ移す
        const id = await user.id();
        const old = id ? (await db.doc(`data/users/${id}/lineup`).get()).data() : null;
        if (old && hasData(old.state)) { saved = old.state; moved = true; }
      }
      remote = ref;
      if (hasData(saved)) {
        state = migrate(saved);
        lastSaved = moved ? '' : JSON.stringify(state);
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* noop */ }
        renderAll();
        if (moved) await flush(); else setSync('☁ 保存済み(管理者で共有)', 'ok');
      } else if (hasData(state)) {
        lastSaved = '';
        await flush(); // 端末にだけあったデータを移す
      } else {
        setSync('☁ 保存されます(管理者で共有)', 'ok');
      }
      showApp();
      const lockApi = await use('lock').catch(() => null);
      if (lockApi) startEditLock(lockApi, ref);
      // 他の管理者の変更をそのまま反映する(自分の書き込みと未保存の編集中は除く)
      ref.onSnapshot((snap) => {
        const d = snap.exists && snap.data();
        if (!d || !d.state || d.by === clientId || dirty || writing || (editLock && editLock.mine)) return;
        if (snap.metadata && snap.metadata.fromCache) return; // 確定していない(古いかもしれない)内容は使わない
        if (!(d.savedAt > latestSavedAt)) return;            // 手元より古い保存は無視
        latestSavedAt = d.savedAt;
        const next = migrate(d.state);
        const json = JSON.stringify(next);
        if (json === JSON.stringify(state)) { lastSaved = json; return; } // 同じ内容なら何もしない
        state = next;
        lastSaved = json;
        renderAll();
        toast('他の管理者の変更を反映しました');
      }, () => {});
    } catch (e) {
      remote = null;
      startLocal();
    }
  }

  const age = (p) => R.toAge(p.age);
  const lvl = (p) => R.toLevel(p.level);
  // 不参加にチェックした選手は、選択欄・自動作成・提案のすべてから外す
  const entries = () => state.players.filter((p) => p.name && !p.absent).map((p) => ({ player: p, age: age(p), level: lvl(p) }));
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
      $('.p-level', el).value = p.level ?? '';
      $('.p-abs', el).checked = !!p.absent;
      el.classList.toggle('absent', !!p.absent);
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
    const absent = state.players.filter((p) => p.absent).length;
    $('#rosterCount').textContent = `${n}人(男性${state.players.filter((p) => p.gender === 'M').length}・女性${state.players.filter((p) => p.gender === 'F').length})${absent ? `・不参加${absent}人` : ''}`;
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
      const names = c.sort((a, b) => b.age - a.age).map((e) => `${esc(e.player.name)}<small>${e.age}歳${e.level != null ? `・Lv${e.level}` : ''}</small>`).join('、');
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
    if (t.classList.contains('p-level')) { p.level = t.value === '' ? '' : Number(t.value); suggestions = {}; }
    if (t.classList.contains('p-abs')) { p.absent = t.checked; row.classList.toggle('absent', t.checked); suggestions = {}; }
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
    const levels = [7, 5, 8, 9, 6, 4, 6, 7, 5, 3, 8];
    state.players = sample.map(([name, gender, a], i) => ({ id: uid(), name, gender, age: a, level: levels[i], eligibility: i === 10 ? 'special' : 'work', note: '' }));
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
    const sel = selected && byId(selected);
    const pool = sel && sel.absent ? [...entries(), { player: sel, age: age(sel), level: lvl(sel) }] : entries();
    const es = pool.filter((e) => {
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
      const fit = memberMode || R.canEnter(ev, e.player, e.age);
      return `<option value="${e.player.id}" ${e.player.id === selected ? 'selected' : ''}>${fit ? '' : '× '}${esc(label(e.player))}${memberMode ? '' : `(${n}試合)`}</option>`;
    }).join('')}</optgroup>`);
    const ph = ev.kind === 'X' ? (slot === 0 ? '女子を選択' : '男子を選択') : '選手を選択';
    return `<option value="">${ph}</option>${opts.join('')}`;
  }

  function matchIssues(m) {
    if (memberMode) {
      const out = {};
      for (const ev of R.EVENTS) {
        const pair = m.lineup[ev.id] || ['', ''];
        out[ev.id] = { state: byId(pair[0]) && byId(pair[1]) ? 'ok' : 'empty', msgs: [] };
      }
      return out;
    }
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
      for (const id of pair) { const p = id && byId(id); if (p && p.absent) { msgs.push(`${p.name}は不参加です。別の選手に替えてください`); res.ok = false; } }
      const warns = [];
      if (state.settings.oneEvent) {
        for (const id of pair) if (id && seen[id].length > 1) warns.push(`${byId(id).name}は種目${seen[id].join('・')}に重複`);
      }
      out[ev.id] = { state: res.ok ? (warns.length ? 'warn' : 'ok') : 'err', msgs: [...msgs, ...[...new Set(warns)]] };
    }
    return out;
  }

  // ---------- 勝率予測と提案(管理者のみ・共有データには入れない) ----------
  let suggestions = {}; // matchId -> 提案リスト(画面上だけで保持)
  const oppLevel = (m) => R.toLevel(m.oppLevel) ?? R.LEVEL_DEFAULT;
  function lineupForecast(m) {
    const eventP = {};
    for (const ev of R.EVENTS) {
      const pair = (m.lineup[ev.id] || []).map(byId);
      if (pair.length === 2 && pair[0] && pair[1]) eventP[ev.id] = R.eventWinProb(pair.map((p) => lvl(p) ?? R.LEVEL_DEFAULT), oppLevel(m));
    }
    const full = R.EVENTS.every((ev) => ev.id in eventP);
    return { eventP, p: full ? R.teamWinProb(R.EVENTS.map((ev) => eventP[ev.id])) : null };
  }
  const pct = (p) => `${Math.round(p * 100)}%`;
  function forecastHtml(m) {
    const f = lineupForecast(m);
    const missing = state.players.filter((p) => p.name && lvl(p) == null).length;
    const sug = suggestions[m.id];
    const sugHtml = !sug ? '' : !sug.length
      ? '<p class="msg">条件を満たす組み合わせがありません</p>'
      : sug.map((s, i) => `<div class="sug">
          <div class="sugh"><b>案${i + 1} チーム勝率 ${pct(s.p)}</b><button data-act="apply" data-i="${i}">この案にする</button></div>
          ${R.EVENTS.map((ev) => `<div class="sugrow"><span>${ev.no}. ${esc(ev.ja)}</span>
            <span>${s.lineup[ev.id].map((id) => esc(byId(id).name)).join(' / ')}</span><span class="num">${pct(s.eventP[ev.id])}</span></div>`).join('')}
        </div>`).join('');
    return `<div class="forecast private">
      <div class="fhead">
        <span>🔒 勝率予測 ${f.p == null ? '<small>(5種目そろうと表示)</small>' : `<b class="big">${pct(f.p)}</b>`}</span>
        <label>相手の強さ <select class="m-opplv private">${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${n === oppLevel(m) ? 'selected' : ''}>Lv${n}</option>`).join('')}</select></label>
      </div>
      ${missing ? `<p class="msg">レベル未入力の選手が${missing}人います(Lv${R.LEVEL_DEFAULT}として計算)</p>` : ''}
      <button data-act="suggest">勝てる組み合わせを提案</button>
      ${sugHtml}
    </div>`;
  }

  // 混合ダブルスは「女子・男子」の順にそろえる(自動作成や提案の結果は男女の順が決まっていないため)
  function normalizeLineups() {
    for (const m of state.matches) {
      for (const ev of R.EVENTS) {
        const pair = m.lineup[ev.id];
        if (ev.kind !== 'X' || !pair || pair.length !== 2) continue;
        const a = byId(pair[0]), b = byId(pair[1]);
        if (a && b && a.gender === 'M' && b.gender === 'F') m.lineup[ev.id] = [pair[1], pair[0]];
      }
    }
  }
  function renderMatches() {
    normalizeLineups();
    if (!memberMode && !state.matches.length && !state.settings.cardsFor && entries().length && buildCards()) autofillAll();
    totals = loadCount(null);
    const f = R.formatFor(state.settings.teams);
    $('#formatText').textContent = f ? `${f.text}。自チームの試合数は最大${f.matches}試合。` : '';
    $('#matchList').innerHTML = state.matches.map((m, i) => {
      const issues = matchIssues(m);
      const fc = lineupForecast(m);
      const done = R.EVENTS.filter((ev) => issues[ev.id].state === 'ok').length;
      return `<div class="card match" data-id="${m.id}">
        <div class="mhead">
          <input class="m-label" value="${esc(m.label)}" placeholder="例:予選1">
          <span>vs</span>
          <input class="m-opp" value="${esc(m.opponent)}" placeholder="相手チーム">
          <span class="badge ${done === 5 ? 'okb' : ''}">${done}/5</span>
        </div>
        ${m.note ? `<p class="hint mnote">${esc(m.note)}</p>` : ''}
        ${R.EVENTS.map((ev) => {
          const pair = m.lineup[ev.id] || ['', ''];
          const is = issues[ev.id];
          return `<div class="ev ${is.state}" data-ev="${ev.id}">
            <div class="evh"><b>${ev.no}. ${esc(ev.ja)}</b><small>${esc(ev.rule)}</small>${ev.id in fc.eventP ? `<span class="evp private">🔒 勝率${pct(fc.eventP[ev.id])}</span>` : ''}</div>
            <div class="slots">
              <select data-slot="0">${slotOptions(ev, 0, pair[0])}</select>
              <select data-slot="1">${slotOptions(ev, 1, pair[1])}</select>
            </div>
            ${is.msgs.map((t) => `<p class="msg">${esc(t)}</p>`).join('')}
          </div>`;
        }).join('')}
        ${forecastHtml(m)}
        <div class="mbtns">
          <button data-act="auto">空き枠を自動で埋める</button>
          ${i > 0 ? '<button data-act="copy">前の対戦をコピー</button>' : ''}
          <button data-act="clear">クリア</button>
          <button data-act="del" class="danger">対戦を削除</button>
        </div>
      </div>`;
    }).join('') || '<div class="card muted">まだ対戦がありません。下の「⚡ 全対戦の組み合わせを自動で作る」を押すと、参加チーム数に合わせて対戦を作り、メンバーを自動で組み合わせます。</div>';
    save();
  }

  $('#matchList').addEventListener('change', (e) => {
    const card = e.target.closest('.match');
    const m = card && state.matches.find((x) => x.id === card.dataset.id);
    if (!m) return;
    if (e.target.classList.contains('m-opplv')) {
      m.oppLevel = Number(e.target.value);
      delete suggestions[m.id];
      renderMatches();
      return;
    }
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
    if (act === 'suggest') {
      suggestions[m.id] = R.suggestLineups(entries(), oppLevel(m), { allowRepeat: !state.settings.oneEvent, top: 3 });
    }
    if (act === 'apply') {
      const s = (suggestions[m.id] || [])[Number(e.target.dataset.i)];
      if (s) { m.lineup = JSON.parse(JSON.stringify(s.lineup)); delete suggestions[m.id]; toast('提案のオーダーにしました'); }
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
  // 参加チーム数から大会規則どおりの対戦カードを作る(既存カードの相手チーム名は引き継ぐ)
  function buildCards() {
    const plan = R.matchPlan(state.settings.teams);
    if (!plan.length) return false;
    const old = state.matches;
    state.matches = plan.map((c, i) => ({ id: uid(), label: c.label, note: c.note, opponent: (old[i] && old[i].opponent) || '', lineup: {} }));
    state.settings.cardsFor = Number(state.settings.teams);
    return true;
  }
  function autofillAll() {
    let failed = 0;
    for (const m of state.matches) {
      const issues = matchIssues(m);
      const fixed = {};
      for (const ev of R.EVENTS) if (issues[ev.id].state === 'ok') fixed[ev.id] = m.lineup[ev.id];
      const r = R.autoAssign(entries(), fixed, loadCount(m.id), { allowRepeat: !state.settings.oneEvent });
      if (r.ok) m.lineup = r.lineup; else failed++;
    }
    return failed;
  }
  // 出場回数の範囲を男女別に「男子3〜4回・女子2〜3回」の形で返す
  function countRange(counts) {
    return [['M', '男子'], ['F', '女子']].map(([g, label]) => {
      const v = entries().filter((e) => e.player.gender === g).map((e) => counts[e.player.id] || 0);
      if (!v.length) return '';
      const lo = Math.min(...v), hi = Math.max(...v);
      return `${label}${lo === hi ? lo : `${lo}〜${hi}`}回`;
    }).filter(Boolean).join('・');
  }
  // 出場回数をできるだけ均等に: 全対戦をまとめて組み直す(勝率は同じ均等さの中での優先順位にだけ使う)
  $('#autoMatches').addEventListener('click', () => {
    if (!entries().length) { toast('先に「選手名簿」で参加する選手を登録してください'); return; }
    if (!state.matches.length && !buildCards()) { toast('参加チーム数(2〜10)を入れてください'); return; }
    const r = R.fairLineups(entries(), state.matches.map((m) => oppLevel(m)), { allowRepeat: !state.settings.oneEvent });
    if (!r) { toast('条件を満たす組み合わせが見つかりませんでした。名簿の「種目ごとの出場可能な選手」を確認してください'); return; }
    state.matches.forEach((m, i) => { m.lineup = JSON.parse(JSON.stringify(r.lineups[i])); });
    suggestions = {};
    renderMatches();
    toast(`全対戦を組み直しました。出場回数 ${countRange(r.counts)}(不参加の選手は除外)`);
  });
  // 勝率と出場回数のバランス: 全対戦をまとめて組み直す
  $('#balanceMatches').addEventListener('click', () => {
    if (!entries().length) { toast('先に「選手名簿」で選手を登録してください'); return; }
    if (!state.matches.length && !buildCards()) { toast('参加チーム数(2〜10)を入れてください'); return; }
    const r = R.balancedLineups(entries(), state.matches.map((m) => oppLevel(m)), { allowRepeat: !state.settings.oneEvent });
    if (!r) { toast('条件を満たす組み合わせが見つかりませんでした。名簿の「種目ごとの出場可能な選手」を確認してください'); return; }
    state.matches.forEach((m, i) => { m.lineup = JSON.parse(JSON.stringify(r.lineups[i])); });
    suggestions = {};
    renderMatches();
    toast(`全対戦を組み直しました。平均チーム勝率 ${pct(r.avgP)}・出場回数 ${countRange(r.counts)}`);
  });
  $('#rebuildMatches').addEventListener('click', (e) => {
    if (!R.matchPlan(state.settings.teams).length) { toast('参加チーム数(2〜10)を入れてください'); return; }
    if (state.matches.some((m) => Object.keys(m.lineup).length) && !armed(e.target, 'もう一度押すと作り直し(組み合わせは消えます)')) return;
    buildCards();
    if (entries().length) autofillAll();
    renderMatches();
    toast(`${state.settings.teams}チームの大会方式で対戦カードを作りました`);
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
    return `<p class="hint scroll-hint">← 表は横にスライドして全体を見られます →</p><div class="scroll"><table class="stats">
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
  const namedPlayers = () => state.players.filter((p) => p.name && !p.absent).sort((a, b) => (a.gender === b.gender ? 0 : a.gender === 'F' ? -1 : 1));
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
      n: state.players.filter((p) => p.name && !p.absent).sort((a, b) => (a.gender === b.gender ? 0 : a.gender === 'F' ? -1 : 1)).map((p) => p.name),
      m: state.matches.map((m) => ({
        l: m.label, o: m.opponent, d: m.note || '',
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
  // メンバー用ページの場所。build.py が管理者版に公開URL(GitHub Pages)を埋め込む。
  // 未設定のときはこのページ自身を閲覧用に使う。
  function shareUrl() {
    const base = window.TENNIS_VIEWER_URL || location.href.split('#')[0];
    return `${base}#view=${encode(shareData())}`;
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
  $('#saveFile').addEventListener('click', async () => {
    const json = JSON.stringify(state, null, 2);
    const filename = `tennis-lineup-${new Date().toISOString().slice(0, 10)}.json`;
    const dl = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
    if (dl) {
      try { await dl.save({ filename, data: json }); toast('バックアップを保存しました'); } catch (e) {
        if (e && e.code !== 'declined') toast('保存できませんでした。もう一度お試しください');
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = filename;
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
    applyMemberMode();
    window.scrollTo(0, 0);
  }));

  function applyMemberMode() {
    if (!memberMode) return;
    lockControls(true);
    // 閲覧のみ: 入力欄・選択欄そのものも無効にする(見た目は CSS で通常の文字に)
    document.querySelectorAll('#tab-roster :is(input, select, textarea), #tab-matches :is(input, select, textarea), #tab-stats :is(input, select, textarea)')
      .forEach((el) => (el.disabled = true));
    $('#rosterCheck').hidden = true;
  }
  function renderAll() {
    renderSettings();
    renderPlayers();
    renderMatches();
    renderStats();
    renderExport();
    applyMemberMode();
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
      ${m.d ? `<p class="hint">${esc(m.d)}</p>` : ''}
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
  function showFromHash() {
    const viewParam = /^#view=(.+)$/.exec(location.hash);
    if (viewParam) {
      try { renderViewer(decode(viewParam[1])); } catch (e) { renderViewer({ m: [] }); }
      return true;
    }
    return false;
  }
  if (window.TENNIS_VIEWER_ONLY) {
    // メンバー用ページ: 閲覧のみ。管理画面は出さない
    if (!showFromHash()) {
      renderViewer({ m: [] });
      $('#viewer').innerHTML = '<div class="card"><h2>オーダー表</h2><p>管理者からLINEで届いたリンクを開いてください。</p></div>';
    }
    window.addEventListener('hashchange', showFromHash);
  } else if (showFromHash()) {
    /* 管理者版でも閲覧リンクを開いたときは閲覧画面 */
  } else {
    lastSaved = JSON.stringify(state);
    renderAll();
    if (window.claude && window.claude.use) {
      // 権限が分かるまで管理画面は出さない(閲覧のみの人に名簿が一瞬見えないように)
      renderViewer({ m: [] });
      $('#viewer').innerHTML = '<div class="card muted">読み込み中…</div>';
    }
    connectRemote();
  }
})();
