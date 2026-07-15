# 公開手順書(初めての方向け)

このアプリをグループLINEで使えるようにするまでの手順です。
所要時間はおよそ30分。すべて無料で完了します。

作業は3つのサービスに分かれます:

| サービス | 役割 | 作るもの |
|---|---|---|
| LINE Developers | LINEログイン | LINE Loginチャネル + LIFFアプリ |
| Supabase | データ保存 | PostgreSQLデータベース |
| Render | アプリの公開 | Webサービス |

---

## STEP 1: Supabase(データベース)

1. https://supabase.com/ にアクセスし、GitHubアカウント等でサインアップ
2. 「New project」でプロジェクトを作成
   - Name: 任意(例: `line-order`)
   - Database Password: 強いパスワードを設定して**必ず控える**
   - Region: `Northeast Asia (Tokyo)` を推奨
3. 作成完了後、画面上部の「Connect」ボタンをクリック
4. 「Connection string」の **URI** タブを選び、`Transaction pooler` の接続文字列をコピー
   - `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres` のような形式
5. `[YOUR-PASSWORD]` の部分を手順2のパスワードに置き換える
   → これが **`DATABASE_URL`** になります

※ テーブルはアプリの初回起動時に自動で作成されるため、SQL操作は不要です。

## STEP 2: LINE Developers(LINEログイン)

1. https://developers.line.biz/console/ にLINEアカウントでログイン
2. Provider(会社/団体名の入れ物)を作成。既にあればそれを使用
3. 「新規チャネル作成」→ **「LINEログイン」** を選択
   - ※「Messaging API」ではありません。Botは使いません
   - チャネル名: 任意(例: `グッズ注文`)※「LINE」を含む名前は不可
   - アプリタイプ: 「ウェブアプリ」にチェック
4. 作成後、「チャネル基本設定」タブの **チャネルID**(数字)を控える
   → これが **`LINE_LOGIN_CHANNEL_ID`** になります
5. 「LIFF」タブ →「追加」でLIFFアプリを作成
   - LIFFアプリ名: 任意(例: `注文フォーム`)
   - サイズ: **Full**
   - エンドポイントURL: 仮でOK(例: `https://example.com`)。STEP 3の後で書き換えます
   - Scope: **`openid` と `profile` の両方に必ずチェック**
   - ボットリンク機能: OFF
6. 作成された **LIFF ID**(`1234567890-AbcdEfgh` のような形式)を控える
   → これが **`LIFF_ID`** になります
7. チャネルを「公開」状態にする(開発中のままだと本人しか使えません)

## STEP 3: Render(アプリの公開)

1. このリポジトリの変更を `main` ブランチに取り込む(プルリクエストをマージ)
2. https://render.com/ にサインアップし、「New +」→「Web Service」
3. このGitHubリポジトリを接続
   - Build Command: `npm install` / Start Command: `npm start`(自動設定されます)
   - Plan: Free
4. 「Environment」で環境変数を設定:

   | Key | Value |
   |---|---|
   | `LIFF_ID` | STEP 2-6 で控えたLIFF ID |
   | `LINE_LOGIN_CHANNEL_ID` | STEP 2-4 で控えたチャネルID |
   | `DATABASE_URL` | STEP 1-5 の接続文字列 |
   | `ADMIN_PASSCODE` | 管理者用パスコード(取りまとめ役だけが知る別の文字列) |
   | `SESSION_SECRET` | ランダムな長い文字列(パスワード生成ツール等で作成) |
   | `APP_TITLE` | 画面に出すタイトル(任意。例: `〇〇会 Tシャツ注文`) |

5. デプロイ完了後、`https://xxxx.onrender.com` というURLが発行される
6. **LINE DevelopersのLIFF設定に戻り**、エンドポイントURLをこのURLに書き換える

## STEP 4: グループLINEに掲載

1. LIFFのURL `https://liff.line.me/{LIFF ID}` を確認
   (LIFF IDが `1234567890-AbcdEfgh` なら `https://liff.line.me/1234567890-AbcdEfgh`)
2. グループLINEの**ノート**に以下のように投稿し、**アナウンス(ピン留め)**する:

   > 🎽 グッズ注文はこちらから
   > https://liff.line.me/xxxxxxxxxx-xxxxxxxx

3. メンバーがリンクをタップすると、LINE内でアプリが開き、すぐ注文画面が表示されます。
   注文フォームで名前を入力して登録します(友人の分を代わりに入力してもOK)。

---

## 運用のヒント

- **管理者になるには**: アプリ画面の一番下の「管理者モード」をタップし、
  `ADMIN_PASSCODE` を入力。全員の注文を編集・削除できるようになります
- **価格を設定するには**: 管理者モードにした後、単価表セクションの「価格を設定」から
  Tシャツ代(サイズ別)・スクリーン版代・スクリーン工賃を入力。全員の画面に単価と金額が即時反映されます
- **発注するとき**: 集計セクションの「CSV 日本語」または「CSV ไทย(タイ語)」ボタンで
  明細CSV(単価・金額入り)をダウンロード。Excelでそのまま開けます
- **完成品を渡すとき**: 「受け渡しチェック」セクションで、受け取った人が自分の行にチェック。
  チェックできるのはその注文を入力した本人と管理者だけです(代行入力分は入力者がチェック)。
  「残数(未受け渡し)」に何がいくつ残っているかが自動で表示されます
- **選択肢(色・サイズ等)を変えたいとき**: `shared/constants.js` を編集してデプロイ

## よくあるトラブル

| 症状 | 原因と対処 |
|---|---|
| 「LIFFの初期化に失敗」 | LIFF IDの設定ミス、またはエンドポイントURLがRenderのURLと不一致 |
| 「IDトークンを取得できません」 | LIFFのScopeで `openid` / `profile` がOFF。両方ONにする |
| 本人以外がログインできない | LINE Loginチャネルが「開発中」のまま。「公開」に変更する |
| 初回アクセスが遅い(30秒程度) | Render無料プランのスリープ復帰。2回目以降は速くなります |
| データが消えた | `DATABASE_URL` 未設定でファイル保存になっていた。Supabaseを設定する |
