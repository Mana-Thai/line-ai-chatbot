# 引き継ぎプロンプト(Claude Code / Codex 共用)

> このファイルは作業セッションの引き継ぎ用。作業が中断した場合、このファイルの内容を
> そのままプロンプトとしてAIエージェント(Codex等)に渡せば続きを実行できる。
> **各セッションの冒頭で必ず最新化し、作業終了時にもコミットすること。**

---

以下のプロンプトをコピーして使う:

```
あなたは Mana-Thai/line-ai-chatbot リポジトリで副業の立ち上げ作業を引き継ぎます。
作業ブランチ: claude/ai-side-income-plan-039ya4(このブランチで開発しプッシュする)

## 背景
- オーナーは在タイ日本人。子供の養育のため副収入が必要。目標は累計で
  2026-08-15までに1万THB / 2026-10-15までに10万THB / 2027-01-15までに20万THB。
- 全体計画は business/income-plan.md(正本)。短期はギフト動画・アパレルデザインの
  小口受注、中期は業務Webアプリ+店舗向けLINE AI Bot(月額)、長期は継続収入化。
- プロジェクト規約は CLAUDE.md / AGENTS.md を必ず読む。再利用手順は .claude/skills/
  (正本)にSkillとしてまとまっている。Skillを追加・編集したら npm run sync-skills で
  .agents/skills/ に同期して両方コミットする。

## これまでに完了したこと
1. business/income-plan.md 作成(短期/中期/長期プラン・数字モデル・週次ルーティン)
2. 運営Skillを4つ追加済み: line-ai-bot(店舗Bot商品化)/ biz-promotion(集客告知)/
   biz-portfolio(事例掲載)/ biz-weekly-review(週次レビュー)。AGENTS.mdの一覧も更新済み
3. 受注台帳 business/orders.csv は実受注ゼロ(SAMPLE行のみ)

## 現在のタスク: 短期プラン第1週「売れる状態を作る」
income-plan.md §3 の第1週アクション。タイの母の日(8/12)商戦が目前。
- [ ] サンプルのギフト動画を制作(gift-video/ パイプライン。実素材が無いため
      artwork/tools でSVGイラスト→PNG→ gift-video/scripts/animate.py でシーン動画化
      → assemble.py → qc.py。Skill: gift-video-run / illustration-animation)
- [ ] ポートフォリオサイトを作成(素の静的HTML・日タイ併記・スマホ最優先。
      Skill: new-website。公開は website-publish の手順で GitHub Pages を想定)
- [ ] 母の日キャンペーンの告知画像(1080px、日タイ併記、価格入り)と
      グループLINE/Facebook用の投稿文(Skill: biz-promotion)

## 進捗メモ(最新のセッションで更新する)
- ✅ サンプル動画3本 完成(qc ALL PASS)。gift-video/orders/sample-{mothersday,birthday,anniversary}/
  (input/outputはgit管理外。イラスト正本は artwork/works/gift-video-samples/ のSVG+
  generate_scenes.py、BGMは同フォルダ gen_bgm.py で再生成可。ffmpegとfonts-noto-cjk,
  fonts-thai-tlwg をapt installして再構築する)
- ✅ ポートフォリオサイト v1 portfolio/(index.html/style.css/assets の軽量mp4×3)
- ✅ 母の日告知画像+投稿文 v1 business/promo/mothersday-2026/(promo.html→promo.png, posts.md)
- ✅ タイ人向けデザイン調査を実施し、サイト・告知画像・OGP・母の日動画ラストシーンを
  再デザイン済み。調査結論: 母の日=水色(สีฟ้า)×白ジャスミン×金が正式モチーフ(ピンクはNG)/
  フォントは Kanit(見出し)+Sarabun(本文)が定番(portfolio/fonts/ に自己ホスト済み)/
  価格を大きく・締切明示・ทักไลน์(LINE)導線がタイSNS販促の型
- ⚠️ オーナー指示(2回目のデザイン修正): 「安っぽい。受け取った人が感動して涙を流す
  デザインに一新せよ」→ 動画シーンアートを映画的に再制作(SVGフィルタで粒子/光/空気感、
  プアンマーライ=ジャスミン花輪など文化的モチーフ、丁寧な人物シルエット)、BGMをピアノ調
  +リバーブに刷新、告知・サイトを高級感ある抑制的デザインへ(作業中)
- ⚠️ 未解決(次のアクション):
  1. ポートフォリオ公開(GitHub Pages=公開リポジトリが必要。オーナーの承認を得てから
     website-publish Skillの手順で公開)
  2. portfolio/index.html と posts.md の <LINE URL>・ポートフォリオURLプレースホルダを
     実URLに差し替え(index.htmlの data-line-placeholder 箇所)
  3. 公開後に website-quality-check を実機で実施
  4. 告知第1弾をグループLINEに投稿(business/promo/mothersday-2026/promo.png + posts.md)

## 作業ルール
- コミットメッセージは日本語で内容を明確に。作業の区切りごとに必ずコミットして
  origin claude/ai-side-income-plan-039ya4 へプッシュ(リモートセッションは
  コミットしないと消える)
- 受注・進捗が発生したら business/orders.csv を更新(Skill: biz-order-ledger)
- 週次で biz-weekly-review を実行し、目標との差と今週のアクション3つを出す
- 固定文言は日タイ二言語(Skill: thai-i18n の考え方に準ずる)。価格は顧客ごとに
  THBかJPYの一方のみ
- このファイル(business/handover-prompt.md)を作業終了時に必ず最新化してコミットする
```
