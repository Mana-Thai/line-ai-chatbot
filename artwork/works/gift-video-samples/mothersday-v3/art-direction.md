# Mother's Day Film v3 — The Distance Between Two Hands

## Creative decision

「母の日＝花・笑顔・ハート」という説明的な記号を使わない。母親の愛を、子ども向けの
イラストではなく、紙、距離、皺、縫い目、朝の光という物質の痕跡で見せる。

## Three acts

1. **Before memory** — 暗い展示室に吊られた手漉き紙。青い投影の中で小さな手の影だけが残る。
2. **The distance** — 二層の紙越しに、年老いた手と大人の手が触れない。一本の金糸だけがつなぐ。
3. **What remains** — 誰もいない夜明けの部屋。繕われた白いシャツの袖が、抱擁の記憶のように動く。

## Visual rules

- Contemporary gallery installation / analog art-film photography.
- Asymmetry, darkness, physical texture, unresolved negative space.
- No flowers, hearts, faces, cartoons, vector shapes, decorative frames, or greeting-card sentimentality.
- Do not bake typography into generated images. Add only two restrained bilingual text moments in video.
- Motion must be almost imperceptible. The viewer should notice the material before the camera move.

## Source assets

- `scene1.png` — blue projection on handmade paper and a child's hand-shadow.
- `scene2.png` — two hands separated by paper, connected by one gold thread.
- `scene3.png` — hand-mended white shirt on a chair at dawn.

All three images were generated with the built-in image generation tool on 2026-07-22. The final prompts
specified portrait fine-art photography, real material texture, no text, and the visual exclusions above.

## Rebuild notes

- Animate each source for 10 seconds at 1080x1920: scene1=`zoom-in`, scene2=`pan-right`,
  scene3=`zoom-out`. Keep motion below the threshold of spectacle.
- Generate the original soundscape with `python gen_soundscape.py <output.wav>`, then encode it as
  `gift-video/orders/sample-mothersday-v3/input/bgm.mp3`.
- Put the animated files at `gift-video/orders/sample-mothersday-v3/input/scene1.mp4` through
  `scene3.mp4`.
- From `gift-video/`, run `precheck.py`, `assemble.py --keep-work`, and `qc.py` for
  `sample-mothersday-v3`. Inspect frames near 2, 12, 25, and 28.5 seconds; mechanical QC alone does
  not catch missing glyphs or poor line breaks.
- The order is Thai-only inside the film by design. `common.find_font()` detects Thai and selects
  Leelawadee UI / Noto Sans Thai instead of a Japanese-only font.
