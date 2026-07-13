# フォントの配置

このフォルダに **Noto Sans JP** の .ttf / .otf を置くと、
パイプラインが最優先で使用します(日本語・英語の両方に対応)。

## ダウンロード手順

1. https://fonts.google.com/noto/specimen/Noto+Sans+JP を開く
2. 「Get font」→「Download all」で zip をダウンロード
3. zip 内の `NotoSansJP-Regular.ttf` (static/ フォルダ内にある場合もあります) を
   このフォルダにコピー

## 置かない場合のフォールバック

- Windows: Noto Sans JP → 游ゴシック → メイリオ → MSゴシック の順で探索
- Linux: `sudo apt install fonts-noto-cjk` (Noto Sans CJK JP)
- macOS: ヒラギノ角ゴシック

フォントが見つからない場合、スクリプトはこの手順を表示して停止します。
