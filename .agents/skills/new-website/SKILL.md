---
name: new-website
description: ウェブサイト(ホームページ・案内ページ・LP等)を新しく作るときの設計テンプレート。「ウェブサイトを作りたい」「ホームページ」「紹介ページ」「LP」のタスクで使う。ビルドツール不要の静的サイト(素のHTML/CSS/JS)を基本とし、要件整理・ページ構成・スマホ対応(LINEから開かれる前提)・OGP・二言語対応までの手順をまとめたもの。
---

# ウェブサイトの新規作成(静的サイト)

お知らせ・紹介・案内が目的のサイトは**静的サイト(素のHTML/CSS/JS、ビルドツールなし)**で作る。
無料でホスティングでき、壊れにくく、誰でも直せる。
ログイン・データ保存・リアルタイム更新が必要になったら、それはWebアプリなので
`new-shared-webapp` Skillに切り替える。

## 最初に決める4つのこと(ユーザーに確認)

1. **目的とゴール**: 誰に何を伝えて、どうしてほしいのか(問い合わせ? LINE登録? 来店?)
2. **ページ構成**: まず1ページ(縦長LP)で足りるか。複数ページは本当に必要なときだけ
3. **更新するもの・頻度**: 更新が多い部分(お知らせ等)はHTML内の1箇所にまとめて編集しやすく
4. **言語**: 日本語のみか、日タイ二言語か(二言語なら下記の方式を選ぶ)

## ファイル構成(雛形)

```
site/
├── index.html      # 1ページ完結ならこれだけでよい
├── style.css
├── script.js       # 不要なら作らない
└── images/         # 画像 (ogp.jpg を含む)
```

- フレームワーク・CDN・Webフォントは原則使わない(遅くなる+依存が壊れる)。
  システムフォントスタック(`"Hiragino Sans", "Noto Sans JP", "Noto Sans Thai", sans-serif` 等)を使う
- CSSは1ファイル。クラス命名は見た目でなく役割で(`.hero` `.notice` `.contact`)

## 必ず入れるもの

1. **スマホ最優先**: 閲覧の大半はLINEから開くスマホ。`<meta name="viewport" content="width=device-width, initial-scale=1">` を必ず入れ、**幅375pxを基準にデザイン**し、PCは `@media (min-width: 768px)` で広げる
2. **OGP(LINE・SNSでのプレビュー)**: URLを共有したときの見え方はこれで決まる。

   ```html
   <meta property="og:title" content="サイト名">
   <meta property="og:description" content="1行説明">
   <meta property="og:image" content="https://<公開URL>/images/ogp.jpg">  <!-- 1200x630推奨・絶対URL -->
   <meta property="og:type" content="website">
   ```

3. **基本メタ**: `<html lang="ja">`、`<title>`、`<meta name="description">`、favicon
4. **連絡導線**: 電話は `tel:`、LINEは公式アカウント/グループの招待URL、地図はGoogleマップ共有リンク
5. **画像の軽量化**: 1枚300KB以下を目安にリサイズ(横幅は表示の2倍まで)。`loading="lazy"` を付ける
6. **`alt` 属性**: すべての意味のある画像に付ける

## 日タイ二言語にする場合

- **推奨: 併記方式** — 同じページに日本語とタイ語を並べて書く(切り替えUI不要で確実。
  分量が少ない案内サイト向き)
- 分量が多いなら `index.html`(日本語)+ `th/index.html`(タイ語)の2ページ方式にし、
  相互リンクと `<html lang="th">` を正しく設定する
- タイ語フォントは `"Noto Sans Thai"` をフォントスタックに含める(タイ語が豆腐にならないか実機確認)

## 作成後

- 公開前チェック → `website-quality-check` Skill
- 公開とURL共有 → `website-publish` Skill(GitHub Pagesで無料公開)
