---
name: image-to-video
description: 静止画(写真・イラスト)をAIでプロンプトの指示通りに自然に動かして動画にする手順。「画像を動画にしたい」「写真を動かして」「この絵を〜のように動かして」「image to video」「AIで動画生成」のタスクで使う。Veo(Gemini API)を使う gift-video/scripts/i2v.py での生成、動きの指示(モーションプロンプト)の書き方、外部サービスで作った動画の整形、ギフト動画シーンへの組み込みまで。ズーム/パン等のカメラワークだけで良い場合は illustration-animation を使う。
---

# 静止画をプロンプト通りに動かして動画にする(image-to-video)

`gift-video/scripts/i2v.py` を使う(要ffmpeg)。**まず方式を決める**:

| 方式 | 何が動くか | コスト | 使うSkill |
|---|---|---|---|
| **AI生成(このSkill)** | 絵の中身そのもの(髪がなびく・波が打つ・人が振り向く・炎が揺れる) | 有料API or 外部サービス。1本1〜5分。仕上がりに当たり外れあり | image-to-video |
| **カメラワーク** | 絵は静止のまま、視点だけ(ズーム/パン/揺れ) | 無料・数秒・確実 | illustration-animation |

「動きを付けたい」だけならまずカメラワークで足りないか考える。
被写体自体の動きを指示されたとき(「〜が動くように」)だけAI生成を使う。

## 前提: 生成手段の確認

1. **Gemini API(推奨・自動化できる)**: 環境変数 `GEMINI_API_KEY` が必要。
   Veo(動画生成)は**有料ティアのみ**(1本数十円〜数百円)。ユーザーに費用がかかることを
   伝えてから実行する。使えるモデルは `python scripts/i2v.py --list-models` で確認
2. **外部サービス(手動)**: APIが使えない場合は Kling / Hailuo (MiniMax) / Runway 等の
   Web画面をユーザーに案内し、生成した動画をダウンロードしてもらう
   → `--normalize-only` で整形する(後述)

## 素材(入力画像)の準備

- 形式: PNG / JPG / WebP。**720p以上**(小さい画像は生成品質が落ちる)
- アスペクト比は生成したい動画に合わせて**先にクロップ**しておく(16:9 か 9:16。
  合っていないと構図が意図せず切れる):

  ```bash
  ffmpeg -i in.png -vf "crop=min(iw\,ih*16/9):min(ih\,iw*9/16)" cropped.png   # 16:9
  ffmpeg -i in.png -vf "crop=min(iw\,ih*9/16):min(ih\,iw*16/9)" cropped.png   # 9:16
  ```

- SVG原稿は先に `artwork/tools/rasterize.py` でPNG化する

## モーションプロンプトの書き方(いちばん重要)

日本語の依頼を**英語のモーションプロンプト**に組み立てる。構成:

```
[被写体と現状] + [どう動くか(1つに絞る)] + [カメラ] + [速度・雰囲気]
```

### 動きは3層に分けて書く

「画面全体が自然に動いてほしい」という依頼はほぼ必ず来る。ここで主動作を並べると
破綻するので、**層を分けて、増やすのは3層目だけ**にする:

1. **主動作(必ず1つだけ)** — 髪を編む、皿に料理を移す、顔を両手で包む
2. **表情・呼吸** — まばたき、目を伏せる、唇を結ぶ、息で胸が上下する、涙が溜まるが落ちない
3. **アンビエントな微動(いくらでも足してよい)** — 髪・布・湯気・埃・草木・水面・
   光のゆらぎ・背景の人通り。破綻の原因にならず、"生きた画"になるかを決めるのはここ

3層目を書かないと、被写体だけ動いて背景が止まった「動く写真」になりやすい。
それを避けるため、共通スタイルに
`Full live-action motion: ... Nothing in the frame is a frozen still image.` を、
負のプロンプトに `static frozen image, cinemagraph, parallax photo effect, ken burns zoom,
motionless background, frozen faces` を入れておく。

- **主動作は1〜2個に絞る**。欲張ると破綻する(顔が溶ける・指が増える)
- 静止画の内容は変えない前提で書く(「turns into...」のような変身指示は破綻しやすい)
- ゆっくり自然に: `slowly` `gently` `subtly` を多用する。激しい動きほど破綻リスクが上がる
- カメラを動かしたくなければ `static camera, no camera movement` を足す
- 破綻対策の負のプロンプト: `--negative-prompt "distortion, morphing, warping, extra fingers"`

**例1** 「この夫婦の写真、2人が微笑み合う感じで動かして」(主動作=向き合って微笑む)
> A couple standing in a park slowly turn to each other and smile warmly. They blink and
> their shoulders rise with a breath. Their hair and clothes stir in the breeze, leaves
> move behind them and the light shifts across their faces. Static camera, photorealistic.

**例2** 「この海のイラスト、波と雲が動くように」(主動作=波)
> An illustrated seascape. Waves roll gently onto the shore and retreat. Clouds drift
> slowly across the sky, beach grass sways and light glitters on the water. The
> illustration style stays exactly the same. Slow ambient motion, static camera.

※ 人物写真は安全フィルタで生成拒否されることがある(エラーに理由が出る)。
その場合は表現を穏当にするか、別カット・イラストで試す。

## 生成する

```bash
cd gift-video
python scripts/i2v.py photo.png --prompt "..." \
    --out orders/x-001/input/scene1.mp4 --fit-duration 10
```

- 出力はシーン素材と同じ **H.264 / yuv420p / 30fps / 音声なし**(16:9→1920x1080、
  9:16→1080x1920 を画像から自動判定)。単体でLINEに送る用途で生成音声を残すなら `--keep-audio`
- Veoの生成は**最大8秒**。`--fit-duration` でシーン尺(目標尺÷シーン数)まで
  スロー再生(1.6倍まで)またはループで自動延長する。ループのつなぎ目は目視確認
- **当たり外れがある**前提で、重要なシーンは2〜3回生成して良い方を選ぶ(その分費用がかかる)。
  生成した元動画は `<出力名>.raw.mp4` に残るので、整形のやり直しに再利用できる
- モデル名が404になったら `--list-models` で現行名を確認して `--model` で指定する

## 外部サービスで生成した動画を使う

ダウンロードしたmp4をパイプライン仕様に整えるだけ(API不要):

```bash
python scripts/i2v.py --normalize-only downloaded.mp4 \
    --out orders/x-001/input/scene1.mp4 --fit-duration 10
```

## ギフト動画への組み込み

`orders/<注文ID>/input/sceneN.mp4` に出力すればそのまま使える。以降は通常フロー
(precheck → assemble → qc。Skill `gift-video-run` / `gift-video-batch`)。
シーンの音声は付けない(BGMは組み立て時に別で付く)。

## 品質チェック

- [ ] **画面のどこかが静止画のまま止まっていないか**(背景・布・髪が固まっていると
      「動く写真」に見える)。止まっていたらアンビエント層(3層目)を書き足して再生成
- [ ] 全編再生して破綻がない(顔・手・文字が溶ける/歪む/増える)。あれば再生成:
      主動作を1つに減らす・`subtly` を足す・`--negative-prompt` を付ける
- [ ] 指示した動きになっている(意図しないカメラ移動・別人化がない)
- [ ] `--fit-duration` でループ延長した場合、つなぎ目が目立たない
- [ ] どうしても破綻が直らないときは `illustration-animation`(カメラワーク)に切り替える
- [ ] ギフト動画に使う場合は最終的に `qc.py` の ALL PASS を確認
