#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""脚本(drama.yaml)から無料のアニマティック(絵コンテ動画)を作る。

Veo に課金する前に、シーン数・尺・テンポ・構成を実際の動画で確認するためのツール。
AI生成は一切使わず、ffmpeg だけで各シーンの「絵コンテカード」を作り、animate.py で
カメラワークを付けて sceneN.mp4 に書き出す。あとは通常の assemble → qc に乗る。

使い方:
    python3 scripts/build_animatic.py orders/xxx-001/drama.yaml \\
        --out-dir orders/xxx-001/input

各シーンの絵は次の優先順で決まる:
    1. scene の `image:`(指定があればその画像を使う)
    2. scene の `ref:`(refs の設定画などを人物の代役として使う)
    3. どちらも無ければ palette 色のカードのみ

カメラワークは scene の `preset:` があればそれを使い、無ければプロンプトの語
(push-in / handheld / close-up 等)から自動で選ぶ。

BGM が input/bgm.mp3 に無ければ、確認用の静かなプレースホルダーを自動生成する
(本番では実際の楽曲に差し替えること)。
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import textwrap
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import PipelineError

CARD_W, CARD_H = 2880, 1620          # 出力1920x1080に対して1.5倍(ズームの余白)
SCRIPTS_DIR = Path(__file__).resolve().parent
MARKER_NAME = ".animatic"            # 仮の絵コンテであることの印(drama_clip.py が見る)

# シーンの雰囲気に応じた背景色(暖色=室内・夜明け / 寒色=夜・朝)。
# プロンプトの語から選ぶだけの簡易マッピングで、あくまで絵コンテの見分け用
PALETTES = [
    (("dawn", "morning", "sunlight", "amber", "backlit"), "0x241a12", "0x6b4a2f"),
    (("night", "dark", "bulb", "city lights"), "0x0e1418", "0x2c3f4d"),
    (("close-up", "hands", "phone"), "0x1a1614", "0x40342b"),
]
DEFAULT_PALETTE = ("0x171a1c", "0x39434a")

# プロンプトの語 → animate.py のプリセット
PRESET_RULES = [
    (("push-in", "push in", "close-up", "close on", "extreme close"), "zoom-in"),
    (("handheld", "pulls away", "shrinking"), "sway"),
    (("static", "holds still", "wide shot"), "zoom-out"),
]
DEFAULT_PRESET = "zoom-in"

# カメラワークで切れずに残る範囲(セーフエリア)の余白。animate.py の zoompan 式から算出:
#   zoom系は最大1.25倍 → 見えるのは中央80% → 片側10%
#   pan系は1.25倍のまま端から端まで動く → 常に見えるのは中央60% → 片側20%
#   sway は1.12倍+わずかな揺れ → 片側約6.4%
# ここを守らないと絵コンテの文字が画面外に切れる(実際に一度やらかした)
SAFE_MARGIN = {"zoom": 0.115, "pan": 0.21, "sway": 0.075}
LABEL_SIZE, BODY_SIZE, LINE_SPACING = 76, 62, 26
CHAR_W_RATIO = 0.52          # Noto Sans の半角1文字あたりの概算幅(フォントサイズ比)
MAX_BODY_LINES = 6


def safe_margin(preset):
    family = "pan" if preset.startswith("pan") else ("sway" if preset == "sway" else "zoom")
    return SAFE_MARGIN[family]


def pick(rules, text, default):
    low = text.lower()
    for keys, *value in rules:
        if any(k in low for k in keys):
            return value[0] if len(value) == 1 else tuple(value)
    return default


def build_card(ffmpeg, font, scene, out_png, preset, photo=None):
    """1シーン分の絵コンテカード(静止画)を作る。

    文字はカメラワークで切れないよう、preset ごとのセーフエリア内に収める。
    """
    c0, c1 = pick(PALETTES, scene["prompt"], DEFAULT_PALETTE)
    margin = safe_margin(preset)
    x0, y0 = int(CARD_W * margin), int(CARD_H * margin)
    wrap_chars = max(24, int((CARD_W - 2 * x0) / (BODY_SIZE * CHAR_W_RATIO)))

    label = f"SCENE {scene['id']:02d}"
    body = "\n".join(
        textwrap.wrap(" ".join(scene["prompt"].split()), width=wrap_chars)[:MAX_BODY_LINES])

    label_txt = out_png.with_suffix(".label.txt")
    body_txt = out_png.with_suffix(".body.txt")
    label_txt.write_text(label, encoding="utf-8")
    body_txt.write_text(body, encoding="utf-8")

    fq = common.ff_quote
    # 写真がある場合は全面に敷いて暗く・彩度を落とす(人物の代役として雰囲気だけ伝える)
    if photo:
        base = (f"[1:v]scale={CARD_W}:{CARD_H}:force_original_aspect_ratio=increase,"
                f"crop={CARD_W}:{CARD_H},hue=s=0.35,eq=brightness=-0.18:contrast=1.05,"
                f"gblur=sigma=6[ph];[0:v][ph]overlay=0:0:format=auto,"
                f"vignette=PI/4[bg]")
        inputs = ["-f", "lavfi", "-i",
                  f"gradients=s={CARD_W}x{CARD_H}:c0={c0}:c1={c1}:type=linear:d=1",
                  "-i", str(photo)]
    else:
        base = f"[0:v]vignette=PI/4[bg]"
        inputs = ["-f", "lavfi", "-i",
                  f"gradients=s={CARD_W}x{CARD_H}:c0={c0}:c1={c1}:type=linear:d=1"]

    graph = (
        f"{base};"
        f"[bg]drawtext=fontfile={fq(font)}:textfile={fq(label_txt)}:"
        f"fontsize={LABEL_SIZE}:fontcolor=white@0.85:x={x0}:y={y0},"
        f"drawtext=fontfile={fq(font)}:textfile={fq(body_txt)}:"
        f"fontsize={BODY_SIZE}:fontcolor=white@0.92:x={x0}:"
        f"y={y0 + LABEL_SIZE + 70}:line_spacing={LINE_SPACING}[out]"
    )
    cmd = [ffmpeg, "-y", *inputs, "-filter_complex", graph,
           "-map", "[out]", "-frames:v", "1", str(out_png)]
    common.run(cmd)
    for p in (label_txt, body_txt):
        p.unlink(missing_ok=True)


def make_placeholder_bgm(ffmpeg, out_mp3, seconds):
    """確認用の静かなドローン(本番では実際の楽曲に差し替える)。"""
    src = ("sine=frequency=110:duration=%d[a1];"
           "sine=frequency=164.81:duration=%d[a2];"
           "sine=frequency=220:duration=%d[a3];"
           "[a1][a2][a3]amix=inputs=3,lowpass=f=700,"
           "afade=t=in:st=0:d=3,afade=t=out:st=%d:d=3[out]") % (
        seconds, seconds, seconds, max(0, seconds - 3))
    common.run([ffmpeg, "-y", "-filter_complex", src, "-map", "[out]",
                "-q:a", "4", str(out_mp3)])


def main():
    ap = argparse.ArgumentParser(
        description="脚本から無料のアニマティック(絵コンテ動画)を作る")
    ap.add_argument("scenes_yaml", help="脚本YAML(drama_clip.py と同じ形式)")
    ap.add_argument("--out-dir", required=True, help="sceneN.mp4 の出力先(通常は注文の input/)")
    ap.add_argument("--duration", type=float, default=0,
                    help="1シーンの秒数(既定: YAMLの duration、無ければ8秒)")
    ap.add_argument("--size", default="1920x1080", help="出力解像度")
    ap.add_argument("--no-bgm", action="store_true", help="プレースホルダーBGMを作らない")
    args = ap.parse_args()

    try:
        import yaml
    except ImportError:
        sys.exit("エラー: PyYAML が必要です。 pip install pyyaml")

    ffmpeg = common.find_tool("ffmpeg")
    font = common.find_font()

    yaml_path = Path(args.scenes_yaml).resolve()
    with open(yaml_path, encoding="utf-8") as f:
        doc = yaml.safe_load(f) or {}
    if not doc.get("scenes"):
        sys.exit(f"エラー: {yaml_path} に scenes: がありません")

    default_dur = args.duration or float(doc.get("duration", 8))
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    work = out_dir / "_animatic_cards"
    work.mkdir(exist_ok=True)

    total = 0.0
    made = []
    for i, s in enumerate(doc["scenes"], 1):
        scene = {"id": s.get("id", i), "prompt": " ".join(str(s.get("prompt", "")).split())}
        if not scene["prompt"]:
            sys.exit(f"エラー: scenes[{i}] に prompt がありません")
        dur = float(s.get("duration", default_dur))

        # 人物の代役に使う画像(image → ref の順)。YAMLからの相対パスで解決する。
        # ref は複数指定できるが、絵コンテカードには先頭の1枚だけを敷く
        ref = s.get("ref")
        if isinstance(ref, (list, tuple)):
            ref = ref[0] if ref else ""
        photo = s.get("image") or ref or ""
        photo_path = None
        if photo:
            photo_path = Path(photo)
            if not photo_path.is_absolute():
                photo_path = yaml_path.parent / photo
            if not photo_path.is_file():
                raise PipelineError(f"scene{scene['id']}: 画像が見つかりません: {photo_path}")

        preset = s.get("preset") or pick(PRESET_RULES, scene["prompt"], DEFAULT_PRESET)
        card = work / f"card{scene['id']}.png"
        build_card(ffmpeg, font, scene, card, preset, photo_path)

        out_mp4 = out_dir / f"scene{scene['id']}.mp4"
        print(f"[animatic] scene{scene['id']} {dur:g}s preset={preset}"
              + (f" photo={photo_path.name}" if photo_path else ""))
        subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "animate.py"), str(card),
             "--out", str(out_mp4), "--preset", preset,
             "--duration", str(dur), "--size", args.size],
            check=True)
        total += dur
        made.append(out_mp4)

    # 生成したファイルを記録しておく。本生成(drama_clip.py)がこの印を見て、
    # 仮の絵コンテを実素材で上書きする(印が無いと「出力済み」と誤判定されて1本も生成されない)
    (out_dir / MARKER_NAME).write_text(
        "\n".join(sorted(p.name for p in made)) + "\n", encoding="utf-8")

    bgm = out_dir / "bgm.mp3"
    if not args.no_bgm and not bgm.is_file():
        print(f"[animatic] プレースホルダーBGMを生成: {bgm}(本番では差し替える)")
        make_placeholder_bgm(ffmpeg, bgm, int(total) + 5)

    print(f"\n完成: {len(doc['scenes'])}シーン / 合計 {total:g}秒")
    print("次: python3 scripts/assemble.py <注文ID> → python3 scripts/qc.py <注文ID>")


if __name__ == "__main__":
    main()
