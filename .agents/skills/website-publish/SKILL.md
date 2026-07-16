---
name: website-publish
description: 作成したウェブサイト(静的サイト)を無料で公開し、URLを共有するまでの手順。「サイトを公開したい」「ホームページをネットに載せたい」「GitHub Pages」のタスクで使う。GitHub Pagesでの公開、更新の反映方法、独自ドメイン、LINEで共有したときのプレビュー確認まで。
---

# ウェブサイトの公開(GitHub Pages)

静的サイトは **GitHub Pages(無料・スリープなし・自動HTTPS)** で公開するのが基本。
サーバー処理が必要なアプリは対象外(その場合は `app-publish` Skill = Render)。

## 手順

1. **リポジトリの用意** — サイト専用の新しいGitHubリポジトリを作り、
   `index.html` をリポジトリ直下(または `docs/`)に置いてpushする
   - リポジトリ名を `<ユーザー名>.github.io` にすると `https://<ユーザー名>.github.io/` で公開される
   - それ以外の名前なら `https://<ユーザー名>.github.io/<リポジトリ名>/` になる
2. **Pagesを有効化** — GitHubのリポジトリ → Settings → Pages →
   Source: `Deploy from a branch`、Branch: `main` / `/ (root)`(`docs/` に置いた場合は `/docs`)→ Save
3. **数分待って公開URLを確認** — Settings → Pages に表示されるURLを開く
4. **以後の更新は push するだけ**(反映まで1〜2分。急ぎならブラウザをスーパーリロード)

### サブパス公開時の注意(リポジトリ名がURLに入る場合)

- リンク・画像は**相対パス**で書く(`/images/...` のようなルート絶対パスは壊れる)
- OGPの `og:image` は例外で、`https://.../<リポジトリ名>/images/ogp.jpg` の**絶対URL**が必要

## 独自ドメイン(任意)

- 取得したドメインをSettings → Pages → Custom domainに設定し、DNSでCNAMEを
  `<ユーザー名>.github.io` に向ける。「Enforce HTTPS」を必ずON
- 未取得なら無理に買わない。`github.io` のURLで十分始められる

## 公開後の確認

- [ ] スマホ実機(LINEのトーク内ブラウザ)で開いて表示崩れがないか
- [ ] **LINEの自分専用トーク(Keepメモ)にURLを送り、プレビュー(OGP)の画像・タイトルを確認**
      (プレビューはLINE側にキャッシュされる。OGP修正後は `?v=2` などを付けて再確認)
- [ ] `website-quality-check` Skillの公開後項目

## URLの共有

- グループLINEのノートに「何のサイトか1行+URL」で投稿し、アナウンス(ピン留め)
- 印刷物・口頭で伝える場合はQRコードを作る(URLが長い場合に有効)

## 補足: Renderの静的サイトを選ぶ場合

すでにRenderで管理を統一したい場合は Render の「Static Site」でも公開できる
(Build Command空欄・Publish Directory `.`)。機能はGitHub Pagesとほぼ同等。
どちらか一方に決めて、サイトごとに混在させない。
