/* 家計簿アプリ フロントエンド(SCB Connect通知連携) */
(function () {
    'use strict';

    const C = window.KAKEIBO_CONSTANTS;
    const TOKEN_KEY = 'kakeibo.token';
    const TZ_MINUTES = 7 * 60; // タイ時間(通知の日時はこの時間帯で表示する)

    const state = {
        config: null,
        token: null,
        settings: null,
        categories: { income: [], expense: [] },
        month: '',
        transactions: [],
        summary: null,
        gaps: [],
        previews: [],
        cash: { type: 'expense', category: '' },
        editingId: null,
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

    // ---------- 表示ヘルパー ----------

    function escapeHtml(s) {
        return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (ch) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
        ));
    }

    function fmtMoney(n) {
        return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function catLabel(name) {
        const ja = C.CATEGORY_LABELS_JA[name];
        return ja && ja !== name ? `${ja}` : name;
    }

    // ISO文字列 → タイ時間の Date 相当(表示・入力欄用)
    function shifted(iso) {
        const d = new Date(iso);
        return new Date(d.getTime() + TZ_MINUTES * 60 * 1000);
    }

    function toDateInput(iso) {
        return shifted(iso).toISOString().slice(0, 16);
    }

    function fmtDate(iso) {
        const d = shifted(iso);
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${days[d.getUTCDay()]})`;
    }

    function fmtTime(iso) {
        const d = shifted(iso);
        return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    }

    function dayKey(iso) {
        return shifted(iso).toISOString().slice(0, 10);
    }

    function currentMonth() {
        return shifted(new Date().toISOString()).toISOString().slice(0, 7);
    }

    function shiftMonth(month, delta) {
        const [y, m] = month.split('-').map(Number);
        const d = new Date(Date.UTC(y, m - 1 + delta, 1));
        return d.toISOString().slice(0, 7);
    }

    let toastTimer = null;
    function toast(message) {
        $('toast').textContent = message;
        $('toast').classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 2600);
    }

    function showScreen(id) {
        ['screen-loading', 'screen-login', 'screen-error', 'screen-main']
            .forEach((s) => $(s).classList.toggle('hidden', s !== id));
    }

    function showError(message) {
        $('error-message').textContent = message;
        showScreen('screen-error');
    }

    // ---------- 起動・ログイン ----------

    async function init() {
        try {
            state.config = await api('/api/config');
        } catch {
            return showError('サーバーに接続できませんでした。');
        }
        document.title = state.config.title;
        $('app-title').textContent = state.config.title;
        $('login-title').textContent = state.config.title;

        const saved = localStorage.getItem(TOKEN_KEY);
        if (saved) {
            state.token = saved;
            try {
                await loadAll();
                return enterMain();
            } catch {
                state.token = null;
                localStorage.removeItem(TOKEN_KEY);
            }
        }
        if (!state.config.passcodeRequired && state.config.devMode) {
            return login(); // 開発モード(合言葉なし)
        }
        showScreen('screen-login');
        $('login-passcode').focus();
    }

    async function login() {
        const passcode = $('login-passcode').value;
        $('login-error').classList.add('hidden');
        $('login-btn').disabled = true;
        try {
            const data = await api('/api/auth', { method: 'POST', body: JSON.stringify({ passcode }) });
            state.token = data.token;
            localStorage.setItem(TOKEN_KEY, data.token);
            await loadAll();
            enterMain();
        } catch (err) {
            $('login-error').textContent = err.message;
            $('login-error').classList.remove('hidden');
        } finally {
            $('login-btn').disabled = false;
        }
    }

    function enterMain() {
        showScreen('screen-main');
        renderAll();
        openStream();
    }

    // ---------- データ取得 ----------

    async function loadAll() {
        if (!state.month) state.month = currentMonth();
        const [settings, txs, summary] = await Promise.all([
            api('/api/settings'),
            api(`/api/transactions?month=${state.month}`),
            api(`/api/summary?month=${state.month}`),
        ]);
        state.settings = settings.settings;
        state.categories = settings.categories;
        state.transactions = txs.transactions;
        state.summary = summary.summary;
        state.gaps = summary.gaps;
        state.bankBalance = summary.bankBalance;
    }

    async function refresh() {
        try {
            await loadAll();
            renderAll();
        } catch (err) {
            if (err.status === 401) return relogin();
            toast(err.message);
        }
    }

    function relogin() {
        state.token = null;
        localStorage.removeItem(TOKEN_KEY);
        location.reload();
    }

    // ---------- 描画 ----------

    function renderAll() {
        renderBalance();
        renderCashCategories();
        renderGaps();
        renderHistory();
        renderSummary();
        renderPreviews();
        $('month-label').textContent = state.month;
        $('s-month-label').textContent = state.month;
    }

    function renderBalance() {
        const b = state.bankBalance;
        $('balance-value').textContent = b ? `${fmtMoney(b.balance)} ${C.CURRENCY}` : '—';
        $('balance-at').textContent = b ? `${fmtDate(b.at)} ${fmtTime(b.at)} 時点` : '通知の取り込みで表示されます';
    }

    function renderCashCategories() {
        const type = state.cash.type;
        const all = state.categories[type] || [];
        const quick = type === 'expense'
            ? C.QUICK_EXPENSE_CATEGORIES.filter((c) => all.includes(c))
            : all.filter((c) => c !== C.ADJUST_CATEGORY);
        if (!quick.includes(state.cash.category)) state.cash.category = '';

        $('cash-categories').innerHTML = quick.map((c) => `
            <button type="button" class="cat-btn ${c === state.cash.category ? 'active' : ''}" data-cat="${escapeHtml(c)}">
                ${escapeHtml(catLabel(c))}<small>${escapeHtml(c)}</small>
            </button>
        `).join('');

        const select = $('cash-category-select');
        select.innerHTML = `<option value="">選択してください</option>${
            all.map((c) => `<option value="${escapeHtml(c)}" ${c === state.cash.category ? 'selected' : ''}>${escapeHtml(catLabel(c))} (${escapeHtml(c)})</option>`).join('')}`;
    }

    // 差額は新しいものから数件だけ出す(取り込んでいない期間が長いと大量に出るため)
    const MAX_GAPS_SHOWN = 5;

    function renderGaps() {
        const gaps = (state.gaps || []).slice().reverse();
        $('gap-card').classList.toggle('hidden', gaps.length === 0);
        const shown = gaps.slice(0, MAX_GAPS_SHOWN);
        $('gap-list').innerHTML = shown.map((g) => `
            <div class="gap-item">
                <div>${fmtDate(g.from)} ${fmtTime(g.from)} 〜 ${fmtDate(g.to)} ${fmtTime(g.to)} の間で
                    <strong>${g.missingType === 'income' ? '入金' : '出金'} ${fmtMoney(g.missingAmount)}</strong> が未記録です</div>
                <button class="btn block" data-gap="${g.beforeId}" style="margin-top:8px">この差額を Adjust で記録する</button>
            </div>
        `).join('') + (gaps.length > shown.length
            ? `<p class="muted small">ほかに${gaps.length - shown.length}件の差額があります。通知を取り込むと解消されます。</p>`
            : '');
    }

    function renderHistory() {
        const list = state.transactions.slice().reverse();
        if (list.length === 0) {
            $('history-list').innerHTML = '<div class="empty">この月の記録はまだありません</div>';
            return;
        }
        const byDay = new Map();
        for (const t of list) {
            const key = dayKey(t.occurredAt);
            if (!byDay.has(key)) byDay.set(key, []);
            byDay.get(key).push(t);
        }
        let html = '';
        for (const [key, items] of byDay) {
            const total = items.reduce((sum, t) => sum + (t.type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);
            html += `<div class="day-head"><span>${fmtDate(`${key}T00:00:00Z`)}</span><span>${total >= 0 ? '+' : ''}${fmtMoney(total)}</span></div>`;
            html += items.map((t) => {
                const sub = [fmtTime(t.occurredAt), t.counterparty || '', t.counterpartyBank || '', t.memo || '',
                    C.SOURCE_LABELS_JA[t.source] || '']
                    .filter(Boolean).join(' · ');
                return `
                    <button class="tx" data-id="${t.id}">
                        <span class="tx-main">
                            <span class="tx-cat">${escapeHtml(catLabel(t.category))}</span>
                            <span class="tx-sub">${escapeHtml(sub)}</span>
                        </span>
                        <span class="tx-amount ${t.type === 'income' ? 'in' : 'out'}">
                            ${t.type === 'income' ? '+' : '-'}${fmtMoney(t.amount)}
                        </span>
                    </button>`;
            }).join('');
        }
        $('history-list').innerHTML = html;
    }

    function renderSummary() {
        const s = state.summary;
        if (!s) return;
        $('total-income').textContent = fmtMoney(s.income);
        $('total-expense').textContent = fmtMoney(s.expense);
        $('total-net').textContent = fmtMoney(s.net);

        const rows = [];
        for (const type of ['expense', 'income']) {
            const entries = Object.entries(s.byCategory[type] || {}).sort((a, b) => b[1] - a[1]);
            const max = entries.length ? entries[0][1] : 0;
            for (const [cat, amount] of entries) {
                rows.push(`
                    <div class="bar-row ${type === 'income' ? 'in' : ''}">
                        <div class="bar-head">
                            <span>${escapeHtml(catLabel(cat))}${type === 'income' ? '(収入)' : ''}</span>
                            <span>${fmtMoney(amount)}</span>
                        </div>
                        <div class="bar"><div style="width:${max ? Math.max(2, (amount / max) * 100) : 0}%"></div></div>
                    </div>`);
            }
        }
        $('category-breakdown').innerHTML = rows.join('') || '<p class="muted small">この月の記録はまだありません</p>';
    }

    // ---------- 現金クイック入力 ----------

    async function submitCash() {
        const amount = Number($('cash-amount').value);
        const category = state.cash.category || $('cash-category-select').value;
        const status = $('cash-status');
        status.classList.add('hidden');

        if (!amount || amount <= 0) return showCashError('金額を入力してください');
        if (!category) return showCashError('カテゴリを選んでください');

        const dateValue = $('cash-date').value;
        const body = {
            occurredAt: dateValue || new Date(Date.now() + TZ_MINUTES * 60 * 1000).toISOString().slice(0, 16),
            type: state.cash.type,
            amount,
            category,
            source: 'cash',
            memo: $('cash-memo').value,
        };
        $('cash-submit').disabled = true;
        try {
            await api('/api/transactions', { method: 'POST', body: JSON.stringify(body) });
            $('cash-amount').value = '';
            $('cash-memo').value = '';
            $('cash-date').value = '';
            state.cash.category = '';
            toast('登録しました');
            await refresh();
        } catch (err) {
            if (err.status === 401) return relogin();
            showCashError(err.message);
        } finally {
            $('cash-submit').disabled = false;
        }
    }

    function showCashError(message) {
        const status = $('cash-status');
        status.textContent = message;
        status.className = 'status error';
    }

    // ---------- 通知の取り込み ----------

    // スクショはそのままだと大きいので、送る前に縮小する
    function resizeImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, 900 / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('画像を読み込めませんでした'));
            };
            img.src = url;
        });
    }

    async function importImages(files) {
        const list = Array.from(files).slice(0, C.MAX_IMAGES_PER_REQUEST);
        if (list.length === 0) return;
        setImportStatus(`${list.length}枚を解析しています…`);
        try {
            const images = await Promise.all(list.map(resizeImage));
            const data = await api('/api/import/images', { method: 'POST', body: JSON.stringify({ images }) });
            addPreviews(data.results);
        } catch (err) {
            if (err.status === 401) return relogin();
            setImportStatus(err.message, true);
        }
    }

    async function importText() {
        const text = $('import-text').value;
        if (!text.trim()) return setImportStatus('通知のテキストを貼り付けてください', true);
        setImportStatus('解析しています…');
        try {
            const data = await api('/api/import/text', { method: 'POST', body: JSON.stringify({ text }) });
            addPreviews(data.results);
            $('import-text').value = '';
        } catch (err) {
            if (err.status === 401) return relogin();
            setImportStatus(err.message, true);
        }
    }

    function setImportStatus(message, isError) {
        const el = $('import-status');
        el.textContent = message;
        el.className = `status${isError ? ' error' : ''}`;
        el.classList.toggle('hidden', !message);
    }

    let previewSeq = 0;
    function addPreviews(results) {
        const ok = results.filter((r) => r.ok).length;
        const ng = results.length - ok;
        for (const r of results) {
            state.previews.push({ key: `p${++previewSeq}`, ...r });
        }
        setImportStatus(`読み取り: 成功${ok}件${ng ? ` / 失敗${ng}件` : ''}。内容を確認して登録してください。`);
        renderPreviews();
    }

    function renderPreviews() {
        const html = state.previews.map((p) => {
            if (!p.ok) {
                return `<div class="preview bad">
                    <div class="preview-head"><strong>読み取れませんでした</strong></div>
                    <div class="preview-meta">${escapeHtml(p.error || '')}</div>
                    <div class="preview-actions"><button class="btn" data-skip="${p.key}">閉じる</button></div>
                </div>`;
            }
            const d = p.draft;
            const cats = state.categories[d.type] || [];
            const counterparty = [d.counterparty, d.counterpartyAccount, d.counterpartyBank].filter(Boolean).join(' ');
            return `<div class="preview">
                <div class="preview-head">
                    <span class="preview-amount ${d.type === 'income' ? 'in' : 'out'}">
                        ${d.type === 'income' ? '+' : '-'}${fmtMoney(d.amount)}
                    </span>
                    <span class="muted small">${fmtDate(d.occurredAt)} ${fmtTime(d.occurredAt)}</span>
                </div>
                <div class="preview-meta">相手: ${escapeHtml(counterparty || '(不明)')}${
                    d.balanceAfter !== null && d.balanceAfter !== undefined ? ` / 残高 ${fmtMoney(d.balanceAfter)}` : ''}</div>
                ${(p.warnings || []).map((w) => `<div class="preview-warn">⚠ ${escapeHtml(w)}</div>`).join('')}
                ${p.duplicate ? '<div class="preview-warn">⚠ 同じ内容の取引がすでに登録されています</div>' : ''}
                <label class="field">
                    <span>カテゴリ</span>
                    <select data-cat-for="${p.key}">
                        <option value="">選択してください</option>
                        ${cats.map((c) => `<option value="${escapeHtml(c)}" ${c === d.category ? 'selected' : ''}>${escapeHtml(catLabel(c))} (${escapeHtml(c)})</option>`).join('')}
                    </select>
                </label>
                <div class="preview-actions">
                    <button class="btn" data-skip="${p.key}">スキップ</button>
                    <button class="btn primary" data-register="${p.key}">${p.duplicate ? '重複を承知で登録' : '登録'}</button>
                </div>
            </div>`;
        }).join('');
        $('preview-list').innerHTML = html;
    }

    async function registerPreview(key) {
        const p = state.previews.find((x) => x.key === key);
        if (!p || !p.ok) return;
        const select = document.querySelector(`[data-cat-for="${key}"]`);
        const category = select ? select.value : '';
        if (!category) return toast('カテゴリを選んでください');
        try {
            await api('/api/transactions', {
                method: 'POST',
                body: JSON.stringify({ ...p.draft, category, force: !!p.duplicate }),
            });
            state.previews = state.previews.filter((x) => x.key !== key);
            toast('登録しました');
            await refresh();
        } catch (err) {
            if (err.status === 401) return relogin();
            if (err.status === 409) {
                p.duplicate = err.data && err.data.existing;
                renderPreviews();
                return toast('同じ取引がすでにあります。登録するにはもう一度押してください。');
            }
            toast(err.message);
        }
    }

    // ---------- 編集 ----------

    function openEdit(id) {
        const t = state.transactions.find((x) => x.id === id);
        if (!t) return;
        state.editingId = id;
        $('edit-date').value = toDateInput(t.occurredAt);
        $('edit-type').value = t.type;
        $('edit-amount').value = t.amount;
        $('edit-counterparty').value = t.counterparty || '';
        $('edit-memo').value = t.memo || '';
        renderEditCategories(t.type, t.category);
        $('edit-error').classList.add('hidden');
        $('edit-modal').classList.remove('hidden');
    }

    function renderEditCategories(type, selected) {
        const cats = state.categories[type] || [];
        $('edit-category').innerHTML = cats.map((c) => (
            `<option value="${escapeHtml(c)}" ${c === selected ? 'selected' : ''}>${escapeHtml(catLabel(c))} (${escapeHtml(c)})</option>`
        )).join('');
    }

    async function saveEdit() {
        const t = state.transactions.find((x) => x.id === state.editingId);
        if (!t) return;
        const body = {
            occurredAt: $('edit-date').value,
            type: $('edit-type').value,
            amount: Number($('edit-amount').value),
            category: $('edit-category').value,
            counterparty: $('edit-counterparty').value,
            counterpartyAccount: t.counterpartyAccount,
            counterpartyBank: t.counterpartyBank,
            balanceAfter: t.balanceAfter,
            memo: $('edit-memo').value,
        };
        try {
            await api(`/api/transactions/${t.id}`, { method: 'PUT', body: JSON.stringify(body) });
            $('edit-modal').classList.add('hidden');
            toast('保存しました');
            await refresh();
        } catch (err) {
            if (err.status === 401) return relogin();
            $('edit-error').textContent = err.message;
            $('edit-error').classList.remove('hidden');
        }
    }

    async function deleteEdit() {
        if (!state.editingId) return;
        if (!confirm('この取引を削除しますか?')) return;
        try {
            await api(`/api/transactions/${state.editingId}`, { method: 'DELETE' });
            $('edit-modal').classList.add('hidden');
            toast('削除しました');
            await refresh();
        } catch (err) {
            if (err.status === 401) return relogin();
            toast(err.message);
        }
    }

    // ---------- 設定 ----------

    function openSettings() {
        $('settings-accounts').value = (state.settings.myAccounts || []).join(', ');
        $('settings-error').classList.add('hidden');
        $('settings-modal').classList.remove('hidden');
    }

    async function saveSettings() {
        const accounts = $('settings-accounts').value.split(',').map((s) => s.trim()).filter(Boolean);
        try {
            const data = await api('/api/settings', {
                method: 'PUT',
                body: JSON.stringify({ myAccounts: accounts }),
            });
            state.settings = data.settings;
            state.categories = data.categories;
            $('settings-modal').classList.add('hidden');
            toast('保存しました');
        } catch (err) {
            if (err.status === 401) return relogin();
            $('settings-error').textContent = err.message;
            $('settings-error').classList.remove('hidden');
        }
    }

    // ---------- CSV(スプレッドシート互換の 日付×カテゴリ 形式) ----------

    function downloadCsv() {
        const income = state.categories.income;
        const expense = state.categories.expense;
        const header = ['Date', 'Day', ...income.map((c) => `In:${c}`), ...expense.map((c) => `Out:${c}`),
            'Balance', 'Counterparty', 'Remark'];
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const rows = state.transactions.map((t) => {
            const d = shifted(t.occurredAt);
            const row = new Array(header.length).fill('');
            row[0] = d.toISOString().slice(0, 10);
            row[1] = days[d.getUTCDay()];
            const offset = t.type === 'income' ? 2 : 2 + income.length;
            const list = t.type === 'income' ? income : expense;
            const idx = list.indexOf(t.category);
            if (idx >= 0) row[offset + idx] = Number(t.amount).toFixed(2);
            row[header.length - 3] = t.balanceAfter === null || t.balanceAfter === undefined ? '' : Number(t.balanceAfter).toFixed(2);
            row[header.length - 2] = [t.counterparty, t.counterpartyAccount, t.counterpartyBank].filter(Boolean).join(' ');
            row[header.length - 1] = t.memo || '';
            return row;
        });
        const csv = [header, ...rows]
            .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\r\n');
        const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `kakeibo-${state.month}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // ---------- SSE ----------

    function openStream() {
        if (state.stream) state.stream.close();
        state.stream = new EventSource(`/api/stream?token=${encodeURIComponent(state.token)}`);
        state.stream.onmessage = (e) => {
            let event;
            try { event = JSON.parse(e.data); } catch { return; }
            if (event.type === 'transactions' || event.type === 'settings') refresh();
        };
    }

    // ---------- イベント ----------

    function switchView(view) {
        ['input', 'history', 'summary'].forEach((v) => {
            $(`view-${v}`).classList.toggle('hidden', v !== view);
        });
        document.querySelectorAll('.tab').forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.view === view);
        });
    }

    async function changeMonth(delta) {
        state.month = shiftMonth(state.month, delta);
        await refresh();
    }

    function bindEvents() {
        $('login-btn').addEventListener('click', login);
        $('login-passcode').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

        document.querySelectorAll('.tab').forEach((tab) => {
            tab.addEventListener('click', () => switchView(tab.dataset.view));
        });

        document.querySelectorAll('[data-cash-type]').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.cash.type = btn.dataset.cashType;
                document.querySelectorAll('[data-cash-type]').forEach((b) => b.classList.toggle('active', b === btn));
                renderCashCategories();
            });
        });

        $('cash-categories').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-cat]');
            if (!btn) return;
            state.cash.category = btn.dataset.cat === state.cash.category ? '' : btn.dataset.cat;
            renderCashCategories();
        });
        $('cash-category-select').addEventListener('change', (e) => {
            state.cash.category = e.target.value;
            renderCashCategories();
        });
        $('cash-submit').addEventListener('click', submitCash);

        $('import-file').addEventListener('change', (e) => {
            importImages(e.target.files);
            e.target.value = '';
        });
        $('import-text-btn').addEventListener('click', importText);

        $('preview-list').addEventListener('click', (e) => {
            const register = e.target.closest('[data-register]');
            if (register) return registerPreview(register.dataset.register);
            const skip = e.target.closest('[data-skip]');
            if (skip) {
                state.previews = state.previews.filter((p) => p.key !== skip.dataset.skip);
                renderPreviews();
            }
        });

        $('gap-list').addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-gap]');
            if (!btn) return;
            btn.disabled = true;
            try {
                await api('/api/transactions/adjust', {
                    method: 'POST',
                    body: JSON.stringify({ beforeId: Number(btn.dataset.gap) }),
                });
                toast('Adjust を登録しました');
                await refresh();
            } catch (err) {
                if (err.status === 401) return relogin();
                toast(err.message);
                btn.disabled = false;
            }
        });

        $('history-list').addEventListener('click', (e) => {
            const row = e.target.closest('[data-id]');
            if (row) openEdit(Number(row.dataset.id));
        });

        $('month-prev').addEventListener('click', () => changeMonth(-1));
        $('month-next').addEventListener('click', () => changeMonth(1));
        $('s-month-prev').addEventListener('click', () => changeMonth(-1));
        $('s-month-next').addEventListener('click', () => changeMonth(1));

        $('edit-type').addEventListener('change', (e) => renderEditCategories(e.target.value, ''));
        $('edit-save').addEventListener('click', saveEdit);
        $('edit-delete').addEventListener('click', deleteEdit);
        $('edit-cancel').addEventListener('click', () => $('edit-modal').classList.add('hidden'));

        $('settings-btn').addEventListener('click', openSettings);
        $('settings-save').addEventListener('click', saveSettings);
        $('settings-cancel').addEventListener('click', () => $('settings-modal').classList.add('hidden'));

        $('csv-btn').addEventListener('click', downloadCsv);
    }

    bindEvents();
    init();
}());
