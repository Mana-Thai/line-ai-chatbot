# 生成用プロンプト集(Web UIに貼り付ける)

アスペクト比: **16:9** / 全9シーン

使い方: 各シーンの「プロンプト」をコピーしてWeb UIに貼り、参照画像があれば
アップロードして生成する。できた動画を「保存先」のファイル名で保存すれば、
`assemble.py` がそのまま1本に繋ぐ。

※ Web UI 側のクリップ長は選べる範囲が決まっている。下の秒数どおりに作れない
場合はできる長さで作り、あとで `order.yaml` の `target_duration` を合計に合わせる。

## 全シーン共通:出したくない要素(Negative欄がある場合はそこへ)

```
saturated colors, glossy commercial look, stock-footage smiles, hearts, sparkles, fast cuts
```

## シーン 1(目安 10秒)

参照画像としてアップロード: `mother-young.jpg, child.jpg`

保存先: `scene1.mp4`

```
Cinematic 35mm film look, anamorphic, shallow depth of field, soft natural light, warm amber and pale blue palette, gentle film grain, muted colors, quiet and restrained mood. Handheld with minimal movement. Rural and urban Thailand, authentic. No text, no captions, no logos, no on-screen words. MOTHER: Thai woman, late 50s, sun-tanned skin, hair in a low bun with grey strands, faded floral blouse, soft lines around the eyes, calm and unshowy. DAUGHTER: Thai woman, 27, long dark hair, simple cream blouse, gentle but tired eyes.
Morning, wooden house. MOTHER braids her 6-year-old daughter's hair before school, humming. Warm light through slatted windows. Close on the hands braiding.
```

## シーン 2(目安 5秒)

参照画像としてアップロード: `mother-young.jpg, child.jpg`

保存先: `scene2.mp4`

```
Cinematic 35mm film look, anamorphic, shallow depth of field, soft natural light, warm amber and pale blue palette, gentle film grain, muted colors, quiet and restrained mood. Handheld with minimal movement. Rural and urban Thailand, authentic. No text, no captions, no logos, no on-screen words. MOTHER: Thai woman, late 50s, sun-tanned skin, hair in a low bun with grey strands, faded floral blouse, soft lines around the eyes, calm and unshowy. DAUGHTER: Thai woman, 27, long dark hair, simple cream blouse, gentle but tired eyes.
Simple dinner. MOTHER moves the piece of fish onto her daughter's plate, then eats plain rice herself. She doesn't say anything. Static shot, candid.
```

## シーン 3(目安 10秒)

参照画像としてアップロード: `mother-young.jpg, adult-child.jpg`

保存先: `scene3.mp4`

```
Cinematic 35mm film look, anamorphic, shallow depth of field, soft natural light, warm amber and pale blue palette, gentle film grain, muted colors, quiet and restrained mood. Handheld with minimal movement. Rural and urban Thailand, authentic. No text, no captions, no logos, no on-screen words. MOTHER: Thai woman, late 50s, sun-tanned skin, hair in a low bun with grey strands, faded floral blouse, soft lines around the eyes, calm and unshowy. DAUGHTER: Thai woman, 27, long dark hair, simple cream blouse, gentle but tired eyes.
Rural roadside. Young woman with a suitcase about to leave. MOTHER pushes a small folded banknote deep into her pocket and pats it twice. Neither speaks.
```

## シーン 4(目安 5秒)

参照画像としてアップロード: `adult-child.jpg`

保存先: `scene4.mp4`

```
Cinematic 35mm film look, anamorphic, shallow depth of field, soft natural light, warm amber and pale blue palette, gentle film grain, muted colors, quiet and restrained mood. Handheld with minimal movement. Rural and urban Thailand, authentic. No text, no captions, no logos, no on-screen words. MOTHER: Thai woman, late 50s, sun-tanned skin, hair in a low bun with grey strands, faded floral blouse, soft lines around the eyes, calm and unshowy. DAUGHTER: Thai woman, 27, long dark hair, simple cream blouse, gentle but tired eyes.
Bangkok office at night, near-empty. DAUGHTER at her desk, checks a salary notification on her phone. She looks at it for a long moment. Cool fluorescent light.
```

## シーン 5(目安 5秒)

参照画像としてアップロード: `adult-child.jpg`

保存先: `scene5.mp4`

```
Cinematic 35mm film look, anamorphic, shallow depth of field, soft natural light, warm amber and pale blue palette, gentle film grain, muted colors, quiet and restrained mood. Handheld with minimal movement. Rural and urban Thailand, authentic. No text, no captions, no logos, no on-screen words. MOTHER: Thai woman, late 50s, sun-tanned skin, hair in a low bun with grey strands, faded floral blouse, soft lines around the eyes, calm and unshowy. DAUGHTER: Thai woman, 27, long dark hair, simple cream blouse, gentle but tired eyes.
Department store. DAUGHTER holds up a soft blue blouse, checking the price, calculating. She decides, and smiles very slightly to herself.
```

## シーン 6(目安 10秒)

参照画像としてアップロード: `mother-now.jpg`

保存先: `scene6.mp4`

```
Cinematic 35mm film look, anamorphic, shallow depth of field, soft natural light, warm amber and pale blue palette, gentle film grain, muted colors, quiet and restrained mood. Handheld with minimal movement. Rural and urban Thailand, authentic. No text, no captions, no logos, no on-screen words. MOTHER: Thai woman, late 50s, sun-tanned skin, hair in a low bun with grey strands, faded floral blouse, soft lines around the eyes, calm and unshowy. DAUGHTER: Thai woman, 27, long dark hair, simple cream blouse, gentle but tired eyes.
Upcountry house. MOTHER unwraps a parcel, finds the blue blouse. She holds it against herself in front of an old spotted mirror, shy, almost embarrassed to like it. Touches her grey hair.
```

## シーン 7(目安 10秒)

参照画像としてアップロード: `mother-now.jpg, adult-child.jpg`

保存先: `scene7.mp4`

```
Cinematic 35mm film look, anamorphic, shallow depth of field, soft natural light, warm amber and pale blue palette, gentle film grain, muted colors, quiet and restrained mood. Handheld with minimal movement. Rural and urban Thailand, authentic. No text, no captions, no logos, no on-screen words. MOTHER: Thai woman, late 50s, sun-tanned skin, hair in a low bun with grey strands, faded floral blouse, soft lines around the eyes, calm and unshowy. DAUGHTER: Thai woman, 27, long dark hair, simple cream blouse, gentle but tired eyes.
Wooden porch, late afternoon. DAUGHTER sits behind her MOTHER, gently combing and dyeing her grey hair. The exact reverse of the childhood braiding. Golden hour, dust in the air.
```

## シーン 8(目安 10秒)

参照画像としてアップロード: `mother-now.jpg, adult-child.jpg`

保存先: `scene8.mp4`

```
Cinematic 35mm film look, anamorphic, shallow depth of field, soft natural light, warm amber and pale blue palette, gentle film grain, muted colors, quiet and restrained mood. Handheld with minimal movement. Rural and urban Thailand, authentic. No text, no captions, no logos, no on-screen words. MOTHER: Thai woman, late 50s, sun-tanned skin, hair in a low bun with grey strands, faded floral blouse, soft lines around the eyes, calm and unshowy. DAUGHTER: Thai woman, 27, long dark hair, simple cream blouse, gentle but tired eyes.
DAUGHTER kneels and offers a white jasmine garland. MOTHER takes her face in both hands and looks at her for a long time. Tears held back, not falling.
```

## シーン 9(目安 5秒)

参照画像: なし(人物の顔が写らないシーン)

保存先: `scene9.mp4`

```
Cinematic 35mm film look, anamorphic, shallow depth of field, soft natural light, warm amber and pale blue palette, gentle film grain, muted colors, quiet and restrained mood. Handheld with minimal movement. Rural and urban Thailand, authentic. No text, no captions, no logos, no on-screen words. MOTHER: Thai woman, late 50s, sun-tanned skin, hair in a low bun with grey strands, faded floral blouse, soft lines around the eyes, calm and unshowy. DAUGHTER: Thai woman, 27, long dark hair, simple cream blouse, gentle but tired eyes.
Close-up: two pairs of hands holding a white jasmine garland with a pale blue ribbon. Sunlight, soft focus. Camera holds still, then slowly fades.
```
