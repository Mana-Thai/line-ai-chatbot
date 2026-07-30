# jasmine-th-001 —「白いジャスミンの花輪」

タイの母と娘の短編(セリフなし・9シーン・合計70秒・シネマ横型 1920x1080)。

方針: **Flowは質感の下見だけ。本番9シーンは Kling で通す**(生成サービスを混ぜると
色味・粒状感が揃わないため)。

| ファイル | 中身 |
|---|---|
| `drama.yaml` | 脚本。シーンごとの尺(5/10秒)と参照画像(`ref:`)の正本 |
| `order.yaml` | 仕上げ設定(尺70秒・文字なし・BGMのみ) |
| `prompts.md` | Web UI に貼るためのプロンプト集(`--export-prompts` で再生成できる) |
| `refs/` | 人物の設定画4枚(母=若い頃/現在、娘=幼少/成人) |

## STEP 1: 質感の下見(無料・Google Flow)

1. https://labs.google/flow を開く
2. `prompts.md` の「シーン 1」のプロンプトを貼る
3. 参照画像に `refs/mother-young.jpg` と `refs/child.jpg` をアップロード
4. 生成して質感を確認する

見るポイント: 肌の質感が自然か / フィルムの粒状感と落ち着いた色味が出ているか /
広告のようなツヤ感・作り笑いになっていないか / 手の動き(髪を編む所作)が破綻していないか

**ここで作った動画は本番には使わない**(下見専用)。

## STEP 2: 本生成(Kling・約$5.9)

前提: https://fal.ai でAPIキーを発行し残高を入れて、リポジトリ直下の `.env` に
`FAL_KEY=...` を設定する。

```bash
cd gift-video

# (0) 送る内容と概算費用を確認(APIを呼ばない)
python3 scripts/drama_clip.py --scenes orders/jasmine-th-001/drama.yaml \
    --out-dir orders/jasmine-th-001/input --dry-run

# (1) まずシーン7だけ試す(10秒・約$0.84)。最も難しい「母と娘が同時に写る」場面で
#     人物の再現を確認する
python3 scripts/drama_clip.py --provider kling --duration 10 \
    --refs orders/jasmine-th-001/refs/mother-now.jpg orders/jasmine-th-001/refs/adult-child.jpg \
    --out /tmp/test-scene7.mp4 \
    --prompt "Wooden porch, late afternoon. DAUGHTER sits behind her MOTHER, gently combing and dyeing her grey hair. Golden hour, dust in the air."

# (2) 良ければ全9シーンを生成(約$5.9)。
#     input/ にある仮の絵コンテは自動で実素材に置き換わる
python3 scripts/drama_clip.py --scenes orders/jasmine-th-001/drama.yaml \
    --out-dir orders/jasmine-th-001/input

# (3) BGMを差し替える(input/bgm.mp3 は今は確認用のプレースホルダー)
#     セリフが無い作品なので、BGMが作品の印象をほぼ決める。静かなピアノ・弦が合う

# (4) 結合 → 品質チェック
python3 scripts/precheck.py jasmine-th-001
python3 scripts/assemble.py jasmine-th-001
python3 scripts/qc.py jasmine-th-001
```

完成品: `output/jasmine-th-001_landscape_1920x1080.mp4`

## 作り直し・調整

- 気に入らないシーンは `input/sceneN.mp4` を消して再実行(成功済みは課金されない)
- 品質を上げたい場合は `drama.yaml` の `tier: standard` を `pro` に(単価2倍・約$11.8)
- 尺を変えたら `order.yaml` の `target_duration` を合計秒数に合わせ直す

## 音について

`order.yaml` は `mix_scene_audio: false`(BGMのみ)にしてある。Kling は環境音も生成するが、
**9本のクリップで環境音がばらつくと繋いだときに不自然になる**ため、まずはBGMのみで
仕上げるのが安全。生成後に各クリップの音を聞いて、良ければ `true` にして試す。

## 費用の実績メモ

| 項目 | 費用 |
|---|---|
| アニマティック(絵コンテ) | $0 |
| Flowでの質感下見 | $0(無料クレジット) |
| 本生成 Kling standard 70秒 | 約$5.9 |
| (pro にした場合) | 約$11.8 |
