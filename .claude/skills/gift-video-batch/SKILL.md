---
name: gift-video-batch
description: ギフト動画を複数本まとめて量産するときの一括処理手順。「動画を複数作る」「まとめて」「一括で」「全注文」のタスクで使う。注文リスト(CSV)から make_orders.py で注文フォルダを一括生成し、precheck.py で素材を事前チェックし、batch.py で全件を組み立て+QCして PASS/FAIL 一覧で報告する。
---

# ギフト動画の一括量産(複数注文)

複数本(例: 1分動画×10件)を効率よく作るためのフロー。すべて `gift-video/` を基準に実行。
1本だけなら `gift-video-run` を使う。

## フロー全体

```
注文リスト(CSV) → make_orders.py → 素材配置 → precheck.py --all → batch.py → 一覧報告
```

## 手順

1. **注文リストの用意** — ユーザーから受け取った注文情報(名前・記念日・メッセージ等)を
   CSVにまとめる。雛形:

   ```bash
   python scripts/make_orders.py --template > orders.csv
   ```

   列: `order_id, couple_names, anniversary_date, scene1_caption, message,
   message_start_sec, target_duration, portrait_mode`
   (最初の3列が必須。1分動画は `target_duration` を 60 に。ExcelのBOM付きUTF-8も可)

2. **注文フォルダの一括生成**

   ```bash
   python scripts/make_orders.py orders.csv
   ```

   既存の `order.yaml` は上書きしない(明示的に指示された場合のみ `--force`)。

3. **素材の配置** — 各 `orders/<order_id>/input/` に `scene1.mp4...` と `bgm.mp3` を配置。
   尺のルール: シーン合計 ≒ `target_duration`(1分なら約60秒。例: 10秒×6本)

4. **素材の事前チェック** — エンコードは1件数分かかるため、先に全件の問題を洗い出す

   ```bash
   python scripts/precheck.py --all
   ```

   FAILがあれば素材を直してから次へ(詳細は `gift-video-material-check` Skill)。

5. **一括処理**

   ```bash
   python scripts/batch.py                  # orders/ 直下の全注文
   python scripts/batch.py id-001 id-002    # 対象を絞る場合
   ```

   1件失敗しても止まらず全件処理し、最後に「注文ID / 尺 / PASS・FAIL / 失敗ステップと理由」の
   一覧表を表示する(1件でも失敗なら exit 1)。

6. **報告** — batch.py の一覧表をもとに、PASSした注文(納品可能: `output/` の縦型・横型mp4)と
   FAILした注文(原因と対処)を分けてユーザーに報告する。FAILは素材修正 →
   `python scripts/batch.py <失敗した注文ID>` で該当分だけ再実行する

## 注意

- `orders/*/input/`・`output/` はgitignore済み。素材や完成動画はコミットしない
- 大量の注文でも `batch.py` は逐次処理(ffmpegがCPUを使い切るため並列化しない)
- 全件が同じ原因でFAILする場合は素材の作り方(尺・解像度)を先に直すほうが早い
