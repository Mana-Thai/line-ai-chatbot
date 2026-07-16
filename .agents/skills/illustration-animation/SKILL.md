---
name: illustration-animation
description: イラスト・静止画からアニメーション動画を作る手順。「イラストを動かしたい」「静止画からアニメーション」「絵に動きを付けたい」「パラパラ漫画」のタスクで使う。gift-video/scripts/animate.py のカメラワーク7プリセット(ズーム/パン/揺れ)と連番フレーム方式の使い分け、ギフト動画のシーンへの組み込み、GIF/Web向けの変換までをまとめたもの。
---

# イラストからアニメーションを作る

`gift-video/scripts/animate.py` を使う(要ffmpeg。無ければスクリプトが導入手順を表示)。
方式は2つ。**まずどちらでやるかを決める**:

| 方式 | 必要な素材 | 向いているもの |
|---|---|---|
| **A) カメラワーク** | イラスト1枚だけ | 風景・記念イラストをそのまま動画に。手軽で失敗しない |
| **B) パラパラ漫画** | 差分イラスト2枚以上 | 絵自体が動く(まばたき・口パク・手を振る等)。素材を作る手間がかかる |

## 素材の準備(重要)

- **解像度は出力の1.5〜2倍以上**を用意する(例: 1920x1080出力なら3000px幅以上)。
  ズーム/パンはこの余白を使うため、小さい絵はカクつき・ぼやけの原因になる。
  AI生成イラストは最初から大きめサイズで出力しておく
- 縦型動画(1080x1920)にするなら縦長のイラストを使う(横長絵は左右が大きく切れる)
- 形式: PNG / JPG / WebP

## A) 1枚絵にカメラワークを付ける

```bash
cd gift-video
python scripts/animate.py illust.png --out scene1.mp4 --preset zoom-in --duration 10
```

| プリセット | 動き | 使いどころの目安 |
|---|---|---|
| `zoom-in` | ゆっくり寄る(既定) | 導入・注目させたい絵 |
| `zoom-out` | ゆっくり引く | 全景見せ・ラストシーン |
| `pan-left` / `pan-right` | 横に流れる | 横長の風景・街並み |
| `pan-up` / `pan-down` | 縦に流れる | 縦長の構図・見上げ/見下ろし |
| `sway` | その場でゆらゆら漂う(一周して戻るループ) | 人物・水彩イラスト |

主なオプション: `--duration 秒数` / `--size 1080x1920`(縦型)/ `--crf 18`(画質)

## B) 連番フレーム(パラパラ漫画)

差分イラストをフォルダに入れる(ファイル名順に再生: `frame1.png, frame2.png, ...`)。
2枚でも成立する(例: 目開き/目閉じの交互でまばたき)。

```bash
python scripts/animate.py frames_dir/ --out scene2.mp4 --frame-fps 8 --duration 10
```

- `--frame-fps`: 1秒あたりのコマ数。**4〜8がパラパラらしい質感**、12以上でなめらか
- `--duration` を指定するとコマ送りを自動ループして尺を埋める

## ギフト動画への組み込み

出力仕様(H.264 / yuv420p / 30fps)はギフト動画のシーン素材と同じなので、
`orders/<注文ID>/input/sceneN.mp4` に出力すればそのまま使える:

```bash
python scripts/animate.py illust1.png --out orders/x-001/input/scene1.mp4 --preset zoom-in --duration 10
# 以降は通常フロー: precheck → assemble → qc (gift-video-run / gift-video-batch Skill)
```

シーンの秒数は `目標尺 ÷ シーン数`(1分×6シーンなら各10秒)。

## GIF・Webでの利用

- **LINEに送る・サイトに載せる**: mp4のまま使うのが基本(軽くて高画質。
  サイトでは `<video autoplay muted loop playsinline>` でGIFのように見せられる)
- **どうしてもGIFが必要な場合**(高画質2パス方式):

  ```bash
  ffmpeg -i in.mp4 -vf "fps=12,scale=480:-1,palettegen" palette.png
  ffmpeg -i in.mp4 -i palette.png -filter_complex "fps=12,scale=480:-1[x];[x][1:v]paletteuse" out.gif
  ```

## 品質チェック

- [ ] 再生して動きの方向・速さが意図どおり(数フレーム抽出して目視でも可)
- [ ] カクつき・ぼやけがない(あれば入力イラストの解像度不足 → 大きい絵で作り直す)
- [ ] 絵の大事な部分(顔・文字)がパン/ズームで見切れていない
      (見切れる場合はプリセットを `sway` か `zoom-in` に変える)
- [ ] ギフト動画に使う場合は最終的に `qc.py` の ALL PASS を確認
