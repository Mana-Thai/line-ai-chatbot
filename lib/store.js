// 注文データの保存層。DATABASE_URL があれば PostgreSQL(Supabase等)、
// なければローカルJSONファイル(開発用。Renderでは再デプロイで消えるため本番はDB必須)
const fs = require('fs');
const path = require('path');

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
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                chest_logo TEXT NOT NULL,
                back_print TEXT NOT NULL,
                size TEXT NOT NULL,
                quantities JSONB NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                updated_by TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `);
        console.log('[Store] PostgreSQL ready');
    }

    _row(r) {
        return {
            id: r.id,
            userId: r.user_id,
            displayName: r.display_name,
            chestLogo: r.chest_logo,
            backPrint: r.back_print,
            size: r.size,
            quantities: r.quantities,
            note: r.note,
            updatedBy: r.updated_by,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }

    async list() {
        const { rows } = await this.pool.query('SELECT * FROM orders ORDER BY id');
        return rows.map((r) => this._row(r));
    }

    async get(id) {
        const { rows } = await this.pool.query('SELECT * FROM orders WHERE id = $1', [id]);
        return rows[0] ? this._row(rows[0]) : null;
    }

    async create(o) {
        const { rows } = await this.pool.query(
            `INSERT INTO orders (user_id, display_name, chest_logo, back_print, size, quantities, note, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [o.userId, o.displayName, o.chestLogo, o.backPrint, o.size,
                JSON.stringify(o.quantities), o.note, o.updatedBy],
        );
        return this._row(rows[0]);
    }

    async update(id, f) {
        const { rows } = await this.pool.query(
            `UPDATE orders SET chest_logo = $1, back_print = $2, size = $3, quantities = $4,
                note = $5, updated_by = $6, updated_at = now()
             WHERE id = $7 RETURNING *`,
            [f.chestLogo, f.backPrint, f.size, JSON.stringify(f.quantities), f.note, f.updatedBy, id],
        );
        return rows[0] ? this._row(rows[0]) : null;
    }

    async remove(id) {
        await this.pool.query('DELETE FROM orders WHERE id = $1', [id]);
    }
}

class FileStore {
    constructor(file) {
        this.file = file;
        this.data = { seq: 0, orders: [] };
    }

    async init() {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        if (fs.existsSync(this.file)) {
            this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        }
        console.warn('[Store] Using local file storage (development only):', this.file);
    }

    _save() {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
        fs.renameSync(tmp, this.file);
    }

    async list() {
        return this.data.orders.slice();
    }

    async get(id) {
        return this.data.orders.find((o) => o.id === id) || null;
    }

    async create(o) {
        const now = new Date().toISOString();
        const order = { id: ++this.data.seq, ...o, createdAt: now, updatedAt: now };
        this.data.orders.push(order);
        this._save();
        return order;
    }

    async update(id, f) {
        const order = await this.get(id);
        if (!order) return null;
        Object.assign(order, f, { updatedAt: new Date().toISOString() });
        this._save();
        return order;
    }

    async remove(id) {
        this.data.orders = this.data.orders.filter((o) => o.id !== id);
        this._save();
    }
}

function createStore() {
    if (process.env.DATABASE_URL) {
        return new PgStore(process.env.DATABASE_URL);
    }
    return new FileStore(path.join(__dirname, '..', 'data', 'orders.json'));
}

module.exports = { createStore };
