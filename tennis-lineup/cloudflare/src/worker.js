// 伝統テニス大会 オーダー表 — Cloudflare Worker
// /api/* を処理し、それ以外は public/ の画面を返す。
// 認証: LIFF の IDトークンを LINE で検証 → HMAC署名のセッショントークン(12時間)
// 権限: users.role = 'admin'(管理者と同じ権限) | 'viewer'(閲覧のみ)。新しい人は viewer。
//       管理者の追加・解除は、管理者が画面の一覧で行う。ADMIN_SETUP_CODE は管理者が1人もいないときだけ使える。
// 編集ロック: 管理者の編集は全体で1人だけ(locks テーブル・30秒、使っている間は更新)。
//       admin_state / public_order の保存は、ロックを持っている人だけができる。
// データ: docs テーブルに 'admin_state'(全データ・管理者のみ)と 'public_order'(閲覧用)を JSON で保存。

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const LOCK_TTL_MS = 30 * 1000;
const DOCS = { admin_state: 'admin', public_order: 'viewer' }; // 読むのに必要な権限
const enc = new TextEncoder();

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fail = (status, error) => json({ error }, status);

function b64url(bytes) {
  let s = '';
  new Uint8Array(bytes).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function issueToken(env, userId) {
  const payload = b64url(enc.encode(JSON.stringify({ userId, exp: Date.now() + TOKEN_TTL_MS })));
  return `${payload}.${await hmac(env.SESSION_SECRET, payload)}`;
}
async function verifyToken(env, token) {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  if (!safeEqual(token.slice(dot + 1), await hmac(env.SESSION_SECRET, payload))) return null;
  try {
    const d = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return d.userId && d.exp > Date.now() ? d.userId : null;
  } catch (e) { return null; }
}

let schemaReady = false; // 同じ Worker の中では一度だけテーブルを確認する
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer',
      created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS docs (
      key TEXT PRIMARY KEY, json TEXT NOT NULL, saved_at INTEGER NOT NULL, by TEXT, version INTEGER NOT NULL DEFAULT 1)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS locks (
      key TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, client_id TEXT NOT NULL, expires_at INTEGER NOT NULL)`),
  ]);
  schemaReady = true;
}

async function verifyLineIdToken(env, idToken) {
  if (!env.LINE_LOGIN_CHANNEL_ID) throw new Error('LINE_LOGIN_CHANNEL_ID が設定されていません');
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: env.LINE_LOGIN_CHANNEL_ID }),
  });
  if (!res.ok) throw new Error(`LINEのIDトークンを確認できませんでした (${res.status})`);
  const d = await res.json();
  return { userId: d.sub, name: d.name || '名前未設定' };
}

async function currentUser(request, env) {
  const auth = request.headers.get('authorization') || '';
  const userId = await verifyToken(env, auth.replace(/^Bearer\s+/i, ''));
  if (!userId) return null;
  return env.DB.prepare('SELECT user_id AS id, name, role FROM users WHERE user_id = ?').bind(userId).first();
}
const isAdmin = (u) => !!u && u.role === 'admin';

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;
  const dev = env.ALLOW_INSECURE_DEV === '1';

  if (path === '/api/config' && method === 'GET') {
    const missing = ['LIFF_ID', 'LINE_LOGIN_CHANNEL_ID', 'SESSION_SECRET', 'ADMIN_SETUP_CODE'].filter((k) => !env[k] && !(dev && k !== 'SESSION_SECRET'));
    let needsAdmin = false;
    if (env.DB && env.SESSION_SECRET) {
      await ensureSchema(env);
      const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").first();
      needsAdmin = !row.n;
    }
    return json({ liffId: env.LIFF_ID || '', dev, missing, needsAdmin });
  }

  if (!env.SESSION_SECRET) return fail(500, 'SESSION_SECRET が設定されていません');
  await ensureSchema(env);

  if (path === '/api/login' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    let profile;
    try {
      if (body.idToken) profile = await verifyLineIdToken(env, body.idToken);
      else if (dev && typeof body.devName === 'string' && body.devName.trim()) {
        const name = body.devName.trim().slice(0, 40);
        profile = { userId: 'dev:' + name, name };
      } else return fail(400, 'ログイン情報がありません');
    } catch (e) {
      return fail(401, e.message);
    }
    const now = Date.now();
    await env.DB.prepare(`INSERT INTO users (user_id, name, role, created_at, last_seen) VALUES (?, ?, 'viewer', ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen`)
      .bind(profile.userId, profile.name, now, now).run();
    const user = await env.DB.prepare('SELECT user_id AS id, name, role FROM users WHERE user_id = ?').bind(profile.userId).first();
    return json({ token: await issueToken(env, profile.userId), user });
  }

  const user = await currentUser(request, env);
  if (!user) return fail(401, 'ログインしてください');

  if (path === '/api/me' && method === 'GET') return json({ user });

  if (path === '/api/claim-admin' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const admins = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").first();
    if (admins.n) return fail(403, 'すでに管理者がいます。管理者に「管理者と同じ権限」にしてもらってください');
    if (!env.ADMIN_SETUP_CODE || typeof body.code !== 'string' || !safeEqual(body.code, env.ADMIN_SETUP_CODE)) {
      return fail(403, '管理者コードが違います');
    }
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE user_id = ?").bind(user.id).run();
    return json({ user: { ...user, role: 'admin' } });
  }

  if (path === '/api/lock') {
    if (!isAdmin(user)) return fail(403, '管理者だけが編集できます');
    const now = Date.now();
    const clientId = (request.headers.get('x-client-id') || '').slice(0, 64);
    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT user_id, name, client_id, expires_at FROM locks WHERE key = ?').bind('edit').first();
      const active = row && row.expires_at > now;
      return json({ holder: active ? { id: row.user_id, name: row.name } : null, mine: !!(active && row.user_id === user.id && row.client_id === clientId), expiresAt: active ? row.expires_at : 0 });
    }
    if (method === 'POST') {
      if (!clientId) return fail(400, 'x-client-id がありません');
      // 空いている・期限切れ・自分(同じ画面)のときだけ取得/更新できる
      await env.DB.prepare(`INSERT INTO locks (key, user_id, name, client_id, expires_at) VALUES ('edit', ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET user_id = excluded.user_id, name = excluded.name, client_id = excluded.client_id, expires_at = excluded.expires_at
        WHERE locks.expires_at <= ? OR (locks.user_id = excluded.user_id AND locks.client_id = excluded.client_id)`)
        .bind(user.id, user.name, clientId, now + LOCK_TTL_MS, now).run();
      const row = await env.DB.prepare('SELECT user_id, name, client_id, expires_at FROM locks WHERE key = ?').bind('edit').first();
      if (row.user_id === user.id && row.client_id === clientId) return json({ ok: true, expiresAt: row.expires_at });
      return json({ ok: false, holder: { id: row.user_id, name: row.name }, expiresAt: row.expires_at }, 409);
    }
    if (method === 'DELETE') {
      await env.DB.prepare("DELETE FROM locks WHERE key = 'edit' AND user_id = ? AND client_id = ?").bind(user.id, clientId).run();
      return json({ ok: true });
    }
    return fail(405, 'method not allowed');
  }

  const docMatch = path.match(/^\/api\/doc\/([a-z_]+)$/);
  if (docMatch) {
    const key = docMatch[1];
    if (!(key in DOCS)) return fail(404, 'not found');
    if (method === 'GET') {
      if (DOCS[key] === 'admin' && !isAdmin(user)) return fail(403, '管理者だけが見られます');
      const row = await env.DB.prepare('SELECT json, saved_at, version FROM docs WHERE key = ?').bind(key).first();
      return json(row ? { exists: true, data: JSON.parse(row.json), savedAt: row.saved_at, version: row.version } : { exists: false });
    }
    if (method === 'PUT') {
      if (!isAdmin(user)) return fail(403, '管理者だけが保存できます');
      const lock = await env.DB.prepare('SELECT user_id, name, client_id, expires_at FROM locks WHERE key = ?').bind('edit').first();
      const clientId = request.headers.get('x-client-id') || '';
      if (!lock || lock.expires_at <= Date.now() || lock.user_id !== user.id || lock.client_id !== clientId) {
        return json({ error: lock && lock.expires_at > Date.now() && lock.user_id !== user.id ? `${lock.name}さんが編集中のため保存できません` : '編集の権利が切れました。もう一度編集してください', code: 'locked' }, 409);
      }
      const text = await request.text();
      if (text.length > 512 * 1024) return fail(413, 'データが大きすぎます');
      let data;
      try { data = JSON.parse(text); } catch (e) { return fail(400, 'JSONではありません'); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(400, 'オブジェクトを送ってください');
      const savedAt = Number(data.savedAt) || Date.now();
      await env.DB.prepare(`INSERT INTO docs (key, json, saved_at, by, version) VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(key) DO UPDATE SET json = excluded.json, saved_at = excluded.saved_at, by = excluded.by, version = docs.version + 1`)
        .bind(key, JSON.stringify(data), savedAt, user.id).run();
      return json({ ok: true, savedAt });
    }
    return fail(405, 'method not allowed');
  }

  if (path === '/api/users' && method === 'GET') {
    if (!isAdmin(user)) return fail(403, '管理者だけが見られます');
    const { results } = await env.DB.prepare('SELECT user_id AS id, name, role, last_seen AS lastSeen FROM users ORDER BY role, name').all();
    return json({ users: results });
  }
  const userMatch = path.match(/^\/api\/users\/(.+)$/);
  if (userMatch && method === 'PUT') {
    if (!isAdmin(user)) return fail(403, '管理者だけが変更できます');
    const targetId = decodeURIComponent(userMatch[1]);
    const body = await request.json().catch(() => ({}));
    if (!['admin', 'viewer'].includes(body.role)) return fail(400, '権限は admin か viewer です');
    if (body.role === 'viewer') {
      const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND user_id != ?").bind(targetId).first();
      if (!n) return fail(409, '管理者が1人もいなくなるため変更できません');
    }
    const r = await env.DB.prepare('UPDATE users SET role = ? WHERE user_id = ?').bind(body.role, targetId).run();
    if (!r.meta.changes) return fail(404, 'その人は見つかりません');
    return json({ ok: true });
  }

  return fail(404, 'not found');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return new Response('ok');
    if (url.pathname.startsWith('/api/')) {
      try { return await handleApi(request, env, url); } catch (e) { return fail(500, 'サーバーエラー: ' + e.message); }
    }
    return env.ASSETS.fetch(request);
  },
};
