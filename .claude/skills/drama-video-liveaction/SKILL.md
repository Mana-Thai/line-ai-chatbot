---
name: drama-video-liveaction
description: 預かった写真の人物・ペットが実写ドラマのように動いて話す動画を作る手順。「実写ドラマにしたい」「写真の人が動いてしゃべる動画」「ショートドラマ」「セリフ付きの記念動画」「本人が演技する映像」のタスクで使う。Veo 3.1(gift-video/scripts/drama_clip.py)で口パク・演技・セリフ音声付きの8秒クリップを参照画像で人物を統一しながら生成し、gift-videoパイプラインで1本のドラマに仕上げる。アニメ調にしたい場合は drama-video-anime を使う。
---

# 実写ドラマ風動画を作る

`gift-video/scripts/drama_clip.py` を使う(Veo 3.1)。人物が動き、口パク付きでセリフを
話し、効果音・環境音も同時生成される。1クリップ最大8秒なので、複数シーンを生成して
gift-video パイプラインで1本に結合する。

## 前提(必ず最初に確認・依頼者に伝える)

- **有料課金が必須**: Veo は無料枠では使えない。`GEMINI_API_KEY` に支払い設定が必要
- **料金が高い**: 8秒1本で約$1(Fast)〜$3(Standard)。**1分のドラマはリテイク込みで
  $15〜30(¥2,500〜5,000)** が目安。副業案件なら biz-quote でAPI実費を織り込むこと
- **本人の同意が必須**: 実在の人物を動かして話させる動画になる。写っている本人の明確な
  了解を得る。有名人・第三者の写真は使わない
- スクリプトは費用防止のため**出力済みシーンをスキップ**する(作り直しは `--overwrite`)

## 制作フロー

### 1. 脚本を作る(依頼者と合意してから生成に進む)

シーン表を YAML で作る。各シーンは4/6/8秒。セリフは「」で書くとリップシンク付きで発話される:

```yaml
# drama.yaml
style: >
  Cinematic live-action drama scene, photorealistic, natural skin texture,
  soft window lighting, shallow depth of field, 35mm film look.
  The dialogue is in Japanese.
refs: [chara/face.jpg, chara/full.jpg]   # 全シーン共通の参照画像(最大3枚)
aspect: "16:9"        # 縦型ドラマなら "9:16"
duration: 8
scenes:
  - id: 1
    prompt: 朝の台所。女性がコーヒーを入れながら振り向いて微笑み、「おはよう、今日は特別な日だね」と言う
  - id: 2
    prompt: 同じ女性が玄関で靴を履き、ドアを開けて外の光に目を細める。カメラはゆっくり寄る
```

### 2. 参照画像を用意する

- 預かり写真から**顔がはっきり写ったもの+全身**の1〜3枚を選ぶ(ブレ・逆光は避ける)
- 全シーンに**同じ参照画像**を渡すのが一貫性の要。服装・髪型もプロンプトに毎回明記する

### 3. テスト生成 → 本生成

```bash
cd gift-video
# まず1シーンだけFastで試す(約$1)。本人らしさ・声・雰囲気を依頼者に確認してもらう
python3 scripts/drama_clip.py --scenes drama.yaml --out-dir orders/x-001/input --fast --dry-run  # 内容確認
python3 scripts/drama_clip.py --prompt "(scene1の内容)" --refs chara/face.jpg --out test.mp4 --fast

# OKが出たら全シーンをStandardで生成
python3 scripts/drama_clip.py --scenes drama.yaml --out-dir orders/x-001/input
```

生成前に表示される**概算費用を必ず依頼者に伝えて了解を取る**。

### 4. 1本に仕上げる(gift-video)

クリップは `orders/<注文ID>/input/sceneN.mp4` に出力されるので、あとは通常フロー:
precheck → assemble(BGM・テロップ)→ qc ALL PASS(`gift-video-run` Skill)。
納品は `biz-delivery` Skill(透かしプレビュー → 入金 → 本納品)。

## 実写らしくするプロンプトのコツ

- style には **photorealistic / natural skin texture / cinematic lighting / 35mm** 等を入れる
- シーンごとに**カメラ指示**(close-up、slow push-in、handheld 等)と**演技**(表情・動作)を書く
- セリフは短く(8秒で日本語20〜30文字程度)。長台詞は2シーンに割る
- 音の指示も書ける(「雨の音」「静かなピアノBGM」等。BGMは後から assemble でも載る点に注意)

## よくある失敗と対処

| 症状 | 対処 |
|---|---|
| 顔が本人に似ない | 参照画像をはっきりした写真に替える/顔アップ+全身の組み合わせにする |
| シーンごとに声が変わる | 仕様上ゼロにはできない。セリフは主役1人に絞る・ナレーション主体の構成にする |
| 服装・髪型が変わる | 毎シーンのプロンプトに服装を明記(例:「白いシャツと青いエプロンの」) |
| 安全フィルタでブロック | 実在人物系で起きやすい。表現を穏当にする・参照画像を替える。子どもの写真は特に通りにくい |
| HTTP 404(モデルID) | Veoのモデル名が更新された可能性。エラーに出るcurlで一覧を確認し `--model` で指定 |
| HTTP 429 | 課金未設定かレート制限。キーの支払い設定を確認 |

## 品質チェック

- [ ] 全クリップを再生確認(顔・手の破綻、口パクとセリフのズレ、不自然な動きがない)
- [ ] 本人の同意を得ている・概算費用を事前に伝えて了解を得ている
- [ ] qc.py ALL PASS(結合後)
- [ ] 副業案件は business/orders.csv に記録(biz-order-ledger)
