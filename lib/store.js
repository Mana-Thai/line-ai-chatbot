// 注文データ・設定の保存層。DATABASE_URL があれば PostgreSQL(Supabase等)、
// なければローカルJSONファイル(開発用。Renderでは再デプロイで消えるため本番はDB必須)
const fs = require('fs');
const path = require('path');

// 旧形式(size + quantities)→ 新形式(items配列)への変換
function legacyToItems(row) {
    if (row.items && Array.isArray(row.items)) return row.items;
    if (row.size && row.quantities) return [{ size: row.size, quantities: row.quantities }];
    return [];
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
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                order_name TEXT NOT NULL DEFAULT '',
                chest_logo TEXT NOT NULL,
                back_print TEXT NOT NULL,
                items JSONB,
                delivered JSONB NOT NULL DEFAULT '{}',
                size TEXT,
                quantities JSONB,
                note TEXT NOT NULL DEFAULT '',
                updated_by TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `);
        // 旧バージョンで作成済みのテーブルの移行
        await this.pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_name TEXT NOT NULL DEFAULT ''");
        await this.pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB');
        await this.pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered JSONB NOT NULL DEFAULT '{}'");
        await this.pool.query('ALTER TABLE orders ALTER COLUMN size DROP NOT NULL');
        await this.pool.query('ALTER TABLE orders ALTER COLUMN quantities DROP NOT NULL');
        await this.pool.query("UPDATE orders SET order_name = display_name WHERE order_name = ''");
        await this.pool.query(`
            UPDATE orders
            SET items = jsonb_build_array(jsonb_build_object('size', size, 'quantities', quantities))
            WHERE items IS NULL AND size IS NOT NULL AND quantities IS NOT NULL
        `);
        // 設定(価格等)の保存領域
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
            userId: r.user_id,
            displayName: r.display_name,
            orderName: r.order_name,
            chestLogo: r.chest_logo,
            backPrint: r.back_print,
            items: legacyToItems(r),
            delivered: r.delivered || {},
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
            `INSERT INTO orders (user_id, display_name, order_name, chest_logo, back_print, items, note, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [o.userId, o.displayName, o.orderName, o.chestLogo, o.backPrint,
                JSON.stringify(o.items), o.note, o.updatedBy],
        );
        return this._row(rows[0]);
    }

    async update(id, f) {
        const { rows } = await this.pool.query(
            `UPDATE orders SET order_name = $1, chest_logo = $2, back_print = $3, items = $4,
                delivered = $5, note = $6, updated_by = $7, updated_at = now()
             WHERE id = $8 RETURNING *`,
            [f.orderName, f.chestLogo, f.backPrint, JSON.stringify(f.items),
                JSON.stringify(f.delivered || {}), f.note, f.updatedBy, id],
        );
        return rows[0] ? this._row(rows[0]) : null;
    }

    // 受け渡しチェックのみ更新(updated_at は変えない:注文内容の変更ではないため)
    async setDelivered(id, delivered) {
        const { rows } = await this.pool.query(
            'UPDATE orders SET delivered = $1 WHERE id = $2 RETURNING *',
            [JSON.stringify(delivered), id],
        );
        return rows[0] ? this._row(rows[0]) : null;
    }

    async remove(id) {
        await this.pool.query('DELETE FROM orders WHERE id = $1', [id]);
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
        this.data = { seq: 0, orders: [], settings: {} };
    }

    async init() {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        if (fs.existsSync(this.file)) {
            this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        }
        if (!this.data.settings) this.data.settings = {};
        // 旧形式(size/quantities)の注文を items 形式へ移行
        for (const o of this.data.orders) {
            if (!o.items) {
                o.items = legacyToItems(o);
                delete o.size;
                delete o.quantities;
            }
            if (!o.delivered) o.delivered = {};
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
        const order = { id: ++this.data.seq, delivered: {}, ...o, createdAt: now, updatedAt: now };
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

    async setDelivered(id, delivered) {
        const order = await this.get(id);
        if (!order) return null;
        order.delivered = delivered;
        this._save();
        return order;
    }

    async remove(id) {
        this.data.orders = this.data.orders.filter((o) => o.id !== id);
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
    return new FileStore(path.join(__dirname, '..', 'data', 'orders.json'));
}

module.exports = { createStore };
