# drama-pilot-001 — 縦型ショートドラマ パイロット第1話「用済みの妻」

オリジナル脚本の約1分(8秒×8シーン)の縦型ドラマ。手順の詳細は
Skill `drama-video-liveaction` を参照。

## 生成手順

前提: `GEMINI_API_KEY`(**有料課金設定済み**)が環境変数か リポジトリ直下の `.env` にあること。

```bash
cd gift-video

# 0) 送る内容と概算費用の確認 (APIは呼ばない)
python3 scripts/drama_clip.py --scenes orders/drama-pilot-001/drama.yaml \
    --out-dir orders/drama-pilot-001/input --dry-run

# 1) まず scene1 だけ Fast でテスト生成 (約$1)。雰囲気・人物・声を確認する
python3 scripts/drama_clip.py --scenes orders/drama-pilot-001/drama.yaml \
    --out-dir orders/drama-pilot-001/input --fast
#    → 良ければ input/ を空にして本生成へ。Fastのまま全話進めてもOK

# 2) 本生成 (Standard・8シーンで約$26目安。出力済みシーンはスキップされる)
python3 scripts/drama_clip.py --scenes orders/drama-pilot-001/drama.yaml \
    --out-dir orders/drama-pilot-001/input

# 3) BGMを input/bgm.mp3 に置く (静かなピアノ等。セリフの邪魔をしない曲)
#    mix_scene_audio: true なのでBGMは自動で小さく(0.3倍)ミックスされる

# 4) 結合 → 品質チェック
python3 scripts/precheck.py drama-pilot-001
python3 scripts/assemble.py drama-pilot-001
python3 scripts/qc.py drama-pilot-001
#    → output/drama-pilot-001_portrait_1080x1920.mp4 が完成品
```

## 品質を上げるオプション

- **人物の一貫性**: 主人公役の写真(または image-stylize で作った設定画)があれば
  `drama.yaml` の `refs:` を有効にする(最大3枚)。無い場合は style の文字指定のみで生成
- **失敗シーンの作り直し**: 該当の `input/sceneN.mp4` を消して再実行(成功分はスキップ)
- 全シーンを作り直すときは `--overwrite`

## 費用目安 (2026-07時点)

| 生成 | 費用 |
|---|---|
| scene1テスト(Fast 8秒) | 約$1.2 |
| 全8シーン(Standard) | 約$26 |
| リテイク2〜3回込みの現実的な合計 | $30〜40 (¥4,500〜6,000) |
