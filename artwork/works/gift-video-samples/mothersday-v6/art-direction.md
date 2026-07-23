# Mother's Day Film v6 — Handcrafted Cinema Edit

## Creative decision

物語と7場面はv5を継承するが、編集単位を「1枚＝1カット」から「1章＝3ショット」へ変更する。
派手なエフェクトではなく、視線・手・反復する労働の構図を編集でつなぎ、一般的なテンプレート動画と
明確に差が出る設計にする。

## Picture design

- 7章×8.5秒。各章をワイド、感情または手元のディテール、余韻の3ショットで構成。
- 章内のカメラ軌道・焦点座標は各画像専用。単純な中央ズームは使用しない。
- 第2章「母の縫製」と第6章「娘の仕事」は、手元→顔の同じ編集リズムでマッチさせる。
- 第4章は渡せなかった手紙、第5章は離れる手、第7章は支える手へ視線をつなぐ。
- 全編に低彩度の母の日ブルー、温かいハイライト、抑えたハレーション、微細な粒子を統一適用。
- 章間は紙テクスチャを使わず、物語に合わせた短い光学フェード／ディゾルブでつなぐ。
- 文字、ハート、装飾素材の量で感情を説明しない。

## Sound design

- D majorを中心に、フェルトピアノ、ベル、低いパッドを章ごとに展開。
- 縫製機、布、紙、扉、足音、キーボード、再生開始の小さな音を音楽へ溶かす。
- 第4章は音数を減らし、第6章から和音と空間を広げる。
- 効果音は誇張せず、映像を見て初めて気づく程度の音量にする。

## Final scene

- 母親の涙粒と涙の筋は完全に除去する。
- 母は泣かず、目を伏せた穏やかな笑顔で感情をこらえる。
- 娘が母の手とタブレットを支える構図だけで、理解と感謝を伝える。

## Rebuild

```powershell
python artwork/works/gift-video-samples/mothersday-v6/cinematic_master.py `
  --out gift-video/orders/sample-mothersday-v6/input/scene1.mp4 `
  --work gift-video/orders/sample-mothersday-v6/output/cinematic-work

python artwork/works/gift-video-samples/mothersday-v6/gen_soundscape.py `
  gift-video/orders/sample-mothersday-v6/input/bgm.wav

# WAVをMP3へ変換後、gift-video/ で実行
python scripts/precheck.py sample-mothersday-v6
python scripts/assemble.py sample-mothersday-v6 --keep-work
python scripts/qc.py sample-mothersday-v6
```

