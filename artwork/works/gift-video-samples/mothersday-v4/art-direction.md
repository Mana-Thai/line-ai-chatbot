# Mother's Day Film v4 — The Light We Make Together

## Emotional correction

v3の物質感と映画品質は維持する一方、暗室、隔たり、空席が生んだ不穏さを取り除く。
母の愛を「失った後に残るもの」ではなく、「今も一緒につくり、直し、歩いている時間」として描く。

## Three acts

1. **Making light** — 朝の木のテーブルで、母と大人になった子がジャスミンと葉を並べ、
   一枚のサイアノタイプを一緒につくる。
2. **Mending together** — 二人の手と視線が同じ白い布に集まり、一本の金糸で繕う。
   隔てる紙や暗い隙間はなく、触れ合いと共同作業を中心に置く。
3. **Walking onward** — タイの穏やかな海辺を二人が手をつないで歩く。
   繕った白布が風を受け、過去ではなくこれから続く時間を示す。

## Visual rules

- Museum-quality analog photography, real skin and fabric texture, subtle film grain.
- Luminous Thai blue, ivory, morning gold, natural skin tones.
- Warmth without commercial posing; joy without exaggerated smiles or sentimentality.
- No dark void, barriers, isolated body parts, empty rooms, farewell sunsets, or death symbolism.
- No baked-in text, hearts, cartoon flowers, vector shapes, or greeting-card decoration.
- Camera motion remains nearly imperceptible so texture and human contact lead the emotion.

## Source and rebuild

- `scene1.png`, `scene2.png`, and `scene3.png` were generated with the built-in image-generation tool
  on 2026-07-22 using the three scene briefs above.
- Animate for 10 seconds each at 1080x1920: scene1=`zoom-in`, scene2=`sway`, scene3=`zoom-out`.
- Generate the original score with `python gen_soundscape.py <output.wav>`.
- Assemble `sample-mothersday-v4`, run precheck and QC, then inspect frames around 2, 12, 25,
  and 28.5 seconds. Confirm warmth, Thai glyphs, safe line breaks, and a clean handoff to the end card.
