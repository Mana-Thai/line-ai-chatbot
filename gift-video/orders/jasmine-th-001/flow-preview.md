# STEP 1: Google Flow で質感の下見(無料)

目的は**この作品の質感がAI生成で成立するかの見極め**だけ。ここで作った動画は本番に
使わない(本番9シーンはKlingで通す。混ぜると色味・粒状感が揃わないため)。

Flow は `prompts.md` とプロンプトの書き方が少し違う。Flow はアップロードした画像を
**`@名前` でプロンプト内から参照する**仕様なので、下の専用プロンプトを使う。

## 手順(スマホ / モバイル版)

モバイル版は画面下の**プロンプト欄1つ**に集約されている(PC版の Ingredients パネルは無い)。

1. https://labs.google/flow を開き、Googleアカウントでログイン
2. **モデルを動画用に変える**(最重要)。プロンプト欄の中にあるモデル名のチップ
   (初期状態は `🍌 Nano Banana 2` = **画像**生成モデル)をタップし、**Veo** 系の
   動画モデルを選ぶ。ここを変えないと動画ではなく静止画が出てクレジットを無駄にする
3. 同じチップの `x2`(1回で2本作る設定)は **x1** に下げるとクレジットの消費を抑えられる
4. プロンプト欄の左の **`+`** をタップして画像を2枚添付
   - `mother-young.jpg`(母・若い頃)/ `child.jpg`(娘・6歳)
5. 下のプロンプト(@タグなし版)を貼る
6. 右の矢印で生成

PC版が使えるなら、そちらの方が Ingredients(Subject/Scene/Style)や比率の指定が
細かくできて楽。その場合は下の「@タグあり版」を使う。

## 貼り付けるプロンプト(モバイル版・@タグなし)

添付画像がそのまま参照として効くので、人物はプロンプト内で言葉で描写する。

```
Morning in a simple wooden house in rural Thailand. A Thai woman in her late 50s with sun-tanned skin and hair in a low bun with grey strands, wearing a faded floral blouse, braids the hair of her 6-year-old daughter before school. She hums quietly. Warm morning light through slatted windows. Close on the hands braiding. Cinematic 35mm film look, anamorphic, shallow depth of field, gentle film grain, muted warm amber colors, quiet and restrained mood. Handheld with minimal movement. 16:9. No text, no captions, no on-screen words. Avoid saturated colors, glossy commercial look, stock-footage smiles.
```

## 貼り付けるプロンプト(PC版・@タグあり)

PC版で Ingredients に画像を登録した場合は、Flowが付けた名前に `@mother` `@child` を
置き換えて使う。

```
Morning in a simple wooden house in rural Thailand. @mother, a Thai woman in her late 50s with sun-tanned skin and hair in a low bun with grey strands, wearing a faded floral blouse, braids the hair of @child, her 6-year-old daughter, before school. She hums quietly. Warm morning light through slatted windows. Close on the hands braiding. Cinematic 35mm film look, anamorphic, shallow depth of field, gentle film grain, muted warm amber colors, quiet and restrained mood. Handheld with minimal movement. No text, no captions, no on-screen words.
```

Negative(除外指定の欄がある場合):

```
saturated colors, glossy commercial look, stock-footage smiles, hearts, sparkles, fast cuts
```

## 見るポイント(ここを判断する)

- [ ] **肌の質感**が自然か(のっぺりした作り物っぽさが出ていないか)
- [ ] **フィルムの粒状感と落ち着いた色味**が出ているか(ブリーフの狙い)
- [ ] **広告のようなツヤ感・作り笑い**になっていないか(NEGATIVEで排除したかったもの)
- [ ] **手の動き**(髪を編む所作)が破綻していないか ← AI動画が最も苦手な部分
- [ ] 母と娘が**設定画の顔に似ている**か

## 終わったら

生成された動画をダウンロードして共有してほしい。質感の評価と、必要ならKling本番用の
プロンプト調整を行う。判断としては次の3つに分かれる:

| 結果 | 次の一手 |
|---|---|
| 質感OK | STEP 2(Kling本生成・約$5.9)へ進む |
| 惜しい(方向性は合っている) | プロンプトを調整して再度下見、またはKlingのpro($11.8)を検討 |
| 手の破綻がひどい | シーン1を「手元のアップ」から「引きの画」に変える等、脚本側で回避する |
