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

## レジストラの選択(2026-07 調査)

| レジストラ | 初年度 | 更新料 | WHOIS代行 |
|---|---|---|---|
| **Cloudflare Registrar**(推奨) | 約 $10.44 | **同額のまま**(原価販売・上乗せなし) | 無料・既定でON |
| お名前.com | 初年度は安いことが多い | **約2,700円**(表示価格+「サービス維持調整費」26.50%) | 有料のことがある |
| Namecheap | 中程度 | 中程度 | 無料 |

**Cloudflare Registrar を推奨する。** 決め手は更新料で、お名前.com は 2026-07-01 時点で
表示価格に **26.50% の「サービス維持調整費」**が上乗せされ、更新のたびに効いてくる。
Cloudflare は原価販売で**登録時と更新時が同額**、WHOIS代行も既定でONのため追加費用がない。

新規ドメインを Cloudflare で直接登録できる(他社から移管してくる必要はない)。
無料プランのアカウントで取得できる。

## 取得手順(Cloudflare Registrar)

1. Cloudflare のアカウントを作る(無料プランでよい)
2. ダッシュボード → **Domain Registration → Register Domain** で `aniostea.com` を検索
3. **購入画面で空き状況を必ず再確認する**(この調査から時間が経つと他者に取られている場合がある)
4. 支払い情報を入力して購入。**WHOIS代行は既定でONなので追加操作は不要**
   (念のため個人の住所・氏名・電話が公開設定になっていないか確認する)
5. **自動更新をONのままにしておく**(失効するとサイトが消える)

購入すると DNS は自動的に Cloudflare 管理になるので、次の「DNS設定」は Cloudflare の
ダッシュボードで行う。

## DNS設定(購入後)

レジストラのDNS管理画面で以下を設定する:

| 種別 | 名前 | 値 |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `mana-thai.github.io` |

### ⚠️ Cloudflare で取得した場合の必須設定(ここを外すとサイトが開かない)

Cloudflare は既定で通信を自社経由にする(**プロキシ=オレンジ色の雲**)。
このままだと GitHub Pages と噛み合わず、**2つの症状のどちらかで必ず詰まる**:

- **証明書が発行されない** — プロキシONだと GitHub が Let's Encrypt 証明書を発行できず、
  Settings → Pages の Enforce HTTPS が永久にグレーアウトしたままになる
- **リダイレクトループ**(`ERR_TOO_MANY_REDIRECTS`)— SSL/TLS モードが既定の
  **Flexible** だと、Cloudflare↔GitHub 間で http と https を互いに押し付け合って無限に転送される

**対処(この順で行う):**

1. DNS画面で上記5レコードすべてを **「DNS only」(灰色の雲)** にする。
   プロキシOFFの状態で GitHub に証明書を発行させる
2. **SSL/TLS → Overview を `Full (Strict)` に変更**する。既定の `Flexible` のままにしない
3. GitHub 側で証明書が発行され Enforce HTTPS がONにできるようになってから、
   プロキシを使いたい場合のみオレンジ雲に戻す(**使わなくても支障はない**。
   GitHub Pages 自体がCDN配信なので、灰色のままで問題ない)

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
- [ ] `ERR_TOO_MANY_REDIRECTS` が出ない(出たら SSL/TLS モードが `Flexible` のまま)
- [ ] LINEの自分専用トーク(Keepメモ)にURLを送り、**プレビュー画像とタイトルが出る**
- [ ] 鍵アイコン(HTTPS)が出ている
