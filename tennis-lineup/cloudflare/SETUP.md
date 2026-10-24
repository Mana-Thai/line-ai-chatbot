# Cloudflare版 公開手順(LINEログイン)

構成: Cloudflare Workers(画面+API)+ D1(データベース)+ LINEログイン(LIFF)。無料枠で動きます。

| 権限 | できること |
|---|---|
| 管理者と同じ権限(admin) | 名簿・年齢・レベル・勝率・オーダー編集・自動作成・権限の変更 |
| 閲覧のみ(viewer) | オーダー・出場回数・参加費の分担だけ(自動で最新) |

LINEでログインした人は最初「閲覧のみ」。最初の管理者だけ「管理者コード」でなり(管理者が1人もいないときだけ入力欄が出る)、
以後の管理者は、その人に一度ログインしてもらってから、管理者が「書き出し」タブの一覧で「管理者と同じ権限」にします。

管理者の編集は同時に1人だけです。入力を始めると自動で「編集中」になり、ほかの管理者には「〇〇さんが編集中です」と表示されて見るだけになります
(「編集を終える」・3分間操作なし・画面を閉じて30秒で解除)。サーバー側でも、編集中の人以外の保存は断ります。

## 1. Workers を GitHub から公開する(D1 も自動で作られる)
1. Cloudflare ダッシュボード → **Workers & Pages → Create → Import a repository**
2. リポジトリ `Mana-Thai/line-ai-chatbot`、ブランチ `claude/tournament-player-match-app-g8ps03`(main にマージ後は main)
3. **Root directory: `tennis-lineup/cloudflare`**、Build command: 空欄、Deploy command: `npx wrangler deploy`
   ※ Project name(Worker名)は `wrangler.toml` の `name`(今は `line-ai-chatbot`)と同じにする。違うとビルドが失敗する
4. Deploy すると、D1 データベース `tennis-lineup` も自動で作られてつながる(Database ID の入力は不要)
5. 表示された Workers のURL(例 `https://line-ai-chatbot.<アカウント>.workers.dev/`)を控える

## 2. LINE Developers で LIFF アプリを作る
1. 既存の「LINEログイン」チャネル(注文アプリと同じでよい)を開く → **LIFF → 追加**
2. サイズ: Full / エンドポイントURL: 手順1-5 の Workers のURL / Scope: **openid と profile をON**
3. **LIFF ID** と、チャネル基本設定の **チャネルID** を控える

## 3. Cloudflare に設定を入れる
Worker の **Settings → Variables and Secrets → Add** で4つ追加(deploy しても消えません):
| 名前 | 種類 | 値 |
|---|---|---|
| `LIFF_ID` | Text | 手順2-3 の LIFF ID |
| `LINE_LOGIN_CHANNEL_ID` | Text | 手順2-3 のチャネルID |
| `SESSION_SECRET` | **Secret** | 長いランダムな文字列(32文字以上・誰にも教えない) |
| `ADMIN_SETUP_CODE` | **Secret** | 管理者になるための合言葉(管理者だけに教える) |

`https://<WorkersのURL>/healthz` が `ok` なら公開完了。設定が足りないと、開いたときに足りない名前が表示されます。

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
| 「Cloudflare の設定が足りません: …」 | 手順3の変数・シークレットが未設定(表示された名前を追加) |
| 「LINEのIDトークンを確認できませんでした」 | `LINE_LOGIN_CHANNEL_ID` が違う、またはLIFFが別チャネル |
| 「SESSION_SECRET が設定されていません」 | 手順3-4のシークレット未設定 |
| 「管理者コードが違います」 | `ADMIN_SETUP_CODE` の入力ミス/未設定 |
