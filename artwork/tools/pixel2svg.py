# -*- coding: utf-8 -*-
"""テキストのグリッド(1文字=1ドット)からピクセルアートのSVGを作る。

    python artwork/tools/pixel2svg.py sprite.txt --palette "X=#1A1A1A,R=#E0453A" --out sprite.svg

グリッドファイルの例 (sprite.txt):
    ..RR.RR..
    .RRRRRRR.
    .RRRRRRR.
    ..RRRRR..
    ...RRR...
    ....R....

- `.` / 半角スペース / `_` は透明 (パレット指定で上書き可)
- 出力SVGは shape-rendering="crispEdges" 付き。何倍に拡大してもドットの角が
  にじまない。PNG化は rasterize.py (幅は グリッド列数の整数倍 を指定)
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

TRANSPARENT_CHARS = {".", " ", "_"}


def parse_palette(spec: str) -> dict[str, str]:
    palette: dict[str, str] = {}
    for pair in spec.split(","):
        pair = pair.strip()
        if not pair:
            continue
        if "=" not in pair:
            sys.exit(f"ERROR: パレットの形式が不正です: {pair} (例: X=#1A1A1A)")
        ch, color = pair.split("=", 1)
        ch, color = ch.strip(), color.strip()
        if len(ch) != 1:
            sys.exit(f"ERROR: パレットのキーは1文字にしてください: {ch}")
        if color.lower() in ("transparent", "none"):
            palette[ch] = ""
            continue
        if not re.fullmatch(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", color):
            sys.exit(f"ERROR: 色は #RGB か #RRGGBB で指定してください: {color}")
        palette[ch] = color
    return palette


def main() -> None:
    ap = argparse.ArgumentParser(description="テキストグリッドからピクセルアートSVGを生成")
    ap.add_argument("grid", help="グリッドのテキストファイル (1文字=1ドット)")
    ap.add_argument("--palette", required=True,
                    help='文字→色の対応 (例: "X=#1A1A1A,R=#E0453A,W=#FFFFFF")')
    ap.add_argument("--out", required=True, help="出力SVGのパス")
    args = ap.parse_args()

    path = Path(args.grid)
    if not path.is_file():
        sys.exit(f"ERROR: グリッドファイルが見つかりません: {path}")
    rows = [r for r in path.read_text(encoding="utf-8").splitlines() if r.strip() != ""]
    if not rows:
        sys.exit("ERROR: グリッドが空です")

    palette = parse_palette(args.palette)
    cols = max(len(r) for r in rows)

    unknown = sorted({ch for r in rows for ch in r}
                     - set(palette) - TRANSPARENT_CHARS)
    if unknown:
        sys.exit(f"ERROR: パレットに無い文字があります: {' '.join(unknown)}\n"
                 f"--palette に追加してください (透明にするなら X=transparent)")

    # 同じ色が横に続く区間を1つの rect にまとめる
    rects: list[str] = []
    count = 0
    for y, row in enumerate(rows):
        x = 0
        while x < cols:
            ch = row[x] if x < len(row) else "."
            color = palette.get(ch, "") if ch not in TRANSPARENT_CHARS else ""
            if not color:
                x += 1
                continue
            run = 1
            while x + run < cols:
                nxt = row[x + run] if x + run < len(row) else "."
                if nxt in TRANSPARENT_CHARS or palette.get(nxt, "") != color:
                    break
                run += 1
            rects.append(f'<rect x="{x}" y="{y}" width="{run}" height="1" fill="{color}"/>')
            count += run
            x += run

    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" '
           f'viewBox="0 0 {cols} {len(rows)}" shape-rendering="crispEdges">\n'
           + "\n".join(rects) + "\n</svg>\n")
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(svg, encoding="utf-8")
    print(f"[done] {out}  {cols}x{len(rows)}ドット / 塗り{count}ドット / rect {len(rects)}個")
    print(f"       PNG化: python artwork/tools/rasterize.py {out} --out sprite.png "
          f"--width {cols * 40}  (40倍の例)")


if __name__ == "__main__":
    main()
