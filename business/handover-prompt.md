# 引き継ぎプロンプト（Claude Code / OpenAI Codex 共用）

> 最終更新: 2026-07-22
>
> 下のコードブロック全体を、そのまま次のAIエージェントへ渡す。
> セッション開始時と終了時に内容を最新化し、必ずコミット・pushすること。

---

```text
あなたは Mana-Thai/line-ai-chatbot リポジトリで、副業立ち上げ作業を引き継ぎます。

## 0. 最初に確認すること

- リポジトリ: https://github.com/Mana-Thai/line-ai-chatbot
- 作業ブランチ: claude/ai-side-income-plan-039ya4
- デザインv3・月商20万モデルのチェックポイント: `19795c1`
  （この引き継ぎ文書の更新コミットは、その後の最新HEADとして確認すること）
- このPCで使った専用worktree:
  C:\Users\ASUS\Documents\Codex\line-ai-chatbot-side-income
- 最初に `git status --short --branch` と `git fetch origin` を実行し、同じブランチに
  他エージェントの更新がないか確認する。強制pushは禁止。
- `CLAUDE.md` と `AGENTS.md` を必ず読む。
- Skill正本は `.claude/skills/`。Skillを追加・変更した場合だけ
  `npm run sync-skills` を実行して `.agents/skills/` と両方コミットする。

## 1. 事業の背景と目標

- オーナーは在タイ日本人。子供の養育のため副収入が必要。
- 累計収入目標:
  - 2026-08-15までに 10,000 THB
  - 2026-10-15までに 100,000 THB
  - 2027-01-15までに 200,000 THB
- 次の事業目標: **月商200,000 THBを3ヶ月連続**。
- 月商目標は小口動画の大量販売ではなく、次の商品階段で作る:
  - Mini Gift Film 初回実売テスト1,290 THB / 検証後1,500〜2,500 THB
  - Story Film 4,900 THB
  - Heirloom Film 12,000 THB〜
  - Shop Story Campaign 25,000 THB〜
  - Web・注文導線 30,000 THB〜
  - LINE AI Care 導入25,000 THB〜 + 月額4,900〜6,000 THB
- 全体計画の正本: `business/income-plan.md`
- 短期: ギフト動画・アパレルデザインの小口受注
- 中期: 業務Webアプリ + 店舗向けLINE AI Bot
- 長期: 月額契約など継続収入化
- 受注台帳: `business/orders.csv`（現在は実受注0、SAMPLE行のみ）

## 2. 現在の商品コンセプト

タイの母の日（8月12日）に向け、写真と言葉から作る30秒〜1分のギフト動画を
主力商品として販売準備中。母の日の初回実売テスト5枠は1,290 THB。
3件の感想または5件販売後に1,500 THBへ上げる。

オーナーから「安っぽい。受け取った人が感動して涙を流し、心からありがとうと
感じるデザインに一新してほしい」、さらに「月々20万THBへ伸ばし、アートの要素を
増やしたい」と指示があり、その後「品質は良いが少し怖い」との評価を受けた。
現行代表作は明るい現代アート短編v4、ポートフォリオv5、告知v4へ刷新済み。

デザイン原則:
- 派手なハート、原色、絵文字、丸型カードを多用しない。
- 感情を説明するのではなく、余白・光・記憶のモチーフ・静かな言葉で伝える。
- 母の日を花・笑顔・ハートで説明しない。手漉き紙、皺、距離、縫い目、朝の光で愛の痕跡を見せる。
- サイトは「自然光の中で一緒につくる記憶」の世界観。紙の繊維、タイの水色、朝の金色、余白。
- タイ語ファースト、日本語併記。スマホとLINE内ブラウザを最優先する。

## 3. 完了済み

### 重要な作業履歴（古い順）

- `2302138` — ポートフォリオを「静かなギフトアトリエ」へ刷新。
- `6e27017` — 保存場所、再生成手順、未承認作業を含む引き継ぎ文書を全面更新。
- `19795c1` — 月商20万THBの商品階段、90日営業KPI、ポートフォリオv3、
  母の日告知v2を追加。
- `fe17c73` — 母の日代表作を現代アート短編v3へ刷新し、タイ語フォント選択を修正。
- `928b51e` — 画像正本、ポートフォリオv4、母の日告知v3を公開面へ反映。
- 以後の履歴は `git log --oneline --decorate -20` で確認する。

コミット履歴だけでは制作物の正本が分からない場合は、必ず下記「データと正本の場所」を
優先する。`gift-video/orders/*/input/` と `output/` はgit管理外であり、完成データの正本ではない。

### 事業基盤

- `business/income-plan.md` 作成済み。
- 運営Skill 4つを追加済み:
  - `line-ai-bot`
  - `biz-promotion`
  - `biz-portfolio`
  - `biz-weekly-review`

### ギフト動画v2（3本）

- 母の日: 手紙 → 手を包む記憶 → 一輪のジャスミン
- 誕生日: 静かな夜 → 一本の蝋燭 → 夜明け
- 記念日: 古い写真 → 手を取り合う瞬間 → 続いていく道
- SVG正本、文言、文字比率、カメラワーク、BGM、ポスターを更新済み。
- 縦型1080x1920・横型1920x1080の計6出力で `qc.py` ALL PASS。
- ラウドネス実測:
  - 母の日 -14.6 LUFS
  - 誕生日 -14.4 LUFS
  - 記念日 -14.5 LUFS
- Windows FFmpeg 8で `C:` がfilter_complex区切りと誤認される問題を
  `gift-video/scripts/common.py::ff_quote` で修正済み。
- 上記3本は旧世代の比較・再生成用。公開ポートフォリオの代表作からは外した。

### 母の日アートフィルムv3（旧版・比較用）

- 作品名: **The Distance Between Two Hands / 二つの手のあいだ**。
- 三幕構成: 手漉き紙に残る子どもの手の影 → 紙越しの老いた手と大人の手を結ぶ金糸 →
  夜明けの部屋に残る繕われた白いシャツ。
- 花、ハート、顔、ベクター図形、装飾額縁を排除し、現代ギャラリー／アナログ写真の質感へ変更。
- 30秒・1080x1920・H.264/AAC。QC ALL PASS、-14.2 LUFS、TP -1.93 dBTP。
- 2秒、12秒、25秒、28.5秒を目視し、タイ語グリフ、改行、本文から献辞への消失を確認済み。
- タイ語を含む注文はLeelawadee UI / Noto Sans Thaiを優先するよう制作パイプラインを修正。
- 画像品質は高いが、暗室、隔たり、空席が一部の鑑賞者に恐怖・喪失を連想させたため公開代表作から外した。

### 母の日アートフィルムv4（現行代表作）

- 作品名: **The Light We Make Together / ふたりでつくる光**。
- 三幕構成: 朝の光で母娘がサイアノタイプをつくる → 同じ白布を金糸で一緒に繕う →
  タイの明るい海辺を手をつないで歩く。
- v3の写真品質、紙・布・金糸の物質感、遅いカメラは維持。暗い空洞、隔たり、空席、別れの象徴を排除。
- BGMは低いドローンと紙の軋みを廃止し、朝の空気、穏やかな波、Dメジャー五音音階で新規生成。
- 30秒・1080x1920・H.264/AAC。QC ALL PASS、-14.4 LUFS、TP -4.35 dBTP。
- 2秒、12秒、25秒、28.5秒を目視し、温度感、人物、タイ語、改行、終幕を確認済み。

### ポートフォリオv2

- `portfolio/index.html` と `portfolio/style.css` を全面刷新済み。
- 新動画3本を中心に、感情の物語として見せる構成へ変更。
- `portfolio/images/ogp.html` と `ogp.jpg` も同じ世界観で再制作済み。
- ChromeでPC 1280x800、スマホ375x812を目視確認済み。
- スマホでタイ語見出しが横切れする問題を修正済み。
- 制作フローはスマホ1列表示、問い合わせCTAは44px以上を確保。
- ローカルのhref/src、viewport、title、OGP、LINEプレースホルダの機械確認PASS。
- 自己ホストフォント:
  - Kanit / Sarabun
  - Charm（手書き風）
  - Kanit Light

### ポートフォリオv3・商品階段

- ヒーロー作品にCharmの手書き文字「ความทรงจำที่ยังหายใจ」を追加。
- 「写真を並べるのではなく、声・光・沈黙を残す」というアトリエ宣言を追加。
- 商品表示をMini / Story / Heirloom / Shop Story / Web / LINE AI Careの6段階へ変更。
- 375px幅・1280px幅をChromeで再確認し、横切れなし。
- LINE URLは未確定のため `data-line-placeholder` を維持。
- GitHub Pages公開URL: https://mana-thai.github.io/line-ai-chatbot/
- 配信正本: `.github/workflows/portfolio-pages.yml`。作業ブランチの`portfolio/**`更新で自動配信。
- 公開前検査で自己ホストフォントが`fonts/fonts/`を参照する不具合を修正済み。

### ポートフォリオv4・母の日告知v3

- ヒーローの花ベクターを廃止し、v3の「二つの手と金糸」をギャラリープリントとして配置。
- 旧誕生日・記念日動画を代表作一覧から外し、v3を記憶／距離／繕いの三部作として展示。
- 告知は花・手紙・額縁のコラージュを廃止。一枚の展覧会ポスターとして再設計。
- `promo.png`は1080x1350。タイ語、日本語、1,290 THB、期限、CTAの表示を目視確認済み。
- 公開用動画は30秒のv3へ差し替え、ポスターと展示静止画2枚も更新。

### ポートフォリオv5・母の日告知v4

- ヒーロー、三部作、公開動画をv4の「つくる／繕う／歩く」へ差し替え。
- 告知は暗い展示ポスターから、朝の海と空を使った明るい作品ポスターへ変更。
- `promo.png`は1080x1350。価格、期限、CTA、日タイ文字の切れがないことを目視確認済み。
- ローカル375px / 1280pxでPlaywright確認済み。参照切れ0、300KB超のWeb画像0、
  HTMLと動画はHTTP 200。

### 母の日告知v2

- `business/promo/mothersday-2026/` を「静かなギフトアトリエ」の世界観へ刷新。
- `promo.html` が正本、`promo.png` が投稿用画像、`posts.md` が投稿文。
- 紙、手紙、金の糸、白ジャスミン、作品本編のジャスミン場面で記憶の層を表現。
- ハート主体の既存イラストは告知から除去。
- `promo.png` は1080x1350、目視確認済み。価格・期限・CTAの文字切れなし。
- 投稿文は日タイとも煽りを抑え、母の日はMini 1商品だけが伝わる文章へ更新。

### 母の日営業ローンチ（7/21開始・7/22再設計）

- 「商品不足ではなく未露出が原因」と判断し、受注3件までは新規制作を止める方針へ変更。
- 母の日の公開オファーをMini Gift Film 1商品へ集約。
- 初回実売テスト5枠は一律1,290 THB。未検証の通常価格2,500 THBを比較表示しない。
- 写真・感想の掲載許可は購入条件にしない。納品後、感想と掲載範囲を別々に任意で確認する。
- 申込締切8/5、納品8/11、写真10枚、30秒、縦横どちらか、修正2回。
- 個別営業は、接触1「サンプルを見てもらえるか」→接触2「感想を一問」→
  接触3「1,290 THBの固定範囲を提示」の3接触に分割。
- LINE公式アカウント開設は並行作業とし、営業開始の前提条件にはしない。
- 営業運用の正本: `business/sales/mothersday-2026/`
  - `launch-plan.md` — 7/21からの日程、KPI、売上10,000 THBモデル
  - `messages.md` — 日タイ個別文、紹介依頼、48時間追客、グループ投稿
  - `warm-leads.csv` — RYUSEI/STC/近隣店主/紹介者の15枠管理表
  - `intake.md` — 問い合わせ後のヒアリングと固定条件
  - `line-setup.md` — LINE公式アカウントの15分設定内容
  - `offer-brief.md` — 顧客、成果、固定範囲、採算、実売テスト
  - `marketing-decision.md` — ポジショニング、価格判断、KPIと根拠
- 週次レビュー: `business/reviews/2026-07-22.md`
- 告知画像とサイト母の日欄も単一オファー・初回5枠1,290 THBへ統一。

## 4. データと正本の場所

### 事業

- 全体計画: `business/income-plan.md`
- 引き継ぎ正本: `business/handover-prompt.md`
- 受注台帳: `business/orders.csv`
- 見積テンプレート: `business/templates/quote-template.html`
- 母の日告知: `business/promo/mothersday-2026/`
- 母の日営業運用: `business/sales/mothersday-2026/`
- 週次レビュー: `business/reviews/`

### ギフト動画

- SVG正本と再生成コード:
  `artwork/works/gift-video-samples/`
- シーン生成:
  `artwork/works/gift-video-samples/generate_scenes.py`
- BGM生成:
  `artwork/works/gift-video-samples/gen_bgm.py`
- テーマ別SVG:
  - `artwork/works/gift-video-samples/mothersday/scene1.svg`〜`scene3.svg`
  - `artwork/works/gift-video-samples/birthday/scene1.svg`〜`scene3.svg`
  - `artwork/works/gift-video-samples/anniversary/scene1.svg`〜`scene3.svg`
- 現行代表作の画像・美術設計・音源生成:
  - `artwork/works/gift-video-samples/mothersday-v4/scene1.png`〜`scene3.png`
  - `artwork/works/gift-video-samples/mothersday-v4/art-direction.md`
  - `artwork/works/gift-video-samples/mothersday-v4/gen_soundscape.py`
  - `mothersday-v3/`は暗い旧版の比較・履歴用として保持。
- SVG→PNG:
  `artwork/tools/rasterize.py`
- 静止画→動画:
  `gift-video/scripts/animate.py`
- 組み立て:
  `gift-video/scripts/assemble.py`
- QC:
  `gift-video/scripts/qc.py`
- 注文設定:
  - `gift-video/orders/sample-mothersday-v4/order.yaml`（現行代表作）
  - `gift-video/orders/sample-mothersday-v3/order.yaml`（旧版）
  - `gift-video/orders/sample-mothersday/order.yaml`
  - `gift-video/orders/sample-birthday/order.yaml`
  - `gift-video/orders/sample-anniversary/order.yaml`
- `gift-video/orders/*/input/` と `output/` はgit管理外。消えても正本から再生成できる。

### ポートフォリオ（git管理対象の公開用成果物）

- HTML: `portfolio/index.html`
- CSS: `portfolio/style.css`
- フォント: `portfolio/fonts/`
- 公開用軽量動画:
  - `portfolio/assets/sample-mothersday_portrait.mp4`
  - 旧birthday / anniversary動画は比較用として残るが、現在のページでは非表示。
- ポスター:
  - `portfolio/assets/sample-mothersday_poster.jpg`
  - `portfolio/assets/mothersday-study-making.jpg`
  - `portfolio/assets/mothersday-study-walking.jpg`
- OGP正本: `portfolio/images/ogp.html`
- OGP画像: `portfolio/images/ogp.jpg`

## 5. 動画を再生成する手順

必要環境:
- Python 3.10+
- PyYAML（`python -m pip install -r gift-video/requirements.txt`）
- ffmpeg / ffprobe
- 日本語フォント。Linuxでは `fonts-noto-cjk`、タイ語確認には `fonts-thai-tlwg`。
- Windowsでは `winget install --id Gyan.FFmpeg` で導入済み。

概略:

1. SVGを再生成:
   `python artwork/works/gift-video-samples/generate_scenes.py`
2. 各SVGを `artwork/tools/rasterize.py` で3840x2160 PNGへ変換。
3. `gift-video/scripts/animate.py` で各10秒、1920x1080のscene1〜3.mp4を生成。
   推奨プリセットは scene1=zoom-in / scene2=sway / scene3=zoom-out。
4. `gen_bgm.py <theme> <out.wav> 30` でBGMを生成し、mp3へ変換。
5. 各 `gift-video/orders/sample-*/input/` にscene1〜3.mp4とbgm.mp3を配置。
6. `gift-video/` で以下をテーマごとに実行:
   - `python scripts/precheck.py <order-id>`
   - `python scripts/assemble.py <order-id> --keep-work`
   - `python scripts/qc.py <order-id>`
7. ALL PASS後、portrait出力を `portfolio/assets/` の公開用ファイルへコピー。
8. 26秒付近のフレームをJPEG化し、各poster.jpgを更新。

注意:
- `precheck.py --all` は素材未配置の古い `sample-001` / `sample-002` も拾うため、
  今回の3本は個別IDで実行する。
- Windows PowerShellで絵文字出力が文字化けする場合は `$env:PYTHONUTF8='1'` を設定。
- 一時PNG/WAVやChromeプロファイルをコミットしない。

## 6. 次に行う作業（優先順）

### オーナー本人の情報・操作が必要

1. `warm-leads.csv` の候補01〜15を実際の表示名へ置き換える（個人情報は最小限）。
2. `messages.md` の接触1だけを15人へ個別送信する。価格や条件は最初から詰め込まない。
3. `line-setup.md` に従いLINE公式アカウントを本人ログインで作り、lin.ee URLを取得する。
4. LINE URL取得後、`portfolio/index.html` の `data-line-placeholder` と、`posts.md` の
   `<LINE URL>`を実URLへ差し替え、pushしてPagesの再配信を確認する。
5. LINE内ブラウザ、スマホ実機、LINEのOGPプレビューを確認し、
   `promo.png` + `posts.md`を対象グループへ週1回の範囲で投稿する。

### 返信・受注後にAIが実行できる作業

6. 返信者を `intake.md` → `biz-quote` → `orders.csv` の順で見積へ進める。
7. 受注後は `biz-delivery` に従い、透かしプレビュー → 入金 → 本納品を実施する。

## 7. 作業ルール

- 既存のユーザー変更を消さない。作業開始前にstatusとリモート差分を確認する。
- 区切りごとに日本語コミットし、
  `origin/claude/ai-side-income-plan-039ya4` へpushする。
- 非fast-forward時はfetchして差分を確認し、安全にrebase/mergeする。強制push禁止。
- 受注が発生したら `biz-order-ledger` Skillで `business/orders.csv` を更新する。
- 週次で `biz-weekly-review` を実行し、目標との差と次のアクション3つを出す。
- 固定文言は日タイ二言語。価格表示は顧客ごとにTHBかJPYの一方だけを使う。
- ギフト動画は `gift-video-run` / `illustration-animation` Skillに従い、
  必ずprecheck → assemble → qc → 目視確認まで行う。
- Web変更後は `website-quality-check` を実行する。
- 作業終了時にこの `business/handover-prompt.md` を最新化してコミットする。

## 8. 現在の状態

- ブランチはoriginと同期済み。
- 現行代表作は母の日アートフィルムv4。月商20万THBの商品階段・90日営業KPI、
  ポートフォリオv5、母の日告知v4へ更新済み。
- pro-marketing-directorとlaunch-ai-side-hustleの観点で母の日ローンチを再点検済み。
  段階はP0（初回受注の検証）。価格1,290 THB、3接触営業、掲載任意へ修正済み。
- 採算仮定は変動費50 THB、制作2.5時間で、1件あたり限界利益1,240 THB、
  時間あたり496 THB。オーナーが許容する最低時給は未確認。
- 7/25までの検証KPIは、接触1を15件、サンプル閲覧許可8件、相談4件、
  条件提示3件、有料受注1件。これは実績ではなく検証仮説。
- 実受注はまだ0件。
- LINE URL未確定。
- Chrome接続ランタイムの初期化エラー（`Cannot redefine property: process`）により、
  AI側からLINE公式アカウント作成画面の操作はできなかった。本人が `line-setup.md` で開設する。
- ポートフォリオはGitHub Pagesで公開済み: https://mana-thai.github.io/line-ai-chatbot/
- PagesはActions方式。`github-pages`環境には`main`と作業ブランチを許可済み。
- v5はローカル品質確認済み。push後、GitHub Pagesの375px / 1280px全画面、
  新動画14,578,499 bytes、展示静止画、CSS、OGPの本番配信を再確認すること。
- グループLINEへの告知未投稿。
- 実在する見込み客の連絡先・表示名はAIに渡されていないため、個別送信は未実行。
- 1,290 THBへの変更後、告知PNG（1080x1350）と公開ポートフォリオを目視確認済み。
```
