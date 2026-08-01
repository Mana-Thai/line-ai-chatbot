---
name: memorial-video-batch
description: 思い出アルバム動画(写真+手紙の贈り物動画カード)を複数注文まとめて量産する手順。「思い出動画を複数作る」「母の日の注文が何件も来た」「まとめて制作」「注文リストから一括で」のタスク、および同型の注文が2件以上あるときに使う。CSVから注文フォルダと行事別(母の日・誕生日・還暦・退職・クリスマス)・日タイ別の手紙プリセット入りmontage.yamlを一括生成(make_montage_orders.py)し、build_montage→batch.pyで一括組み立て+QCする。1本だけ作るときは memorial-photo-video を使う。
---

# 思い出アルバム動画の量産(一括制作)

`memorial-photo-video` の商品を**複数注文まとめて**作る手順。1本ずつの手作業
(フォルダ作成・手紙の下書き・order.yaml へのコピペ)をスクリプトに任せ、
人の時間は**手紙の仕上げとお客様確認**という商品価値の中心に集中させる。

AI生成を使わないので何本作っても生成コストはゼロ。制作能力の上限は
ヒアリングとお客様確認の往復回数で決まる(そこは省略してはいけない)。

## 全体の流れ

```
受注(LINE) → 台帳記録 → ①CSV → ②一括生成 → ③写真投入(再実行)
  → ④手紙・キャプション仕上げ+お客様確認 → ⑤--sync → ⑥一括ビルド
  → ⑦batch.py(組み立て+QC一括) → ⑧縦型2パス → 納品
```

受注のたびに `business/orders.csv` に記録する(`biz-order-ledger`)。

## 手順

```bash
cd gift-video

# ① 注文リストCSVを作る(雛形を表示して埋める)
python3 scripts/make_montage_orders.py --template > orders.csv

# ② 一括生成(フォルダ+order.yaml+手紙プリセット入り montage.yaml)
python3 scripts/make_montage_orders.py orders.csv

# ③ 各注文の photos/ に時系列順の名前(01-.., 02-..)で写真を入れて再実行
#    → 写真の行が montage.yaml に入る(編集済みの手紙はそのまま保たれる)
python3 scripts/make_montage_orders.py orders.csv

# ④ 各注文の montage.yaml の手紙・caption を仕上げる(下記「プリセットの扱い」)

# ⑤ target_duration / scene_captions を order.yaml へ自動反映
python3 scripts/make_montage_orders.py --sync mom-001 mom-002 bday-001

# ⑥ シーン生成(1件ずつ。件数が多いときはバックグラウンドで回す)
for id in mom-001 mom-002 bday-001; do python3 scripts/build_montage.py $id; done

# ⑦ BGMを各 input/bgm.mp3 に置いてから、一括組み立て+QC
python3 scripts/batch.py mom-001 mom-002 bday-001
#    → 全件の PASS/FAIL 一覧が出る。FAILは gift-video-material-check で潰す
```

### CSVの列(order_id / occasion が必須)

| 列 | 値 |
|---|---|
| `occasion` | mothers-day / birthday / kanreki / retirement / christmas |
| `language` | ja(既定)/ th |
| `sender` | daughter(既定)/ son — **タイ語の自称(หนู/ผม)と文末が変わる**。間違えると不自然 |
| `closing_title` / `closing_date` | 締めの言葉と日付(空なら行事プリセット) |
| `letter_opening` / `letter_closing` | 手紙本文(空ならプリセット。改行は `\n`) |
| `formats` | landscape(既定)/ portrait / both |

### プリセットの扱い(ここが品質の分かれ目)

- プリセットの手紙は**下書き**。そのまま納品しない。ヒアリングで聞いた具体的な
  エピソードを結びに1つ入れる(既製テンプレとの差はここで生まれる)
- 行事×言語の文例と差し替えパターンは `references/occasion-presets.md` を見る
- タイ語の注意点(母の日=8月12日・หนู/ผม・フォントの□)は
  `memorial-photo-video` の references/thai-templates.md が正本
- タイ語の退職・クリスマスはプリセットが**穴埋め**になっている(検証済み文例が
  無いため)。referencesを見て書き、必ずお客様に文字で確認してもらう

### 縦型2パス(formats=both の注文)

横型の一括が終わってから、縦型を注文単位で回す:

```bash
python3 scripts/make_montage_orders.py --sync --set-formats portrait mom-001 mom-002
for id in mom-001 mom-002; do python3 scripts/build_montage.py $id --size 1080x1920; done
python3 scripts/batch.py mom-001 mom-002
```

## 量産時の運用ルール

- **お客様確認は一括で先に**: 全注文の手紙・キャプションを文字だけ先に送って
  確認を取ってから⑥に進む。1件ずつ「作る→直す」を繰り返すと件数分の手戻りになる
- **BGMの使い回しに注意**: 全注文が同じ曲だと「テンプレ感」が出る。2〜3曲を
  ローテーションし、台帳にどの曲を使ったか記録する
- **納期順に処理する**: batch.py に渡す順は台帳の納期順。母の日(タイは8月12日)の
  直前は駆け込みが来るので、締切を「2日前受付終了」と先に案内する
- **長時間コマンドはバックグラウンドで**: ⑥⑦は件数×数十秒〜数分かかる。
  リモートセッションでは10分上限があるためバックグラウンド実行にする
- 納品は `biz-delivery`(透かしプレビュー → 入金 → 本納品)。QRカード等の
  実物とセットにする場合は `qr-video-gift` Skill へ

## 品質チェック(全件に対して)

- [ ] 手紙・キャプションをお客様に文字で確認してもらった(タイ語は声調まで)
- [ ] batch.py が全件 PASS(FAILを残したまま納品しない)
- [ ] 各動画を再生して目視確認(写真の順番・□文字・顔の見切れ)
- [ ] business/orders.csv のステータスを更新した
