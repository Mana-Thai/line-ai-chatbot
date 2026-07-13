# ギフト動画 組み立てパイプライン

AI生成済みのシーン素材(scene1〜N.mp4)とBGMから、約30秒のパーソナライズギフト動画を
自動で組み立てる再利用可能なパイプラインです。注文ごとに独立したフォルダで管理します。

```
gift-video/
├── scripts/
│   ├── new_order.py      # 新規注文フォルダを生成 (--dummy でテスト素材も生成)
│   ├── assemble.py       # 動画を組み立て (縦型/横型を output/ に書き出し)
│   ├── qc.py             # 品質チェック (時間・解像度・コーデック・音量・テキストタイミング)
│   └── common.py         # 共通処理 (環境検出 / order.yaml 読み込み / フォント解決)
├── assets/
│   ├── transition.png    # 場面転換用の紙テクスチャ (なければ自動生成)
│   └── fonts/            # Noto Sans JP を配置 (詳細は fonts/README.md)
└── orders/
    └── {order_id}/
        ├── order.yaml    # 注文情報
        ├── input/        # scene1.mp4, scene2.mp4, ..., bgm.mp3
        └── output/       # 完成動画 + work/(manifest・デバッグ用中間ファイル)
```

## 1. 環境準備

必要なもの: **Python 3.10+ / ffmpeg / PyYAML / 日本語フォント**

### ffmpeg (Windows)

```powershell
ffmpeg -version   # 入っているか確認
winget install --id Gyan.FFmpeg   # なければインストール (要ターミナル再起動)
```

choco 派は `choco install ffmpeg`、手動なら https://www.gyan.dev/ffmpeg/builds/ の
zip を展開して `bin` を PATH に追加してください。macOS は `brew install ffmpeg`、
Linux は `sudo apt install ffmpeg`。

### Python ライブラリ

```powershell
pip install -r requirements.txt
```

### フォント (日英両対応)

Windows では `assets/fonts/` に **Noto Sans JP** (.ttf) を置くのが確実です
(手順は [assets/fonts/README.md](assets/fonts/README.md))。置かない場合は
游ゴシック・メイリオなどのシステムフォントに自動フォールバックします。
Linux は `sudo apt install fonts-noto-cjk` でもOK。

各スクリプトは起動時に ffmpeg / フォントを自動チェックし、
足りなければインストール手順を表示して止まります。

## 2. 使い方

```powershell
cd gift-video

# (1) 新規注文フォルダを作成し、テスト用ダミー素材も生成
python scripts/new_order.py sample-001 --dummy

# (2) order.yaml を編集 (名前・記念日・メッセージなど)

# (3) 組み立て → orders/sample-001/output/ に縦型・横型のmp4が出力される
python scripts/assemble.py sample-001

# (4) 品質チェック (全項目PASSで exit 0)
python scripts/qc.py sample-001
```

`--dummy` はグラデーション+ラベルのダミーシーン3本と正弦波BGMを生成するので、
**実素材がなくてもパイプライン全体をテストできます**。
シーン数やダミー長は `--scenes 4 --scene-sec 8` のように変更できます。

## 3. order.yaml の仕様

```yaml
order_id: "sample-001"
couple_names: "Kenji & Yuki"
anniversary_date: "2021.10.15"
scene1_caption: "Autumn, 2019"      # Scene 1の左下に小さく表示 (空なら非表示)
message: "Thank you for dropping that book."
message_start_sec: 22               # メッセージのフェードイン開始秒 (BGMの山に合わせて調整)
output_formats: ["portrait", "landscape"]  # 1080x1920 / 1920x1080
portrait_mode: "crop"               # 縦型変換: crop=センタークロップ / pad=余白パディング
```

## 4. 組み立ての内容 (assemble.py)

- `input/scene*.mp4` を番号順に連結。**シーン数は可変**(scene4.mp4 を置けば4シーン構成に自動対応)
- シーン間は紙テクスチャを挟んだ**約1秒のクロスフェード**
  (0.5秒で紙へ・0.5秒で次シーンへ。柔らかい水彩画向きの転換。総再生時間はシーン合計と一致)
- テキストオーバーレイ (Noto Sans JP、日英対応):
  - Scene 1 左下: `scene1_caption` (小さめ、1〜6秒でフェードイン/アウト)
  - `message`: 画面中央に `message_start_sec` から3秒かけてゆっくりフェードイン
  - ラスト2秒: `couple_names` と `anniversary_date` を下部中央に表示
- BGM: `loudnorm` で -14 LUFS にノーマライズ → 全体の長さに合わせてトリム → 末尾2秒フェードアウト
  (シーン素材側の音声は使用しない)
- 出力: H.264 (CRF 18) + AAC 192kbps、`+faststart`。縦型は order.yaml の `portrait_mode` で
  センタークロップ / 余白パディングを選択

フィルタ設定値は `output/work/assemble_manifest.json` に記録され、qc.py の照合に使われます。
エラー時は `output/work/` にフィルタグラフ・ログ・テキストファイルが残るので、
そのままデバッグできます(成功時は `--keep-work` を付けた場合のみ保持)。

## 5. 品質チェックの内容 (qc.py)

| 項目 | 基準 |
|---|---|
| 総再生時間 | 28〜35秒の範囲内、かつ組み立て時の想定値と±0.5秒以内 |
| 解像度 | portrait=1080x1920 / landscape=1920x1080 |
| コーデック | 映像 H.264、音声 AAC |
| ラウドネス | 実測の統合ラウドネスが -14 LUFS ±3dB |
| テキストタイミング | manifest のフィルタ設定値が order.yaml の指定と一致 |

## 6. 本番運用 (実素材への差し替え)

ダミーで動作確認が済んでいれば、本番は**素材を入れ替えて再実行するだけ**です。

1. `python scripts/new_order.py {注文ID}` で注文フォルダを作成
2. AI生成済みの実素材を `orders/{注文ID}/input/` に `scene1.mp4`〜`scene3.mp4`
   (各10秒前後)として配置し、`bgm.mp3` を置く
3. `order.yaml` に注文内容を記入(メッセージのタイミングは `message_start_sec` で微調整)
4. `python scripts/assemble.py {注文ID}` → `python scripts/qc.py {注文ID}`
5. QCが ALL PASS なら `output/` の2ファイルを納品

シーン追加オプション(4シーン以上)の注文は、`input/` に `scene4.mp4` 以降を
置くだけで自動的に組み込まれます(スクリプト修正は不要)。
