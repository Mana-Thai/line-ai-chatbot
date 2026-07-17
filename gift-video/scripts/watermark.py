# -*- coding: utf-8 -*-
"""動画に透かし(ウォーターマーク)を入れて、支払い前の確認用プレビューを作る。

    python scripts/watermark.py orders/x-001/output/x-001_portrait_1080x1920.mp4 \
        --out preview.mp4 --text "SAMPLE"

中央に大きく半透明のテキストを重ねる。納品版は透かしなしの元ファイルを渡す。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import PipelineError, ff_quote


def main() -> None:
    ap = argparse.ArgumentParser(description="動画に確認用の透かしを入れる")
    ap.add_argument("video", help="入力動画 (mp4)")
    ap.add_argument("--out", required=True, help="出力mp4のパス")
    ap.add_argument("--text", default="SAMPLE", help='透かし文字 (既定: "SAMPLE")')
    args = ap.parse_args()

    src = Path(args.video)
    if not src.is_file():
        raise PipelineError(f"入力動画が見つかりません: {src}")
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    ffmpeg = common.find_tool("ffmpeg")
    font = common.find_font()
    # 中央に大きく1つ + 左上に小さく1つ (切り抜き対策)
    text = args.text.replace("'", "")
    vf = (f"drawtext=fontfile={ff_quote(font)}:text='{text}':"
          f"fontsize=h/8:fontcolor=white@0.35:borderw=2:bordercolor=black@0.2:"
          f"x=(w-text_w)/2:y=(h-text_h)/2,"
          f"drawtext=fontfile={ff_quote(font)}:text='{text}':"
          f"fontsize=h/28:fontcolor=white@0.5:x=20:y=20")
    common.run([ffmpeg, "-y", "-i", str(src), "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "copy", "-movflags", "+faststart", str(out)])
    print(f"[done] {out}  (透かし: {args.text})")


if __name__ == "__main__":
    try:
        main()
    except PipelineError as e:
        common.die(e)
