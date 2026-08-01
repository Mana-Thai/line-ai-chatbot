#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""お客様の写真から思い出アルバム動画(モンタージュ)を組み立てる。

母の日・誕生日・還暦・退職・クリスマス向けの「あなたが私にしてくれたこと」型
動画カード用。**AI生成を使わない**ので1本あたりの生成コストはゼロ。

構成は Etsy 系の人気商品と同じ3部構成:
    1. 冒頭の手紙カード(「お母さんへ」)
    2. 時系列の写真(キャプション付き・カメラワークはゆっくり)
    3. 結びの手紙カード → 締めの言葉(order.yaml の couple_names)
映像で驚かせるのではなく**手紙(文章)を商品価値の中心**に置くのがこの型の要。

montage.yaml には写真(`file:`)と手紙カード(`letter:`)を自由な順で並べられる。
手紙カードは水彩調の淡い背景に文章を全画面で見せる(ゆっくり漂うカメラ付き)。

使い方:
    # (1) 注文フォルダを作り、写真を photos/ に時系列順の名前で入れる
    #     例: 01-baby.jpg, 02-family.jpg, 03-school.jpg ...
    python3 scripts/new_order.py mom-001
    mkdir orders/mom-001/photos

    # (2) 構成の雛形を作る(手紙とキャプションを書き込む)
    python3 scripts/build_montage.py mom-001 --init

    # (3) montage.yaml を埋めてから組み立て
    python3 scripts/build_montage.py mom-001
    python3 scripts/assemble.py mom-001 && python3 scripts/qc.py mom-001

写真の推奨: 出力の1.5倍以上の解像度(1920x1080出力なら3000px幅以上)、最大12枚目安。
小さい写真はズームでぼやけるため、スクリプトが警告する。

縦型(スマホ用)も納品する場合は**2パス方式**にする。横型素材のセンタークロップでは
手紙カードの文字が切れるため、縦型は縦型専用にシーンを作り直す:
    # 横型パス: order.yaml の output_formats を ["landscape"] にして
    python3 scripts/build_montage.py mom-001 && python3 scripts/assemble.py mom-001
    # 縦型パス: output_formats を ["portrait"] に変えて
    python3 scripts/build_montage.py mom-001 --size 1080x1920
    python3 scripts/assemble.py mom-001 && python3 scripts/qc.py mom-001
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import PipelineError

SCRIPTS_DIR = Path(__file__).resolve().parent
PHOTO_EXTS = (".jpg", ".jpeg", ".png", ".webp")
DEFAULT_SEC = 4.0
DEFAULT_LETTER_SEC = 7.0             # 手紙カードは読む時間が要るので長め
MAX_PHOTOS_HINT = 12                 # 参考にした商品群の上限。超えても動くが冗長になりがち
# 単調にならないよう、カメラワークを順番に変えていく(人物写真はズームが無難)。
# 派手なパンは母親向けの落ち着いた雰囲気に合わないため入れていない
PRESET_CYCLE = ["zoom-in", "sway", "zoom-out"]

# 手紙カードの配色(水彩調・淡い色。参考商品の「花・柔らかい色・上品さ」に合わせる)
LETTER_BG = ("0xf7f1e8", "0xe9d8d2")   # クリーム → 淡いローズのグラデーション
LETTER_INK = "0x5a4a3f"                # 温かみのある焦げ茶(白背景に黒文字は硬すぎる)


def find_photos(order_id):
    photo_dir = common.order_dir(order_id) / "photos"
    if not photo_dir.is_dir():
        raise PipelineError(
            f"写真フォルダがありません: {photo_dir}\n"
            f"  作成して、時系列順に並ぶ名前(01-.., 02-.. など)で写真を入れてください")
    photos = sorted(p for p in photo_dir.iterdir() if p.suffix.lower() in PHOTO_EXTS)
    if not photos:
        raise PipelineError(f"写真が見つかりません: {photo_dir}(対応: {', '.join(PHOTO_EXTS)})")
    return photos


def write_template(order_id, photos, sec):
    path = common.order_dir(order_id) / "montage.yaml"
    if path.exists():
        raise PipelineError(f"すでにあります: {path}(作り直すなら削除してから --init)")
    lines = [
        "# 思い出アルバム動画の構成。上から順に再生される。",
        "#   - file:   photos/ の写真(caption は画面下の一言。空なら出ない)",
        "#   - letter: 手紙カード(水彩調の背景に文章を全画面表示。改行はそのまま反映)",
        "# duration は表示秒数、preset はカメラワーク",
        "# (zoom-in / zoom-out / pan-left / pan-right / pan-up / pan-down / sway)。",
        "",
        f"default_duration: {sec:g}",
        "",
        "photos:",
        "  # 冒頭の手紙カード(宛名と書き出し)",
        "  - letter: |-",
        "      お母さんへ",
        "",
        "      あなたが私にしてくれたことを",
        "      おぼえています",
        f"    duration: {DEFAULT_LETTER_SEC:g}",
        "",
    ]
    for p in photos:
        lines += [f'  - file: "{p.name}"', '    caption: ""']
    lines += [
        "",
        "  # 結びの手紙カード(いちばん伝えたい言葉。締めのタイトルは order.yaml 側)",
        "  - letter: |-",
        "      (ここに結びの手紙を書く)",
        f"    duration: {DEFAULT_LETTER_SEC:g}",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"雛形を作りました: {path}")
    print(f"  写真{len(photos)}枚+手紙カード2枚の構成。手紙と caption を書き込んでから、"
          f"もう一度このスクリプトを実行してください")


def load_montage(order_id, photos, default_sec):
    """montage.yaml があればそれを、無ければ写真をそのまま使う。"""
    path = common.order_dir(order_id) / "montage.yaml"
    if not path.is_file():
        return [{"file": p.name, "letter": "", "caption": "", "duration": default_sec,
                 "preset": ""} for p in photos], default_sec
    try:
        import yaml
    except ImportError:
        raise PipelineError("PyYAML が必要です。 pip install pyyaml")
    with open(path, encoding="utf-8") as f:
        doc = yaml.safe_load(f) or {}
    sec = float(doc.get("default_duration", default_sec))
    items = doc.get("photos") or []
    if not items:
        raise PipelineError(f"{path} に photos: がありません")
    out = []
    for i, it in enumerate(items, 1):
        name = it.get("file") or ""
        letter = str(it.get("letter") or "").strip()
        if bool(name) == bool(letter):
            raise PipelineError(
                f"{path} の photos[{i}] は file(写真)か letter(手紙カード)の"
                f"どちらか一方を指定してください")
        default = DEFAULT_LETTER_SEC if letter else sec
        out.append({
            "file": name,
            "letter": letter,
            "caption": str(it.get("caption") or ""),
            "duration": float(it.get("duration", default)),
            "preset": it.get("preset") or "",
        })
    return out, sec


def wrap_letter(text, max_chars):
    """手紙の改行を保ちつつ、長すぎる行だけ折り返す。

    日本語・タイ語は単語間に空白が無いので文字数で折り返すが、先頭から max_chars で
    切ると「を」だけの行(ぶら下がり)ができるため、行を均等な長さに分割する。
    タイ語の結合文字は基底文字から切り離さない(common.wrap_tokens が1単位にする)。
    空白があればそこを優先して切る。
    """
    lines = []
    for raw in text.splitlines():
        raw = raw.rstrip()
        if not raw:
            lines.append("")
            continue
        if len(common.wrap_tokens(raw)) <= max_chars:
            lines.append(raw)
            continue
        # 空白区切りのまとまりで詰める。1つが長すぎる行だけ文字単位に落とす
        cur: list[str] = []
        for unit in common.wrap_units(raw):
            toks = common.wrap_tokens(unit)
            if len(toks) > max_chars:
                # そもそも1行に収まらないまとまり(空白の無い長い語)は文字単位で詰める
                for tok in toks:
                    if len(cur) < max_chars:
                        cur.append(tok)
                    else:
                        lines.append("".join(cur).strip())
                        cur = [tok]
                continue
            if not cur or len(cur) + len(toks) <= max_chars:
                cur += toks
                continue
            lines.append("".join(cur).strip())
            cur = toks
        if cur:
            lines.append("".join(cur).strip())
    return lines


def build_letter_card(ffmpeg, text, out_png, card_w, card_h):
    """手紙カード(水彩調の淡い背景+全画面テキスト)を作る。

    カメラは sway(1.12倍ズーム+微小な揺れ)を付けるので、文字は中央の
    セーフエリア(片側約13%を除いた範囲)に収める。
    フォントは手紙の言語に合わせて選ぶ(タイ語の手紙に日本語フォントを使うと □ になる)。
    """
    font = common.find_font(text)
    # フォントは短辺基準(縦型で高さ基準にすると巨大になり数文字で折り返してしまう)。
    # ここは全画面に数行だけなので元から十分大きい。タイ語向けの拡大(THAI_SIZE_FACTOR)は
    # かけない — 縦型で1行に入る文字数が減り、単語の途中で折り返す原因になるため
    fontsize = int(min(card_w, card_h) * 0.052)
    line_spacing = int(fontsize * 0.75)
    safe_w = card_w * 0.76
    max_chars = max(8, int(safe_w / fontsize))
    lines = wrap_letter(text, max_chars)
    max_lines = int((card_h * 0.62) / (fontsize + line_spacing))
    if len(lines) > max_lines:
        raise PipelineError(
            f"手紙が長すぎます({len(lines)}行 > 最大{max_lines}行)。\n"
            f"  2枚の letter カードに分けてください")

    body_txt = out_png.with_suffix(".body.txt")
    body_txt.write_text("\n".join(lines), encoding="utf-8")
    fq = common.ff_quote
    c0, c1 = LETTER_BG
    graph = (
        f"[0:v]vignette=PI/5,"
        f"drawtext=fontfile={fq(font)}:textfile={fq(body_txt)}:"
        f"fontsize={fontsize}:fontcolor={LETTER_INK}:"
        f"x=(w-text_w)/2:y=(h-text_h)/2:line_spacing={line_spacing}[out]"
    )
    common.run([ffmpeg, "-y", "-f", "lavfi", "-i",
                f"gradients=s={card_w}x{card_h}:c0={c0}:c1={c1}:type=radial:d=1",
                "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", str(out_png)])
    body_txt.unlink(missing_ok=True)


def check_resolution(ffprobe_json, path, out_w):
    info = ffprobe_json(path)
    for s in info.get("streams", []):
        if s.get("codec_type") == "video":
            w = int(s.get("width", 0))
            if w < out_w * 1.4:
                print(f"  注意: {path.name} は幅{w}px。ズームでぼやける可能性がある"
                      f"(推奨 {int(out_w * 1.5)}px 以上)")
            return


def main():
    ap = argparse.ArgumentParser(description="写真から思い出アルバム動画を組み立てる")
    ap.add_argument("order_id")
    ap.add_argument("--init", action="store_true", help="montage.yaml の雛形を作って終了")
    ap.add_argument("--seconds", type=float, default=DEFAULT_SEC, help="1枚あたりの既定表示秒数")
    ap.add_argument("--size", default="1920x1080", help="出力解像度(縦型は 1080x1920)")
    args = ap.parse_args()

    photos = find_photos(args.order_id)
    if args.init:
        write_template(args.order_id, photos, args.seconds)
        return

    items, _ = load_montage(args.order_id, photos, args.seconds)
    photo_dir = common.order_dir(args.order_id) / "photos"
    input_dir = common.order_dir(args.order_id) / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    work = input_dir / "_letter_cards"
    out_w, out_h = (int(v) for v in args.size.split("x"))
    card_w, card_h = int(out_w * 1.5), int(out_h * 1.5)   # sway/zoom の余白ぶん大きく作る

    n_photos = sum(1 for it in items if it["file"])
    if n_photos > MAX_PHOTOS_HINT:
        print(f"注意: 写真が{n_photos}枚あります。この型の相場は最大{MAX_PHOTOS_HINT}枚。"
              f"多すぎると間延びするので、良い写真に絞ることを推奨")

    ffmpeg = common.find_tool("ffmpeg")

    total = 0.0
    captions = []
    for i, it in enumerate(items, 1):
        out_mp4 = input_dir / f"scene{i}.mp4"
        if it["letter"]:
            # 手紙カード: 生成してから sway でゆっくり漂わせる(固定だと写真との落差が出る)
            work.mkdir(exist_ok=True)
            card = work / f"letter{i}.png"
            build_letter_card(ffmpeg, it["letter"], card, card_w, card_h)
            src, preset = card, (it["preset"] or "sway")
            label = f"letter({it['letter'].splitlines()[0][:12]}…)"
        else:
            src = photo_dir / it["file"]
            if not src.is_file():
                raise PipelineError(f"写真がありません: {src}")
            check_resolution(common.ffprobe_json, src, out_w)
            preset = it["preset"] or PRESET_CYCLE[(i - 1) % len(PRESET_CYCLE)]
            label = it["file"]
        print(f"[montage] {i:2d}. {label} {it['duration']:g}s preset={preset}")
        subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "animate.py"), str(src),
             "--out", str(out_mp4), "--preset", preset,
             "--duration", str(it["duration"]), "--size", args.size],
            check=True)
        captions.append(it["caption"])
        total += it["duration"]

    n_letters = len(items) - n_photos
    print(f"\n写真{n_photos}枚 + 手紙カード{n_letters}枚 / 合計 {total:g}秒")
    print("\norder.yaml に次を反映してください:")
    print(f"  target_duration: {total:g}")
    print("  scene_captions:")
    for c in captions:
        print(f'    - "{c}"')
    print("\nBGM を input/bgm.mp3 に置いたら:")
    print(f"  python3 scripts/assemble.py {args.order_id} && python3 scripts/qc.py {args.order_id}")


if __name__ == "__main__":
    main()
