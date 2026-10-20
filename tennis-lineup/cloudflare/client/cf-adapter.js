// Cloudflare版の接続部分。app.js が claude.ai で使っている window.claude.use('db' / 'user') と
// 同じ形のオブジェクトを、自前のAPI(/api/*)+ LINEログインで提供する。
// app.js 本体はそのまま動く(保存・権限・メンバー画面の切り替えはすべて app.js 側の既存処理)。
(function () {
  const TOKEN_KEY = 'tennis-cf-token';
  const POLL_MS = 4000;
  const DOC_KEYS = { 'admin/state': 'admin_state', 'public/order': 'public_order' };
  let token = null, me = null, loginPromise = null;
  window.TENNIS_VIEWER_URL = location.origin + '/view/';

  const store = {
    get() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } },
    set(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* noop */ } },
  };
  async function api(path, opts) {
    const res = await fetch(path, {
      method: (opts && opts.method) || 'GET',
      headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}),
      body: opts && opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/api/login') { store.set(null); token = null; }
    if (!res.ok) { const e = new Error(data.error || ('HTTP ' + res.status)); e.status = res.status; throw e; }
    return data;
  }

  // ---------- ログイン画面(開発用の名前入力・エラー表示) ----------
  function overlay(html) {
    let el = document.getElementById('cfOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cfOverlay';
      el.className = 'cf-overlay';
      document.body.appendChild(el);
    }
    el.innerHTML = `<div class="card cf-box">${html}</div>`;
    el.hidden = false;
    return el;
  }
  function closeOverlay() { const el = document.getElementById('cfOverlay'); if (el) el.hidden = true; }
  function devLogin() {
    return new Promise((resolve) => {
      const el = overlay(`<h2>ログイン(開発用)</h2><p class="hint">本番ではLINEでログインします。</p>
        <form id="cfDevForm"><input id="cfDevName" placeholder="名前" required> <button class="primary-inline">ログイン</button></form>`);
      el.querySelector('#cfDevForm').addEventListener('submit', (e) => {
        e.preventDefault();
        resolve({ devName: el.querySelector('#cfDevName').value });
      });
    });
  }
  async function login() {
    token = store.get();
    if (token) {
      try { me = (await api('/api/me')).user; return me; } catch (e) { token = null; store.set(null); }
    }
    const cfg = await api('/api/config');
    let body;
    if (cfg.liffId && window.liff) {
      await liff.init({ liffId: cfg.liffId });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return new Promise(() => {}); }
      const idToken = liff.getIDToken();
      if (!idToken) throw new Error('LINEのIDトークンを取得できませんでした(LIFFのScopeで openid と profile をONにしてください)');
      body = { idToken };
    } else if (cfg.dev) {
      body = await devLogin();
    } else {
      throw new Error('LIFF_ID が設定されていません(SETUP.md の手順を確認してください)');
    }
    const r = await api('/api/login', { method: 'POST', body });
    token = r.token; store.set(token); me = r.user;
    closeOverlay();
    return me;
  }
  const ensureLogin = () => (loginPromise = loginPromise || login().catch((e) => {
    overlay(`<h2>ログインできませんでした</h2><p>${String(e.message).replace(/</g, '&lt;')}</p><button onclick="location.reload()">もう一度</button>`);
    throw e;
  }));

  // ---------- db / user(app.js が使う部分だけ) ----------
  function docRef(path) {
    const key = DOC_KEYS[path];
    const read = async () => {
      if (!key) return { exists: false, data: () => undefined, metadata: { fromCache: false } };
      const r = await api('/api/doc/' + key).catch((e) => (e.status === 403 ? { exists: false } : Promise.reject(e)));
      return { exists: !!r.exists, data: () => (r.exists ? r.data : undefined), metadata: { fromCache: false, hasPendingWrites: false }, savedAt: r.savedAt };
    };
    return {
      get: read,
      async set(data) {
        if (!key) throw Object.assign(new Error('invalid'), { code: 'invalid_argument' });
        await api('/api/doc/' + key, { method: 'PUT', body: data });
      },
      // 変更の取り込みは定期的な確認で行う(保存時刻が変わったときだけ通知)
      onSnapshot(next, error) {
        let last = null, stopped = false;
        const tick = async () => {
          if (stopped) return;
          try {
            const snap = await read();
            const sig = snap.exists ? snap.savedAt : 'none';
            if (sig !== last) { last = sig; next(snap); }
          } catch (e) { if (e.status === 401) { stopped = true; error && error({ code: 'revoked', message: e.message }); } }
          if (!stopped) setTimeout(tick, document.hidden ? POLL_MS * 4 : POLL_MS);
        };
        tick();
        return () => { stopped = true; };
      },
    };
  }
  const db = { doc: docRef };
  const user = {
    async canEdit() { return !!me && me.role === 'admin'; },
    async isOwner() { return false; },
    async id() { return me ? me.id : null; },
  };

  window.claude = {
    async use(name) {
      if (name !== 'db' && name !== 'user') return null;
      await ensureLogin();
      afterLogin();
      return name === 'db' ? db : user;
    },
  };

  // ---------- Cloudflare版だけの画面(権限の管理・管理者コード) ----------
  let decorated = false;
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function afterLogin() {
    if (decorated || !me) return;
    decorated = true;
    const who = document.createElement('span');
    who.className = 'sync';
    who.textContent = me.name;
    document.querySelector('.top .sub').appendChild(who);
    if (me.role === 'admin') setupAdminTools(); else setupClaim();
  }
  function setupClaim() {
    const box = document.createElement('div');
    box.className = 'cf-claim';
    box.innerHTML = `<details><summary>管理者の方はこちら</summary>
      <form id="cfClaim"><input id="cfCode" placeholder="管理者コード" autocomplete="off"> <button>管理者になる</button></form>
      <p class="hint">管理者コードはチームの管理者に聞いてください。ほかの管理者に「管理者と同じ権限」にしてもらうこともできます。</p></details>`;
    document.body.appendChild(box);
    box.querySelector('#cfClaim').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/claim-admin', { method: 'POST', body: { code: box.querySelector('#cfCode').value } }); location.reload(); }
      catch (err) { alert(err.message); }
    });
  }
  function setupAdminTools() {
    const card = document.getElementById('permCard');
    if (!card) return;
    card.innerHTML = `<h2>共有と権限</h2>
      <p class="hint">メンバーには <b>このページのURL</b>(LINEで開くならLIFFのURL)を送ってください。LINEでログインした人は最初は「閲覧のみ」です。
      一緒に編集する人は、下の一覧で「管理者と同じ権限」にしてください。</p>
      <div id="cfUsers" class="perm"><p class="muted">読み込み中…</p></div>`;
    loadUsers();
  }
  async function loadUsers() {
    const box = document.getElementById('cfUsers');
    try {
      const { users } = await api('/api/users');
      box.innerHTML = users.map((u) => `<div class="permrow cf-user"><b>${esc(u.name)}${u.id === me.id ? '(あなた)' : ''}</b>
        <select data-uid="${esc(u.id)}"><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>管理者と同じ権限</option>
        <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>閲覧のみ</option></select></div>`).join('')
        || '<p class="muted">まだ誰もログインしていません</p>';
      box.querySelectorAll('select').forEach((sel) => sel.addEventListener('change', async () => {
        try { await api('/api/users/' + encodeURIComponent(sel.dataset.uid), { method: 'PUT', body: { role: sel.value } }); }
        catch (err) { alert(err.message); }
        loadUsers();
      }));
    } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }
})();
