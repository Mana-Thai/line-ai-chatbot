// 取引データ・設定の保存層。DATABASE_URL があれば PostgreSQL(Supabase等)、
// なければローカルJSONファイル(開発用。Renderでは再デプロイで消えるため本番はDB必須)
const fs = require('fs');
const path = require('path');

// 保存済みデータの形が変わったときはここに起動時マイグレーションを足す
// (PgStore・FileStore の両方に入れること)
function migrateRow(t) {
    let changed = false;
    if (t.counterpartyBank === undefined) {
        t.counterpartyBank = '';
        changed = true;
    }
    if (t.balanceAfter === undefined) {
        t.balanceAfter = null;
        changed = true;
    }
    return changed;
}

function num(value) {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

class PgStore {
    constructor(connectionString) {
        const { Pool } = require('pg');
        this.pool = new Pool({
            connectionString,
            ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
        });
    }

    async init() {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                occurred_at TIMESTAMPTZ NOT NULL,
                type TEXT NOT NULL,
                amount NUMERIC(14,2) NOT NULL,
                category TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT 'cash',
                counterparty TEXT NOT NULL DEFAULT '',
                counterparty_account TEXT NOT NULL DEFAULT '',
                counterparty_bank TEXT NOT NULL DEFAULT '',
                balance_after NUMERIC(14,2),
                memo TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `);
        // 旧バージョンで作成済みのテーブルの移行
        await this.pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS counterparty_bank TEXT NOT NULL DEFAULT ''");
        await this.pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS balance_after NUMERIC(14,2)');
        await this.pool.query('CREATE INDEX IF NOT EXISTS transactions_occurred_at_idx ON transactions (occurred_at)');
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `);
        console.log('[Store] PostgreSQL ready');
    }

    _row(r) {
        return {
            id: r.id,
            occurredAt: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : r.occurred_at,
            type: r.type,
            amount: num(r.amount),
            category: r.category,
            source: r.source,
            counterparty: r.counterparty,
            counterpartyAccount: r.counterparty_account,
            counterpartyBank: r.counterparty_bank,
            balanceAfter: num(r.balance_after),
            memo: r.memo,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }

    async list({ from, to } = {}) {
        const where = [];
        const params = [];
        if (from) {
            params.push(from);
            where.push(`occurred_at >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            where.push(`occurred_at < $${params.length}`);
        }
        const sql = `SELECT * FROM transactions${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY occurred_at, id`;
        const { rows } = await this.pool.query(sql, params);
        return rows.map((r) => this._row(r));
    }

    async get(id) {
        const { rows } = await this.pool.query('SELECT * FROM transactions WHERE id = $1', [id]);
        return rows[0] ? this._row(rows[0]) : null;
    }

    async create(t) {
        const { rows } = await this.pool.query(
            `INSERT INTO transactions
                (occurred_at, type, amount, category, source, counterparty, counterparty_account,
                 counterparty_bank, balance_after, memo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [t.occurredAt, t.type, t.amount, t.category, t.source, t.counterparty,
                t.counterpartyAccount, t.counterpartyBank, t.balanceAfter, t.memo],
        );
        return this._row(rows[0]);
    }

    async update(id, t) {
        const { rows } = await this.pool.query(
            `UPDATE transactions SET occurred_at = $1, type = $2, amount = $3, category = $4,
                counterparty = $5, counterparty_account = $6, counterparty_bank = $7,
                balance_after = $8, memo = $9, updated_at = now()
             WHERE id = $10 RETURNING *`,
            [t.occurredAt, t.type, t.amount, t.category, t.counterparty, t.counterpartyAccount,
                t.counterpartyBank, t.balanceAfter, t.memo, id],
        );
        return rows[0] ? this._row(rows[0]) : null;
    }

    async remove(id) {
        await this.pool.query('DELETE FROM transactions WHERE id = $1', [id]);
    }

    async getSetting(key) {
        const { rows } = await this.pool.query('SELECT value FROM settings WHERE key = $1', [key]);
        return rows[0] ? rows[0].value : null;
    }

    async setSetting(key, value) {
        await this.pool.query(
            `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
            [key, JSON.stringify(value)],
        );
    }
}

class FileStore {
    constructor(file) {
        this.file = file;
        this.data = { seq: 0, transactions: [], settings: {} };
    }

    async init() {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        if (fs.existsSync(this.file)) {
            this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        }
        let changed = false;
        if (!this.data.settings) {
            this.data.settings = {};
            changed = true;
        }
        if (!Array.isArray(this.data.transactions)) {
            this.data.transactions = [];
            changed = true;
        }
        for (const t of this.data.transactions) {
            if (migrateRow(t)) changed = true;
        }
        if (changed) this._save();
        console.warn('[Store] Using local file storage (development only):', this.file);
    }

    _save() {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
        fs.renameSync(tmp, this.file);
    }

    _sorted() {
        return this.data.transactions.slice().sort((a, b) => (
            a.occurredAt === b.occurredAt ? a.id - b.id : (a.occurredAt < b.occurredAt ? -1 : 1)
        ));
    }

    async list({ from, to } = {}) {
        return this._sorted().filter((t) => (
            (!from || t.occurredAt >= from) && (!to || t.occurredAt < to)
        ));
    }

    async get(id) {
        return this.data.transactions.find((t) => t.id === id) || null;
    }

    async create(t) {
        const now = new Date().toISOString();
        const row = { id: ++this.data.seq, ...t, createdAt: now, updatedAt: now };
        this.data.transactions.push(row);
        this._save();
        return row;
    }

    async update(id, t) {
        const row = await this.get(id);
        if (!row) return null;
        Object.assign(row, t, { updatedAt: new Date().toISOString() });
        this._save();
        return row;
    }

    async remove(id) {
        this.data.transactions = this.data.transactions.filter((t) => t.id !== id);
        this._save();
    }

    async getSetting(key) {
        return this.data.settings[key] || null;
    }

    async setSetting(key, value) {
        this.data.settings[key] = value;
        this._save();
    }
}

function createStore() {
    if (process.env.DATABASE_URL) {
        return new PgStore(process.env.DATABASE_URL);
    }
    return new FileStore(path.join(__dirname, '..', 'data', 'kakeibo.json'));
}

module.exports = { createStore, PgStore, FileStore };
