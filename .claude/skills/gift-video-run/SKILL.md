---
name: gift-video-run
description: ギフト動画 組み立てパイプライン(gift-video/)で1本の動画を作る手順。「ギフト動画」「動画を組み立て」「assemble」「qc」のタスクで使う。注文フォルダ作成(new_order.py)→ 素材チェック(precheck.py)→ 組み立て(assemble.py)→ 品質チェック(qc.py)を順に実行し、QCがALL PASSになるまで直す。尺はorder.yamlのtarget_durationで指定(30秒〜1分等)。複数本まとめて作るときは gift-video-batch を使う。
---

# ギフト動画パイプラインの実行(1本)

シーン素材(scene1〜N.mp4)とBGMから動画を組み立てる。すべて `gift-video/` を基準に実行。
**複数注文をまとめて処理する場合はこのSkillではなく `gift-video-batch` を使う。**

## 必要環境

- Python 3.10+ / PyYAML / ffmpeg / 日本語フォント。各スクリプトが起動時に自動チェックし、
  無ければ導入手順を表示する(Windowsは `winget install --id Gyan.FFmpeg`、
  Linuxは `sudo apt install ffmpeg fonts-noto-cjk`)

## 手順

1. **注文フォルダの作成**

   ```bash
   python scripts/new_order.py <注文ID>
   # 約1分の動画にする場合(target_duration: 60 が書き込まれる):
   python scripts/new_order.py <注文ID> --target-sec 60
   # 実素材なしの全体テスト(ダミーシーン+正弦波BGM。1分なら --scenes 6 推奨):
   python scripts/new_order.py <注文ID> --target-sec 60 --dummy --scenes 6
   ```

2. **素材と設定の準備**
   - `orders/<注文ID>/input/` に `scene1.mp4, scene2.mp4, ...`(番号順に連結・数は可変)と
     `bgm.mp3` を配置
   - `order.yaml` を記入: `couple_names` / `anniversary_date`(必須)、`scene1_caption`、
     `message`、`message_start_sec`、`portrait_mode`(crop/pad)
   - **尺のルール**: 完成尺 ≒ シーン素材の合計秒数(紙テクスチャ転換は既定では尺を変えない)。
     `target_duration` の −2〜+5秒 が合格範囲。1分なら合計約60秒(例: 10秒×6本)にする

3. **素材の事前チェック(推奨)** — エンコード前に問題を検出できる

   ```bash
   python scripts/precheck.py <注文ID>
   ```

4. **組み立て** — 縦型1080x1920と横型1920x1080を `output/` に生成

   ```bash
   python scripts/assemble.py <注文ID>
   ```

   計算上の尺が `target_duration` の許容範囲外だと**エンコード前に**エラーで止まる。
   失敗時は `output/work/` のフィルタグラフ・ログで原因を調べる。

5. **品質チェック(必須)** — ALL PASS になるまで納品しない

   ```bash
   python scripts/qc.py <注文ID>
   ```

   尺(target_duration基準)・解像度・コーデック・ラウドネス(-14 LUFS)・
   テキストタイミングを自動判定。不合格は exit 1。

6. **目視確認**: ffmpegでフレームを数枚抽出し、キャプション・場面転換・中央メッセージの
   フェードイン・ラスト2秒の名前+記念日・日本語の文字化けが無いことを確認する

## トラブル時

- まず `--dummy` の注文がALL PASSするか確認し、環境問題か素材問題かを切り分ける
- 尺が合わない: precheck が「あと何秒分」を表示する。シーンを増減するか、
  意図した尺なら `target_duration` を変更する
- 詳細仕様(禁則処理、クロスフェード、出力パラメータ)は `gift-video/README.md` を参照
