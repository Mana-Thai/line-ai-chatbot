# line-ai-chatbot プロジェクトガイド

このファイルは Claude Code と OpenAI Codex の共通コンテキストです(CLAUDE.md から取り込まれます)。

## リポジトリの構成

このリポジトリには独立した2つのアプリが入っている:

1. **グッズ注文とりまとめアプリ(メイン・本番運用中)** — グループLINEのメンバーで
   Tシャツ等の注文を取りまとめるWebアプリ。LIFF(LINEログイン)使用、Messaging API(Bot)不使用。
   - `server.js` — Express APIサーバー(認証・注文CRUD・価格設定・編集ロック・SSE・サンプル画像)
   - `lib/auth.js` — LINE IDトークン検証+HMAC署名セッショントークン(12時間)
   - `lib/store.js` — 保存層。`DATABASE_URL` があればPostgreSQL(Supabase)、なければ
     ローカルJSON(`data/orders.json`)。**起動時に自動マイグレーション**を行う
   - `public/` — フロントエンド(素のHTML/CSS/JS、依存ライブラリなし)。`app.js` に
     描画・価格計算・CSV出力(日本語/タイ語)・SSE受信のすべてがある
   - `shared/constants.js` — 選択肢(胸ロゴ6種・カラー20色+持ち込み・サイズS〜5XL)と
     タイ語辞書 `TH`。サーバー/ブラウザ共用(UMD形式)
2. **ギフト動画 組み立てパイプライン** — `gift-video/`。AI生成済みシーン素材+BGMから
   パーソナライズ動画(30秒〜1分等、`order.yaml` の `target_duration` で指定)を組み立てる
   Python+ffmpegのCLI。詳細は `gift-video/README.md`
3. **アートワーク制作ツール** — `artwork/tools/`。SVG→高解像度PNGの `rasterize.py`
   (ヘッドレスChrome利用・透過/生地色プレビュー対応)と、テキストグリッド→ドット絵SVGの
   `pixel2svg.py`、写真→映画風/アニメ風画像のAI生成 `stylize.py`(要 `GEMINI_API_KEY`)。
   作品は `artwork/works/<作品名>/` に置く
4. **副業の運営ファイル** — `business/`。受注管理台帳 `orders.csv`(全案件のステータス管理)と
   見積書テンプレート `templates/quote-template.html`(日タイ併記・PNG化してLINEで送る)
5. **旧チャットボット(休止中)** — `index.js`。LINE Messaging API + Gemini。`npm run chatbot`
6. **ローカルPCエージェント** — `local-agent/`。自分のWindows PCの中で動かすCLIエージェント。
   Claude APIを呼び、返ってきた指示を**ローカルで実行**する(ファイル検索・閲覧・編集、
   Excel/Word/PDF/画像の読み取り、PowerShell、`--gui` で画面操作)。`--root` で許可フォルダを限定し、書き込み・実行は既定で都度確認。
   このリポジトリでは開発するだけで、実行は各自のPC上。詳細は `local-agent/README.md`

## 重要な仕様・約束事

- **価格は工賃込みの一律価格**。管理者が入力したサイズ別価格(+持ち込み価格)をそのまま単価に
  使う。計算・切り上げは一切しない
- **権限**: 注文の編集/削除/支払い/受け渡しチェックは「入力した本人」と「管理者」のみ
  (API側で403)。価格設定・サンプル画像は管理者のみ
- **編集ロック**: 全体で1人だけ編集可(TTL30秒+10秒ハートビート)。競合は409
- **リアルタイム反映**: 変更はすべてSSE(`/api/stream`)で全クライアントに配信される
- **二言語**: CSVは日本語版とタイ語版。固定文言は `shared/constants.js` の `TH` 辞書で翻訳。
  辞書に無い文言は日本語のまま出る(サイレントに漏れるので注意)
- **選択肢の改名・データ構造変更**時は `lib/store.js` に起動時マイグレーションを必ず入れる
  (PgStore・FileStoreの両方)

## ローカルでの起動・テスト

```bash
npm install
rm -rf data
ALLOW_INSECURE_DEV=1 ADMIN_PASSCODE=admin123 PORT=3000 node server.js
```

`ALLOW_INSECURE_DEV=1` でLINEログイン不要のdevログイン(名前入力のみ)が使える。開発専用。
テストフレームワークは無く、curlによるAPIテスト+Playwrightの複数ユーザー同時UIテストで
検証する(手順はSkill `order-app-regression` にある)。

## デプロイ

- Render(無料プラン)。設定は `render.yaml`(ヘルスチェック `/healthz`)
- DBはSupabase。`DATABASE_URL` 未設定だと再デプロイでデータが消えるため本番はDB必須
- 環境変数を追加したら `render.yaml` / `.env.example` / `SETUP.md` の3つにも必ず反映
- 公開手順の正本は `SETUP.md`

## Skill(Claude Code / Codex 共通)

再利用ワークフローは Skill として管理している。**正本は `.claude/skills/`**(Claude Code用)、
`.agents/skills/` は Codex 用の同期コピー。Skillを追加・編集したら必ず
`npm run sync-skills` で同期してから両方をコミットすること。

| Skill | 用途 |
|---|---|
| `order-app-regression` | 注文アプリ変更後のフルリグレッションテスト(PR前に必須) |
| `thai-i18n` | 選択肢・CSV列・文言の追加/変更時の日タイ二言語チェックリスト |
| `order-data-migration` | 選択肢改名・データ構造変更時の既存データ自動移行パターン |
| `deploy-check` | 環境変数・render.yaml・SETUP.md の整合チェック(マージ前) |
| `gift-video-run` | ギフト動画1本の作成(new_order → precheck → assemble → qc) |
| `gift-video-batch` | ギフト動画の一括量産(CSV → make_orders → precheck → batch) |
| `gift-video-material-check` | ギフト動画素材の事前チェックとFAIL/WARNの対処 |
| `new-shared-webapp` | URL共有型Webアプリの新規立ち上げ(注文アプリを雛形に流用) |
| `webapp-access-control` | URL共有アプリのアクセス制御(認証方式の選択+公開前チェック) |
| `app-publish` | 新アプリの公開手順(Render+Supabase)とグループLINEでのURL共有 |
| `new-website` | ウェブサイト(案内ページ・LP等)の新規作成テンプレート(静的サイト) |
| `website-publish` | ウェブサイトの無料公開(GitHub Pages)とURL共有 |
| `website-quality-check` | ウェブサイトの公開前チェック(スマホ表示・OGP・リンク切れ等) |
| `roblox-game-dev` | Robloxゲーム開発(Luau・Studio連携・サーバー権威設計・公開) |
| `new-web-game` | ブラウザミニゲーム(Canvas)の作成とURL共有 |
| `illustration-animation` | イラスト・静止画のアニメーション化(animate.py・ギフト動画連携) |
| `image-stylize` | 写真数枚から実写映画風・アニメ風画像をAI生成(stylize.py・Gemini) |
| `drama-video-liveaction` | 写真の人物が動いて話す実写ドラマ風動画(drama_clip.py・Veo 3.1) |
| `drama-video-anime` | 写真をアニメキャラ化して動かすアニメ風ドラマ動画(設定画→Veo 3.1) |
| `memorial-photo-video` | お客様の実写真から思い出アルバム動画(母の日等・AI生成不要) |
| `apparel-graphic-design` | アパレルプリントのデザイン制作(SVG→300dpi透過PNG・印刷制約) |
| `pixel-art` | ピクセルアート制作(テキストグリッド作画→SVG→PNG) |
| `gimmick-art` | 仕掛けアート(逆さ絵・隠し文字・QRアート等)の制作と検証 |
| `biz-quote` | 副業の見積もり作成(ヒアリング→日タイ併記の見積書PNG) |
| `biz-order-ledger` | 受注管理台帳(business/orders.csv)の運用とレポート |
| `biz-customer-messages` | 顧客対応メッセージの日タイテンプレート |
| `biz-delivery` | 納品手順(透かしプレビュー→入金→本納品) |
