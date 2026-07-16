---
name: new-shared-webapp
description: URLを知っている仲間だけで使う小さなWebアプリを新しく作るときの設計テンプレート。「新しいアプリを作りたい」「グループで使うツール」「みんなで共有するWebアプリ」のタスクで使う。注文とりまとめアプリで実証済みの構成(Express+素のJS+SSE+二重保存層+HMACセッション+devログイン)を雛形として流用し、要件整理から実装・テスト・公開準備までの手順をまとめたもの。
---

# URL共有Webアプリの新規立ち上げ

グループLINE等でURLを共有して仲間だけで使う小さなWebアプリを作るときは、
**注文とりまとめアプリ(`server.js` + `lib/` + `public/` + `shared/`)を雛形にする**。
本番で実証済みで、無料構成(Render+Supabase)でそのまま動く。

## 最初に決める3つのこと(ユーザーに確認)

1. **誰が使うか** → 認証方式が決まる(`webapp-access-control` Skillで選ぶ)
2. **何のデータを共有するか** → データモデル(1エンティティから始める。注文アプリの `orders` に相当)
3. **書き込み権限** → 「作った本人+管理者だけが編集」なら注文アプリの権限パターンをそのまま使う

## 雛形から流用するもの(コピーして固有部分を書き換え)

| ファイル | 流用方法 |
|---|---|
| `lib/auth.js` | **そのままコピー**。HMAC署名セッション(12h)+devログイン+LINE IDトークン検証。LINEログインを使わない場合は `verifyLineIdToken` を使わないだけ |
| `lib/store.js` | 構造をコピーし、`orders` のCRUDを自分のエンティティに書き換える。**PgStore(本番)とFileStore(開発)の二重構造と、起動時マイグレーション・`settings` テーブルは必ず残す** |
| `server.js` | `requireAuth` / `/api/auth` / `/api/admin` / `/api/config` / `/healthz` / SSE(`broadcast`+`/api/stream`)を流用。注文APIを自分のAPIに置き換える |
| `public/` | `app.js` の `api()`(fetchラッパ)・`escapeHtml`・`openStream`(SSE受信)・画面切り替えの構造を流用 |
| `shared/constants.js` | 選択肢や上限値をサーバー/ブラウザで共用するUMDパターン |
| `render.yaml` / `.env.example` | コピーしてサービス名と環境変数を書き換え |

新しいアプリは**新しいリポジトリ**に作るのが基本(Renderのサービスはリポジトリ単位)。
このリポジトリの雛形ファイルをコピーして持っていく。

## 実装時に必ず入れるもの

- **全 `/api/*` に `requireAuth`**(詳細は `webapp-access-control` Skill)
- **サーバー側バリデーション**: 型・範囲・長さを `parseXxx` 関数でチェックして400(注文アプリの `parseOrderInput` 方式)
- **リアルタイム反映**: 変更APIの末尾で `broadcast({type: '...'})`、フロントは `EventSource` で受けて再取得
- **devログイン**: `ALLOW_INSECURE_DEV=1` のときだけ名前入力でログイン可(開発とテストが劇的に楽になる。本番では絶対に設定しない)
- **`/healthz`**(Renderのヘルスチェック用)
- 表示するユーザー入力は必ず `escapeHtml` を通す

## テストと公開

- テスト: サーバーをdevモードで起動し、curlでAPI(401/403/400含む)→ Playwrightで
  複数ユーザー同時のUI確認(`order-app-regression` Skillのやり方を新アプリに合わせて縮小)
- 公開: `app-publish` Skill(Render+Supabase+共有方法)
- 環境変数を増やしたら `deploy-check` Skillの4点セット(コード / render.yaml / .env.example / セットアップ手順書)
