---
name: order-app-regression
description: グッズ注文とりまとめアプリ(server.js)を変更した後に実行するフルリグレッションテスト。注文CRUD・一律価格の計算・権限制御(401/403)・編集ロック(409)・SSEリアルタイム反映・支払い/受け渡しチェック・日本語/タイ語CSVを、curlとPlaywrightの複数ユーザー同時セッションで検証する。「リグレッションテスト」「動作確認して」「テストして」と言われたとき、注文アプリのコードを変更したとき、PR作成前に必ず使う。
---

# 注文アプリ フルリグレッションテスト

対象: `server.js` + `lib/` + `shared/constants.js` + `public/`(グッズ注文とりまとめアプリ)。
変更に関係する項目だけでなく、以下のチェックリストを**全部**回す(過去に既存機能の退行が起きやすかったため)。

## 1. テスト用サーバーの起動

`DATABASE_URL` を設定しなければローカルJSONファイル保存(`data/orders.json`)になる。
毎回まっさらな状態から始める:

```bash
rm -rf data
ALLOW_INSECURE_DEV=1 ADMIN_PASSCODE=admin123 PORT=3000 node server.js
```

- `ALLOW_INSECURE_DEV=1` でLINEログイン不要のdevログイン画面が有効になる(名前だけでログイン可能)
- 起動ログに `🛒 Order app is running on port 3000` が出ればOK(`LIFF_ID is not set` の警告は無視してよい)
- バックグラウンド起動して、テスト後に必ずプロセスを止める

## 2. APIレベルのテスト(curl)

トークン取得:

```bash
TOKEN_A=$(curl -s -X POST localhost:3000/api/auth -H 'Content-Type: application/json' \
  -d '{"devUser":{"userId":"dev-a","name":"Aさん"}}' | jq -r .token)
TOKEN_B=$(curl -s -X POST localhost:3000/api/auth -H 'Content-Type: application/json' \
  -d '{"devUser":{"userId":"dev-b","name":"Bさん"}}' | jq -r .token)
# 管理者化(既存トークンに admin 権限を付けた新トークンが返る)
TOKEN_ADMIN=$(curl -s -X POST localhost:3000/api/admin -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' -d '{"adminPasscode":"admin123"}' | jq -r .token)
```

必須チェック(期待ステータスを必ず確認):

| # | 操作 | 期待 |
|---|---|---|
| 1 | 認証なしで `GET /api/orders` | 401 |
| 2 | Aが注文作成 `POST /api/orders`(複数サイズ・複数カラー) | 200 |
| 3 | 不正入力(不明カラー、items空、数量が範囲外、胸ロゴ不正) | 400 |
| 4 | BがAの注文を `PUT /api/orders/:id` | 403 |
| 5 | 管理者がAの注文を編集 | 200 |
| 6 | 非管理者が `PUT /api/pricing` | 403 |
| 7 | 管理者が `PUT /api/pricing` | 200 |
| 8 | 非管理者が `PUT /api/designs` | 403 |
| 9 | Aがロック保持中にBが `POST /api/lock` | 409 |
| 10 | BがAの注文の `POST /api/orders/:id/payment` / `delivery` | 403 |
| 11 | 存在しない明細への delivery(`itemIndex` 不正) | 400 |
| 12 | 注文編集で明細が消えたとき、対応する受け渡しチェックが自動削除される | orders応答で確認 |

注文ボディの例(選択肢の正確な文字列は `shared/constants.js` を必ず参照。胸ロゴは
`有(ロゴ小 白)` など6種、カラーは `1.BK` 形式+`持ち込み`):

```json
{"orderName":"Aさん","chestLogo":"有(ロゴ小 白)","backPrint":"有",
 "items":[{"size":"M","quantities":{"1.BK":2,"持ち込み":1}}],"note":"テスト"}
```

## 3. UIレベルのテスト(Playwright・3ユーザー同時)

1つのbrowserに対して `browser.newContext()` を3つ作り、A(一般)/B(一般)/C(管理者)として同時に開く。
devログインは `#dev-name` に名前を入れて `#dev-login-btn` をクリック。
管理者化はページ最下部の `#admin-link` → `#admin-passcode-input` → `#admin-ok`。

※ Claudeのリモート環境ではChromiumが `/opt/pw-browsers/chromium` にプリインストール済み
(`PLAYWRIGHT_BROWSERS_PATH` 設定済み)。`playwright install` は実行しないこと。

チェックリスト:

1. **注文の作成・編集**: Aが「+注文を追加」→ 胸ロゴ/バックプリントのチップ選択 →
   「＋サイズを追加」で複数サイズ×複数カラーを入力 → 保存。編集で開き直すと入力値が復元される
2. **SSEリアルタイム反映**: Aの注文追加・編集・削除が**リロードなしで**Bの画面に現れる
3. **編集ロック**: Aがフォームを開いている間、Bが開こうとすると「Aさんさんが編集中です」ポップアップ。
   Bの画面上部にロックバナーが出る。Aが閉じるとバナーが消えBが開ける
4. **権限表示**: Bの画面ではAの注文カードに編集/削除ボタンが無い。支払い・受け渡しの
   チェックボックスがdisabled。管理者Cは全部操作できる
5. **価格設定(管理者C)**: 「価格を設定」でサイズ別価格+持ち込み価格を入力 → 保存。
   A/Bの画面の単価表・注文カードの@単価・金額が**リロードなしで**更新される
6. **金額の手計算照合**: 価格は工賃込みの一律(計算・切り上げなし)。
   単価 = `持ち込み`なら持ち込み価格、それ以外は該当サイズの価格。
   注文金額 = Σ(数量×単価)。名前別合計・総合計を**必ず事前に手計算した期待値**と照合する
7. **支払いチェック**: 本人がチェック→確認者名と日時が表示される。名前別合計の「支払い」列が
   済/未/一部(残額)で変わり、合計行に未収額(全員済なら「全員済 ✓」)が出る
8. **受け渡しチェック+残数**: 本人がチェック→進捗「受け渡し済み X / Y枚」が増え、
   残数表からその分が消える。全部チェックすると完了バナー
9. **サンプル画像(管理者C)**: 価格設定画面から画像アップロード → 選択チップに画像が付き、
   A/Bにもリアルタイム反映。非管理者にはアップロードUIが出ない
10. **CSV(日本語/タイ語)**: `#csv-btn` / `#csv-th-btn` のダウンロードを取得して中身を検証。
    ヘッダー14列(名前〜更新日時)、タイ語版は固定文言がタイ語(例: 胸ロゴ→โลโก้หน้าอก、
    済→รับแล้ว)、名前・備考は原文のまま、BOM付きUTF-8、単価・金額がUIと一致

## 4. 結果報告

各項目について ✅/❌ と、金額系は「期待値 vs 実測値」を並べて報告する。
1つでも❌があれば修正して**最初から**全項目をやり直す。
終了後は `rm -rf data` とサーバープロセスの停止を忘れない。
