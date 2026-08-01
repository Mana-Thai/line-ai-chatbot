---
name: website-quality-check
description: ウェブサイトの公開前・更新後の品質チェックリスト。「サイトを確認して」「公開前チェック」「表示崩れ」「リンク切れ」のタスク、およびウェブサイトを変更したあとに使う。スマホ表示・OGP・リンク切れ・画像サイズ・二言語表示などを、Playwrightのスクリーンショットと機械チェックで確認する。
---

# ウェブサイトの品質チェック

サイトを新規作成・変更したら公開前に必ず一巡する。
機械チェックできるものはコマンドで、見た目はPlaywrightのスクリーンショットで確認する。

## 1. ローカルで開く

```bash
# サイトのフォルダで簡易サーバーを起動 (file:// 直開きはパス・OGP確認に不向き)
python3 -m http.server 8000
```

## 2. 表示確認(Playwrightでスクリーンショット)

スマホ(375x812)とPC(1280x800)の2サイズで全ページを撮影し、目視確認する。
実行環境のChromium: Claude Codeのリモート環境では `/opt/pw-browsers/chromium` にあり
`playwright install` 不要。Codex等それ以外の環境ではシステムのChromium/Chromeを
`executablePath` で指定するか `npx playwright install chromium` で導入する。

**`rasterize.py` でスマホ幅を撮るときの注意**: ヘッドレスChromeのウィンドウは
**幅485pxまでしか狭くならない**。素朴に `--width 390` で撮ると、485pxで描画した
左端390pxが切り出され、**右側が見切れた「偽の崩れ」**が写る。`rasterize.py` は
指定幅がこれを下回ると自動でiframeに入れて本物の狭いビューポートを作るので
そのまま使ってよいが、他の方法で撮るときはこの罠に注意する。

確認ポイント:

- [ ] スマホ幅で横スクロールが発生しない(はみ出す要素がない)
      — 見切れを見つけたら**まず撮影方法を疑う**(上記の485px問題)
- [ ] 文字サイズ・行間が読みやすい(スマホで本文16px相当以上。
      **タイ語は字面が小さく声調記号が潰れるので17〜18px相当を目安にする**)
- [ ] ボタン・リンクが指で押せる大きさ(44px四方目安)、隣と近すぎない
- [ ] 画像のアスペクト比が崩れていない
- [ ] 日タイ二言語の場合: タイ語が文字化け(豆腐)していない、行間が詰まって
      上下の記号が切れていない(タイ文字は行間を広めに)

## 3. 機械チェック

```bash
# リンク切れ・画像切れ (ローカルサーバー起動中に)
grep -rhoE '(href|src)="[^"]+"' *.html | grep -oE '"[^"]+"' | tr -d '"' | sort -u | \
while read -r u; do
  case "$u" in
    http*) code=$(curl -s -o /dev/null -w "%{http_code}" "$u");;
    \#*|tel:*|mailto:*|line:*) continue;;
    *) code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/$u");;
  esac
  [ "$code" != 200 ] && echo "NG($code): $u"
done; echo "リンクチェック完了"

# 画像の重さ (300KB超を洗い出す)
find images -type f -size +300k -exec ls -lh {} \;

# 必須メタタグの存在確認
grep -L 'name="viewport"' *.html; grep -L 'og:title' *.html; grep -L '<title>' *.html
```

- [ ] リンク切れ・画像切れが0件
- [ ] 300KB超の画像がない(あればリサイズ・JPEG/WebP化)
- [ ] 全ページに viewport / title / OGP がある

## 4. 内容の確認

- [ ] 電話番号・住所・営業時間・料金など**事実情報が最新か**(サイトの信頼はここで決まる)
- [ ] `tel:` リンクの番号がテキスト表記と一致している
- [ ] 誤字脱字(タイ語部分はネイティブ確認が取れるまで機械翻訳のまま公開しない)

## 5. 公開後(website-publish の後)

- [ ] 公開URLをスマホ実機・LINEトーク内ブラウザで開いて最終確認
- [ ] LINEにURLを貼ってOGPプレビュー(画像・タイトル)を確認
      (キャッシュされるので、OGP修正後は `?v=2` 付きで再確認)
- [ ] `og:image` が絶対URLで、公開URLから直接開けるか
