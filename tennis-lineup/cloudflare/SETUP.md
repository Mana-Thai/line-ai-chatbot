# Cloudflare版 公開手順(LINEログイン)

構成: Cloudflare Workers(画面+API)+ D1(データベース)+ LINEログイン(LIFF)。無料枠で動きます。

| 権限 | できること |
|---|---|
| 管理者と同じ権限(admin) | 名簿・年齢・レベル・勝率・オーダー編集・自動作成・権限の変更 |
| 閲覧のみ(viewer) | オーダー・出場回数・参加費の分担だけ(自動で最新) |

LINEでログインした人は最初「閲覧のみ」。最初の管理者は「管理者コード」でなり、以後は管理者が「書き出し」タブの一覧で変更します。

## 1. D1(データベース)を作る
1. Cloudflare ダッシュボード → **Storage & Databases → D1 SQL Database → Create**
2. 名前 `tennis-lineup` で作成し、表示された **Database ID** を控える
3. `wrangler.toml` の `database_id` をその値に書き換える(Claudeに伝えれば書き換えます)
   ※ テーブルは初回アクセス時に自動で作られます

## 2. LINE Developers で LIFF アプリを作る
1. 既存の「LINEログイン」チャネル(注文アプリと同じでよい)を開く → **LIFF → 追加**
2. サイズ: Full / エンドポイントURL: 手順3で分かる Workers のURL(例 `https://tennis-lineup.<アカウント>.workers.dev/`)/ Scope: **openid と profile をON**
3. **LIFF ID** と、チャネル基本設定の **チャネルID** を控える
4. `wrangler.toml` の `[vars]` の `LIFF_ID` と `LINE_LOGIN_CHANNEL_ID` に入れる(公開しても問題ない値)

## 3. Workers を GitHub から公開する
1. ダッシュボード → **Workers & Pages → Create → Import a repository**
2. リポジトリ `Mana-Thai/line-ai-chatbot`、ブランチ `claude/tournament-player-match-app-g8ps03`(main にマージ後は main)
3. **Root directory: `tennis-lineup/cloudflare`**、Build command: 空欄、Deploy command: `npx wrangler deploy`
4. 公開後、Worker の **Settings → Variables and Secrets** で次の2つを **Secret** として追加
   | 名前 | 値 |
   |---|---|
   | `SESSION_SECRET` | 長いランダムな文字列(32文字以上・誰にも教えない) |
   | `ADMIN_SETUP_CODE` | 管理者になるための合言葉(管理者だけに教える) |
5. `https://<WorkersのURL>/healthz` が `ok` になれば公開完了。LIFFのエンドポイントURLもこのURLにする

## 4. 最初の管理者になる・データを移す
1. `https://liff.line.me/<LIFF ID>` をLINEで開いてログイン →「管理者の方はこちら」に `ADMIN_SETUP_CODE` を入力
2. 「書き出し」タブ →「ファイルから読み込み」で、claude.ai版から書き出したバックアップ(JSON)を読み込む
3. 一緒に編集する人には、その人がログインしたあと「共有と権限」の一覧で「管理者と同じ権限」にする

## 5. メンバーへの共有
- グループLINEに `https://liff.line.me/<LIFF ID>` を送る(LINEで開くと自動ログイン、閲覧のみで最新オーダーが見える)
- ログインしたくない人向けには、従来どおり「メンバー用の閲覧リンク」(`/view/#view=...`)も使える(送り直しが必要)

## 更新のしかた
- 画面を直したら `python3 tennis-lineup/build.py --cf` で `public/` を作り直してコミット → push で自動デプロイ
- ローカル確認: `.dev.vars` に `ALLOW_INSECURE_DEV=1` `SESSION_SECRET=...` `ADMIN_SETUP_CODE=...` を書き、`npx wrangler dev`(名前入力だけでログインできる。本番では設定しない)

## うまくいかないとき
| 症状 | 原因 |
|---|---|
| 「LIFF_ID が設定されていません」 | `wrangler.toml` の `LIFF_ID` が空 |
| 「LINEのIDトークンを確認できませんでした」 | `LINE_LOGIN_CHANNEL_ID` が違う、またはLIFFが別チャネル |
| 「SESSION_SECRET が設定されていません」 | 手順3-4のシークレット未設定 |
| 「管理者コードが違います」 | `ADMIN_SETUP_CODE` の入力ミス/未設定 |
