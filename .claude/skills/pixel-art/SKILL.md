---
name: pixel-art
description: ピクセルアート(ドット絵)を作る手順。「ドット絵」「ピクセルアート」「レトロ風」のタスクで使う。テキストのグリッド(1文字=1ドット)で作画し、artwork/tools/pixel2svg.py でSVG化、rasterize.py でにじみのないPNGに書き出す。アパレルプリント・Webゲーム素材・アイコン・パラパラアニメへの展開もカバー。
---

# ピクセルアート(ドット絵)の作成

**テキストのグリッドで作画する**(1文字=1ドット)。Claude/Codexが直接読み書き・修正
しやすく、差分レビューもできるのがこの方式の利点。

## 制作フロー

1. **キャンバスサイズを決める**: 小さく始めるほどドット絵らしくなる。
   目安: アイコン 16x16 / キャラクター 16x16〜32x32 / 大きめの絵 48x48〜64x64
2. **パレットを決める**: **4〜16色**に絞る(色数が少ないほど締まる。
   影は「暗い同系色」を1つ用意する)。アパレル向けなら印刷の色数制限に合わせる
3. **グリッドを書く** — `artwork/works/<作品名>/sprite.txt`:

   ```
   ..RR..RR..
   .RRRRRRRR.
   RRWRRRRRRR      ← W=ハイライトで立体感
   .RRRRRRRR.
   ..RRRRRR..
   ....RR....
   ```

   コツ: 左右対称のモチーフは半分だけ丁寧に作って反転コピー。
   輪郭に最暗色を1周入れるとくっきりする
4. **SVG化 → PNG化**:

   ```bash
   python artwork/tools/pixel2svg.py sprite.txt --palette "R=#E0453A,W=#FFF" --out sprite.svg
   python artwork/tools/rasterize.py sprite.svg --out sprite.png --width 400
   ```

   - `--width` は**列数の整数倍**にする(10列なら 400=40倍)。端数だとドットが不均一になる
   - SVGは `crispEdges` 付きなので、どの倍率でも角がにじまない
5. **必ず画像を目視確認**して、意図と違うドットをグリッドで直す(ここの反復が本体)

## 展開先

| 用途 | やり方 |
|---|---|
| **アパレルプリント** | `apparel-graphic-design` Skillのフローへ。ドット絵は色数が少なくスクリーン印刷と相性が良い。入稿PNGは300dpi(例: 10cm幅なら `--width 1200`、20列なら60倍) |
| **Webゲーム素材** | `new-web-game` のCanvasに `<img>` として読み込み `imageSmoothingEnabled=false` で描画 |
| **パラパラアニメ** | 差分グリッドを `sprite1.txt, sprite2.txt...` で作り、各PNGを `illustration-animation` Skillの連番モードでGIF/mp4化(歩き2〜4コマ、まばたき2コマで十分) |
| **アイコン・favicon** | 16x16や32x32で作り `--width` 512 等で書き出し |

## 品質チェック

- [ ] 拡大PNGでドットの境界がにじんでいない(にじむ場合は `--width` が整数倍か確認)
- [ ] 遠目(縮小表示)で何の絵か分かる — 迷ったらシルエットを先に固める
- [ ] 色数がパレット内に収まっている(pixel2svg.py が未定義色をエラーで検出する)
