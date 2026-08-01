# -*- coding: utf-8 -*-
"""SVG/HTMLを高解像度PNGに書き出す (ヘッドレスChrome/Chromium/Edgeを利用)。

    python artwork/tools/rasterize.py design.svg --out print.png --width 3600
    python artwork/tools/rasterize.py design.svg --out preview.png --width 800 --background "#1A1A1A"
    python artwork/tools/rasterize.py quote.html --out quote.png --width 1080 --height 1528

- SVG: 背景は既定で透明 (プリント入稿用)。--background で生地色プレビューを作れる。
  高さ省略時はSVGのviewBox/width/heightから自動計算
- HTML (.html/.htm): ページをそのまま指定サイズで撮影 (見積書など文書のPNG化用。
  --height 必須)
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
import struct
import subprocess
import sys
import tempfile
import zlib
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


def viewport_gap(browser: str, probe_h: int = 1000) -> int:
    """--window-size で指定した高さと、実際のビューポート高さの差を測る。

    ヘッドレスChromeは --window-size=W,H を指定しても、ビューポートが H より
    数十px低くなる(この環境では87px)。スクリーンショットは H px で出力されるため、
    差のぶんだけページが描かれない帯が下端に残る。SVGは 100vh に合わせて
    縮むので**縦横比まで狂う**。ここで実測して補正する。

    追加ライブラリを増やさないよう、画像を読まずに --dump-dom で innerHeight を拾う。
    測れなければ 0 を返す(従来どおりの挙動になるだけで、壊れはしない)。
    """
    probe = ('<!doctype html><meta charset="utf-8"><body><script>'
             'document.body.textContent="VPH="+window.innerHeight</script></body>')
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "probe.html"
        p.write_text(probe, encoding="utf-8")
        try:
            proc = subprocess.run(
                [browser, "--headless", "--disable-gpu", "--no-sandbox",
                 "--hide-scrollbars", "--force-device-scale-factor=1",
                 "--dump-dom", f"--window-size=800,{probe_h}", p.resolve().as_uri()],
                capture_output=True, text=True, timeout=60)
        except (subprocess.SubprocessError, OSError):
            return 0
    m = re.search(r"VPH=(\d+)", proc.stdout or "")
    if not m:
        return 0
    gap = probe_h - int(m.group(1))
    return gap if 0 <= gap < probe_h // 2 else 0


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def crop_png_bottom(path: Path, keep_h: int) -> bool:
    """PNGの下端を切り落として高さを keep_h にする(標準ライブラリのみ)。

    PNGの各行は「フィルタ種別1バイト + 画素データ」で、フィルタは自分より上の行しか
    参照しない。よって**末尾の行を捨てるだけ**なら再フィルタ不要で安全に切れる。
    8bitの非インターレースPNGのみ対応(Chromeの出力はこれ)。それ以外は False。
    """
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        return False
    pos, ihdr, idat = 8, None, bytearray()
    while pos + 8 <= len(raw):
        ln = struct.unpack(">I", raw[pos:pos + 4])[0]
        tag = raw[pos + 4:pos + 8]
        body = raw[pos + 8:pos + 8 + ln]
        if tag == b"IHDR":
            ihdr = body
        elif tag == b"IDAT":
            idat += body
        elif tag == b"IEND":
            break
        pos += 12 + ln
    if not ihdr:
        return False
    w, h, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", ihdr[:13])
    if depth != 8 or interlace != 0 or keep_h >= h:
        return False
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(color)
    if not channels:
        return False
    stride = 1 + w * channels
    rows = zlib.decompress(bytes(idat))[:stride * keep_h]
    if len(rows) < stride * keep_h:
        return False
    new_ihdr = struct.pack(">II", w, keep_h) + ihdr[8:13]
    path.write_bytes(b"\x89PNG\r\n\x1a\n"
                     + _png_chunk(b"IHDR", new_ihdr)
                     + _png_chunk(b"IDAT", zlib.compress(rows, 9))
                     + _png_chunk(b"IEND", b""))
    return True


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

    src_path = Path(args.svg)
    if not src_path.is_file():
        sys.exit(f"ERROR: 入力ファイルが見つかりません: {src_path}")
    is_html = src_path.suffix.lower() in (".html", ".htm")

    W = args.width
    bg_css = args.background or "transparent"
    if is_html:
        if not args.height:
            sys.exit("ERROR: HTML入力では --height を指定してください")
        H = args.height
        page_uri = src_path.resolve().as_uri()
        page = None
    else:
        svg = src_path.read_text(encoding="utf-8")
        if "<svg" not in svg:
            sys.exit(f"ERROR: SVGファイルではないようです: {src_path}")
        H = args.height or max(2, round(W * svg_aspect(svg)))
        if H % 2:
            H += 1  # 動画素材への転用も考えて偶数に
        page = (f'<!doctype html><html><head><meta charset="utf-8"><style>'
                f'html,body{{margin:0;padding:0;background:{bg_css};overflow:hidden}}'
                f'svg{{display:block;width:100vw;height:100vh}}'
                f'</style></head><body>{svg}</body></html>')

    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    browser = find_browser()

    with tempfile.TemporaryDirectory() as td:
        if page is not None:
            page_file = Path(td) / "page.html"
            page_file.write_text(page, encoding="utf-8")
            page_uri = page_file.resolve().as_uri()
        # ビューポートが要求より低い分だけ窓を高くして描かせ、あとで下端を切る。
        # (補正しないと下端に未描画の帯が残り、SVGは 100vh に潰されて縦横比が狂う)
        gap = viewport_gap(browser)
        win_h = H + gap
        cmd = [browser, "--headless", "--disable-gpu", "--no-sandbox",
               "--hide-scrollbars", "--force-device-scale-factor=1",
               "--default-background-color=00000000",
               f"--screenshot={out}", f"--window-size={W},{win_h}",
               page_uri]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0 or not out.is_file():
            tail = "\n".join((proc.stderr or "").splitlines()[-10:])
            sys.exit(f"ERROR: ラスタライズに失敗しました\n{tail}")

    if gap and not crop_png_bottom(out, H):
        print(f"注意: 下端 {gap}px を切れませんでした。出力は {W}x{H + gap}px です")

    kb = out.stat().st_size / 1024
    print(f"[done] {out}  {W}x{H}px / {kb:.0f}KB / 背景: {bg_css}")


if __name__ == "__main__":
    main()
