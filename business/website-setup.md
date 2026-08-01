# サイトの設定・公開手順

タイ人のお客様向けの「思い出アルバム動画」サービス紹介サイト(タイ語)。
`docs/` の中身が**そのまま** GitHub Pages で公開される。

```
docs/
├── .nojekyll    # Jekyll処理を止める(素のHTMLをそのまま配信させる)
├── index.html   # 本文(1ページ完結)
├── style.css
├── images/ogp.jpg      # LINE等でURLを共有したときのプレビュー画像
└── media/              # サンプル動画(Web用に軽量化済み)+ poster.jpg
```

**`docs/` に内部向けのファイルを置かないこと。** この手順書と `domain-setup.md` は
もともと `docs/` にあったが、公開すると `https://aniostea.com/README.md` として
誰でも読めてしまうため `business/` に移した(価格が仮設定であることや、
ドメインの契約情報が外から見える状態だった)。作業メモは必ず `business/` 側に置く。

## 差し替え済みの項目(記録)

`index.html` にあったプレースホルダーは**すべて置換済み**(残存0件):
LINE友だち追加URL / 連絡用メール `hello@aniostea.com` / 屋号 `aniostea อนิโอซเตีย`。

## 内容の確認(公開前に決めること)

- **価格**(฿590 / ฿1,290 / +฿290)は市場調査に基づく仮の設定。実際の作業時間で見直す
  (`biz-quote` Skillの「価格の組み立て方」を参照)
- **納期3日・修正2〜3回・返金条件**は約束になるので、守れる内容か確認する
- **写真の取り扱い(30日で削除等)** は約束として書いてある。実際の運用と一致させる

## GitHub Pages で公開する

1. GitHub → Settings → Pages
2. Source: `Deploy from a branch` / Branch: `main` / フォルダ: **`/docs`** → Save
3. Custom domain に `aniostea.com` を入力 → Save
4. **先に Cloudflare 側を DNS only(プロキシOFF)にしておく**。ONのままだと
   証明書が発行されず Enforce HTTPS がグレーアウトしたままになる → `domain-setup.md`
5. DNSチェックが通ったら **Enforce HTTPS をON**、その後 Cloudflare の
   SSL/TLS を **Full (Strict)** にする(Flexible のままだとリダイレクトループ)

## 独自ドメイン `aniostea.com`(取得済み)

**2026-08-01 に Cloudflare Registrar で取得済み**(Active / 自動更新ON /
2027-08-01 まで)。ネームサーバーは `desiree.ns.cloudflare.com` /
`lynn.ns.cloudflare.com`。

`index.html` のOGP絶対URLは `https://aniostea.com/` に書き換え済み。

**DNSレコードと、Cloudflare特有のSSL設定(ここを外すとサイトが開かない)は
`domain-setup.md` を参照すること。**

`docs/CNAME` はあえて置いていない。中身が実在しないドメインだと Pages が配信を止めて
しまうため。GitHub の Settings → Pages で Custom domain を設定すると自動で作られる。

## 公開後の確認

- [ ] スマホ実機で開いて崩れがないか(タイ語が □ になっていないか)
- [ ] **LINEの自分専用トーク(Keepメモ)にURLを送り、プレビュー画像とタイトルを確認**
      (LINEはプレビューをキャッシュするので、直したら `?v=2` を付けて再確認)
- [ ] サンプル動画が再生できるか(モバイル回線でも)
- [ ] LINEボタンから実際に友だち追加できるか
- [ ] 詳細は `website-quality-check` Skill

## サンプル動画の差し替え

いまのサンプルは `gift-video/orders/sample-site-th`(タイ語・50秒・両画角)。
作り直したら次のコマンドでWeb用に軽量化して差し替える:

```bash
O=gift-video/orders/sample-site-th/output
ffmpeg -y -i $O/sample-site-th_landscape_1920x1080.mp4 -vf scale=1280:720 \
  -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p \
  -c:a aac -b:a 96k -movflags +faststart docs/media/sample-landscape.mp4
ffmpeg -y -i $O/sample-site-th_portrait_1080x1920.mp4 -vf scale=608:1080 \
  -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p \
  -c:a aac -b:a 96k -movflags +faststart docs/media/sample-portrait.mp4
# ポスター画像は必ず「人が写っている場面」から取る
ffmpeg -y -ss 35 -i $O/sample-site-th_landscape_1920x1080.mp4 -frames:v 1 \
  -vf scale=1280:-1 -q:v 3 docs/media/poster.jpg
```

**poster.jpg は手紙カードの場面から取らないこと。** 淡い背景だけが写り、
動画枠が「読み込み失敗」に見える(実際に一度その状態で公開しかけた)。

実際のお客様の作品(**掲載許可を得たもののみ**)に差し替えると説得力が上がる。
許可が取れない間は、いまのデモ(写真は素材)を使い、
「※ ตัวอย่างนี้ใช้รูปสาธิต(サンプル素材です)」の注記を消さないこと。

サイトに書いてある尺(`ประมาณ 50 วินาที`)は動画を差し替えたら合わせて直す。
