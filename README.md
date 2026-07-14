# グッズ注文とりまとめアプリ(LINEグループ用)

LINEグループのメンバーでTシャツ等のグッズ注文を取りまとめるWebアプリです。
**Messaging API(Bot)は使わない**ため、メッセージ通数の上限を一切消費しません。
メンバー数・利用回数に制限なく無料で運用できます。

## 特長

- **LINEログイン(LIFF)** で開くだけ。名前は自動取得、ログイン操作不要
- **合言葉方式** でグループメンバー以外のアクセスをブロック(初回のみ入力)
- **リアルタイム更新**:誰かが保存すると全員の画面が即座に自動更新(SSE)
- **編集ロック**:他のメンバーが編集中は「◯◯さんが編集中です」とポップアップ表示
- **本人のみ編集可**:自分の注文だけ編集/削除できる(管理者パスコードで全件編集可能)
- **発注用の集計表**:デザイン(胸ロゴ×バックプリント)ごとに カラー×サイズ の枚数を自動集計

## 注文の選択肢

| 項目 | 選択肢 |
|---|---|
| 胸ロゴ | 有(白) / 有(カラー) / 無 |
| バックプリント | 有 / 無 |
| サイズ | S / M / L / XL / 2XL / 3XL / 4XL / 5XL |
| カラー | 1.BK 〜 20.MT の20色 + 持ち込み(色ごとに数量を入力) |

選択肢を変更したい場合は `shared/constants.js` を編集してください。

## セットアップ

**初めての方は [SETUP.md](./SETUP.md) にクリック単位の詳細手順があります。**

### 1. LINE Developers Console(無料)

1. https://developers.line.biz/console/ でProviderを作成(既存でも可)
2. **「LINE Login」チャネル**を作成(Messaging APIチャネルは不要)
3. チャネル基本設定の **チャネルID** を控える → `LINE_LOGIN_CHANNEL_ID`
4. 「LIFF」タブで **LIFFアプリを追加**
   - サイズ: `Full`
   - エンドポイントURL: デプロイ後のURL(例: `https://your-app.onrender.com`)
   - Scope: `openid` と `profile` を **必ず両方ON**
5. 発行された **LIFF ID** を控える → `LIFF_ID`

### 2. データベース(Supabase・無料)

1. https://supabase.com/ でプロジェクトを作成
2. `Project Settings → Database → Connection string (URI)` をコピー → `DATABASE_URL`
   (テーブルは初回起動時に自動作成されます)

※ `DATABASE_URL` 未設定の場合はローカルJSONファイルに保存します(開発用。
Renderの無料プランでは再デプロイ時にデータが消えるため、本番ではDB必須)。

### 3. Renderへデプロイ

1. このリポジトリをGitHubにプッシュ
2. RenderでWeb Serviceを作成し、環境変数を設定:
   - `LIFF_ID` / `LINE_LOGIN_CHANNEL_ID` / `DATABASE_URL`
   - `APP_PASSCODE`(グループの合言葉。例: `tshirt2026`)
   - `ADMIN_PASSCODE`(管理者用。取りまとめ役だけが知るパスコード)
   - `SESSION_SECRET`(ランダムな長い文字列)
3. デプロイ完了後、そのURLをLIFFのエンドポイントURLに設定

### 4. グループLINEへの掲載

LIFFのURL(`https://liff.line.me/{LIFF_ID}`)と合言葉を、グループの
**ノート または アナウンス(ピン留め)** に掲載してください。
メンバーはそこからワンタップでいつでも開けます。

## ローカル開発

```bash
npm install
cp .env.example .env   # ALLOW_INSECURE_DEV=1 を設定するとLINEログインなしで試せる
npm start              # http://localhost:3000
```

## 環境変数一覧

| 変数 | 必須 | 説明 |
|---|---|---|
| `LIFF_ID` | ○ | LIFFアプリのID |
| `LINE_LOGIN_CHANNEL_ID` | ○ | LINE LoginチャネルのチャネルID(IDトークン検証用) |
| `APP_PASSCODE` | 推奨 | 入室用の合言葉。未設定ならURLだけでアクセス可 |
| `ADMIN_PASSCODE` | 推奨 | 管理者モード(全注文の編集/削除)解除用 |
| `DATABASE_URL` | 推奨 | PostgreSQL接続文字列(Supabase等)。未設定ならファイル保存 |
| `SESSION_SECRET` | 推奨 | セッション署名鍵。未設定なら起動ごとにランダム生成 |
| `APP_TITLE` | - | 画面に表示するタイトル |
| `ALLOW_INSECURE_DEV` | - | `1`でLINEログインを省略(ローカル開発専用) |

## 旧チャットボットについて

以前のGemini AIチャットボット(`index.js`)はそのまま残してあります。
`npm run chatbot` で起動できます(Messaging APIの通数制限あり)。
