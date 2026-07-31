# サイトの設定・公開手順

タイ人のお客様向けの「思い出アルバム動画」サービス紹介サイト(タイ語)。
`docs/` の中身がそのまま GitHub Pages で公開される。

```
docs/
├── index.html   # 本文(1ページ完結)
├── style.css
├── images/ogp.jpg      # LINE等でURLを共有したときのプレビュー画像
└── media/              # サンプル動画(Web用に軽量化済み・各2.2MB)
```

## 公開前に必ず差し替える(3箇所)

`index.html` の以下のプレースホルダーは**そのままだと機能しない**。公開前に置換する:

| 置換前 | 置換内容 | 場所 |
|---|---|---|
| `LINE_URL_HERE` | LINE公式アカウントの友だち追加URL(`https://lin.ee/xxxxx`) | 「ทักทาง LINE」ボタン(2箇所) |
| `EMAIL_HERE` | 連絡用メールアドレス | 問い合わせ欄 |
| `SHOP_NAME_HERE` | 屋号(タイ語表記も検討) | フッター(3箇所) |

```bash
cd docs
sed -i 's|LINE_URL_HERE|https://lin.ee/実際のID|g; s|EMAIL_HERE|実際のアドレス|g; s|SHOP_NAME_HERE|屋号|g' index.html
grep -nE "LINE_URL_HERE|EMAIL_HERE|SHOP_NAME_HERE" index.html || echo "置換完了"
```

## 内容の確認(公開前に決めること)

- **価格**(฿590 / ฿1,290 / +฿290)は市場調査に基づく仮の設定。実際の作業時間で見直す
  (`biz-quote` Skillの「価格の組み立て方」を参照)
- **納期3日・修正2〜3回・返金条件**は約束になるので、守れる内容か確認する
- **写真の取り扱い(30日で削除等)** は約束として書いてある。実際の運用と一致させる

## GitHub Pages で公開する

1. GitHub → Settings → Pages
2. Source: `Deploy from a branch` / Branch: `main` / フォルダ: **`/docs`** → Save
3. 数分待つと `https://mana-thai.github.io/line-ai-chatbot/` で公開される

## 独自ドメインにする(推奨)

**有料サービスのサイトとしては独自ドメインを強く推奨する。** 現在のURLには2つ問題がある:

- パスの `line-ai-chatbot` が商品と無関係で、お客様には意味不明(不信感につながる)
- `github.io` は開発者の実験場という印象で、店舗として見てもらいにくい

**候補・空き状況・取得手順は `domain-setup.md` にまとめてある**(調査済みの推奨は
`maligift.com`)。

`docs/CNAME` はあえて置いていない。中身が実在しないドメインだと Pages が配信を止めて
しまい、独自ドメインを使わない間は github.io のURLまで見られなくなるため。
GitHub の Settings → Pages で Custom domain を設定すると自動で作られる。

## 公開後の確認

- [ ] スマホ実機で開いて崩れがないか(タイ語が □ になっていないか)
- [ ] **LINEの自分専用トーク(Keepメモ)にURLを送り、プレビュー画像とタイトルを確認**
      (LINEはプレビューをキャッシュするので、直したら `?v=2` を付けて再確認)
- [ ] サンプル動画が再生できるか(モバイル回線でも)
- [ ] LINEボタンから実際に友だち追加できるか
- [ ] 詳細は `website-quality-check` Skill

## サンプル動画の差し替え

実際のお客様の作品(**掲載許可を得たもののみ**)に差し替えると説得力が上がる。
Web用の軽量化:

```bash
ffmpeg -i 元動画.mp4 -vf scale=1280:720 -c:v libx264 -crf 28 -preset slow \
  -c:a aac -b:a 96k -movflags +faststart docs/media/sample-landscape.mp4
ffmpeg -ss 12 -i 元動画.mp4 -frames:v 1 -vf scale=1280:-2 -q:v 4 docs/media/poster.jpg
```

許可が取れない間は、いまのデモ(写真は素材)を使い、
「※ ตัวอย่างนี้ใช้รูปสาธิต(サンプル素材です)」の注記を消さないこと。
