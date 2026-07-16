---
name: deploy-check
description: Render/Supabase/LINE(LIFF)で動く注文アプリのデプロイ整合性チェック。環境変数の追加・変更をしたとき、render.yaml や SETUP.md に触れたとき、PRのマージ前(デプロイ前)に使う。process.env・render.yaml・.env.example・SETUP.md の4点が揃っているか、ヘルスチェックパスが一致しているかを確認する。
---

# デプロイ整合性チェック(Render / Supabase / LIFF)

本番は Render(無料プラン)+ Supabase(PostgreSQL)+ LINEログイン(LIFF)。
過去に「ヘルスチェックパスの不一致」「環境変数の設定漏れ」で本番だけ動かない事故が
起きているため、マージ前に以下を機械的に確認する。

## 1. 環境変数の4点セット確認

コードで参照している環境変数を洗い出す:

```bash
grep -rhoE "process\.env\.[A-Z_]+" server.js lib/ shared/ index.js | sort -u
```

新しい環境変数を1つでも追加したら、**必ず次の4箇所すべて**に反映する:

| 場所 | 内容 |
|---|---|
| コード | `process.env.XXX`(未設定時のフォールバック動作も決める) |
| `render.yaml` | `envVars` に `- key: XXX` + `sync: false`(手入力)or `generateValue: true`(乱数) |
| `.env.example` | コメント付きでサンプル行を追加 |
| `SETUP.md` | STEP 3 の環境変数テーブルに行を追加 |

注意:
- `ALLOW_INSECURE_DEV` は開発専用。**render.yaml には絶対に追加しない**
- 秘密値(パスコード・接続文字列)は `sync: false`、`SESSION_SECRET` のような乱数は
  `generateValue: true` が使える

## 2. Render設定の整合

- `render.yaml` の `healthCheckPath` とコードのヘルスチェックルート
  (`server.js` の `app.get('/healthz', ...)`)が**完全一致**していること
- `startCommand: npm start` が起動したいエントリポイント(`package.json` の `start` =
  `node server.js`)を指していること。旧チャットボット(`index.js`)は `npm run chatbot` 側
- `package.json` の `engines.node` と使用しているAPI(組み込み `fetch` はNode 18+)が矛盾しないこと

## 3. データ永続化の確認

- `DATABASE_URL` 未設定だとローカルファイル保存になり、**Renderでは再デプロイで全データが消える**。
  本番向けの変更でファイル保存を前提にしていないか確認する
- DBスキーマを変えた場合は起動時マイグレーションが入っているか → `order-data-migration` Skill

## 4. ドキュメントの整合

- 機能・画面・運用手順を変えたら `SETUP.md`(特に「運用のヒント」「よくあるトラブル」)と
  `README.md` の記述が現状と合っているか読み直す
- LIFF関連の変更(スコープ、エンドポイント)をしたら SETUP.md の STEP 2 も更新する

## 5. 最終確認

- ローカルで `npm start`(環境変数なし)して起動エラーにならないこと
  (LIFF_ID警告は出てよい。クラッシュはNG)
- `order-app-regression` Skillのフルテストが通っていること
