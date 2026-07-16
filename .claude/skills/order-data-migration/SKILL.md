---
name: order-data-migration
description: 注文アプリのデータ構造や選択肢名を変更するときの既存データ移行パターン。胸ロゴ等の選択肢の改名、注文データへの項目追加、DBカラム追加をするとき、「マイグレーション」「既存データ」「選択肢を変える」タスクで必ず使う。lib/store.js のPgStore(PostgreSQL)とFileStore(ローカルJSON)の両方を起動時自動移行で対応させる。
---

# 既存データの自動マイグレーション パターン

本番はSupabase(PostgreSQL)に**既に実データが入っている**。仕様変更のたびに手作業のSQLを
要求しない方針で、**アプリ起動時に自動で移行する**のがこのリポジトリの定石。
保存層は `lib/store.js` に2つあり、**必ず両方に同じ移行を入れる**:

- `PgStore`(`DATABASE_URL` あり・本番)
- `FileStore`(ローカルJSON `data/orders.json`・開発)

## パターン1: 選択肢の改名(例: 胸ロゴ名の変更)

1. `lib/store.js` 冒頭の `CHEST_LOGO_RENAMES` に `'旧名称': '新名称'` を追加する
   (胸ロゴ以外の項目を改名する場合は同じ形式のマップを新設する)
2. これだけで両ストアに効く:
   - `PgStore.init()` がマップを回して `UPDATE orders SET chest_logo = 新 WHERE chest_logo = 旧` を実行
   - `FileStore.init()` が読み込み時に各注文の値を書き換える
3. **古い変換エントリは消さない**。何ヶ月も起動していないDBが旧名称のまま残っている可能性がある。
   多段改名(A→B→C)になったら、A→C になるようマップを更新する
4. `shared/constants.js` の選択肢リストと `TH` 辞書(タイ語訳)も新名称に更新する
   → 詳細は `thai-i18n` Skill
5. 管理者設定(`settings` の `designImages` キーなど)が旧名称をキーにしていないか確認し、
   していれば同様に移行する

## パターン2: 注文データへの項目追加(例: paid / delivered の追加)

- **PgStore**: `init()` に2つ追加する
  1. `CREATE TABLE` 文に新カラムを追加(新規環境用)
  2. `ALTER TABLE orders ADD COLUMN IF NOT EXISTS 新カラム ...`(既存環境用)。
     JSONオブジェクトは `JSONB NOT NULL DEFAULT '{}'`、null許容の単一値は `JSONB` を使う
  - `_row()` にキャメルケースへの変換を追加、INSERT/UPDATE文にもカラムを追加
- **FileStore**: `init()` の注文ループでデフォルト値を埋める
  (例: `if (!o.delivered) o.delivered = {};` / `if (o.paid === undefined) o.paid = null;`)

## パターン3: 構造の変換(例: size/quantities → items配列)

- 変換関数を共通化して両ストアから使う(既存例: `legacyToItems()`)
- PgStoreでは読み出し時変換(`_row()`)+起動時の一括UPDATE、FileStoreでは起動時変換

## 検証(必須)

1. **旧形式データを手で作って起動テスト**する。`data/orders.json` に旧名称・旧形式の注文を
   直接書いてからサーバーを起動し、APIの `GET /api/orders` で新形式に変換されていることを確認:

   ```bash
   rm -rf data && mkdir data
   cat > data/orders.json <<'EOF'
   {"seq":1,"orders":[{"id":1,"userId":"dev-a","displayName":"Aさん","orderName":"Aさん",
    "chestLogo":"有(白)","backPrint":"有","size":"M","quantities":{"1.BK":2},
    "note":"","updatedBy":"Aさん","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}],
    "settings":{}}
   EOF
   ALLOW_INSECURE_DEV=1 PORT=3000 node server.js
   # 別ターミナルで: 注文の chestLogo が新名称、items が配列になっていることを確認
   ```

2. PgStore側は起動時マイグレーションのSQLを机上レビュー(冪等か? `IF NOT EXISTS` があるか?
   旧データが無い新規環境でもエラーにならないか?)
3. 移行後の値が画面(注文カード・集計・受け渡し・CSV)に正しく出ることを
   `order-app-regression` Skillで確認する
