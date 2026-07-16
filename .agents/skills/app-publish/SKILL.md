---
name: app-publish
description: 新しいWebアプリをオンラインに公開し、URLを仲間に共有するまでの手順。「公開したい」「デプロイしたい」「URLをグループに共有」「Renderに載せる」のタスクで使う。無料構成(Render+Supabase+必要ならLINEログイン)での新規サービス作成、環境変数、公開後の動作確認、グループLINEでの共有方法まで。
---

# アプリの公開とURL共有(Render + Supabase)

すべて無料プランで完結する。所要約30分。注文アプリで実際に使っている構成で、
詳細な画面操作つきの正本は `SETUP.md`(このSkillは新アプリへの一般化)。

## 公開前の準備(リポジトリ側)

- [ ] `render.yaml` がある(`healthCheckPath` がコードの実装と一致、環境変数が列挙済み)
- [ ] `package.json` の `start` が本番エントリポイントを指す
- [ ] `.env.example` とセットアップ手順書が最新(`deploy-check` Skillで整合確認)
- [ ] アクセス制御の公開前チェックに合格(`webapp-access-control` Skill)
- [ ] `ALLOW_INSECURE_DEV` 等の開発専用フラグが本番設定に含まれていない

## 手順

1. **Supabase(DB)** — `SETUP.md` STEP 1 と同じ。プロジェクト作成 →
   Connection string の **Transaction pooler** URI → パスワードを埋めて `DATABASE_URL` に。
   テーブルはアプリの起動時マイグレーションが作るのでSQL操作は不要
2. **LINEログインを使う場合** — `SETUP.md` STEP 2(LINE Loginチャネル+LIFF作成、
   Scopeは `openid`+`profile`、チャネルを「公開」に)。エンドポイントURLは手順3の後で確定
3. **Render(公開)** — New Web Service → GitHubリポジトリを接続 → Plan: Free →
   環境変数を入力(`DATABASE_URL` / `ADMIN_PASSCODE` / `SESSION_SECRET` /
   LINEログイン時は `LIFF_ID`・`LINE_LOGIN_CHANNEL_ID`)→ デプロイ →
   `https://xxxx.onrender.com` が発行される
4. **(LINEログイン時)LIFFのエンドポイントURLをRenderのURLに更新**

## 公開後の動作確認(必ずやる)

- [ ] `https://<URL>/healthz` が200
- [ ] 本番URLで実際にログイン→データ作成→別の端末/ユーザーで見える
- [ ] **手動再デプロイしてもデータが残る**(消えたら `DATABASE_URL` 未設定でファイル保存に
      落ちている。これが一番多い事故)
- [ ] 未認証curlでAPIが401(`webapp-access-control` の公開前チェック)

## 仲間へのURL共有

- **グループLINEのノートに投稿してアナウンス(ピン留め)**が基本
  (トークに流すだけだと埋もれる)
- LINEログインのアプリは `https://liff.line.me/{LIFF_ID}` を共有(LINE内でそのまま開ける)
- それ以外は RenderのURLをそのまま共有。合言葉がある場合は**URLとは別の場所**で伝える
- 案内文には「何のアプリか+最初にやること(名前入力など)」を1〜2行で添える

## 運用の注意

- Render無料プランはスリープする(初回アクセスに30秒程度)。仲間に事前に伝えておく
- URLを変えたいとき(漏れた等)は Renderのサービス名変更で新URLになる。
  合言葉方式なら合言葉の変更が手軽
- 環境変数を後から追加したら Render のダッシュボードにも設定し、`deploy-check` Skillで整合確認
