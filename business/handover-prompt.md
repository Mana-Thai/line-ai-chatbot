# 引き継ぎプロンプト（Claude Code / OpenAI Codex 共用）

> 最終更新: 2026-07-23
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
現行代表作は母親視点の人生短編v5、ポートフォリオv6、告知v4へ刷新済み。

デザイン原則:
- 派手なハート、原色、絵文字、丸型カードを多用しない。
- 感情を説明するのではなく、余白・光・記憶のモチーフ・静かな言葉で伝える。
- 母の日を花・笑顔・ハートで説明しない。手漉き紙、皺、距離、縫い目、朝の光で愛の痕跡を見せる。
- サイトは「母が見つめてきた子どもの人生」の世界観。働く手、修繕した水色の布、朝の金色、余白。
- タイ語ファースト、日本語併記。スマホとLINE内ブラウザを最優先する。

## 3. 完了済み

### 重要な作業履歴（古い順）

- `2302138` — ポートフォリオを「静かなギフトアトリエ」へ刷新。
- `6e27017` — 保存場所、再生成手順、未承認作業を含む引き継ぎ文書を全面更新。
- `19795c1` — 月商20万THBの商品階段、90日営業KPI、ポートフォリオv3、
  母の日告知v2を追加。
- `fe17c73` — 母の日代表作を現代アート短編v3へ刷新し、タイ語フォント選択を修正。
- `928b51e` — 画像正本、ポートフォリオv4、母の日告知v3を公開面へ反映。
- `c4f61a8` — 怖さを除き、母娘が一緒につくる・繕う・歩く明るい映像v4を制作。
- `058604a` — ポートフォリオv5と母の日告知v4を公開導線へ反映。
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

### 母の日アートフィルムv4（旧版・比較用）

- 作品名: **The Light We Make Together / ふたりでつくる光**。
- 三幕構成: 朝の光で母娘がサイアノタイプをつくる → 同じ白布を金糸で一緒に繕う →
  タイの明るい海辺を手をつないで歩く。
- v3の写真品質、紙・布・金糸の物質感、遅いカメラは維持。暗い空洞、隔たり、空席、別れの象徴を排除。
- BGMは低いドローンと紙の軋みを廃止し、朝の空気、穏やかな波、Dメジャー五音音階で新規生成。
- 30秒・1080x1920・H.264/AAC。QC ALL PASS、-14.4 LUFS、TP -4.35 dBTP。
- 2秒、12秒、25秒、28.5秒を目視し、温度感、人物、タイ語、改行、終幕を確認済み。

### 母の日アートフィルムv5（現行代表作）

- 作品名: **From the Day I First Saw You / 母が見つめた成長**。
- 母親の視点で、幼少期の世話 → 母の縫製仕事 → 幸せな子ども時代 → 思春期の衝突と
  言えない後悔 → 自立 → 娘が働く大変さを理解して思い出の映画を作る → 母が涙を隠して笑う、
  の7章を描く。代表作は娘版で、息子版も受注時に同じ感情設計で制作可能。
- 貧しさは悲惨さで誇張せず、弁当、給料袋、修繕、請求書、働く手の具体で表現。
  母の縫製机と娘の編集机を同じ構図で反復し、娘の気づきを説明字幕なしで伝える。
- 7シーン×8秒、56秒、1080x1920、H.264/AAC。`precheck.py` / `assemble.py` /
  `qc.py` ALL PASS。-13.8 LUFS、TP -3.41 dBTP。
- 2 / 10 / 18 / 26 / 34 / 42 / 50 / 54.5秒を完成MP4から抽出し、人物の年齢推移、
  母親視点、タイ語キャプション、喧嘩場面の安全性、涙を隠す笑顔、終幕を目視確認済み。
- 公開用動画はCRF 23 / faststartで13,956,833 bytesへ軽量化。マスターは注文output内で再生成可能。

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
- （v4当時）LINE URLは未確定のため `data-line-placeholder` を維持していた。v7で解消済み。
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

### ポートフォリオv6

- ヒーロー、作品本編、展示静止画をv5の「母の仕事／娘の気づき／涙を隠す母」へ差し替え。
- 日タイ二言語のあらすじを追加し、代表作は娘版、息子版も写真から制作可能と明記。
- Playwrightで375x812 / 1280x800を全画面・作品セクション原寸確認。横スクロールなし、
  参照切れ0、画像300KB超0、公開動画56秒・1080x1920の読込を確認済み。

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
  - `artwork/works/gift-video-samples/mothersday-v6/scene1.png`〜`scene7.png`
  - `artwork/works/gift-video-samples/mothersday-v6/art-direction.md`
  - `artwork/works/gift-video-samples/mothersday-v6/cinematic_master.py`
  - `artwork/works/gift-video-samples/mothersday-v6/gen_soundscape.py`
  - `mothersday-v3/`〜`mothersday-v5/`は比較・履歴用として保持。
- SVG→PNG:
  `artwork/tools/rasterize.py`
- 静止画→動画:
  `gift-video/scripts/animate.py`
- 組み立て:
  `gift-video/scripts/assemble.py`
- QC:
  `gift-video/scripts/qc.py`
- 注文設定:
  - `gift-video/orders/sample-mothersday-v6/order.yaml`（現行代表作）
  - `gift-video/orders/sample-mothersday-v5/order.yaml`（旧版）
  - `gift-video/orders/sample-mothersday-v4/order.yaml`（旧版）
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
  - `portfolio/assets/mothersday-study-work.jpg`
  - `portfolio/assets/mothersday-study-realization.jpg`
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

1. v6の画像正本 `mothersday-v6/scene1.png`〜`scene7.png` を使用。
2. `mothersday-v6/cinematic_master.py <output.mp4>` で、21ショットの56秒映像を生成する。
3. `mothersday-v6/gen_soundscape.py <out.wav>` で56秒の専用音楽とフォーリーを生成し、mp3へ変換。
4. 映像を `gift-video/orders/sample-mothersday-v6/input/scene1.mp4`、音源を同じ
   `input/bgm.mp3` に配置する。
5. `gift-video/` で以下を実行:
   - `python scripts/precheck.py <order-id>`
   - `python scripts/assemble.py <order-id> --keep-work`
   - `python scripts/qc.py <order-id>`
6. ALL PASS後、portrait出力を `portfolio/assets/` の公開用ファイルへコピー。
7. 涙を除いたscene7をposterへ変換。公開動画はCRF 22 slow / faststartで軽量化。

注意:
- `precheck.py --all` は素材未配置の古い `sample-001` / `sample-002` も拾うため、
  現行代表作は `sample-mothersday-v6` を個別指定して実行する。
- Windows PowerShellで絵文字出力が文字化けする場合は `$env:PYTHONUTF8='1'` を設定。
- 一時PNG/WAVやChromeプロファイルをコミットしない。

## 6. 次に行う作業（優先順）

### オーナー本人の情報・操作が必要

1. `warm-leads.csv` の候補01〜15を実際の表示名へ置き換える（個人情報は最小限）。
2. `messages.md` の接触1だけを15人へ個別送信する。価格や条件は最初から詰め込まない。
3. LINE公式アカウント `https://lin.ee/zuu5hJM` を自分の個人LINEで友だち追加し、
   あいさつ文の表示と公式アカウント側からの返信を実機確認する。
4. LINE内ブラウザ、スマホ実機、LINEのOGPプレビューを確認し、
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
- 現行代表作は母の日アートフィルムv6。月商20万THBの商品階段・90日営業KPI、
  ポートフォリオv6、母の日告知v4へ更新済み。
- pro-marketing-directorとlaunch-ai-side-hustleの観点で母の日ローンチを再点検済み。
  段階はP0（初回受注の検証）。価格1,290 THB、3接触営業、掲載任意へ修正済み。
- 採算仮定は変動費50 THB、制作2.5時間で、1件あたり限界利益1,240 THB、
  時間あたり496 THB。オーナーが許容する最低時給は未確認。
- 7/25までの検証KPIは、接触1を15件、サンプル閲覧許可8件、相談4件、
  条件提示3件、有料受注1件。これは実績ではなく検証仮説。
- 実受注はまだ0件。
- LINE公式アカウントの友だち追加URLは `https://lin.ee/zuu5hJM`。サイト・投稿文・営業文へ反映済み。
- Chrome接続ランタイムの初期化エラー（`Cannot redefine property: process`）により、
  AI側からLINE公式アカウント作成画面の操作はできなかった。本人が `line-setup.md` で開設する。
- ポートフォリオはGitHub Pagesで公開済み: https://mana-thai.github.io/line-ai-chatbot/
- PagesはActions方式。`github-pages`環境には`main`と作業ブランチを許可済み。
- ポートフォリオv7と母の日アートフィルムv6はGitHub Pagesへ配信済み。
  ローカルwebsite-quality-checkと公開ファイルの応答・容量照合まで完了。
- グループLINEへの告知未投稿。
- 実在する見込み客の連絡先・表示名はAIに渡されていないため、個別送信は未実行。
- 1,290 THBへの変更後、告知PNG（1080x1350）と公開ポートフォリオを目視確認済み。

## 9. STC母の日マルキー（2026-07-22追加）

- 元データ `stc-marquee-v16.html` を壊さず、派生正本を
  `artwork/works/stc-mothersday-marquee/stc-marquee-mothersday.html` に保存。
- キャラクターはテニスボールから、ボブヘア、ジャスミンの髪飾り、母の日ブルーの服を着た
  ピクセルアートの女の子へ変更。梯子と文字配置の演出は継承。
- 導入の一回転は完全に廃止。歩く→つまずく→身体を完全に横にして、
  女の子の頭上方向（動画上では右）へ両手を水平に伸ばす→
  目を閉じた驚き顔のまま約42px右へ減速スライド→笑顔で立ち上がる構成。
- 脚立運搬は左右グリップを両手で保持し、その間だけ頭を12px下げる。`LOVE MOM`の各文字もタイル左右端を両手で持つ。
  文字が届かない掲上終盤のみ最大12pxジャンプし、腕を不自然に伸ばさない。
- 後ろ姿の服は白いエプロンとピンクの点を除き、母の日ブルー一色。文字掲上中の腕は
  身体の背面へ隠し、タイル下端から両手だけをわずかに見せる。後頭部に残っていた肌色線も除去。
  音楽も回転音から足音、柔らかな着地音、回復の上昇チャイムへ変更。
- `LOVE MOM`、白ジャスミン、母の日ブルー／コーラル／金の配色で再構成。
- 終幕は `THANK YOU MOM` と `สุขสันต์วันแม่`。怖さや暗さを避けた13秒の祝福作品。
- 音楽正本は同ディレクトリの `gen_music.py`。F majorのベル、フェルトピアノ、
  柔らかなパッドを文字配置・看板点灯・終幕に同期。WAVは再生成可能。
- Canvas録画補助は `export_webm.js`。中間WAV/WebMは`.gitignore`対象。
- 完成動画: `portfolio/assets/stc-mothersday-marquee_1080x1080.mp4`
- ポスター: `portfolio/assets/stc-mothersday-marquee_poster.png`
- QC: 13.00秒、H.264 1080x1080 30fps、AAC 48kHz stereo 192kbps、
  -13.37 LUFS / -1.50 dBTP。全390フレームのデコードに成功。0.40 / 0.80 / 1.17 /
  1.40 / 2.50 / 4.03 / 4.43 / 8.03 / 12.30秒を最終MP4から原寸抽出し、転倒・閉眼・
  右スライド・脚立両手保持・青一色の後ろ姿・文字掲上・完成画面を目視確認済み。

## 10. ポートフォリオv7（2026-07-23追加）

- `pro-marketing-director` と `launch-ai-side-hustle` のP0判断に基づき、ポートフォリオを
  作品集から「母の日Miniの初回受注を取る単一導線」へ再構成。
- ヒーロー訴求を「働く大変さを知った今、あの頃言えなかったありがとうを母へ」に変更。
- 母の日Miniを1,290 THB、写真10枚、30秒、縦横どちらか、修正2回、8/5締切として主表示。
- 56秒の代表動画は `Story Film制作例（4,900 THB）` と明記し、Miniとの価格矛盾を解消。
- P0では選択肢を増やさないため、消費者向けページからHeirloom / Shop Story / Web /
  LINE AI Careを外し、MiniとStoryの2択に限定。法人商品は収入計画から削除していない。
- 透かし入りプレビュー確認後の支払い、入金後Full HD納品、掲載任意、修正条件、納品形式、
  日本語・タイ語対応を信頼情報とFAQへ追加。未確認の削除期限・キャンセル条件は掲載していない。
- LINE URL取得前の動かない疑似ボタンは撤去済み。取得した `https://lin.ee/zuu5hJM` を
  ヘッダー・ヒーロー・商品欄・最終CTAへ設定し、すべて同じ友だち追加導線に統一。
- ローカル品質確認: Playwright 375x812 / 1280x800、横スクロールなし、画像3点読込成功、
  動画56秒・1080x1920、console error 0。確認画像は `output/playwright/portfolio-v7-*.png`。
- OGPも同じ母の日訴求、1,290 THB、母娘の代表画像へ更新。正本は
  `portfolio/images/ogp.html`、配信用画像は `portfolio/images/ogp.jpg`（1200x630）。
- LINE URLの販売ブロッカーは解消。残る本人確認は、個人LINEでの友だち追加・あいさつ文・返信テスト。

## 11. 母の日アートフィルムv6（2026-07-23追加）

- v5の7枚を単純にパン／ズームする構成から、7章×3カットの全21ショットへ再編集。
  各章にワイド、感情または手元のディテール、余韻のショットを割り当て、
  母の労働と成長した娘の仕事を平行するカメラリズムで結んだ。
- 章ごとに焦点位置とカメラ軌道を個別設計。低彩度の母の日ブルーを基調に、
  控えめなハレーション、フィルムグレイン、ビネット、フォーカス移動を重ねた。
  汎用的な紙トランジションは使用せず、物語に合わせた章間トランジションへ変更。
- 冒頭・終幕に使う母娘の画像から、母親の目の下にあった薄い涙の滴と涙の筋を除去。
  顔、手、タブレット、衣服、照明、構図は維持し、乾いた頬と穏やかな笑顔にした。
- 第4章は、背中を向けて手紙を隠す旧構図と、母の前で謝罪文を見せる試作をともに不採用。
  手紙・紙・文字を完全に除き、娘の伏せた視線、言いかけて止まる唇、内側へ寄せた肩、
  制服の裾を落ち着かず握る両手、踏み出せない重心だけで「心では謝っているのに言えない」を表現。
  ワイド→表情→指先の3カットを完成MP4から抽出し、手紙が残っていないことを目視確認済み。
- 56秒の専用音楽とフォーリーを新規設計。ミシン、布、紙、扉／足音、キーボード、
  タブレット再生音を物語へ同期し、喧嘩の章では音数を減らし、和解の章では和声を広げた。
  第4章からは紙の効果音も削除し、沈黙と小さな心拍だけに変更。
- 画像・演出正本:
  - `artwork/works/gift-video-samples/mothersday-v6/scene1.png`〜`scene7.png`
  - `artwork/works/gift-video-samples/mothersday-v6/art-direction.md`
  - `artwork/works/gift-video-samples/mothersday-v6/cinematic_master.py`
  - `artwork/works/gift-video-samples/mothersday-v6/gen_soundscape.py`
- 注文設定: `gift-video/orders/sample-mothersday-v6/order.yaml`
- `cinematic_master.py` は中間解像度2560x3840、1080x1920、30fps、CRF 16 slowで
  7章を描画して56秒へ結合する。中断再開時は各章を全フレームデコードしてから再利用する。
- `precheck.py` → `assemble.py --keep-work` → `qc.py` を完走しALL PASS。
  56.00秒、1080x1920、H.264/AAC、-13.7 LUFS、-2.09 dBTP。
  最終MP4の全フレームデコードと代表フレームの目視確認にも成功。
- 公開用動画はCRF 22 slow / faststartへ変換し
  `portfolio/assets/sample-mothersday_portrait.mp4`（29,264,309 bytes）へ配置。
  涙を除いたポスターは `portfolio/assets/sample-mothersday_poster.jpg`、
  同じ画像を使うOGPは `portfolio/images/ogp.jpg`。
- ローカルwebsite-quality-checkは375x812で横はみ出しなし、console error 0。
  OGPは1200x630で目視確認済み。修正版はコミット `9805fdb` でPages配信ブランチへpush済み。
  ローカルの公開用動画は29,264,309 bytesで全フレームデコードPASS。push後に実行環境から
  `github.io` への接続が一時的に失敗したため、同容量が公開URLから返ることの再照合だけ未完了。

## 12. image-stylize Skill（PR #28、2026-07-23追加）

- PR `https://github.com/Mana-Thai/line-ai-chatbot/pull/28` のコミット `f571b28` から、
  `image-stylize` Skillと `artwork/tools/stylize.py` を作業ブランチへ取り込んだ。
- `npm.cmd run sync-skills` を実行し、`.claude/skills/image-stylize/SKILL.md` と
  `.agents/skills/image-stylize/SKILL.md` の同期を確認。取り込みコミットは `2e5e294`。
- 第4章 `mothersday-v6/scene4.png` を入力し、`cinematic`、`9:16`、2候補、
  人物・衣服・母親肩越し構図・伏せた視線・指先のしぐさを維持し、手紙・文字・涙・
  重複した手足を禁止するプロンプトを `--dry-run` で検証済み。
- リポジトリ直下のgit管理外 `.env` に `GEMINI_API_KEY` を保存済み。値は表示せず、
  設定済み判定と文字数のみで検証した。キーをコミットしてはいけない。
- Gemini APIはキーを正常認識したが、`gemini-2.5-flash-preview-image` の無料枠上限が0で
  HTTP 429 `RESOURCE_EXHAUSTED`。Google Cloud側で画像生成の課金枠を有効化すれば再実行可能。
- 作業を止めず、`image-stylize` の同一性維持・禁止要素・2候補比較の仕様を組み込み画像編集へ適用。
  2候補を生成し、母親との距離と温かさが最も自然な候補1をscene4へ採用した。
- 採用画像は1024x1536へ正規化。母親肩越し構図、人物と服装、伏せた視線、言いかけた唇、
  制服の裾をつまむ両手を維持し、自然な肌、雨の寒色、ランプの暖色、奥行きを改善。
  手紙、紙、文字、涙、余分な手足、恐怖表現がないことを目視確認済み。
- 第4章のみ再描画して56秒マスターへ再結合。他6章は再利用。
  `precheck.py` → `assemble.py --keep-work` → `qc.py` はALL PASS。
  56.00秒、1080x1920、H.264/AAC、-13.7 LUFS、TP -2.10 dBTP。
- 完成動画の24.8秒（広角）、27.7秒（表情）、30.5秒（両手）を抽出して目視検査し合格。
  公開用はCRF 22 slow / AAC 160kbps / faststartへ変換し、
  `portfolio/assets/sample-mothersday_portrait.mp4`（29,449,971 bytes）へ反映。
  全フレームデコードもPASS。
- `website-quality-check` を実行。375x812と1280x800の全ページ画像を目視し、
  スマホ横はみ出しなし、本文16px、タイ語フォント正常、動画readyState 4、console error 0。
  ローカル資産とLINEリンクはHTTP 200、viewport/title/OGP/絶対og:imageもPASS。
  映像更新コミット `b00ecf8` を作業ブランチへpush済み。
- GitHub Pagesの公開動画
  `https://mana-thai.github.io/line-ai-chatbot/assets/sample-mothersday_portrait.mp4`
  はHTTP 200、Content-Length 29,449,971 bytesでローカル正本と一致し、公開反映完了。
```
