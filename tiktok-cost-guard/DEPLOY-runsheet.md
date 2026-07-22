# デプロイ逐次ランシート(Phase 0)

Apps Scriptに貼って公開するまでを、1手ずつ。所要15〜20分。**上から順に**やればOK。
つまずいたら、その手順番号をチャットに書いてください。

---

## 準備:貼り付け元(GitHub)

6ファイルの中身はこのブランチにあります。各リンクを開き、右上の **📋(Copy raw file)** で全文コピー:

- Code.gs → `tiktok-cost-guard/Code.gs`
- Rules.gs → `tiktok-cost-guard/Rules.gs`
- Notifications.gs → `tiktok-cost-guard/Notifications.gs`
- TikTok.gs → `tiktok-cost-guard/TikTok.gs`
- Index.html → `tiktok-cost-guard/Index.html`
- appsscript.json → `tiktok-cost-guard/appsscript.json`

GitHubの場所:`Mana-Thai/line-ai-chatbot` → ブランチ `claude/tiktok-ad-scaling-nyacta` → フォルダ `tiktok-cost-guard`

---

## STEP 1 — プロジェクトを作る

1. Chromeで **https://script.google.com** を開く(いつものGoogleアカウントでログイン)
2. 左上 **「新しいプロジェクト」** をクリック
3. 左上のプロジェクト名(「無題のプロジェクト」)をクリック →  **`TikTok LIVE Cost Guard`** に変更 → OK

## STEP 2 — Code.gs を貼る

4. 最初から開いている **`コード.gs`(Code.gs)** をクリック
5. エディタ内を **Ctrl+A → Delete** で全消し
6. GitHubの **Code.gs** をコピーして、ここに **貼り付け**
7. **Ctrl+S**(保存)

## STEP 3 — 残りのスクリプト3つを追加

各ファイルで同じ操作を繰り返す(Rules → Notifications → TikTok):

8. 左「ファイル」の **＋** → **「スクリプト」**
9. 名前に **`Rules`** と入力(`.gs` は付けない)→ Enter
10. 開いたら中を全消し → GitHubの **Rules.gs** を貼り付け
11. 同様に **`Notifications`** を作成 → **Notifications.gs** を貼り付け
12. 同様に **`TikTok`** を作成 → **TikTok.gs** を貼り付け
13. **Ctrl+S**

## STEP 4 — Index(HTML)を追加

14. 左「ファイル」の **＋** → **「HTML」**
15. 名前に **`Index`** と入力 → Enter
16. 開いたHTMLの中を全消し → GitHubの **Index.html** を貼り付け
17. **Ctrl+S**

## STEP 5 — appsscript.json を差し替え

18. 左の歯車 **⚙️「プロジェクトの設定」** を開く
19. **「エディタで『appsscript.json』マニフェスト ファイルを表示する」** を **オン**
20. 左メニューの **「エディタ(< >)」** に戻る
21. 左に現れた **`appsscript.json`** をクリック
22. 中を全消し → GitHubの **appsscript.json** を貼り付け → **Ctrl+S**

## STEP 6 — 初期設定を実行(★承認あり)

23. 上部中央の関数プルダウンで **`setupSystem`** を選ぶ
24. **「実行」** をクリック
25. **「承認が必要です」** → **「権限を確認」**
26. 使うGoogleアカウントを選択
27. **「Googleで確認されていません」** 画面が出たら:
    - 左下の **「詳細」** をクリック
    - **「TikTok LIVE Cost Guard(安全でないページ)に移動」** をクリック
28. 権限一覧が出る → 下の **「許可」** をクリック
29. 下部の **「実行ログ」** に赤いエラーが無ければ成功(`✅ セットアップ完了` が出る)

## STEP 7 — Sheetsができたか確認

30. Googleドライブ(drive.google.com)で **「TikTok LIVE Cost Guard」** を開く
31. 下タブに **SETTINGS / LIVE_SESSIONS / METRICS / DECISIONS / ALERT_LOG / DASHBOARD / LINE_IDS** があればOK

## STEP 8 — テスト(公開前の動作確認)

32. Apps Scriptに戻り、右上 **「デプロイ」** → **「デプロイをテスト」**
33. 種類が **「ウェブアプリ」** になっているのを確認 → 出た **テストURL(/dev)** をコピー
34. 新しいタブでそのURLを開く
35. LIVE名「テストLIVE」→ **▶ LIVEを開始**
36. 広告費 `50` / 注文 `5` / GMV `500` → **記録** → **CPA 10・🟢緑** を確認
37. 広告費 `100` / 注文 `5` / GMV `550` → **記録** → **CPA 20・🟡黄** を確認
38. **LIVE終了** → 新しいLIVEを開始 → 広告費 `100` / 注文 `0` / GMV `0` → **記録** → **🔴「無注文のまま上限到達」** を確認
39. 3つとも想定どおりなら合格

## STEP 9 — 本番デプロイ(/exec URL発行)

40. 右上 **「デプロイ」** → **「新しいデプロイ」**
41. 左上「種類の選択(歯車)」→ **「ウェブアプリ」**
42. 説明:`初回運用版`
43. **実行するユーザー:自分**
44. **アクセスできるユーザー:自分のみ**(まずは自分だけ。※LINE通知を付ける時に「全員」へ変更)
45. **「デプロイ」** をクリック → 出た **`/exec` で終わるURL** をコピーして保存

## STEP 10 — スマホで使う & 売り手に渡す

46. ライブで使うスマホで **/exec のURL** を開く(同じGoogleアカウントでログイン)
47. Chromeメニュー → **「ホーム画面に追加」**
48. 売り手に渡すもの2つ:
    - **/exec のURL**
    - **`USAGE-th.md`**(タイ語の使い方。スクショでOK)
49. 売り手に「⚙️で5項目(CPA目標・粗利率・手数料・クーポン・無注文上限)だけ先に設定してね」と伝える

---

## 完了後

- **まず1回、実ライブで動かす**(これがこの道具の本番)。
- LINE通知(Phase 1)を足すときは `README.md` の「LINE通知(Phase 1)」へ。
  → その時だけ STEP 9-44 のアクセスを **「全員」** に変えて再デプロイが必要。

## よくある詰まり

- **「承認が必要です」が怖い** → 自作スクリプトなので正常。STEP 27 の「詳細→移動」で進む。
- **実行ログにエラー** → だいたい貼り付け漏れ。該当ファイルを開き直して STEP をやり直す。
- **画面が真っ白** → `Index` の名前が正しいか(大文字 I)、HTMLを貼り忘れていないか確認。
