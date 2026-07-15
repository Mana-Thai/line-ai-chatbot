/* グッズ注文とりまとめアプリ フロントエンド */
(function () {
    'use strict';

    const C = window.APP_CONSTANTS;

    const state = {
        config: null,
        token: null,
        user: null,
        orders: [],
        pricing: null,       // 管理者が設定した価格(未設定なら null)
        priceModel: null,    // pricing + 注文数から算出した単価モデル
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

    const SCREENS = ['screen-loading', 'screen-error', 'screen-devlogin', 'screen-main'];
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

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (ch) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
        ));
    }

    // 金額表示(小数は最大2桁)
    function fmtMoney(n) {
        return Number(n).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
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
            authenticate();
        } else if (state.config.devMode) {
            const saved = localStorage.getItem('devName');
            if (saved) $('dev-name').value = saved;
            showScreen('screen-devlogin');
        } else {
            showError('LIFF_ID が設定されていません。サーバーの環境変数を確認してください。');
        }
    }

    async function authenticate() {
        const body = {};
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
            enterMain();
        } catch (err) {
            showError(err.message);
        }
    }

    async function enterMain() {
        $('user-name').textContent = state.user.name;
        updateAdminUi();
        showScreen('screen-main');
        await Promise.all([loadPricing(), refreshOrders()]);
        openStream();
    }

    function updateAdminUi() {
        $('admin-badge').classList.toggle('hidden', !state.user.admin);
        $('admin-link').classList.toggle('hidden', !state.config.adminEnabled || state.user.admin);
        $('pricing-edit-btn').classList.toggle('hidden', !state.user.admin);
    }

    // ---------- データ取得 ----------

    let refreshSeq = 0;
    async function refreshOrders() {
        const seq = ++refreshSeq;
        try {
            const data = await api('/api/orders');
            if (seq !== refreshSeq) return; // 古いレスポンスで新しい表示を上書きしない
            state.orders = data.orders;
            renderAll();
        } catch (err) {
            if (err.status === 401) location.reload();
        }
    }

    async function loadPricing() {
        try {
            const data = await api('/api/pricing');
            state.pricing = data.pricing;
        } catch { /* 価格未設定でもアプリは動く */ }
    }

    // ---------- 価格計算 ----------
    //
    // ロゴ用スクリーン版代 : 白/カラーの発注数合計で割って1枚あたりを算出(ロゴ無=0)
    //   白の分配費用      = 版代 ÷ (白合計+カラー合計) × 白合計
    //   カラーの分配費用  = 版代 ÷ (白合計+カラー合計) × カラー合計
    // バックプリント用版代 : 有の発注数合計で割って1枚あたりを算出(無=0)
    // 完成Tシャツ単価 = サイズ別Tシャツ代(持ち込みは持ち込み価格)
    //                 + ロゴ用版代の1枚あたり + BP用版代の1枚あたり + スクリーン工賃
    //                 を10の位で切り上げ(例: 221 → 230)

    // 浮動小数点誤差でちょうど10の倍数が繰り上がらないよう、小数2桁で丸めてから切り上げる
    function roundUp10(n) {
        return Math.ceil(Math.round(n * 100) / 1000) * 10;
    }

    function orderQty(order) {
        let q = 0;
        for (const item of order.items) {
            for (const v of Object.values(item.quantities)) q += v;
        }
        return q;
    }

    function buildPriceModel() {
        const p = state.pricing || { sizePrices: {}, bringOwnPrice: 0, plates: [], labor: {} };
        const counts = { white: 0, color: 0, none: 0, bpYes: 0, bpNo: 0 };
        for (const o of state.orders) {
            const q = orderQty(o);
            if (o.chestLogo === '有(白)') counts.white += q;
            else if (o.chestLogo === '有(カラー)') counts.color += q;
            else counts.none += q;
            if (o.backPrint === '有') counts.bpYes += q;
            else counts.bpNo += q;
        }
        const logoDen = counts.white + counts.color;
        let logoUnit = 0;
        let bpUnit = 0;
        for (const plate of p.plates || []) {
            if (plate.type === 'logo' && logoDen > 0) logoUnit += plate.cost / logoDen;
            if (plate.type === 'back' && counts.bpYes > 0) bpUnit += plate.cost / counts.bpYes;
        }

        function laborFor(chestLogo, backPrint) {
            const combo = C.LABOR_COMBOS.find(
                (l) => l.chestLogo === chestLogo && l.backPrint === backPrint,
            );
            return combo ? (p.labor || {})[combo.key] || 0 : 0; // 「無+無」は工賃0
        }

        function basePrice(size, color) {
            return color === C.BRING_OWN ? (p.bringOwnPrice || 0) : ((p.sizePrices || {})[size] || 0);
        }

        function unit(chestLogo, backPrint, size, color) {
            const logoAdd = chestLogo === '無' ? 0 : logoUnit;
            const bpAdd = backPrint === '有' ? bpUnit : 0;
            return roundUp10(basePrice(size, color) + logoAdd + bpAdd + laborFor(chestLogo, backPrint));
        }

        return { counts, logoDen, logoUnit, bpUnit, laborFor, basePrice, unit, hasPricing: !!state.pricing };
    }

    function orderAmount(order) {
        const pm = state.priceModel;
        let total = 0;
        for (const item of order.items) {
            for (const [color, qty] of Object.entries(item.quantities)) {
                total += qty * pm.unit(order.chestLogo, order.backPrint, item.size, color);
            }
        }
        return total;
    }

    // ---------- 描画 ----------

    function renderAll() {
        state.priceModel = buildPriceModel();
        renderOrders();
        renderPersonTotals();
        renderPriceTable();
        renderSummary();
        renderDelivery();
        renderRemaining();
    }

    function itemQtyHtml(order, item) {
        const pm = state.priceModel;
        const parts = C.COLORS.filter((c) => item.quantities[c]).map((c) => {
            const u = pm.unit(order.chestLogo, order.backPrint, item.size, c);
            return `${escapeHtml(c)}×${item.quantities[c]}<span class="unit">(@${fmtMoney(u)})</span>`;
        });
        let amount = 0;
        for (const [color, qty] of Object.entries(item.quantities)) {
            amount += qty * pm.unit(order.chestLogo, order.backPrint, item.size, color);
        }
        return `<div class="order-item"><span class="tag size">${escapeHtml(item.size)}</span> ${parts.join('、')} <b>= ${fmtMoney(amount)}</b></div>`;
    }

    function renderOrders() {
        const list = $('order-list');
        const orders = state.orders.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        $('order-count').textContent = orders.length ? `${orders.length}件` : '';
        $('order-empty').classList.toggle('hidden', orders.length > 0);

        list.innerHTML = orders.map((o) => {
            const mine = o.userId === state.user.userId;
            const editable = mine || state.user.admin;
            const proxy = o.orderName !== o.displayName;
            const updated = new Date(o.updatedAt).toLocaleString('ja-JP', {
                month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            return `
            <div class="order-card${mine ? ' mine' : ''}">
                <div class="order-top">
                    <span class="order-name">${escapeHtml(o.orderName)}${mine ? '<span class="you">(自分の入力)</span>' : ''}</span>
                    ${editable ? `
                    <span class="order-actions">
                        <button class="btn btn-small" data-edit="${o.id}">編集</button>
                        <button class="btn btn-small btn-danger" data-delete="${o.id}">削除</button>
                    </span>` : ''}
                </div>
                <div class="order-tags">
                    <span class="tag">胸ロゴ:${escapeHtml(o.chestLogo)}</span>
                    <span class="tag">バックプリント:${escapeHtml(o.backPrint)}</span>
                </div>
                ${o.items.map((item) => itemQtyHtml(o, item)).join('')}
                <div class="order-total">合計 ${orderQty(o)}枚 <b>${fmtMoney(orderAmount(o))}</b></div>
                ${o.note ? `<div class="order-note">📝 ${escapeHtml(o.note)}</div>` : ''}
                <div class="order-meta">${proxy ? `入力: ${escapeHtml(o.displayName)} / ` : ''}更新: ${updated}(${escapeHtml(o.updatedBy)})</div>
            </div>`;
        }).join('');

        list.querySelectorAll('[data-edit]').forEach((btn) => {
            btn.addEventListener('click', () => startEdit(Number(btn.dataset.edit)));
        });
        list.querySelectorAll('[data-delete]').forEach((btn) => {
            btn.addEventListener('click', () => deleteOrder(Number(btn.dataset.delete)));
        });
    }

    function renderPersonTotals() {
        const totals = new Map();
        for (const o of state.orders) {
            const t = totals.get(o.orderName) || { qty: 0, amount: 0 };
            t.qty += orderQty(o);
            t.amount += orderAmount(o);
            totals.set(o.orderName, t);
        }
        if (totals.size === 0) {
            $('person-totals').innerHTML = '<p class="muted">注文が入ると名前ごとの合計金額が表示されます。</p>';
            return;
        }
        let allQty = 0;
        let allAmount = 0;
        const rows = [...totals.entries()].map(([name, t]) => {
            allQty += t.qty;
            allAmount += t.amount;
            return `<tr><th>${escapeHtml(name)}</th><td class="num">${t.qty}</td><td class="num">${fmtMoney(t.amount)}</td></tr>`;
        }).join('');
        $('person-totals').innerHTML = `
            <div class="summary-group"><div class="table-wrap">
            <table class="summary">
                <tr><th>名前</th><th>枚数</th><th>金額</th></tr>
                ${rows}
                <tr class="total-row"><th>合計</th><td class="num">${allQty}</td><td class="num">${fmtMoney(allAmount)}</td></tr>
            </table>
            </div></div>`;
    }

    // 単価表:デザインの組み合わせごとに内訳(Tシャツ代+版代+工賃=単価)を表示
    function renderPriceTable() {
        const pm = state.priceModel;
        const box = $('price-table');

        if (!pm.hasPricing) {
            box.innerHTML = `<p class="muted">価格が未設定です。${state.user.admin ? '「価格を設定」から入力してください。' : '管理者が設定すると単価が表示されます。'}</p>`;
            return;
        }

        // 注文に存在する組み合わせ+工賃が設定されている組み合わせを表示
        const comboKeys = new Set();
        for (const o of state.orders) comboKeys.add(`${o.chestLogo}|${o.backPrint}`);
        const combos = C.LABOR_COMBOS.filter(
            (l) => comboKeys.has(`${l.chestLogo}|${l.backPrint}`) || (state.pricing.labor || {})[l.key] > 0,
        );
        if (comboKeys.has('無|無')) combos.push({ key: null, chestLogo: '無', backPrint: '無', label: 'ロゴ無+バックプリント無' });

        if (combos.length === 0) {
            box.innerHTML = '<p class="muted">注文が入ると、デザインごとの単価と内訳が表示されます。</p>';
            return;
        }

        box.innerHTML = combos.map((combo) => {
            const logoAdd = combo.chestLogo === '無' ? 0 : pm.logoUnit;
            const bpAdd = combo.backPrint === '有' ? pm.bpUnit : 0;
            const labor = pm.laborFor(combo.chestLogo, combo.backPrint);
            const rows = C.SIZES.map((size) => {
                const base = pm.basePrice(size, null);
                return `<tr><th>${size}</th><td class="num">${fmtMoney(base)}</td><td class="num total-col">${fmtMoney(pm.unit(combo.chestLogo, combo.backPrint, size, null))}</td></tr>`;
            }).join('');
            const bringBase = pm.basePrice(null, C.BRING_OWN);
            const bringRow = `<tr><th>${escapeHtml(C.BRING_OWN)}</th><td class="num">${fmtMoney(bringBase)}</td><td class="num total-col">${fmtMoney(pm.unit(combo.chestLogo, combo.backPrint, null, C.BRING_OWN))}</td></tr>`;
            return `
            <div class="summary-group">
                <div class="summary-title">${escapeHtml(combo.label)}</div>
                <div class="price-breakdown muted">
                    内訳: Tシャツ代(サイズ別) + ロゴ版代 ${fmtMoney(logoAdd)} + バックプリント版代 ${fmtMoney(bpAdd)} + 工賃 ${fmtMoney(labor)}(単価は10の位で切り上げ)
                </div>
                <div class="table-wrap">
                    <table class="summary">
                        <tr><th>サイズ</th><th>Tシャツ代</th><th>完成単価</th></tr>
                        ${rows}${bringRow}
                    </table>
                </div>
            </div>`;
        }).join('');
    }

    function renderSummary() {
        const groups = new Map();
        let grandQty = 0;

        for (const o of state.orders) {
            const key = `${o.chestLogo}|${o.backPrint}`;
            if (!groups.has(key)) {
                groups.set(key, { chestLogo: o.chestLogo, backPrint: o.backPrint, cells: {}, total: 0 });
            }
            const g = groups.get(key);
            for (const item of o.items) {
                for (const [color, qty] of Object.entries(item.quantities)) {
                    g.cells[color] = g.cells[color] || {};
                    g.cells[color][item.size] = (g.cells[color][item.size] || 0) + qty;
                    g.total += qty;
                    grandQty += qty;
                }
            }
        }

        let grandAmount = 0;
        for (const o of state.orders) grandAmount += orderAmount(o);
        $('grand-total').textContent = grandQty
            ? `合計 ${grandQty}枚 / ${fmtMoney(grandAmount)}`
            : '';

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

    // ---------- 受け渡しチェック・残数 ----------

    // 明細行(注文×サイズ×カラー)を列挙する共通処理
    function eachLine(order, fn) {
        order.items.forEach((item, idx) => {
            for (const color of C.COLORS) {
                const qty = item.quantities[color];
                if (qty) fn(idx, item, color, qty, order.delivered[`${idx}:${color}`]);
            }
        });
    }

    function renderDelivery() {
        const box = $('delivery-list');
        if (state.orders.length === 0) {
            $('delivery-progress').textContent = '';
            box.innerHTML = '<p class="muted">注文が入るとチェックリストが表示されます。</p>';
            return;
        }
        let totalQty = 0;
        let doneQty = 0;
        const orders = state.orders.slice().sort((a, b) => a.orderName.localeCompare(b.orderName, 'ja'));

        box.innerHTML = orders.map((o) => {
            const mine = o.userId === state.user.userId;
            const canCheck = mine || state.user.admin;
            const rows = [];
            eachLine(o, (idx, item, color, qty, check) => {
                totalQty += qty;
                if (check) doneQty += qty;
                const meta = check
                    ? `✓ ${escapeHtml(check.by)} ${new Date(check.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : '';
                rows.push(`
                    <label class="delivery-row${check ? ' done' : ''}">
                        <input type="checkbox" data-order="${o.id}" data-item="${idx}" data-color="${escapeHtml(color)}"
                            ${check ? 'checked' : ''} ${canCheck ? '' : 'disabled'}>
                        <span class="delivery-text">
                            <span class="tag">${escapeHtml(o.chestLogo)}/${escapeHtml(o.backPrint)}</span>
                            <span class="tag size">${escapeHtml(item.size)}</span>
                            ${escapeHtml(color)}×${qty}
                        </span>
                        <span class="delivery-meta">${meta}</span>
                    </label>`);
            });
            return `
            <div class="delivery-group${mine ? ' mine' : ''}">
                <div class="delivery-name">${escapeHtml(o.orderName)}${mine ? '<span class="you">(自分の入力)</span>' : ''}</div>
                ${rows.join('')}
            </div>`;
        }).join('');

        $('delivery-progress').textContent = `受け渡し済み ${doneQty} / ${totalQty}枚`;

        box.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => toggleDelivery(cb));
        });
    }

    async function toggleDelivery(cb) {
        cb.disabled = true;
        try {
            await api(`/api/orders/${cb.dataset.order}/delivery`, {
                method: 'POST',
                body: JSON.stringify({
                    itemIndex: Number(cb.dataset.item),
                    color: cb.dataset.color,
                    delivered: cb.checked,
                }),
            });
            refreshOrders();
        } catch (err) {
            showPopup(err.message);
            refreshOrders();
        }
    }

    // 残数 = 発注数 − 受け渡し済み数(デザイン×サイズ×カラー別)
    function renderRemaining() {
        const groups = new Map();
        let remainingTotal = 0;

        for (const o of state.orders) {
            eachLine(o, (idx, item, color, qty, check) => {
                if (check) return; // 受け渡し済みは残数に含めない
                const key = `${o.chestLogo}|${o.backPrint}`;
                if (!groups.has(key)) {
                    groups.set(key, { chestLogo: o.chestLogo, backPrint: o.backPrint, cells: {}, total: 0 });
                }
                const g = groups.get(key);
                g.cells[color] = g.cells[color] || {};
                g.cells[color][item.size] = (g.cells[color][item.size] || 0) + qty;
                g.total += qty;
                remainingTotal += qty;
            });
        }

        $('remaining-total').textContent = state.orders.length ? `残り ${remainingTotal}枚` : '';

        if (state.orders.length === 0) {
            $('remaining').innerHTML = '<p class="muted">注文が入ると残数が表示されます。</p>';
            return;
        }
        if (remainingTotal === 0) {
            $('remaining').innerHTML = '<p class="all-done">🎉 すべての受け渡しが完了しました!</p>';
            return;
        }

        $('remaining').innerHTML = [...groups.values()].map((g) => {
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
            const totalRow = `<tr class="total-row"><th>残り</th>${sizes.map((s) => `<td class="num">${colTotals[s]}</td>`).join('')}<td class="num total-col">${g.total}</td></tr>`;
            return `
            <div class="summary-group">
                <div class="summary-title">胸ロゴ:${escapeHtml(g.chestLogo)} / バックプリント:${escapeHtml(g.backPrint)}(残り${g.total}枚)</div>
                <div class="table-wrap">
                    <table class="summary">
                        <tr><th>カラー</th>${sizes.map((s) => `<th>${s}</th>`).join('')}<th>計</th></tr>
                        ${rows}${totalRow}
                    </table>
                </div>
            </div>`;
        }).join('');
    }

    // ---------- 編集ロック ----------

    async function acquireLock() {
        try {
            await api('/api/lock', { method: 'POST' });
            return true;
        } catch (err) {
            showPopup(err.status === 409 ? (err.message || '他のメンバーが編集中です') : err.message);
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

    function selectedChip(name) {
        const chip = document.querySelector(`.chip.selected[data-group="${name}"]`);
        return chip ? chip.dataset.value : null;
    }

    function setChip(name, value) {
        document.querySelectorAll(`.chip[data-group="${name}"]`).forEach((c) => {
            c.classList.toggle('selected', c.dataset.value === value);
        });
    }

    // サイズ1件分の入力ブロック(サイズ選択+カラー別数量)
    function createItemBlock(item) {
        const div = document.createElement('div');
        div.className = 'item-block';
        div.innerHTML = `
            <div class="item-head">
                <span class="item-title">サイズ</span>
                <button type="button" class="btn btn-small btn-danger item-remove">このサイズを削除</button>
            </div>
            <div class="chip-group item-sizes"></div>
            <div class="color-grid item-colors"></div>`;

        const sizeBox = div.querySelector('.item-sizes');
        sizeBox.innerHTML = C.SIZES.map((s) => `<button type="button" class="chip" data-value="${s}">${s}</button>`).join('');
        sizeBox.querySelectorAll('.chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                sizeBox.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
                chip.classList.add('selected');
            });
        });

        const colorBox = div.querySelector('.item-colors');
        colorBox.innerHTML = C.COLORS.map((color) => `
            <div class="color-row">
                <label>${escapeHtml(color)}</label>
                <input data-color="${escapeHtml(color)}" type="number" inputmode="numeric" min="0" max="${C.MAX_QTY}" placeholder="0">
            </div>`).join('');
        colorBox.querySelectorAll('input').forEach((input) => {
            input.addEventListener('input', () => {
                input.closest('.color-row').classList.toggle('has-qty', Number(input.value) > 0);
            });
        });

        div.querySelector('.item-remove').addEventListener('click', () => {
            div.remove();
            updateItemRemoveButtons();
        });

        if (item) {
            sizeBox.querySelectorAll('.chip').forEach((c) => c.classList.toggle('selected', c.dataset.value === item.size));
            colorBox.querySelectorAll('input').forEach((input) => {
                const qty = item.quantities[input.dataset.color] || 0;
                input.value = qty || '';
                input.closest('.color-row').classList.toggle('has-qty', qty > 0);
            });
        }
        return div;
    }

    function addItemBlock(item) {
        if ($('items-list').children.length >= C.MAX_ITEMS) return;
        $('items-list').appendChild(createItemBlock(item));
        updateItemRemoveButtons();
    }

    // ブロックが1つだけの時は削除ボタンを隠す
    function updateItemRemoveButtons() {
        const blocks = $('items-list').querySelectorAll('.item-block');
        blocks.forEach((b) => {
            b.querySelector('.item-remove').classList.toggle('hidden', blocks.length <= 1);
        });
    }

    function fillForm(order) {
        // 新規は自分のLINE名を初期値に(代行入力時は書き換えてもらう)
        $('order-name-input').value = order ? order.orderName : state.user.name;
        setChip('chestLogo', order ? order.chestLogo : null);
        setChip('backPrint', order ? order.backPrint : null);
        $('items-list').innerHTML = '';
        if (order) {
            order.items.forEach((item) => addItemBlock(item));
        } else {
            addItemBlock(null);
        }
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

    function collectItems() {
        const items = [];
        for (const block of $('items-list').querySelectorAll('.item-block')) {
            const sizeChip = block.querySelector('.item-sizes .chip.selected');
            const quantities = {};
            block.querySelectorAll('.item-colors input').forEach((input) => {
                const n = Number(input.value);
                if (n > 0) quantities[input.dataset.color] = n;
            });
            items.push({ size: sizeChip ? sizeChip.dataset.value : null, quantities });
        }
        return items;
    }

    async function saveForm() {
        const items = collectItems();
        const body = {
            orderName: $('order-name-input').value.trim(),
            chestLogo: selectedChip('chestLogo'),
            backPrint: selectedChip('backPrint'),
            note: $('note-input').value,
            items,
        };

        if (!body.orderName) return showFormError('名前を入力してください');
        if (!body.chestLogo) return showFormError('胸ロゴを選択してください');
        if (!body.backPrint) return showFormError('バックプリントを選択してください');
        for (let i = 0; i < items.length; i++) {
            if (!items[i].size) return showFormError(`${i + 1}番目のサイズを選択してください`);
            if (Object.keys(items[i].quantities).length === 0) {
                return showFormError(`サイズ${items[i].size}の数量を1色以上入力してください`);
            }
        }
        $('form-error').classList.add('hidden');

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
        if (!window.confirm(`${order.orderName}さんの注文(計${orderQty(order)}枚)を削除しますか?`)) return;
        try {
            await api(`/api/orders/${id}`, { method: 'DELETE' });
            refreshOrders();
        } catch (err) {
            showPopup(err.message);
        }
    }

    // ---------- 価格設定(管理者) ----------

    function pricingOrDefault() {
        return state.pricing || { sizePrices: {}, bringOwnPrice: 0, plates: [], labor: {} };
    }

    // スクリーン版1件分の入力行と、発注数合計・分配費用の表示
    function createPlateRow(plate) {
        const div = document.createElement('div');
        div.className = 'plate-row';
        div.innerHTML = `
            <div class="plate-inputs">
                <select class="input plate-type">
                    <option value="logo">ロゴ用</option>
                    <option value="back">バックプリント用</option>
                </select>
                <input class="input plate-cost" type="number" inputmode="decimal" min="0" placeholder="版代">
                <button type="button" class="btn btn-small btn-danger plate-remove">削除</button>
            </div>
            <div class="plate-alloc muted"></div>`;
        if (plate) {
            div.querySelector('.plate-type').value = plate.type;
            div.querySelector('.plate-cost').value = plate.cost || '';
        }
        const update = () => updatePlateAlloc(div);
        div.querySelector('.plate-type').addEventListener('change', update);
        div.querySelector('.plate-cost').addEventListener('input', update);
        div.querySelector('.plate-remove').addEventListener('click', () => div.remove());
        update();
        return div;
    }

    // 仕様の分配計算:
    //  ロゴ用   白 = 版代/(白+カラー)×白, カラー = 版代/(白+カラー)×カラー, ロゴ無 = 0
    //  BP用     有 = 版代/有合計(1枚あたり), 無 = 0
    function updatePlateAlloc(row) {
        const { counts } = state.priceModel;
        const type = row.querySelector('.plate-type').value;
        const cost = Number(row.querySelector('.plate-cost').value) || 0;
        const box = row.querySelector('.plate-alloc');
        if (type === 'logo') {
            const den = counts.white + counts.color;
            const white = den > 0 ? (cost / den) * counts.white : 0;
            const color = den > 0 ? (cost / den) * counts.color : 0;
            box.innerHTML = `発注数 → 白:${counts.white}枚 / カラー:${counts.color}枚 / ロゴ無:${counts.none}枚<br>`
                + `分配 → 白:${fmtMoney(white)} / カラー:${fmtMoney(color)} / ロゴ無:0`
                + (den > 0 ? `(1枚あたり ${fmtMoney(cost / den)})` : '');
        } else {
            const perUnit = counts.bpYes > 0 ? cost / counts.bpYes : 0;
            box.innerHTML = `発注数 → 有:${counts.bpYes}枚 / 無:${counts.bpNo}枚<br>`
                + `分配 → 有:1枚あたり ${fmtMoney(perUnit)}(合計 ${fmtMoney(cost)}) / 無:0`;
        }
    }

    function openPricingModal() {
        const p = pricingOrDefault();
        $('size-price-grid').innerHTML = C.SIZES.map((s) => `
            <div class="price-row">
                <label>${s}</label>
                <input data-size="${s}" class="input" type="number" inputmode="decimal" min="0" placeholder="0" value="${p.sizePrices[s] || ''}">
            </div>`).join('');
        $('bring-own-price').value = p.bringOwnPrice || '';

        $('plates-list').innerHTML = '';
        (p.plates || []).forEach((plate) => $('plates-list').appendChild(createPlateRow(plate)));

        $('labor-list').innerHTML = C.LABOR_COMBOS.map((combo) => `
            <div class="price-row labor-row">
                <label>${escapeHtml(combo.label)}</label>
                <input data-labor="${combo.key}" class="input" type="number" inputmode="decimal" min="0" placeholder="0" value="${(p.labor || {})[combo.key] || ''}">
            </div>`).join('');

        $('pricing-error').classList.add('hidden');
        $('pricing-modal').classList.remove('hidden');
        $('pricing-modal').querySelector('.modal-card').scrollTop = 0;
    }

    async function savePricing() {
        const body = { sizePrices: {}, plates: [], labor: {} };
        $('size-price-grid').querySelectorAll('input').forEach((input) => {
            body.sizePrices[input.dataset.size] = Number(input.value) || 0;
        });
        body.bringOwnPrice = Number($('bring-own-price').value) || 0;
        for (const row of $('plates-list').querySelectorAll('.plate-row')) {
            body.plates.push({
                type: row.querySelector('.plate-type').value,
                cost: Number(row.querySelector('.plate-cost').value) || 0,
            });
        }
        $('labor-list').querySelectorAll('input').forEach((input) => {
            body.labor[input.dataset.labor] = Number(input.value) || 0;
        });

        try {
            const data = await api('/api/pricing', { method: 'PUT', body: JSON.stringify(body) });
            state.pricing = data.pricing;
            $('pricing-modal').classList.add('hidden');
            renderAll();
        } catch (err) {
            $('pricing-error').textContent = err.message;
            $('pricing-error').classList.remove('hidden');
        }
    }

    // ---------- CSV出力(日本語/タイ語) ----------

    function tr(text, lang) {
        return lang === 'th' ? (C.TH[text] || text) : text;
    }

    // 明細CSV(1行 = 注文×サイズ×カラー)。Excelで開けるようBOM付きUTF-8
    function downloadCsv(lang) {
        if (state.orders.length === 0) return showPopup('注文がまだありません');
        const pm = state.priceModel;
        const header = ['名前', '胸ロゴ', 'バックプリント', 'サイズ', 'カラー', '数量', '単価', '金額', '受け渡し', '確認者', '備考', '入力者', '更新日時']
            .map((h) => tr(h, lang));
        const rows = [header];
        for (const o of state.orders) {
            o.items.forEach((item, idx) => {
                for (const color of C.COLORS) {
                    const qty = item.quantities[color];
                    if (!qty) continue;
                    const unit = pm.unit(o.chestLogo, o.backPrint, item.size, color);
                    const check = o.delivered[`${idx}:${color}`];
                    rows.push([
                        o.orderName,
                        tr(o.chestLogo, lang),
                        tr(o.backPrint, lang),
                        item.size,
                        tr(color, lang),
                        qty,
                        Math.round(unit * 100) / 100,
                        Math.round(unit * qty * 100) / 100,
                        tr(check ? '済' : '未', lang),
                        check ? check.by : '',
                        o.note,
                        o.displayName,
                        new Date(o.updatedAt).toLocaleString('ja-JP'),
                    ]);
                }
            });
        }
        const csv = '\ufeff' + rows
            .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
            .join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        const d = new Date();
        const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        a.download = lang === 'th' ? `orders_th_${stamp}.csv` : `注文一覧_${stamp}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // ---------- リアルタイム更新(SSE) ----------

    function openStream() {
        if (state.stream) state.stream.close();
        state.stream = new EventSource(`/api/stream?token=${encodeURIComponent(state.token)}`);
        state.stream.onmessage = async (e) => {
            let event;
            try { event = JSON.parse(e.data); } catch { return; }
            if (event.type === 'orders') refreshOrders();
            if (event.type === 'pricing') {
                await loadPricing();
                renderAll();
            }
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
            updateAdminUi();
            openStream(); // 新トークンで張り直す
            renderAll();
        } catch (err) {
            $('admin-error').textContent = err.message;
            $('admin-error').classList.remove('hidden');
        }
    }

    // ---------- イベント登録 ----------

    buildChips('chest-logo-options', C.CHEST_LOGOS, 'chestLogo');
    buildChips('back-print-options', C.BACK_PRINTS, 'backPrint');

    $('add-btn').addEventListener('click', () => openForm(null));
    $('add-item-btn').addEventListener('click', () => addItemBlock(null));
    $('form-cancel').addEventListener('click', closeForm);
    $('form-save').addEventListener('click', saveForm);
    $('popup-ok').addEventListener('click', () => $('popup').classList.add('hidden'));

    $('csv-btn').addEventListener('click', () => downloadCsv('ja'));
    $('csv-th-btn').addEventListener('click', () => downloadCsv('th'));

    $('pricing-edit-btn').addEventListener('click', openPricingModal);
    $('add-plate-btn').addEventListener('click', () => $('plates-list').appendChild(createPlateRow(null)));
    $('pricing-cancel').addEventListener('click', () => $('pricing-modal').classList.add('hidden'));
    $('pricing-save').addEventListener('click', savePricing);

    $('dev-login-btn').addEventListener('click', () => {
        const name = $('dev-name').value.trim();
        if (!name) return;
        localStorage.setItem('devName', name);
        authenticate();
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
            stopHeartbeat();
            fetch(`/api/lock?token=${encodeURIComponent(state.token)}`, { method: 'DELETE', keepalive: true }).catch(() => {});
        }
    });

    init();
})();
