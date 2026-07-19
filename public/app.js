/* グッズ注文とりまとめアプリ フロントエンド */
(function () {
    'use strict';

    const C = window.APP_CONSTANTS;

    const state = {
        config: null,
        token: null,
        user: null,
        orders: [],
        designImages: {},    // デザイン項目ごとのサンプル画像(dataURL)
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
        await Promise.all([loadPricing(), loadDesigns(), refreshOrders({ render: false })]);
        renderAll();
        refreshChipImages();
        showScreen('screen-main');
        openStream();
    }

    function updateAdminUi() {
        $('admin-badge').classList.toggle('hidden', !state.user.admin);
        $('admin-link').classList.toggle('hidden', !state.config.adminEnabled || state.user.admin);
        $('pricing-edit-btn').classList.toggle('hidden', !state.user.admin);
    }

    // ---------- データ取得 ----------

    let refreshSeq = 0;
    async function refreshOrders({ render = true } = {}) {
        const seq = ++refreshSeq;
        try {
            const data = await api('/api/orders');
            if (seq !== refreshSeq) return; // 古いレスポンスで新しい表示を上書きしない
            state.orders = data.orders;
            if (render) renderAll();
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

    async function loadDesigns() {
        try {
            const data = await api('/api/designs');
            state.designImages = data.images || {};
        } catch { /* 画像未設定でもアプリは動く */ }
    }

    // 選択肢に対応するサンプル画像のキー(胸ロゴは項目名そのまま、バックプリントは「有」のみ)
    function designImageKey(group, value) {
        if (group === 'chestLogo' && value !== '無') return value;
        if (group === 'backPrint' && value === '有') return C.BACK_PRINT_IMAGE_KEY;
        return null;
    }

    // チップ(選択肢ボタン)にサンプル画像を反映
    function refreshChipImages() {
        document.querySelectorAll('.chip[data-group]').forEach((chip) => {
            const key = designImageKey(chip.dataset.group, chip.dataset.value);
            const img = key ? state.designImages[key] : null;
            chip.innerHTML = (img ? `<img class="chip-img" src="${img}" alt="${escapeHtml(chip.dataset.value)}" data-zoom-design="${escapeHtml(key)}" title="画像を拡大">` : '')
                + escapeHtml(chip.dataset.value);
        });
    }

    // ---------- 価格 ----------
    //
    // 価格は工賃込みの一律。管理者が入力したサイズ別価格(持ち込みは持ち込み価格)を
    // そのまま単価として表示する(計算・切り上げなし)

    function orderQty(order) {
        let q = 0;
        for (const item of order.items) {
            for (const v of Object.values(item.quantities)) q += v;
        }
        return q;
    }

    function buildPriceModel() {
        const p = state.pricing || { sizePrices: {}, bringOwnPrice: 0 };

        function unit(chestLogo, backPrint, size) {
            return size === C.BRING_OWN ? (p.bringOwnPrice || 0) : ((p.sizePrices || {})[size] || 0);
        }

        return { unit, hasPricing: !!state.pricing };
    }

    // 明細の数量キー(通常サイズはカラー、持ち込みサイズは「持ち込み」のみ)
    function itemKeys(item) {
        return item.size === C.BRING_OWN ? [C.BRING_OWN] : C.COLORS;
    }

    function orderAmount(order) {
        const pm = state.priceModel;
        let total = 0;
        for (const item of order.items) {
            const u = pm.unit(order.chestLogo, order.backPrint, item.size);
            for (const qty of Object.values(item.quantities)) {
                total += qty * u;
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
        const u = pm.unit(order.chestLogo, order.backPrint, item.size);
        const parts = itemKeys(item).filter((c) => item.quantities[c]).map((c) => {
            const label = item.size === C.BRING_OWN ? '' : `${escapeHtml(c)}`;
            return `${label}×${item.quantities[c]}<span class="unit">(@${fmtMoney(u)})</span>`;
        });
        let amount = 0;
        for (const qty of Object.values(item.quantities)) {
            amount += qty * u;
        }
        return `<div class="order-item"><span class="tag size">${escapeHtml(item.size)}</span> ${parts.join('、')} <b>= ${fmtMoney(amount)}</b></div>`;
    }

    function renderOrders() {
        const list = $('order-list');
        const orders = state.orders.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        $('order-count').textContent = orders.length ? `${orders.length}件` : '';
        $('order-empty').classList.toggle('hidden', orders.length > 0);

        const groups = new Map();
        for (const order of orders) {
            if (!groups.has(order.orderName)) groups.set(order.orderName, []);
            groups.get(order.orderName).push(order);
        }

        list.innerHTML = [...groups.entries()].map(([orderName, personOrders]) => {
            const hasMine = personOrders.some((o) => o.userId === state.user.userId);
            const personQty = personOrders.reduce((sum, o) => sum + orderQty(o), 0);
            const personAmount = personOrders.reduce((sum, o) => sum + orderAmount(o), 0);
            const allPaid = personOrders.every((o) => Boolean(o.paid));
            const somePaid = personOrders.some((o) => Boolean(o.paid));
            const paymentEditable = state.user.admin || personOrders.every((o) => o.userId === state.user.userId);
            const latestPayment = personOrders
                .filter((o) => o.paid)
                .map((o) => o.paid)
                .sort((a, b) => new Date(b.at) - new Date(a.at))[0];
            const paymentMeta = allPaid && latestPayment
                ? `✓ ${escapeHtml(latestPayment.by)} ${new Date(latestPayment.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                : (somePaid ? `一部済み (${personOrders.filter((o) => o.paid).length}/${personOrders.length}件)` : '');
            const entries = personOrders.map((o) => {
            const mine = o.userId === state.user.userId;
            const editable = mine || state.user.admin;
            const proxy = o.orderName !== o.displayName;
            const updated = new Date(o.updatedAt).toLocaleString('ja-JP', {
                month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            return `
            <div class="order-entry${mine ? ' mine' : ''}">
                <div class="order-entry-head">
                    <div class="order-tags">
                        <span class="tag">胸ロゴ:${escapeHtml(o.chestLogo)}</span>
                        <span class="tag">バックプリント:${escapeHtml(o.backPrint)}</span>
                    </div>
                    ${editable ? `
                    <span class="order-actions">
                        <button class="btn btn-small" data-edit="${o.id}">編集</button>
                        <button class="btn btn-small btn-danger" data-delete="${o.id}">削除</button>
                    </span>` : ''}
                </div>
                ${orderPreviewGallery(o)}
                ${o.items.map((item) => itemQtyHtml(o, item)).join('')}
                <div class="order-total">小計 ${orderQty(o)}枚 <b>${fmtMoney(orderAmount(o))}</b></div>
                ${o.note ? `<div class="order-note">📝 ${escapeHtml(o.note)}</div>` : ''}
                <div class="order-meta">${proxy ? `入力: ${escapeHtml(o.displayName)} / ` : ''}更新: ${updated}(${escapeHtml(o.updatedBy)})</div>
            </div>`;
            }).join('');
            return `
            <div class="order-card${hasMine ? ' mine' : ''}">
                <div class="order-top">
                    <span class="order-name">${escapeHtml(orderName)}${hasMine ? '<span class="you">(自分の入力)</span>' : ''}</span>
                </div>
                ${entries}
                <div class="person-order-summary">
                    <div class="order-total person-order-total">合計 ${personQty}枚 <b>${fmtMoney(personAmount)}</b></div>
                    <label class="pay-row${allPaid ? ' paid' : ''}">
                        <input type="checkbox" data-pay-person="${escapeHtml(orderName)}" data-partial="${somePaid && !allPaid}" ${allPaid ? 'checked' : ''} ${paymentEditable ? '' : 'disabled'}>
                        <span class="pay-label">支払い済み</span>
                        <span class="pay-meta">${paymentMeta}</span>
                    </label>
                </div>
            </div>`;
        }).join('');

        list.querySelectorAll('[data-edit]').forEach((btn) => {
            btn.addEventListener('click', () => startEdit(Number(btn.dataset.edit)));
        });
        list.querySelectorAll('[data-delete]').forEach((btn) => {
            btn.addEventListener('click', () => deleteOrder(Number(btn.dataset.delete)));
        });
        list.querySelectorAll('[data-pay-person]').forEach((cb) => {
            cb.indeterminate = cb.dataset.partial === 'true';
            cb.addEventListener('change', () => togglePersonPayment(cb));
        });
    }

    async function togglePersonPayment(cb) {
        cb.disabled = true;
        const personOrders = state.orders.filter((o) => o.orderName === cb.dataset.payPerson);
        const canEditAll = state.user.admin || personOrders.every((o) => o.userId === state.user.userId);
        if (!canEditAll) {
            showPopup('この名前の支払い状況をまとめて変更できるのは管理者のみです。');
            refreshOrders();
            return;
        }
        try {
            await Promise.all(personOrders
                .filter((o) => Boolean(o.paid) !== cb.checked)
                .map((o) => api(`/api/orders/${o.id}/payment`, {
                    method: 'POST',
                    body: JSON.stringify({ paid: cb.checked }),
                })));
        } catch (err) {
            showPopup(err.message);
        }
        refreshOrders();
    }

    function renderPersonTotals() {
        const totals = new Map();
        for (const o of state.orders) {
            const t = totals.get(o.orderName) || { qty: 0, amount: 0, paidAmount: 0, previews: new Map() };
            const amount = orderAmount(o);
            t.qty += orderQty(o);
            t.amount += amount;
            if (o.paid) t.paidAmount += amount;
            for (const color of orderPreviewColors(o)) {
                const key = `${color}|${o.chestLogo}|${o.backPrint}`;
                t.previews.set(key, previewThumbnail(color, o.chestLogo, o.backPrint));
            }
            totals.set(o.orderName, t);
        }
        if (totals.size === 0) {
            $('person-totals').innerHTML = '<p class="muted">注文が入ると名前ごとの合計金額が表示されます。</p>';
            return;
        }
        let allQty = 0;
        let allAmount = 0;
        let allPaid = 0;

        function payStatus(t) {
            if (t.amount > 0 && t.paidAmount >= t.amount) return '<span class="pay-ok">✓ 済</span>';
            if (t.paidAmount === 0) return '<span class="pay-no">未</span>';
            return `<span class="pay-part">一部(残 ${fmtMoney(t.amount - t.paidAmount)})</span>`;
        }

        const rows = [...totals.entries()].map(([name, t]) => {
            allQty += t.qty;
            allAmount += t.amount;
            allPaid += t.paidAmount;
            return `<tr><th>${escapeHtml(name)}${previewGallery([...t.previews.values()])}</th><td class="num">${t.qty}</td><td class="num">${fmtMoney(t.amount)}</td><td>${payStatus(t)}</td></tr>`;
        }).join('');
        const unpaid = allAmount - allPaid;
        $('person-totals').innerHTML = `
            <div class="summary-group"><div class="table-wrap">
            <table class="summary">
                <tr><th>名前</th><th>枚数</th><th>金額</th><th>支払い</th></tr>
                ${rows}
                <tr class="total-row"><th>合計</th><td class="num">${allQty}</td><td class="num">${fmtMoney(allAmount)}</td><td>${unpaid > 0 ? `未収 ${fmtMoney(unpaid)}` : '<span class="pay-ok">全員済 ✓</span>'}</td></tr>
            </table>
            </div></div>`;
    }

    // 単価表:管理者が入力した価格(工賃込み)をそのまま表示
    function renderPriceTable() {
        const pm = state.priceModel;
        const box = $('price-table');

        if (!pm.hasPricing) {
            box.innerHTML = `<p class="muted">価格が未設定です。${state.user.admin ? '「価格を設定」から入力してください。' : '管理者が設定すると単価が表示されます。'}</p>`;
            return;
        }

        const sizeGroups = new Map();
        for (const size of C.SIZES) {
            const unit = pm.unit(null, null, size);
            if (!sizeGroups.has(unit)) sizeGroups.set(unit, []);
            sizeGroups.get(unit).push(size);
        }
        const rows = [...sizeGroups.entries()].map(([unit, sizes]) => `
            <tr><th>${sizes.join('・')}</th><td class="num total-col">${fmtMoney(unit)}</td></tr>`).join('');
        const bringRow = `<tr><th>${escapeHtml(C.BRING_OWN)}</th><td class="num total-col">${fmtMoney(pm.unit(null, null, C.BRING_OWN))}</td></tr>`;
        box.innerHTML = `
            <div class="summary-group">
                <div class="price-breakdown muted">工賃込みの一律価格です(デザインによる差はありません)</div>
                <div class="table-wrap">
                    <table class="summary">
                        <tr><th>サイズ</th><th>単価</th></tr>
                        ${rows}${bringRow}
                    </table>
                </div>
            </div>`;
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
            const sizes = [...C.SIZES, C.BRING_OWN].filter((s) => Object.values(g.cells).some((row) => row[s]));
            const colors = [...C.COLORS, C.BRING_OWN].filter((c) => g.cells[c]);
            const colTotals = Object.fromEntries(sizes.map((s) => [s, 0]));

            const rows = colors.map((color) => {
                let rowTotal = 0;
                const cells = sizes.map((s) => {
                    const v = g.cells[color][s] || 0;
                    rowTotal += v;
                    colTotals[s] += v;
                    return `<td class="num">${v || ''}</td>`;
                }).join('');
                const image = previewThumbnail(color, g.chestLogo, g.backPrint);
                return `<tr><th>${escapeHtml(color)}${image}</th>${cells}<td class="num total-col">${rowTotal}</td></tr>`;
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
            for (const color of itemKeys(item)) {
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
        const groups = new Map();
        for (const order of orders) {
            if (!groups.has(order.orderName)) groups.set(order.orderName, []);
            groups.get(order.orderName).push(order);
        }

        box.innerHTML = [...groups.entries()].map(([orderName, personOrders]) => {
            const hasMine = personOrders.some((o) => o.userId === state.user.userId);
            const rows = [];
            for (const o of personOrders) {
                const canCheck = o.userId === state.user.userId || state.user.admin;
                eachLine(o, (idx, item, color, qty, check) => {
                    totalQty += qty;
                    if (check) doneQty += qty;
                    const meta = check
                        ? `✓ ${escapeHtml(check.by)} ${new Date(check.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                        : '';
                    rows.push(`
                        <div class="delivery-row${check ? ' done' : ''}">
                            <input type="checkbox" data-order="${o.id}" data-item="${idx}" data-color="${escapeHtml(color)}"
                                ${check ? 'checked' : ''} ${canCheck ? '' : 'disabled'}>
                            ${previewThumbnail(color, o.chestLogo, o.backPrint)}
                            <span class="delivery-text">
                                <span class="tag">${escapeHtml(o.chestLogo)}/${escapeHtml(o.backPrint)}</span>
                                <span class="tag size">${escapeHtml(item.size)}</span>
                                ${color === C.BRING_OWN ? '' : escapeHtml(color)}×${qty}
                            </span>
                            <span class="delivery-meta">${meta}</span>
                        </div>`);
                });
            }
            return `
            <div class="delivery-group${hasMine ? ' mine' : ''}">
                <div class="delivery-name">${escapeHtml(orderName)}${hasMine ? '<span class="you">(自分の入力)</span>' : ''}</div>
                ${rows.join('')}
            </div>`;
        }).join('');

        $('delivery-progress').textContent = `受け渡し済み ${doneQty} / ${totalQty}枚`;

        box.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => toggleDelivery(cb));
        });
        box.querySelectorAll('.delivery-row').forEach((row) => {
            row.addEventListener('click', (event) => {
                if (event.target.closest('input, button')) return;
                const cb = row.querySelector('input[type="checkbox"]');
                if (!cb.disabled) cb.click();
            });
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

        const sections = [...groups.values()].map((g) => {
            const sizes = [...C.SIZES, C.BRING_OWN].filter((s) => Object.values(g.cells).some((row) => row[s]));
            const colors = [...C.COLORS, C.BRING_OWN].filter((c) => g.cells[c]);
            const colTotals = Object.fromEntries(sizes.map((s) => [s, 0]));
            const rows = colors.map((color) => {
                let rowTotal = 0;
                const cells = sizes.map((s) => {
                    const v = g.cells[color][s] || 0;
                    rowTotal += v;
                    colTotals[s] += v;
                    return `<td class="num">${v || ''}</td>`;
                }).join('');
                const image = previewThumbnail(color, g.chestLogo, g.backPrint);
                return `<tr><th>${escapeHtml(color)}${image}</th>${cells}<td class="num total-col">${rowTotal}</td></tr>`;
            }).join('');
            const totalRow = `<tr class="total-row"><th>残り</th>${sizes.map((s) => `<td class="num">${colTotals[s]}</td>`).join('')}<td class="num total-col">${g.total}</td></tr>`;
            return `
            <div class="remaining-design">
                <div class="summary-title">胸ロゴ:${escapeHtml(g.chestLogo)} / バックプリント:${escapeHtml(g.backPrint)}(残り${g.total}枚)</div>
                <div class="table-wrap">
                    <table class="summary">
                        <tr><th>カラー</th>${sizes.map((s) => `<th>${s}</th>`).join('')}<th>計</th></tr>
                        ${rows}${totalRow}
                    </table>
                </div>
            </div>`;
        }).join('');
        $('remaining').innerHTML = `<div class="summary-group remaining-card">${sections}</div>`;
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

    const PREVIEW_ASSET_BASE = 'https://layer-photo-switcher.vercel.app/images';
    const CHEST_PREVIEW_POSITIONS = {
        '有(ロゴ小 白)': 1,
        '有(ロゴ小 カラー)': 2,
        '有(ロゴ大 白)': 3,
        '有(ロゴ大 カラー1)': 4,
        '有(ロゴ大 カラー2)': 5,
    };

    function previewBackPosition(position) {
        return position === 5 ? 1 : position === 6 ? 5 : position;
    }

    function previewFrontExtension(position) {
        return position === 1 || position === 3 ? 'jpg' : 'png';
    }

    function previewSide(color, position, label, lazy = true) {
        const scene = C.COLORS.indexOf(color) + 1;
        const bringOwn = color === C.BRING_OWN;
        if (scene < 1 && !bringOwn) return '';
        const overlay = `${PREVIEW_ASSET_BASE}/front/front-${position}.${previewFrontExtension(position)}`;
        const loading = lazy ? ' loading="lazy"' : '';
        let backgroundHtml;
        if (bringOwn) {
            backgroundHtml = '<div class="bring-own-preview-background" aria-hidden="true"></div>';
        } else {
            const sceneNumber = String(scene).padStart(2, '0');
            const backPosition = previewBackPosition(position);
            const background = `${PREVIEW_ASSET_BASE}/back/set-${sceneNumber}-${backPosition}.jpg`;
            backgroundHtml = `<img class="design-preview-background" src="${background}" alt="${escapeHtml(color)} ${label}"${loading}>`;
        }
        return `
            <div class="design-preview-side">
                <div class="design-preview-side-label">${label}</div>
                <div class="design-preview-stack design-preview-stack-${position}${bringOwn ? ' bring-own-preview-stack' : ''}">
                    ${backgroundHtml}
                    <img class="design-preview-overlay" src="${overlay}" alt=""${loading}>
                </div>
            </div>`;
    }

    function previewSides(color, chestLogo, backPrint, lazy = true) {
        const sides = [];
        const chestPosition = CHEST_PREVIEW_POSITIONS[chestLogo] || null;
        if (chestPosition) sides.push(previewSide(color, chestPosition, '前面', lazy));
        if (backPrint === '有') sides.push(previewSide(color, 6, '背面', lazy));
        return sides;
    }

    function previewDataAttributes(color, chestLogo, backPrint) {
        return `data-preview-color="${escapeHtml(color)}" data-preview-chest="${escapeHtml(chestLogo)}" data-preview-back="${escapeHtml(backPrint)}"`;
    }

    function previewThumbnail(color, chestLogo, backPrint) {
        const sides = previewSides(color, chestLogo, backPrint);
        if (sides.length === 0) return '';
        const sideClass = sides.length === 1 ? ' single-side' : '';
        return `<button type="button" class="image-thumb-button${sideClass}" ${previewDataAttributes(color, chestLogo, backPrint)} aria-label="${escapeHtml(color)}の画像を拡大" title="画像を拡大"><span class="design-preview-sides">${sides.join('')}</span></button>`;
    }

    function previewGallery(images) {
        const available = images.filter(Boolean);
        return available.length ? `<div class="image-thumb-list">${available.join('')}</div>` : '';
    }

    function orderPreviewColors(order) {
        const colors = new Set();
        for (const item of order.items) {
            if (item.size === C.BRING_OWN) {
                if (item.quantities[C.BRING_OWN]) colors.add(C.BRING_OWN);
                continue;
            }
            for (const [color, qty] of Object.entries(item.quantities)) {
                if (qty && C.COLORS.includes(color)) colors.add(color);
            }
        }
        return [...C.COLORS.filter((color) => colors.has(color)), ...(colors.has(C.BRING_OWN) ? [C.BRING_OWN] : [])];
    }

    function orderPreviewGallery(order) {
        return previewGallery(orderPreviewColors(order).map((color) => (
            previewThumbnail(color, order.chestLogo, order.backPrint)
        )));
    }

    function selectedPreviewColors() {
        const selected = new Set();
        $('items-list').querySelectorAll('.item-block').forEach((block) => {
            const size = block.querySelector('.item-sizes .chip.selected')?.dataset.value;
            if (size === C.BRING_OWN) {
                const input = block.querySelector('.item-bring input');
                if (Number(input?.value) > 0) selected.add(C.BRING_OWN);
                return;
            }
            block.querySelectorAll('.item-colors input').forEach((input) => {
                if (Number(input.value) > 0) selected.add(input.dataset.color);
            });
        });
        return [...C.COLORS.filter((color) => selected.has(color)), ...(selected.has(C.BRING_OWN) ? [C.BRING_OWN] : [])];
    }

    function renderDesignPreviews() {
        const box = $('design-previews');
        const colors = selectedPreviewColors();
        if (colors.length === 0) {
            box.innerHTML = '<p class="hint">色の数量を入力すると完成イメージが表示されます。</p>';
            return;
        }

        const chestLogo = selectedChip('chestLogo');
        const backPrint = selectedChip('backPrint');
        if (!chestLogo || !backPrint) {
            box.innerHTML = '<p class="hint">胸ロゴとバックプリントを選択してください。</p>';
            return;
        }

        box.innerHTML = colors.map((color) => {
            const sides = previewSides(color, chestLogo, backPrint, false);
            return `
                <section class="design-preview-card">
                    <div class="design-preview-color">${escapeHtml(color)}</div>
                    ${sides.length
                        ? `<button type="button" class="design-preview-zoom" ${previewDataAttributes(color, chestLogo, backPrint)} aria-label="${escapeHtml(color)}の画像を拡大" title="画像を拡大"><span class="design-preview-sides">${sides.join('')}</span></button>`
                        : '<div class="design-preview-none">プリントなし</div>'}
                </section>`;
        }).join('');
    }

    function buildChips(containerId, values, name) {
        const box = $(containerId);
        box.innerHTML = values.map((v) => `<button type="button" class="chip" data-group="${name}" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
        box.querySelectorAll('.chip').forEach((chip) => {
            chip.addEventListener('click', (event) => {
                const zoomImage = event.target.closest('[data-zoom-design]');
                if (zoomImage) {
                    event.stopPropagation();
                    openDesignViewer(zoomImage.dataset.zoomDesign);
                    return;
                }
                box.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
                chip.classList.add('selected');
                renderDesignPreviews();
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

    function quantityStepper(color) {
        const safeColor = escapeHtml(color);
        return `
            <div class="qty-stepper">
                <button type="button" class="qty-step" data-delta="-1" aria-label="${safeColor}の数量を減らす">−</button>
                <span class="qty-value" aria-live="polite">0</span>
                <input data-color="${safeColor}" type="hidden" value="0">
                <button type="button" class="qty-step" data-delta="1" aria-label="${safeColor}の数量を増やす">＋</button>
            </div>`;
    }

    // サイズ1件分の入力ブロック(サイズ選択+カラー別数量。持ち込みは数量のみ)
    function createItemBlock(item) {
        const div = document.createElement('div');
        div.className = 'item-block';
        div.innerHTML = `
            <div class="item-head">
                <span class="item-title">サイズ</span>
                <button type="button" class="btn btn-small btn-danger item-remove">このサイズを削除</button>
            </div>
            <div class="chip-group item-sizes"></div>
            <div class="color-grid item-colors"></div>
            <div class="color-grid item-bring hidden">
                <div class="color-row">
                    <label>持ち込み数量</label>
                    ${quantityStepper(C.BRING_OWN)}
                </div>
            </div>`;

        // 持ち込みが選ばれたらカラー表を隠して数量入力だけにする
        function updateMode() {
            const selected = div.querySelector('.item-sizes .chip.selected');
            const isBring = !!selected && selected.dataset.value === C.BRING_OWN;
            div.querySelector('.item-colors').classList.toggle('hidden', isBring);
            div.querySelector('.item-bring').classList.toggle('hidden', !isBring);
        }

        const sizeBox = div.querySelector('.item-sizes');
        sizeBox.innerHTML = [...C.SIZES, C.BRING_OWN]
            .map((s) => `<button type="button" class="chip" data-value="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('');
        sizeBox.querySelectorAll('.chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                sizeBox.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
                chip.classList.add('selected');
                updateMode();
                renderDesignPreviews();
            });
        });

        const colorBox = div.querySelector('.item-colors');
        colorBox.innerHTML = C.COLORS.map((color) => `
            <div class="color-row">
                <label>${escapeHtml(color)}</label>
                ${quantityStepper(color)}
            </div>`).join('');
        div.querySelectorAll('.qty-step').forEach((button) => {
            button.addEventListener('click', () => {
                const stepper = button.closest('.qty-stepper');
                const input = stepper.querySelector('input[data-color]');
                const current = Number(input.value) || 0;
                const next = Math.max(0, Math.min(C.MAX_QTY, current + Number(button.dataset.delta)));
                input.value = String(next);
                stepper.querySelector('.qty-value').textContent = String(next);
                input.closest('.color-row').classList.toggle('has-qty', next > 0);
                renderDesignPreviews();
            });
        });

        div.querySelector('.item-remove').addEventListener('click', () => {
            div.remove();
            updateItemRemoveButtons();
            renderDesignPreviews();
        });

        if (item) {
            sizeBox.querySelectorAll('.chip').forEach((c) => c.classList.toggle('selected', c.dataset.value === item.size));
            const inputs = item.size === C.BRING_OWN
                ? div.querySelectorAll('.item-bring input')
                : div.querySelectorAll('.item-colors input');
            inputs.forEach((input) => {
                const qty = item.quantities[input.dataset.color] || 0;
                input.value = String(qty);
                input.closest('.qty-stepper').querySelector('.qty-value').textContent = String(qty);
                input.closest('.color-row').classList.toggle('has-qty', qty > 0);
            });
            updateMode();
        }
        return div;
    }

    function addItemBlock(item) {
        if ($('items-list').children.length >= C.MAX_ITEMS) return;
        $('items-list').appendChild(createItemBlock(item));
        updateItemRemoveButtons();
        renderDesignPreviews();
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
        renderDesignPreviews();
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
            const size = sizeChip ? sizeChip.dataset.value : null;
            const quantities = {};
            const inputs = size === C.BRING_OWN
                ? block.querySelectorAll('.item-bring input')
                : block.querySelectorAll('.item-colors input');
            inputs.forEach((input) => {
                const n = Number(input.value);
                if (n > 0) quantities[input.dataset.color] = n;
            });
            items.push({ size, quantities });
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
                return showFormError(items[i].size === C.BRING_OWN
                    ? '持ち込みの数量を入力してください'
                    : `サイズ${items[i].size}の数量を1色以上入力してください`);
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

    function openPricingModal() {
        const p = state.pricing || { sizePrices: {}, bringOwnPrice: 0 };
        $('size-price-grid').innerHTML = C.SIZES.map((s) => `
            <div class="price-row">
                <label>${s}</label>
                <input data-size="${s}" class="input" type="number" inputmode="decimal" min="0" placeholder="0" value="${p.sizePrices[s] || ''}">
            </div>`).join('');
        $('bring-own-price').value = p.bringOwnPrice || '';
        renderDesignImageRows();
        $('pricing-error').classList.add('hidden');
        $('pricing-modal').classList.remove('hidden');
        $('pricing-modal').querySelector('.modal-card').scrollTop = 0;
    }

    async function savePricing() {
        const body = { sizePrices: {} };
        $('size-price-grid').querySelectorAll('input').forEach((input) => {
            body.sizePrices[input.dataset.size] = Number(input.value) || 0;
        });
        body.bringOwnPrice = Number($('bring-own-price').value) || 0;

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

    // ---------- デザインのサンプル画像(管理者) ----------

    function renderDesignImageRows() {
        const box = $('design-images');
        box.innerHTML = C.DESIGN_IMAGE_KEYS.map((key) => {
            const img = state.designImages[key];
            return `
            <div class="design-row" data-key="${escapeHtml(key)}">
                ${img ? `<img class="design-thumb" src="${img}" alt="${escapeHtml(key)}" data-zoom-design="${escapeHtml(key)}" title="画像を拡大">` : '<span class="design-thumb empty">なし</span>'}
                <span class="design-label">${escapeHtml(key)}</span>
                <button type="button" class="btn btn-small design-pick">画像を選択</button>
                ${img ? '<button type="button" class="btn btn-small btn-danger design-clear">削除</button>' : ''}
                <input type="file" accept="image/*" class="design-file hidden">
            </div>`;
        }).join('');

        box.querySelectorAll('.design-row').forEach((row) => {
            const key = row.dataset.key;
            const fileInput = row.querySelector('.design-file');
            row.querySelector('.design-pick').addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async () => {
                const file = fileInput.files[0];
                if (!file) return;
                try {
                    const dataUrl = await resizeImage(file, 256);
                    await saveDesignImage(key, dataUrl);
                } catch (err) {
                    showPopup(err.message || '画像の読み込みに失敗しました');
                }
            });
            const clearBtn = row.querySelector('.design-clear');
            if (clearBtn) clearBtn.addEventListener('click', () => saveDesignImage(key, null));
        });
    }

    async function saveDesignImage(key, image) {
        try {
            const data = await api('/api/designs', { method: 'PUT', body: JSON.stringify({ key, image }) });
            state.designImages = data.images;
            renderDesignImageRows();
            refreshChipImages();
        } catch (err) {
            showPopup(err.message);
        }
    }

    // アップロード画像を最大 maxSize px に縮小して JPEG の dataURL に変換
    function resizeImage(file, maxSize) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('画像を読み込めませんでした'));
            };
            img.src = url;
        });
    }

    // ---------- CSV出力(日本語/タイ語) ----------

    function tr(text, lang) {
        return lang === 'th' ? (C.TH[text] || text) : text;
    }

    // 明細CSV(1行 = 注文×サイズ×カラー)。Excelで開けるようBOM付きUTF-8
    function downloadCsv(lang) {
        if (state.orders.length === 0) return showPopup('注文がまだありません');
        const pm = state.priceModel;
        const header = ['名前', '胸ロゴ', 'バックプリント', 'サイズ', 'カラー', '数量', '単価', '金額', '支払い', '受け渡し', '確認者', '備考', '入力者', '更新日時']
            .map((h) => tr(h, lang));
        const rows = [header];
        for (const o of state.orders) {
            o.items.forEach((item, idx) => {
                for (const color of itemKeys(item)) {
                    const qty = item.quantities[color];
                    if (!qty) continue;
                    const unit = pm.unit(o.chestLogo, o.backPrint, item.size);
                    const check = o.delivered[`${idx}:${color}`];
                    rows.push([
                        o.orderName,
                        tr(o.chestLogo, lang),
                        tr(o.backPrint, lang),
                        tr(item.size, lang),
                        item.size === C.BRING_OWN ? '-' : tr(color, lang),
                        qty,
                        Math.round(unit * 100) / 100,
                        Math.round(unit * qty * 100) / 100,
                        tr(o.paid ? '済' : '未', lang),
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
            if (event.type === 'designs') {
                await loadDesigns();
                refreshChipImages();
                if (!$('pricing-modal').classList.contains('hidden')) renderDesignImageRows();
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

    // ---------- 画像拡大ビューア ----------

    let imageViewerReturnFocus = null;

    function openImageViewer(title, content) {
        imageViewerReturnFocus = document.activeElement;
        $('image-viewer-title').textContent = title;
        $('image-viewer-content').innerHTML = content;
        $('image-viewer').classList.remove('hidden');
        document.body.classList.add('image-viewer-open');
        $('image-viewer-close').focus();
    }

    function openPreviewViewer(color, chestLogo, backPrint) {
        const sides = previewSides(color, chestLogo, backPrint, false);
        if (sides.length === 0) return;
        openImageViewer(
            `${color} / 胸ロゴ:${chestLogo} / バックプリント:${backPrint}`,
            `<div class="design-preview-sides">${sides.join('')}</div>`,
        );
    }

    function openDesignViewer(key) {
        const image = state.designImages[key];
        if (!image) return;
        openImageViewer(key, `<img class="image-viewer-raw" src="${image}" alt="${escapeHtml(key)}">`);
    }

    function closeImageViewer() {
        if ($('image-viewer').classList.contains('hidden')) return;
        $('image-viewer').classList.add('hidden');
        $('image-viewer-content').innerHTML = '';
        document.body.classList.remove('image-viewer-open');
        if (imageViewerReturnFocus && typeof imageViewerReturnFocus.focus === 'function') {
            imageViewerReturnFocus.focus();
        }
        imageViewerReturnFocus = null;
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

    document.addEventListener('click', (event) => {
        const preview = event.target.closest('[data-preview-color]');
        if (preview) {
            event.preventDefault();
            event.stopPropagation();
            openPreviewViewer(preview.dataset.previewColor, preview.dataset.previewChest, preview.dataset.previewBack);
            return;
        }
        const design = event.target.closest('[data-zoom-design]');
        if (design) {
            event.preventDefault();
            event.stopPropagation();
            openDesignViewer(design.dataset.zoomDesign);
        }
    });
    $('image-viewer-close').addEventListener('click', closeImageViewer);
    $('image-viewer').addEventListener('click', (event) => {
        if (event.target === $('image-viewer')) closeImageViewer();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeImageViewer();
    });

    // ページを閉じる時にロックを解放
    window.addEventListener('pagehide', () => {
        if (state.lockHeartbeat && state.token) {
            stopHeartbeat();
            fetch(`/api/lock?token=${encodeURIComponent(state.token)}`, { method: 'DELETE', keepalive: true }).catch(() => {});
        }
    });

    init();
})();
