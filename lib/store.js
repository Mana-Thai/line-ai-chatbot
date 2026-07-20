// 注文データ・設定の保存層。DATABASE_URL があれば PostgreSQL(Supabase等)、
// なければローカルJSONファイル(開発用。Renderでは再デプロイで消えるため本番はDB必須)
const fs = require('fs');
const path = require('path');

// 旧バージョンの胸ロゴ名 → 新名称(デザイン項目の改名に伴う移行)
const CHEST_LOGO_RENAMES = {
    '有(白)': '有(ロゴ小 白)',
    '有(カラー)': '有(ロゴ小 カラー1)',
    '有(ロゴ小 カラー)': '有(ロゴ小 カラー1)',
    '有(白・大)': '有(ロゴ大 白)',
    '有(カラー・大)': '有(ロゴ大 カラー1)',
};

// 背面プリントに白/黒の選択肢を追加。旧「有」は白プリントとして引き継ぐ。
const BACK_PRINT_RENAMES = {
    '有': '有(白)',
};

const DESIGN_IMAGE_RENAMES = {
    ...CHEST_LOGO_RENAMES,
    'バックプリント有': 'バックプリント有(白)',
};

const BRING_OWN = '持ち込み';

// 胸ロゴ名をキーに保存している管理者の参考写真も、新名称へ引き継ぐ。
function migrateDesignImageKeys(images) {
    if (!images || typeof images !== 'object' || Array.isArray(images)) {
        return { value: images || {}, changed: false };
    }
    const value = { ...images };
    let changed = false;
    for (const [oldName, newName] of Object.entries(DESIGN_IMAGE_RENAMES)) {
        if (!Object.prototype.hasOwnProperty.call(value, oldName)) continue;
        if (!Object.prototype.hasOwnProperty.call(value, newName)) value[newName] = value[oldName];
        delete value[oldName];
        changed = true;
    }
    return { value, changed };
}

// 旧仕様では「持ち込み」はカラーの一種だった。新仕様ではサイズの一種
// (色なし・数量のみ)のため、通常サイズ内の持ち込み数量を独立した
// 持ち込みアイテムへ移す
function migrateBringOwnItems(items) {
    if (!Array.isArray(items)) return { items: [], changed: false };
    const out = [];
    let bringQty = 0;
    let changed = false;
    for (const item of items) {
        if (!item) continue;
        if (item.size === BRING_OWN) {
            bringQty += Object.values(item.quantities || {}).reduce((a, b) => a + b, 0);
            changed = true; // まとめ直すため一旦除外
            continue;
        }
        const quantities = { ...(item.quantities || {}) };
        if (quantities[BRING_OWN]) {
            bringQty += quantities[BRING_OWN];
            delete quantities[BRING_OWN];
            changed = true;
        }
        if (Object.keys(quantities).length > 0) {
            out.push({ size: item.size, quantities });
        } else {
            changed = true;
        }
    }
    if (bringQty > 0) out.push({ size: BRING_OWN, quantities: { [BRING_OWN]: bringQty } });
    return { items: out, changed };
}

// 明細構成が変わった注文では、対応しなくなった受け渡しチェックを外す
function sanitizeDeliveredKeys(delivered, items) {
    const out = {};
    for (const [key, val] of Object.entries(delivered || {})) {
        const sep = key.indexOf(':');
        const idx = Number(key.slice(0, sep));
        const color = key.slice(sep + 1);
        if (items[idx] && items[idx].quantities[color]) out[key] = val;
    }
    return out;
}

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
                paid JSONB,
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
        await this.pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid JSONB');
        await this.pool.query('ALTER TABLE orders ALTER COLUMN size DROP NOT NULL');
        await this.pool.query('ALTER TABLE orders ALTER COLUMN quantities DROP NOT NULL');
        await this.pool.query("UPDATE orders SET order_name = display_name WHERE order_name = ''");
        await this.pool.query(`
            UPDATE orders
            SET items = jsonb_build_array(jsonb_build_object('size', size, 'quantities', quantities))
            WHERE items IS NULL AND size IS NOT NULL AND quantities IS NOT NULL
        `);
        for (const [oldName, newName] of Object.entries(CHEST_LOGO_RENAMES)) {
            await this.pool.query('UPDATE orders SET chest_logo = $1 WHERE chest_logo = $2', [newName, oldName]);
        }
        for (const [oldName, newName] of Object.entries(BACK_PRINT_RENAMES)) {
            await this.pool.query('UPDATE orders SET back_print = $1 WHERE back_print = $2', [newName, oldName]);
        }
        // 「持ち込み」がカラーとして保存されている注文をサイズ形式へ移行
        {
            const { rows } = await this.pool.query(
                "SELECT id, items, delivered FROM orders WHERE items::text LIKE '%持ち込み%'",
            );
            for (const r of rows) {
                const migrated = migrateBringOwnItems(r.items);
                const alreadyNew = (r.items || []).every(
                    (it) => it && (it.size !== BRING_OWN ? !(it.quantities || {})[BRING_OWN] : true),
                );
                if (!migrated.changed || alreadyNew) continue;
                await this.pool.query(
                    'UPDATE orders SET items = $1, delivered = $2 WHERE id = $3',
                    [JSON.stringify(migrated.items),
                        JSON.stringify(sanitizeDeliveredKeys(r.delivered, migrated.items)), r.id],
                );
            }
        }
        // 設定(価格等)の保存領域
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `);
        {
            const { rows } = await this.pool.query("SELECT value FROM settings WHERE key = 'designImages'");
            if (rows[0]) {
                const migrated = migrateDesignImageKeys(rows[0].value);
                if (migrated.changed) {
                    await this.pool.query(
                        "UPDATE settings SET value = $1, updated_at = now() WHERE key = 'designImages'",
                        [JSON.stringify(migrated.value)],
                    );
                }
            }
        }
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
            paid: r.paid || null,
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

    // 支払い済みチェックのみ更新
    async setPaid(id, paid) {
        const { rows } = await this.pool.query(
            'UPDATE orders SET paid = $1 WHERE id = $2 RETURNING *',
            [paid ? JSON.stringify(paid) : null, id],
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
        let changed = false;
        if (!this.data.settings) {
            this.data.settings = {};
            changed = true;
        }
        // 旧形式(size/quantities)の注文を items 形式へ移行
        for (const o of this.data.orders) {
            if (!o.items) {
                o.items = legacyToItems(o);
                delete o.size;
                delete o.quantities;
                changed = true;
            }
            if (!o.delivered) {
                o.delivered = {};
                changed = true;
            }
            if (o.paid === undefined) {
                o.paid = null;
                changed = true;
            }
            if (CHEST_LOGO_RENAMES[o.chestLogo]) {
                o.chestLogo = CHEST_LOGO_RENAMES[o.chestLogo];
                changed = true;
            }
            if (BACK_PRINT_RENAMES[o.backPrint]) {
                o.backPrint = BACK_PRINT_RENAMES[o.backPrint];
                changed = true;
            }
            // 「持ち込み」カラー → 持ち込みサイズへの移行
            const hasOldBring = o.items.some(
                (it) => it && it.size !== BRING_OWN && (it.quantities || {})[BRING_OWN],
            );
            if (hasOldBring) {
                const migrated = migrateBringOwnItems(o.items);
                o.items = migrated.items;
                o.delivered = sanitizeDeliveredKeys(o.delivered, o.items);
                changed = true;
            }
        }
        const migratedImages = migrateDesignImageKeys(this.data.settings.designImages);
        if (migratedImages.changed) {
            this.data.settings.designImages = migratedImages.value;
            changed = true;
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

    async setPaid(id, paid) {
        const order = await this.get(id);
        if (!order) return null;
        order.paid = paid;
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
