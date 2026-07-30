---
name: drama-video-anime
description: 写真の人物・ペットをアニメキャラ化し、アニメ作品のように動いて話すドラマ動画を作る手順。「アニメにしたい」「アニメ風の動画」「キャラが動いてしゃべる」「アニメのショートストーリー」「思い出をアニメ化」のタスクで使う。image-stylizeでキャラ設定画を作り、Veo 3.1(gift-video/scripts/drama_clip.py)で口パク・演技・セリフ音声付きのアニメクリップを生成、gift-videoパイプラインで1本に仕上げる。実写調にしたい場合は drama-video-liveaction を使う。
---

# アニメ風ドラマ動画を作る

流れは実写版(`drama-video-liveaction`)と同じだが、**先に「キャラ設定画」を作る工程が入る**
のがアニメ版の要。写真を直接Veoに渡すのではなく、いったんアニメ絵に変換してから
参照画像に使うことで、全シーンで同じキャラデザインが保たれ、実在人物の生成制約にも
かかりにくくなる。

## 前提(必ず最初に確認・依頼者に伝える)

- **有料課金が必須・料金が高い**: 8秒1本で約$1(Fast)〜$3(Standard)、1分もので
  リテイク込み$15〜30目安(+設定画の画像生成が1枚約$0.04)。biz-quote で実費を織り込む
- **本人の同意**: アニメ化しても元は預かり写真。写っている本人の了解を得る
- スクリプトは費用防止のため出力済みシーンをスキップする(作り直しは `--overwrite`)

## 制作フロー

### 1. キャラ設定画を作る(image-stylize Skill)

写真からアニメ調の設定画を**正面+横向き(または全身)の2〜3枚**作る:

```bash
python3 artwork/tools/stylize.py photo1.jpg photo2.jpg --style anime --count 3 \
  --prompt "キャラクターシート風、正面向き、全身、無地の背景" --out chara/front.png
python3 artwork/tools/stylize.py photo1.jpg photo2.jpg --style anime --count 3 \
  --prompt "同じキャラクターの横向き、無地の背景" --out chara/side.png
```

**ここで依頼者にキャラデザインのOKをもらってから**次へ進む(以降の全シーンの見た目が
この設定画で決まる。後から変えると全シーン作り直し=費用も倍かかる)。

### 2. 脚本を作る

```yaml
# drama.yaml
style: >
  Japanese anime style, 2D cel animation, clean line art, vibrant colors,
  expressive character acting, detailed painted background, soft lighting.
  The dialogue is in Japanese.
refs: [chara/front.png, chara/side.png]   # 設定画を全シーン共通の参照に(最大3枚)
aspect: "16:9"
duration: 8
scenes:
  - id: 1
    prompt: 桜並木の通学路。少女が走ってきて立ち止まり、息を整えて「待って、一緒に行こう!」と言う
  - id: 2
    prompt: 同じ少女が夕暮れの教室で窓の外を見て、小さく微笑む。カメラはゆっくり寄る
```

### 3. テスト生成 → 本生成 → 仕上げ

```bash
cd gift-video
python3 scripts/drama_clip.py --scenes drama.yaml --out-dir orders/x-001/input --dry-run  # 内容と費用を確認
python3 scripts/drama_clip.py --prompt "(scene1の内容)" --refs chara/front.png --out test.mp4 --fast
# キャラの再現と動きを依頼者に確認してもらい、OKなら全シーンをStandardで
python3 scripts/drama_clip.py --scenes drama.yaml --out-dir orders/x-001/input
```

生成前に表示される**概算費用を依頼者に伝えて了解を取る**。仕上げは通常フロー:
precheck → assemble(BGM・テロップ)→ qc(`gift-video-run` Skill)→ `biz-delivery` で納品。

**重要: order.yaml に `mix_scene_audio: true` を必ず設定する**(未設定だとBGMだけに
なりセリフ音声が消える)。脚本や注文フォルダの雛形は実写版の実例
`gift-video/orders/drama-pilot-001/` が使える(スタイル文をアニメ用に差し替える)。

## アニメらしくするプロンプトのコツ

- style に **2D cel animation / clean line art / anime style** を入れ、
  「photorealistic」系の語は使わない(実写に引っ張られる)
- 髪色・服・持ち物など**キャラの特徴を毎シーンのプロンプトにも明記**する
  (例:「ピンクの髪でセーラー服の少女が…」)。設定画+文字指定の二重で固定するのがコツ
- アニメ的な演出語が効く: 「風で髪がなびく」「目を輝かせる」「コミカルに転ぶ」等
- セリフは「」で書くと口パク付きで発話される。8秒で20〜30文字が目安
- 背景だけのシーン(風景・空)を挟むとキャラ一貫性の負担が減り、物語の間も作れる

## よくある失敗と対処

| 症状 | 対処 |
|---|---|
| シーンごとに顔・作画が変わる | 設定画を無地背景で作り直す/毎シーンに特徴の文字指定を足す |
| 実写っぽくなる | style からrealistic系の語を外し「2D cel animation」を強調 |
| 声が毎回変わる | セリフは主役1人に絞る・ナレーション主体にする(仕様上ゼロにはできない) |
| 元の人物に似ていない | 設定画の段階で直す(image-stylize に写真を2〜3枚渡して `--count 3` から選ぶ) |
| 安全フィルタでブロック | 表現を穏当に。アニメ化済みの設定画を参照にすると実写より通りやすい |
| HTTP 404 / 429 | モデルID変更(`--model`で指定)/課金未設定。liveaction版の表と同じ |

## 品質チェック

- [ ] 設定画の段階で依頼者のOKをもらった
- [ ] 全クリップを再生確認(作画崩れ・口パクのズレ・キャラの入れ替わりがない)
- [ ] 概算費用を事前に伝えて了解を得ている
- [ ] qc.py ALL PASS(結合後)・副業案件は business/orders.csv に記録
