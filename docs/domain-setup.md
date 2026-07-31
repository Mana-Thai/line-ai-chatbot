# 独自ドメインの取得と設定

**ドメインの購入はご本人の契約**(クレジットカードとWHOIS登録の本人情報が必要)なので、
ここでは候補・手順・購入後の作業をまとめる。

## 決定: `aniostea.com`

**取得予定のドメインは `aniostea.com`**(ご本人の選択)。2026-07-31 時点で
DNSは `NXDOMAIN` を返すため**未登録=取得可能**。ただし**購入直前に登録画面で
もう一度確認**すること(調査後に他者が取得する可能性がある)。

このドメインは商品名(母の日・ジャスミン等)に寄せていないぶん、**ギフト動画に限らず
アパレル・Web制作も含めた副業全体の看板として使える**。反面、単語として意味が通らないため
**口頭で伝えるときは綴りの確認が要る**(「a-n-i-o-s-t-e-a」)。名刺・LINEプロフィールなど
文字で渡せる導線を用意しておくとよい。

以下は決定前に調査した候補。**再検討する場合の参考**として残す。

### 調査済みの候補(2026-07-31 時点で未登録)

| ドメイン | 意味・狙い | 評価 |
|---|---|---|
| **`maligift.com`** | มะลิ(マリ=ジャスミン)+ gift。母の日の花で、商品の花輪モチーフとも一致 | **第1候補**。短い・意味が通る・.comで無難 |
| `malivideo.co` | マリ+動画。`.co` は短く現代的 | 第2候補。`.com`より安いことが多い |
| `khunmaevideo.com` | คุณแม่(お母さん)+ 動画。意味が最も直接的 | 分かりやすいが長い |
| `thankyoumae.com` | 「ありがとうお母さん」。商品の締めの言葉そのもの | 情緒的。英+タイ混在が好みなら |
| `malimemories.com` | マリ+思い出 | 長いが意味は明快 |
| `mali.gift` | 最も短く印象的 | `.gift`は割高で、一般消費者には`.com`より馴染みが薄い |

(調査時点の推奨は `maligift.com` だった。短くて口頭でも伝えられること、タイ人なら誰でも
「มะลิ」を母の日と結びつけられること、`.com` が最も信頼されることが理由。ただし商品が
母の日ギフトに限定されて見えるため、副業全体の看板にするなら `aniostea.com` の方が広く使える。)

### 避けた方がよいもの(調査済み・すでに登録済み)

`malivideo.com` / `malistudio.com` / `khunmae.com` / `maevideo.com`

## 取得手順

1. レジストラで購入(年1,000〜2,000円程度)
   - **Cloudflare Registrar** — 原価販売で最安・更新料も上がらない。おすすめ
   - お名前.com — 日本語UIだが初年度が安く更新料が高い点に注意
   - Namecheap — WHOIS代行が無料
2. **WHOIS代行(privacy protection)を必ずON**にする。個人の住所・電話が公開されるのを防ぐ
3. 支払いは自動更新をONにしておく(失効するとサイトが消える)

## DNS設定(購入後)

レジストラのDNS管理画面で以下を設定する:

| 種別 | 名前 | 値 |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `mana-thai.github.io` |

## GitHub側の設定

1. リポジトリ → Settings → Pages → **Custom domain** に取得したドメインを入力 → Save
2. DNSチェックが通るまで数分〜1時間待つ
3. **Enforce HTTPS を必ずON**(証明書の発行を待ってから有効になる)

## サイト側の書き換え(忘れやすい)

CNAMEファイルは Settings → Pages で Custom domain を設定すると自動生成される。
あわせて **OGPの絶対URL**を新ドメインに変える。これを忘れるとLINEで共有したときに
プレビュー画像が出ない:

```bash
cd docs
# CNAMEはGitHubが自動生成するので、手で作る必要はない
sed -i 's|https://mana-thai.github.io/line-ai-chatbot/|https://aniostea.com/|g' index.html
grep -n "og:image\|og:url" index.html   # 書き換わったか確認
```

書き換わると次の2行になる(現在は `mana-thai.github.io` を指している):

```html
<meta property="og:image" content="https://aniostea.com/images/ogp.jpg">
<meta property="og:url" content="https://aniostea.com/">
```

## 確認

- [ ] `https://aniostea.com/` が開く(httpでアクセスしてhttpsに転送されるか)
- [ ] `www` あり・なしの両方で開く(`www.aniostea.com` も同じサイトに着くか)
- [ ] LINEの自分専用トーク(Keepメモ)にURLを送り、**プレビュー画像とタイトルが出る**
- [ ] 鍵アイコン(HTTPS)が出ている
