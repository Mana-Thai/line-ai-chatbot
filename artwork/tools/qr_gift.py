#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""qr_gift.py — 動画URLから印刷用のQRコードを作る。

QRギフト(読み取ると動画が再生されるカード・タグ・写真立て等)用。
誤り訂正レベルH(30%復元)で作るので、印刷のかすれや多少の装飾に耐える。

使い方:
    python3 artwork/tools/qr_gift.py "https://youtu.be/XXXX" --out qr.png
    python3 artwork/tools/qr_gift.py "https://youtu.be/XXXX" --out qr.svg   # 印刷原稿はSVG推奨
    python3 artwork/tools/qr_gift.py "https://youtu.be/XXXX" --out qr.png --scale 20  # 大きく

必要なもの:
    pip install segno   (純Pythonの定番QRライブラリ。他に依存なし)

出力後に印刷サイズの目安(300dpi)を表示する。QRの一辺は **2cm以上** で印刷し、
必ずスマホの実機で読み取り確認をすること(Skill qr-video-gift 参照)。
"""
import argparse
import os
import sys

try:
    import segno
except ImportError:
    sys.exit("エラー: segno が必要です。 pip install segno を実行してください")

# QRの周囲の余白(クワイエットゾーン)。規格の最低は4モジュール。
# これを削ると読み取りが不安定になるので、装飾はこの外側に置く
DEFAULT_BORDER = 4
DPI = 300


def main():
    ap = argparse.ArgumentParser(
        description="動画URLから印刷用QRコード(誤り訂正H)を作る",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("url", help="QRに入れるURL(YouTube限定公開など。後から変えられない)")
    ap.add_argument("--out", default="qr.png", help="出力パス(.png / .svg)")
    ap.add_argument("--scale", type=int, default=12,
                    help="1モジュールあたりのpx(PNGのみ。12で約3.7cm@300dpi)")
    ap.add_argument("--border", type=int, default=DEFAULT_BORDER,
                    help="余白のモジュール数(規格の最低は4。減らさないこと)")
    ap.add_argument("--dark", default="#000000",
                    help="QRの色(背景との明暗差が要る。淡い色は読めなくなる)")
    args = ap.parse_args()

    if args.border < DEFAULT_BORDER:
        print(f"注意: 余白{args.border}は規格最低({DEFAULT_BORDER})未満。読み取りに失敗しやすくなります")
    if not args.url.startswith(("http://", "https://")):
        print("注意: URLが http(s):// で始まっていません。スマホで開けるURLか確認してください")

    qr = segno.make(args.url, error="h")   # H = 30%汚損まで復元可(印刷・装飾向け)
    ext = os.path.splitext(args.out)[1].lower()
    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)

    if ext == ".svg":
        qr.save(args.out, border=args.border, dark=args.dark)
    else:
        qr.save(args.out, scale=args.scale, border=args.border, dark=args.dark)

    modules = qr.symbol_size(border=args.border)[0]     # 余白込みのモジュール数
    px = modules * args.scale
    cm = px / DPI * 2.54
    print(f"保存: {args.out}")
    print(f"  バージョン{qr.version} / 誤り訂正H / {modules}x{modules}モジュール(余白{args.border}込み)")
    if ext != ".svg":
        print(f"  {px}x{px}px → 300dpi印刷で 約{cm:.1f}cm角")
        if cm < 2.0:
            print(f"  注意: 2cm未満は読み取りにくい。--scale {max(args.scale + 2, int(2.0 * DPI / 2.54 / modules) + 1)} 以上を推奨")
    print("  印刷したら必ずスマホの実機で読み取り確認(カメラアプリとLINEのQRリーダー両方)")


if __name__ == "__main__":
    main()
