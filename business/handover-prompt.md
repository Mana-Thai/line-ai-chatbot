# 引き継ぎプロンプト（Claude Code / OpenAI Codex 共用）

> 最終更新: 2026-07-21
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
  - Mini Gift Film 1,500〜2,500 THB
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
主力商品として販売準備中。価格は1,500 THB〜。

オーナーから「安っぽい。受け取った人が感動して涙を流し、心からありがとうと
感じるデザインに一新してほしい」、さらに「月々20万THBへ伸ばし、アートの要素を
増やしたい」と指示があり、動画v2、ポートフォリオv3、告知v2へ刷新済み。

デザイン原則:
- 派手なハート、原色、絵文字、丸型カードを多用しない。
- 感情を説明するのではなく、余白・光・記憶のモチーフ・静かな言葉で伝える。
- 母の日はタイ文化に合わせ、水色（สีฟ้า）・白ジャスミン・控えめな金を使う。
- サイトは「静かなギフトアトリエ」の世界観。紙色、白ジャスミン、真鍮色、深い青緑。
- タイ語ファースト、日本語併記。スマホとLINE内ブラウザを最優先する。

## 3. 完了済み

### 重要な作業履歴（古い順）

- `2302138` — ポートフォリオを「静かなギフトアトリエ」へ刷新。
- `6e27017` — 保存場所、再生成手順、未承認作業を含む引き継ぎ文書を全面更新。
- `19795c1` — 月商20万THBの商品階段、90日営業KPI、ポートフォリオv3、
  母の日告知v2を追加。
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

### 母の日告知v2

- `business/promo/mothersday-2026/` を「静かなギフトアトリエ」の世界観へ刷新。
- `promo.html` が正本、`promo.png` が投稿用画像、`posts.md` が投稿文。
- 紙、手紙、金の糸、白ジャスミン、作品本編のジャスミン場面で記憶の層を表現。
- ハート主体の既存イラストは告知から除去。
- `promo.png` は1080x1350、目視確認済み。価格・期限・CTAの文字切れなし。
- 投稿文は日タイとも煽りを抑え、母の日はMini 1商品だけが伝わる文章へ更新。

### 母の日営業ローンチ（7/21追加）

- 「商品不足ではなく未露出が原因」と判断し、受注3件までは新規制作を止める方針へ変更。
- 母の日の公開オファーをMini Gift Film 1商品へ集約。
- 創業5枠1,500 THB（匿名の5〜10秒抜粋+一言感想の掲載許可）、掲載なしは通常2,500 THB。
- 申込締切8/5、納品8/11、写真10枚、30秒、縦横どちらか、修正2回。
- 営業運用の正本: `business/sales/mothersday-2026/`
  - `launch-plan.md` — 7/21からの日程、KPI、売上10,000 THBモデル
  - `messages.md` — 日タイ個別文、紹介依頼、48時間追客、グループ投稿
  - `warm-leads.csv` — RYUSEI/STC/近隣店主/紹介者の15枠管理表
  - `intake.md` — 問い合わせ後のヒアリングと固定条件
  - `line-setup.md` — LINE公式アカウントの15分設定内容
- 週次レビュー: `business/reviews/2026-07-21.md`
- 告知画像とサイト母の日欄も単一オファー・創業5枠へ統一。

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
- SVG→PNG:
  `artwork/tools/rasterize.py`
- 静止画→動画:
  `gift-video/scripts/animate.py`
- 組み立て:
  `gift-video/scripts/assemble.py`
- QC:
  `gift-video/scripts/qc.py`
- 注文設定:
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
  - `portfolio/assets/sample-birthday_portrait.mp4`
  - `portfolio/assets/sample-anniversary_portrait.mp4`
- ポスター:
  - `portfolio/assets/sample-mothersday_poster.jpg`
  - `portfolio/assets/sample-birthday_poster.jpg`
  - `portfolio/assets/sample-anniversary_poster.jpg`
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

### 外部公開前に安全に進められる作業

1. `warm-leads.csv` の候補01〜15を実際の表示名へローカルで置き換える（個人情報は最小限）。
2. 7/22までに `messages.md` を使って15人へ個別送信する。
3. 返信者を `intake.md` → `biz-quote` → `orders.csv` の順で見積へ進める。

### オーナー確認が必要な作業

4. `line-setup.md` に従いLINE公式アカウントを本人ログインで作り、lin.ee URLを取得する。
5. GitHub Pages公開の明示承認を得る。
6. 承認後、`website-publish` Skillで公開する。
7. `portfolio/index.html` の `data-line-placeholder` と、`posts.md` の
   `<LINE URL>` / `<ポートフォリオURL>` を実URLへ差し替える。
8. 公開後、`website-quality-check` Skillで実URLを確認する。
9. LINE内ブラウザ、スマホ実機、LINEのOGPプレビューを確認する。
10. 投稿直前にオーナー最終確認を取り、promo.png + posts.mdをグループLINEへ投稿する。

外部公開、URL差し替え、LINE投稿は勝手に実行しない。

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
- 最新の動画v2、月商20万THBの商品階段・90日営業KPI、ポートフォリオv3、
  母の日告知v2は更新済み。
- 実受注はまだ0件。
- LINE URL未確定。
- Chrome接続ランタイムの初期化エラー（`Cannot redefine property: process`）により、
  AI側からLINE公式アカウント作成画面の操作はできなかった。本人が `line-setup.md` で開設する。
- ポートフォリオ未公開。
- グループLINEへの告知未投稿。
```
