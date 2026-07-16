---
name: gift-video-run
description: ギフト動画 組み立てパイプライン(gift-video/)の実行手順。「ギフト動画」「動画を組み立て」「assemble」「qc」のタスクで使う。注文フォルダ作成(new_order.py)→ 組み立て(assemble.py)→ 品質チェック(qc.py)を順に実行し、QCがALL PASSになるまで直す。
---

# ギフト動画パイプラインの実行

> **前提**: このパイプラインは PR #1(`claude/work-sample-creation-beodne` ブランチ)の
> `gift-video/` ディレクトリに入っている。作業ブランチに `gift-video/` が無い場合は、
> まずPR #1をマージするか該当ブランチを取り込むこと。無いまま進めない。

3シーン構成(約30秒)のパーソナライズギフト動画を、AI生成済みのシーン素材から自動で組み立てる。

## 必要環境

- Python 3 + ffmpeg(`new_order.py` が起動時に自動チェックし、無ければ導入手順を表示する)
- 日本語テキストを使う場合は日本語フォント(Noto Sans JP)。配置場所は `gift-video/README.md` 参照
- Windowsでは `winget` でffmpegを導入(READMEに手順あり)

## 手順

すべて `gift-video/` ディレクトリを基準に実行する。

1. **注文フォルダの作成**

   ```bash
   python scripts/new_order.py <注文ID>
   # 実素材なしで全体を試すとき(グラデーション+ラベルのダミーシーンと正弦波BGMを生成):
   python scripts/new_order.py <注文ID> --dummy
   ```

   `orders/<注文ID>/` に `order.yaml` / `input/` / `output/` ができる。

2. **素材と設定の準備**
   - `input/scene1.mp4, scene2.mp4, scene3.mp4 ...` を番号順に配置(scene4以降を置けば自動で増える)
   - `input/bgm.*`(BGM)を配置
   - `order.yaml` で宛名・記念日・中央メッセージ・`message_start_sec`・縦型の crop/pad などを設定
   - 既存の設定例: `orders/sample-001`(英語・crop)、`orders/sample-002`(日本語・pad)

3. **組み立て**

   ```bash
   python scripts/assemble.py orders/<注文ID>
   ```

   縦型 1080x1920 と横型 1920x1080 を `output/` に生成。BGMは -14 LUFS に正規化され
   末尾2秒フェードアウト。失敗時は `output/work/` の中間ファイルで原因を調べる。

4. **品質チェック(必須)**

   ```bash
   python scripts/qc.py orders/<注文ID>
   ```

   総再生時間(28〜35秒)・解像度・コーデック・ラウドネス・テキストタイミングを自動判定。
   **ALL PASS になるまで納品しない**(不合格時は exit 1)。

5. **目視確認**: ffmpegでフレームを数枚抽出し、キャプション・紙テクスチャの場面転換・
   中央メッセージのフェードイン・ラスト2秒の名前+記念日、日本語の文字化けが無いことを確認する。

## トラブル時

- まず `--dummy` で作った注文がALL PASSするか確認し、環境問題か素材問題かを切り分ける
- 詳細仕様(禁則処理、クロスフェード、出力パラメータ)は `gift-video/README.md` と
  各スクリプトのdocstringを参照
