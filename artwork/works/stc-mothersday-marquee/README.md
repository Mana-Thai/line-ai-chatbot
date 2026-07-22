# STC Mother's Day Marquee

`stc-marquee-v16.html` のタイポグラフィと梯子を運ぶ演出を継承し、
タイの母の日を祝う13秒のスクエア動画へ再構成した作品。

## Art direction

- メッセージ: `LOVE MOM` / `THANK YOU MOM` / `สุขสันต์วันแม่`
- 色: ジャスミンのアイボリー、母の日の淡いブルー、コーラル、控えめな金
- キャラクター: ジャスミンの髪飾りと母の日ブルーの服を着たピクセルアートの女の子
- 導入: 歩いて登場 → つまずく → 完全に横になって両手を上げる → 笑顔で立ち上がる。回転動作は使わない
- 装飾: 白ジャスミンを抽象化したピクセルの花びら
- 音楽: F majorのベル、フェルトピアノ、柔らかなパッド。文字配置と点灯に同期

## Files

- `stc-marquee-mothersday.html`: 1080 × 1080 Canvasの正本
- `export_webm.js`: Canvasの1ループをWebMへ書き出す補助スクリプト
- `gen_music.py`: 13秒のオリジナル音楽を生成する標準Pythonスクリプト
- `stc-mothersday-marquee-music.wav`: 上記スクリプトの生成物

元データ:
`C:/Users/ASUS/Documents/Codex/2026-07-03/sriracha-tennis-club-stc-index-html/stc-marquee-v16.html`

## Regeneration

```powershell
python artwork\works\stc-mothersday-marquee\gen_music.py
```

`export_webm.js --qc` は検査用時刻固定パラメータを使い、主要7フレームを
`output/playwright/` へ保存する。

HTML下部の「WebMを書き出す」で無音映像を生成し、WAVと結合してH.264/AACの
MP4を作る。最終成果物は `portfolio/assets/stc-mothersday-marquee_1080x1080.mp4`。

## Final QC

- Duration: 13.02 seconds
- Video: H.264, 1080 × 1080, 30 fps, yuv420p
- Audio: AAC, 48 kHz, stereo, 192 kbps
- Loudness: -13.4 LUFS integrated / -1.5 dBTP
- Visual checks: 0.4 / 0.8 / 1.02 / 1.15 / 1.35 / 1.55 / 5.3 / 8.8 / 12.3 seconds checked at full resolution
