# -*- coding: utf-8 -*-
"""SVGを高解像度PNGに書き出す (ヘッドレスChrome/Chromium/Edgeを利用)。

    python artwork/tools/rasterize.py design.svg --out print.png --width 3600
    python artwork/tools/rasterize.py design.svg --out preview.png --width 800 --background "#1A1A1A"

- 背景は既定で透明 (プリント入稿用)。--background で生地色プレビューを作れる
- 高さ省略時はSVGのviewBox/width/heightから自動計算
- 追加ライブラリ不要。Chrome / Chromium / Edge のどれかがあれば動く
  (Claude Codeのリモート環境は /opt/pw-browsers のChromiumを自動検出。
   Windowsはインストール済みのChrome/Edgeを自動検出)
"""
from __future__ import annotations

import argparse
import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

_BROWSER_CANDIDATES = [
    "chromium", "chromium-browser", "google-chrome", "google-chrome-stable",
    "chrome", "msedge", "microsoft-edge",
]
_BROWSER_GLOBS = [
    "/opt/pw-browsers/chromium-*/chrome-linux/chrome",          # Claude Code リモート環境
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


def find_browser() -> str:
    if os.environ.get("CHROME_PATH") and Path(os.environ["CHROME_PATH"]).is_file():
        return os.environ["CHROME_PATH"]
    for name in _BROWSER_CANDIDATES:
        path = shutil.which(name)
        if path:
            return path
    for pattern in _BROWSER_GLOBS:
        hits = sorted(glob.glob(pattern))
        if hits:
            return hits[0]
    sys.exit("ERROR: Chrome/Chromium/Edge が見つかりません。インストールするか "
             "環境変数 CHROME_PATH に実行ファイルのパスを設定してください。")


def svg_aspect(svg: str) -> float:
    """SVGの縦横比 (height/width) を viewBox または width/height 属性から求める。"""
    m = re.search(r'viewBox\s*=\s*"[\d.\-]+[ ,]+[\d.\-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"', svg)
    if m:
        w, h = float(m.group(1)), float(m.group(2))
        if w > 0:
            return h / w
    mw = re.search(r'<svg[^>]*\swidth\s*=\s*"([\d.]+)', svg)
    mh = re.search(r'<svg[^>]*\sheight\s*=\s*"([\d.]+)', svg)
    if mw and mh and float(mw.group(1)) > 0:
        return float(mh.group(1)) / float(mw.group(1))
    return 1.0


def main() -> None:
    ap = argparse.ArgumentParser(description="SVGを高解像度PNGに書き出す")
    ap.add_argument("svg", help="入力SVGファイル")
    ap.add_argument("--out", required=True, help="出力PNGのパス")
    ap.add_argument("--width", type=int, required=True,
                    help="出力の幅px (印刷は300dpi目安: 10cm=1200px / 30cm=3600px)")
    ap.add_argument("--height", type=int, default=None,
                    help="出力の高さpx (省略時はSVGの縦横比から自動計算)")
    ap.add_argument("--background", default=None,
                    help="背景色 (例: '#1A1A1A'=濃色生地プレビュー。省略時は透明)")
    args = ap.parse_args()

    svg_path = Path(args.svg)
    if not svg_path.is_file():
        sys.exit(f"ERROR: SVGが見つかりません: {svg_path}")
    svg = svg_path.read_text(encoding="utf-8")
    if "<svg" not in svg:
        sys.exit(f"ERROR: SVGファイルではないようです: {svg_path}")

    W = args.width
    H = args.height or max(2, round(W * svg_aspect(svg)))
    if H % 2:
        H += 1  # 動画素材への転用も考えて偶数に
    bg_css = args.background or "transparent"

    html = (f'<!doctype html><html><head><meta charset="utf-8"><style>'
            f'html,body{{margin:0;padding:0;background:{bg_css};overflow:hidden}}'
            f'svg{{display:block;width:100vw;height:100vh}}'
            f'</style></head><body>{svg}</body></html>')

    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    browser = find_browser()

    with tempfile.TemporaryDirectory() as td:
        page = Path(td) / "page.html"
        page.write_text(html, encoding="utf-8")
        cmd = [browser, "--headless", "--disable-gpu", "--no-sandbox",
               "--hide-scrollbars", "--force-device-scale-factor=1",
               "--default-background-color=00000000",
               f"--screenshot={out}", f"--window-size={W},{H}",
               page.resolve().as_uri()]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0 or not out.is_file():
            tail = "\n".join((proc.stderr or "").splitlines()[-10:])
            sys.exit(f"ERROR: ラスタライズに失敗しました\n{tail}")

    kb = out.stat().st_size / 1024
    print(f"[done] {out}  {W}x{H}px / {kb:.0f}KB / 背景: {bg_css}")


if __name__ == "__main__":
    main()
