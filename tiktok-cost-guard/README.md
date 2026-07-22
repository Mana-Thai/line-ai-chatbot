# TikTok LIVE Cost Guard(無料版)

TikTokライブ販売中の広告コストを見張り、**CPA(注文1件あたり広告費)が危険域に入ったら
緑/黄/赤で自動判定**する道具。月1,990バーツの有料ツールの中核機能を、
**Google Apps Script + Google Sheets だけ(月額0円・サーバー/DB不要)** で再現する。

- **Phase 0(このフォルダ):** 手入力 + 自動判定 + Google Sheets保存 ← まずここを動かす
- **Phase 1:** 赤のときに LINE 通知(`Notifications.gs` にプロパティを足すだけ)
- **Phase 2:** TikTok API で自動取得・キャンペーン自動作り直し(`TikTok.gs`・要API審査)

> なぜ段階的か:TikTokのレポートAPIは遅延があり(費用は最大11時間遅れることがある)、
> 自動作成はアカウントリスクを伴う。まず一番効く「2画面見張りの手間を消す」から始める。

## まず触ってみる(Googleアカウント不要)

`standalone-test.html` は、Apps Scriptのセットアップ前に**判定ロジックだけを今すぐ試せる単体版**。
判定(CPA/損益分岐/緑黄赤)は `Rules.gs` と完全に同一で、保存はブラウザのlocalStorage。

- スマホ:このファイルを開く(またはチャットで共有した公開URLを開く)→「ホーム画面に追加」
- 使い方:LIVE開始 → 累計の 広告費/注文数/GMV を入れて「記録」→ 色で判定
- これで色の出方・しきい値の感触を確かめてから、本番のGoogle Sheets版を作ると失敗しにくい。

## ファイル一覧

| ファイル | 役割 |
|---|---|
| `Code.gs` | メイン。`setupSystem` / Webアプリ / 画面から呼ぶ関数 / 5分監視トリガー |
| `Rules.gs` | 判定エンジン。CPA・損益分岐CPA・ROI を計算し 緑/黄/赤 を返す(**中核**) |
| `Notifications.gs` | 通知。ALERT_LOG記録+(設定時)LINE push。LINE webhook(`doPost`)で通知先IDを自動取得 |
| `TikTok.gs` | TikTok連携のプレースホルダ(未設定なら何もしない) |
| `Index.html` | スマホ用の入力画面(タイ語+日本語) |
| `appsscript.json` | マニフェスト(タイムゾーン・権限・Webアプリ設定) |
| `standalone-test.html` | Apps Script不要のお試し単体版(localStorage・判定は Rules.gs と同一) |
| `USAGE-th.md` | 売り手(タイ語)に渡すライブ中の使い方ワンページ。スクショして共有可 |

## 判定ロジック(Rules.gs)

- **CPA** = 広告費 ÷ 注文数
- **損益分岐CPA** = 平均注文単価(GMV÷注文数) ×(粗利率 − TikTok手数料率 − クーポン率)
  → これを超えると「1件売るごとに赤字」
- 判定:
  - 🟢 **緑** … CPA ≤ 目標CPA かつ 損益分岐内 → このまま継続
  - 🟡 **黄** … 目標CPA超過、または損益分岐の手前バッファに侵入 → 作り直し検討
  - 🔴 **赤** … CPA > 損益分岐(赤字)/ または 無注文のまま上限到達 → **今すぐ新キャンペーン**

### 初期設定(SETTINGSシート・後から変更可)

| キー | 初期値 | 意味 |
|---|---|---|
| `CPA_TARGET` | 15 | 目標CPA(バーツ) |
| `GROSS_MARGIN_RATE` | 0.40 | 粗利率(40%) |
| `TIKTOK_FEE_RATE` | 0.05 | TikTok手数料率 |
| `COUPON_RATE` | 0.03 | クーポン/割引の平均率 |
| `NO_ORDER_COST_LIMIT` | 80 | 無注文のままこの広告費に達したら赤 |
| `YELLOW_BUFFER_RATE` | 0.15 | 損益分岐の手前どこから黄にするか |

## セットアップ手順(コピペ方式)

1. Chromeで <https://script.google.com> を開き「新しいプロジェクト」。
   プロジェクト名を **`TikTok LIVE Cost Guard`** に変更。
2. 最初の `コード.gs` の中身を全消しして、このフォルダの **`Code.gs`** を貼り付け → 保存。
3. 左の「ファイル」＋ →「スクリプト」で **`Rules` / `Notifications` / `TikTok`** を作り、
   それぞれ同名ファイルの中身を貼り付け(`.gs` は付けなくてよい)。
4. ＋ →「HTML」で **`Index`** を作り、`Index.html` の中身を貼り付け → すべて保存。
5. 歯車「プロジェクトの設定」→「`appsscript.json` マニフェストをエディタで表示」をオン。
   エディタに出た `appsscript.json` を全消しして、このフォルダの `appsscript.json` を貼り付け → 保存。
6. 上部の関数選択で **`setupSystem`** を選び「実行」→ 承認を許可。
   成功すると Google Sheets(SETTINGS/LIVE_SESSIONS/METRICS/DECISIONS/ALERT_LOG/DASHBOARD/LINE_IDS)と
   5分ごとの監視トリガーが自動作成される。
7. 「デプロイ」→「デプロイをテスト」→「ウェブアプリ」でテストURL(`/dev`)を開く。
8. 動作テスト(下記)。
9. 問題なければ「デプロイ」→「新しいデプロイ」→「ウェブアプリ」。
   実行ユーザー=自分 / アクセス=**最初は自分のみ**。`/exec` のURLを保存。
   → スマホでそのURLを開き、Chromeメニュー「ホーム画面に追加」。

> 母親が別のGoogleアカウントで使う場合は、動作確認後にアクセス設定を変更する。
> いきなり一般公開にはしない。

## 動作テスト

新しいプロジェクトのデフォルト設定のまま:

| 入力(累計) | 期待される結果 |
|---|---|
| LIVE開始 → 広告費50 / 注文5 / GMV500 | CPA **10** → 🟢 緑 |
| 広告費100 / 注文5 / GMV550 | CPA **20**(目標15超過) → 🟡 黄 |
| 別LIVEで 広告費100 / 注文0 / GMV0 | 🔴 **「無注文のまま上限到達」** |

## LINE通知(Phase 1)

赤判定のときにLINEへ自動通知する。**構築はすべて自分(製作者)側で完結**でき、
知り合い(アカウント主)は「Botを友だち追加 or グループに招待」する1回だけ。
旧「LINE Notify」は2025年に終了 → Messaging API の push を使う(無料通数の範囲内)。
LINE未設定の間も、赤判定は必ず ALERT_LOG シートに残る。

### 手順

1. **LINE公式アカウント(Bot)を作る**
   [LINE Developers](https://developers.line.biz/) でプロバイダー作成 →
   「Messaging API」チャネルを新規作成。
2. **チャネルアクセストークン(長期)を発行**して控える。
   同チャネルの設定で **応答メッセージ=オフ / Webhook=オン** にする。
3. **`LINE_CHANNEL_TOKEN` をスクリプトプロパティに設定**
   「プロジェクトの設定 → スクリプト プロパティ」に `LINE_CHANNEL_TOKEN` = 発行トークン。
4. **Webアプリを「アクセス=全員」で再デプロイ**(LINEのサーバーから受信するため必須)。
   「デプロイ → デプロイを管理 → 編集(鉛筆) → アクセスできるユーザー=**全員**」→ 更新。
   > 注意:URLを知っている人は入力画面も開ける。URLは共有範囲を絞って扱う。
5. **その `/exec` URL を LINE の Webhook URL に設定**(Messaging APIチャネルの設定)。
6. **通知先を登録(自動)**
   通知を受けたいLINE(主本人 or 主と自分のグループ)で、**Botを友だち追加 or グループに招待**。
   Botに一言送ると、`LINE_TO` が**自動で設定**され、`LINE_IDS` シートにIDが記録される。
   Botが「✅ 通知先として登録しました」と返信すれば成功。
7. **テスト送信**:Apps Scriptエディタで関数 **`testLineAlert`** を実行 → LINEにテスト通知が届けばOK。
   状態確認は **`showLineConfig`** を実行(トークン/通知先の設定有無をログ表示)。

> グループに送りたい場合は、主と自分が入ったLINEグループにBotを招待するのが簡単。
> 通知先を変えたいときは、`LINE_TO` を手で書き換えるか、`LINE_IDS` シートのIDをコピーして設定。

## TikTok自動化を後から足す(Phase 2)

`TikTok.gs` のプレースホルダを実装し、スクリプトプロパティに
`TIKTOK_ACCESS_TOKEN` / `TIKTOK_ADVERTISER_ID` / `TIKTOK_STORE_ID` を設定する。
API v1.3 の `gmv_max` 系エンドポイント利用には審査/認可が必要。
自動作成は「通知 → ボタンで半自動 → 完全自動(回数上限・日次予算キャップ付き)」の順で慎重に。
