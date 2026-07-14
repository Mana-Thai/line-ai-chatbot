/* グッズ注文とりまとめアプリ フロントエンド */
(function () {
    'use strict';

    const C = window.APP_CONSTANTS;

    const state = {
        config: null,
        token: null,
        user: null,
        orders: [],
        editingOrderId: null, // null = 新規追加
        lockHeartbeat: null,
        stream: null,
    };

    const $ = (id) => document.getElementById(id);

    // ---------- 通信 ----------

    async function api(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (state.token) headers.Authorization = `Bearer ${state.token}`;
        const res = await fetch(path, { ...options, headers });
        let data = null;
        try { data = await res.json(); } catch { /* 空レスポンス */ }
        if (!res.ok) {
            const err = new Error((data && data.message) || `通信エラー (${res.status})`);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    // ---------- 画面切り替え ----------

    const SCREENS = ['screen-loading', 'screen-error', 'screen-devlogin', 'screen-passcode', 'screen-main'];
    function showScreen(id) {
        SCREENS.forEach((s) => $(s).classList.toggle('hidden', s !== id));
    }

    function showError(message) {
        $('error-message').textContent = message;
        showScreen('screen-error');
    }

    function showPopup(message) {
        $('popup-message').textContent = message;
        $('popup').classList.remove('hidden');
    }

    // ---------- 初期化・ログイン ----------

    async function init() {
        try {
            state.config = await api('/api/config');
        } catch {
            return showError('サーバーに接続できませんでした。');
        }
        document.title = state.config.title;
        $('app-title').textContent = state.config.title;

        if (state.config.liffId) {
            try {
                await liff.init({ liffId: state.config.liffId });
            } catch (err) {
                return showError(`LIFFの初期化に失敗しました: ${err.message}`);
            }
            if (!liff.isLoggedIn()) return liff.login();
            proceedToPasscode();
        } else if (state.config.devMode) {
            const saved = localStorage.getItem('devName');
            if (saved) $('dev-name').value = saved;
            showScreen('screen-devlogin');
        } else {
            showError('LIFF_ID が設定されていません。サーバーの環境変数を確認してください。');
        }
    }

    function proceedToPasscode() {
        const saved = localStorage.getItem('appPasscode') || '';
        if (state.config.passcodeRequired && !saved) {
            showScreen('screen-passcode');
        } else {
            authenticate(saved);
        }
    }

    async function authenticate(passcode) {
        const body = { passcode };
        if (state.config.liffId) {
            body.idToken = liff.getIDToken();
            if (!body.idToken) {
                return showError('LINEのIDトークンを取得できませんでした。LIFFのScopeで openid / profile を有効にしてください。');
            }
        } else {
            body.devUser = { userId: `dev-${$('dev-name').value.trim()}`, name: $('dev-name').value.trim() };
        }

        try {
            const data = await api('/api/auth', { method: 'POST', body: JSON.stringify(body) });
            state.token = data.token;
            state.user = data.user;
            if (state.config.passcodeRequired) localStorage.setItem('appPasscode', passcode);
            enterMain();
        } catch (err) {
            if (err.data && err.data.error === 'passcode') {
                localStorage.removeItem('appPasscode');
                $('passcode-error').textContent = err.message;
                $('passcode-error').classList.remove('hidden');
                showScreen('screen-passcode');
            } else {
                showError(err.message);
            }
        }
    }

    async function enterMain() {
        $('user-name').textContent = state.user.name;
        $('admin-badge').classList.toggle('hidden', !state.user.admin);
        $('admin-link').classList.toggle('hidden', !state.config.adminEnabled || state.user.admin);
        showScreen('screen-main');
        await refreshOrders();
        openStream();
    }

    // ---------- 注文リスト ----------

    async function refreshOrders() {
        try {
            const data = await api('/api/orders');
            state.orders = data.orders;
            renderOrders();
            renderSummary();
        } catch (err) {
            if (err.status === 401) location.reload();
        }
    }

    function qtyText(quantities) {
        return C.COLORS
            .filter((c) => quantities[c])
            .map((c) => `${c}×${quantities[c]}`)
            .join('、');
    }

    function totalQty(quantities) {
        return Object.values(quantities).reduce((a, b) => a + b, 0);
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (ch) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
        ));
    }

    function renderOrders() {
        const list = $('order-list');
        const orders = state.orders.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        $('order-count').textContent = orders.length ? `${orders.length}件` : '';
        $('order-empty').classList.toggle('hidden', orders.length > 0);

        list.innerHTML = orders.map((o) => {
            const mine = o.userId === state.user.userId;
            const editable = mine || state.user.admin;
            const updated = new Date(o.updatedAt).toLocaleString('ja-JP', {
                month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            return `
            <div class="order-card${mine ? ' mine' : ''}">
                <div class="order-top">
                    <span class="order-name">${escapeHtml(o.displayName)}${mine ? '<span class="you">(自分)</span>' : ''}</span>
                    ${editable ? `
                    <span class="order-actions">
                        <button class="btn btn-small" data-edit="${o.id}">編集</button>
                        <button class="btn btn-small btn-danger" data-delete="${o.id}">削除</button>
                    </span>` : ''}
                </div>
                <div class="order-tags">
                    <span class="tag">胸ロゴ:${escapeHtml(o.chestLogo)}</span>
                    <span class="tag">バックプリント:${escapeHtml(o.backPrint)}</span>
                    <span class="tag size">サイズ:${escapeHtml(o.size)}</span>
                </div>
                <div class="order-qty">${escapeHtml(qtyText(o.quantities))} <b>(計${totalQty(o.quantities)}枚)</b></div>
                ${o.note ? `<div class="order-note">📝 ${escapeHtml(o.note)}</div>` : ''}
                <div class="order-meta">更新: ${updated}(${escapeHtml(o.updatedBy)})</div>
            </div>`;
        }).join('');

        list.querySelectorAll('[data-edit]').forEach((btn) => {
            btn.addEventListener('click', () => startEdit(Number(btn.dataset.edit)));
        });
        list.querySelectorAll('[data-delete]').forEach((btn) => {
            btn.addEventListener('click', () => deleteOrder(Number(btn.dataset.delete)));
        });
    }

    // ---------- 集計 ----------

    function renderSummary() {
        const groups = new Map();
        let grandTotal = 0;

        for (const o of state.orders) {
            const key = `${o.chestLogo}|${o.backPrint}`;
            if (!groups.has(key)) {
                groups.set(key, { chestLogo: o.chestLogo, backPrint: o.backPrint, cells: {}, total: 0 });
            }
            const g = groups.get(key);
            for (const [color, qty] of Object.entries(o.quantities)) {
                g.cells[color] = g.cells[color] || {};
                g.cells[color][o.size] = (g.cells[color][o.size] || 0) + qty;
                g.total += qty;
                grandTotal += qty;
            }
        }

        $('grand-total').textContent = grandTotal ? `合計 ${grandTotal}枚` : '';

        $('summary').innerHTML = [...groups.values()].map((g) => {
            const sizes = C.SIZES.filter((s) => Object.values(g.cells).some((row) => row[s]));
            const colors = C.COLORS.filter((c) => g.cells[c]);
            const colTotals = Object.fromEntries(sizes.map((s) => [s, 0]));

            const rows = colors.map((color) => {
                let rowTotal = 0;
                const cells = sizes.map((s) => {
                    const v = g.cells[color][s] || 0;
                    rowTotal += v;
                    colTotals[s] += v;
                    return `<td class="num">${v || ''}</td>`;
                }).join('');
                return `<tr><th>${escapeHtml(color)}</th>${cells}<td class="num total-col">${rowTotal}</td></tr>`;
            }).join('');

            const totalRow = `<tr class="total-row"><th>合計</th>${sizes.map((s) => `<td class="num">${colTotals[s]}</td>`).join('')}<td class="num total-col">${g.total}</td></tr>`;

            return `
            <div class="summary-group">
                <div class="summary-title">胸ロゴ:${escapeHtml(g.chestLogo)} / バックプリント:${escapeHtml(g.backPrint)}(${g.total}枚)</div>
                <div class="table-wrap">
                    <table class="summary">
                        <tr><th>カラー</th>${sizes.map((s) => `<th>${s}</th>`).join('')}<th>計</th></tr>
                        ${rows}${totalRow}
                    </table>
                </div>
            </div>`;
        }).join('') || '<p class="muted">注文が入ると自動で集計表が表示されます。</p>';
    }

    // ---------- 編集ロック ----------

    async function acquireLock() {
        try {
            await api('/api/lock', { method: 'POST' });
            return true;
        } catch (err) {
            if (err.status === 409) {
                showPopup(err.message || '他のメンバーが編集中です');
                return false;
            }
            showPopup(err.message);
            return false;
        }
    }

    function startHeartbeat() {
        stopHeartbeat();
        state.lockHeartbeat = setInterval(() => {
            api('/api/lock', { method: 'POST' }).catch(() => {});
        }, 10 * 1000);
    }

    function stopHeartbeat() {
        if (state.lockHeartbeat) {
            clearInterval(state.lockHeartbeat);
            state.lockHeartbeat = null;
        }
    }

    function releaseLock() {
        stopHeartbeat();
        api('/api/lock', { method: 'DELETE' }).catch(() => {});
    }

    // ---------- 注文フォーム ----------

    function buildChips(containerId, values, name) {
        const box = $(containerId);
        box.innerHTML = values.map((v) => `<button type="button" class="chip" data-group="${name}" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
        box.querySelectorAll('.chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                box.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
                chip.classList.add('selected');
            });
        });
    }

    function buildColorGrid() {
        $('color-grid').innerHTML = C.COLORS.map((color, i) => `
            <div class="color-row">
                <label for="qty-${i}">${escapeHtml(color)}</label>
                <input id="qty-${i}" data-color="${escapeHtml(color)}" type="number" inputmode="numeric" min="0" max="${C.MAX_QTY}" placeholder="0">
            </div>`).join('');
        $('color-grid').querySelectorAll('input').forEach((input) => {
            input.addEventListener('input', () => {
                input.closest('.color-row').classList.toggle('has-qty', Number(input.value) > 0);
            });
        });
    }

    function selectedChip(name) {
        const chip = document.querySelector(`.chip.selected[data-group="${name}"]`);
        return chip ? chip.dataset.value : null;
    }

    function setChip(name, value) {
        document.querySelectorAll(`.chip[data-group="${name}"]`).forEach((c) => {
            c.classList.toggle('selected', c.dataset.value === value);
        });
    }

    function fillForm(order) {
        setChip('chestLogo', order ? order.chestLogo : null);
        setChip('backPrint', order ? order.backPrint : null);
        setChip('size', order ? order.size : null);
        $('color-grid').querySelectorAll('input').forEach((input) => {
            const qty = order ? order.quantities[input.dataset.color] || 0 : 0;
            input.value = qty || '';
            input.closest('.color-row').classList.toggle('has-qty', qty > 0);
        });
        $('note-input').value = order ? order.note : '';
        $('form-error').classList.add('hidden');
    }

    async function openForm(order) {
        if (!(await acquireLock())) return;
        state.editingOrderId = order ? order.id : null;
        $('form-title').textContent = order ? '注文を編集' : '注文を追加';
        fillForm(order);
        $('form-modal').classList.remove('hidden');
        $('form-modal').querySelector('.modal-card').scrollTop = 0;
        startHeartbeat();
    }

    function closeForm() {
        $('form-modal').classList.add('hidden');
        releaseLock();
    }

    function startEdit(id) {
        const order = state.orders.find((o) => o.id === id);
        if (order) openForm(order);
    }

    async function saveForm() {
        const body = {
            chestLogo: selectedChip('chestLogo'),
            backPrint: selectedChip('backPrint'),
            size: selectedChip('size'),
            note: $('note-input').value,
            quantities: {},
        };
        $('color-grid').querySelectorAll('input').forEach((input) => {
            const n = Number(input.value);
            if (n > 0) body.quantities[input.dataset.color] = n;
        });

        const errBox = $('form-error');
        if (!body.chestLogo) return showFormError('胸ロゴを選択してください');
        if (!body.backPrint) return showFormError('バックプリントを選択してください');
        if (!body.size) return showFormError('サイズを選択してください');
        if (Object.keys(body.quantities).length === 0) return showFormError('数量を1色以上入力してください');
        errBox.classList.add('hidden');

        try {
            if (state.editingOrderId) {
                await api(`/api/orders/${state.editingOrderId}`, { method: 'PUT', body: JSON.stringify(body) });
            } else {
                await api('/api/orders', { method: 'POST', body: JSON.stringify(body) });
            }
            closeForm();
            refreshOrders();
        } catch (err) {
            showFormError(err.message);
        }
    }

    function showFormError(message) {
        const errBox = $('form-error');
        errBox.textContent = message;
        errBox.classList.remove('hidden');
    }

    async function deleteOrder(id) {
        const order = state.orders.find((o) => o.id === id);
        if (!order) return;
        if (!window.confirm(`${order.displayName}さんの注文(${order.size}/計${totalQty(order.quantities)}枚)を削除しますか?`)) return;
        try {
            await api(`/api/orders/${id}`, { method: 'DELETE' });
            refreshOrders();
        } catch (err) {
            showPopup(err.message);
        }
    }

    // ---------- リアルタイム更新(SSE) ----------

    function openStream() {
        if (state.stream) state.stream.close();
        state.stream = new EventSource(`/api/stream?token=${encodeURIComponent(state.token)}`);
        state.stream.onmessage = (e) => {
            let event;
            try { event = JSON.parse(e.data); } catch { return; }
            if (event.type === 'orders') refreshOrders();
            if (event.type === 'lock') {
                const showBanner = event.locked && event.holderId !== state.user.userId;
                $('lock-banner').classList.toggle('hidden', !showBanner);
                if (showBanner) $('lock-holder').textContent = event.holderName;
            }
        };
    }

    // ---------- 管理者モード ----------

    async function adminUnlock() {
        const passcode = $('admin-passcode-input').value;
        try {
            const data = await api('/api/admin', { method: 'POST', body: JSON.stringify({ adminPasscode: passcode }) });
            state.token = data.token;
            state.user = data.user;
            $('admin-modal').classList.add('hidden');
            $('admin-badge').classList.remove('hidden');
            $('admin-link').classList.add('hidden');
            openStream(); // 新トークンで張り直す
            renderOrders();
        } catch (err) {
            $('admin-error').textContent = err.message;
            $('admin-error').classList.remove('hidden');
        }
    }

    // ---------- イベント登録 ----------

    buildChips('chest-logo-options', C.CHEST_LOGOS, 'chestLogo');
    buildChips('back-print-options', C.BACK_PRINTS, 'backPrint');
    buildChips('size-options', C.SIZES, 'size');
    buildColorGrid();

    $('add-btn').addEventListener('click', () => openForm(null));
    $('form-cancel').addEventListener('click', closeForm);
    $('form-save').addEventListener('click', saveForm);
    $('popup-ok').addEventListener('click', () => $('popup').classList.add('hidden'));

    $('passcode-btn').addEventListener('click', () => authenticate($('passcode-input').value.trim()));
    $('passcode-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') authenticate($('passcode-input').value.trim());
    });

    $('dev-login-btn').addEventListener('click', () => {
        const name = $('dev-name').value.trim();
        if (!name) return;
        localStorage.setItem('devName', name);
        proceedToPasscode();
    });

    $('admin-link').addEventListener('click', () => {
        $('admin-error').classList.add('hidden');
        $('admin-passcode-input').value = '';
        $('admin-modal').classList.remove('hidden');
    });
    $('admin-cancel').addEventListener('click', () => $('admin-modal').classList.add('hidden'));
    $('admin-ok').addEventListener('click', adminUnlock);

    // ページを閉じる時にロックを解放
    window.addEventListener('pagehide', () => {
        if (state.lockHeartbeat && state.token) {
            navigator.sendBeacon && stopHeartbeat();
            fetch(`/api/lock?token=${encodeURIComponent(state.token)}`, { method: 'DELETE', keepalive: true }).catch(() => {});
        }
    });

    init();
})();
