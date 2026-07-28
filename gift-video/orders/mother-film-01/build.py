# -*- coding: utf-8 -*-
"""mother-film-01 (母と娘・1分の短編) を組み立てる。

    python build.py --previz    # 参考画像+カメラワークで尺確認用の仮編集を作る (無料・API不要)
    python build.py             # Veoで9シーンを生成して本編を作る (要 GEMINI_API_KEY・有料)
    python build.py --assemble-only   # input/ にある素材をつなぐだけ

シーンの内容・プロンプト・尺は shotlist.json が正本。
テキスト/キャプション/ロゴは一切入れない(ブリーフの指定)。BGMも入れない。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import common
from common import PipelineError

SHOTLIST = HERE / "shotlist.json"
SIZE = "1920x1080"


def load_shotlist() -> dict:
    with open(SHOTLIST, encoding="utf-8") as f:
        return json.load(f)


def run_script(name: str, args: list[str]) -> None:
    cmd = [sys.executable, str(SCRIPTS / name), *args]
    print(f"\n$ {' '.join(cmd)}")
    proc = subprocess.run(cmd)
    if proc.returncode != 0:
        raise PipelineError(f"{name} が失敗しました (exit {proc.returncode})")


def ensure_still(n: int) -> Path:
    """シーンの入力画像を用意する。

    本番用に差し替えた stills/sceneN.png があればそれを使う。無い場合は参考画像
    (sceneN_original.png) を拡大して代用する — あくまで仮編集用の暫定措置で、
    本編では720p以上の画像に差し替える必要がある。
    """
    still = HERE / "stills" / f"scene{n}.png"
    if still.is_file():
        return still
    original = HERE / "stills" / f"scene{n}_original.png"
    if not original.is_file():
        raise PipelineError(f"シーン{n}の画像がありません: {still} か {original} を置いてください")
    ffmpeg = common.find_tool("ffmpeg")
    common.run([ffmpeg, "-y", "-i", str(original),
                "-vf", "scale=2560:1440:flags=lanczos,unsharp=5:5:0.8:5:5:0.0",
                "-frames:v", "1", str(still)])
    print(f"[stills] 参考画像を拡大して代用: {still} (本編では高解像度画像に差し替えること)")
    return still


def build_previz(sl: dict) -> list[Path]:
    """参考画像にカメラワークを付けて仮編集用クリップを作る(animate.py)。"""
    out = []
    for sc in sl["scenes"]:
        still = ensure_still(sc["n"])
        dst = HERE / "input" / f"previz_scene{sc['n']}.mp4"
        run_script("animate.py", [str(still), "--out", str(dst),
                                  "--preset", sc["previz_preset"],
                                  "--duration", str(sc["duration"]),
                                  "--size", SIZE])
        out.append(dst)
    return out


def ref_args(sl: dict, sc: dict) -> list[str]:
    """シーンに出る人物の参照画像を --ref 引数に変換する。

    シーンをまたいで顔が別人になるのを防ぐためのもの。画像が未配置なら黙って
    落とさず警告して続行する — 4人分揃うのを待たずに、用意できた人物から
    順に効かせられる方が制作を進めやすいため。
    """
    args, missing = [], []
    for name in sc.get("refs", []):
        rel = sl.get("characters", {}).get(name)
        if not rel:
            raise PipelineError(f"shotlist.json の characters に {name} がありません")
        path = HERE / rel
        (args.extend(["--ref", str(path)]) if path.is_file() else missing.append(name))
    if missing:
        print(f"[ref] scene{sc['n']}: 参照画像が未配置のためスキップ: {', '.join(missing)}")
    return args


def build_generated(sl: dict, only: list[int] | None) -> list[Path]:
    """Veoで各シーンを生成する(i2v.py)。既にあるシーンはスキップする。"""
    out = []
    for sc in sl["scenes"]:
        dst = HERE / "input" / f"scene{sc['n']}.mp4"
        if only and sc["n"] not in only:
            out.append(dst)
            continue
        if dst.is_file():
            print(f"[skip] scene{sc['n']} は生成済み: {dst}")
            out.append(dst)
            continue
        still = ensure_still(sc["n"])
        prompt = f"{sc['prompt']} {sl['style']}."
        run_script("i2v.py", [str(still), "--prompt", prompt,
                              "--out", str(dst),
                              "--negative-prompt", sl["negative_prompt"],
                              "--fit-duration", str(sc["duration"]),
                              "--size", SIZE,
                              *ref_args(sl, sc)])
        out.append(dst)
    return out


def assemble(clips: list[Path], dst: Path, xfade: float, end_fade: float) -> float:
    """クリップをクロスフェードでつなぎ、最後をゆっくり暗転させる。"""
    ffmpeg = common.find_tool("ffmpeg")
    for c in clips:
        if not c.is_file():
            raise PipelineError(f"素材がありません: {c}")
    durs = [common.probe_duration(c) for c in clips]

    parts, prev, total = [], "0:v", durs[0]
    for i in range(1, len(clips)):
        label = f"v{i}"
        offset = total - xfade
        parts.append(f"[{prev}][{i}:v]xfade=transition=fade:"
                     f"duration={xfade}:offset={offset:.3f}[{label}]")
        total += durs[i] - xfade
        prev = label
    parts.append(f"[{prev}]fade=t=out:st={total - end_fade:.3f}:d={end_fade},"
                 f"format=yuv420p[vout]")

    cmd = [ffmpeg, "-y"]
    for c in clips:
        cmd += ["-i", str(c)]
    cmd += ["-filter_complex", ";".join(parts), "-map", "[vout]",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p", "-r", str(common.FPS),
            "-movflags", "+faststart", "-an", str(dst)]
    dst.parent.mkdir(parents=True, exist_ok=True)
    print(f"\n[assemble] {len(clips)}シーン → {dst}")
    common.run(cmd)
    return total


def main() -> None:
    ap = argparse.ArgumentParser(description="mother-film-01 を組み立てる")
    ap.add_argument("--previz", action="store_true",
                    help="参考画像+カメラワークで仮編集を作る (API不要)")
    ap.add_argument("--assemble-only", action="store_true",
                    help="生成せず input/ の素材をつなぐだけ")
    ap.add_argument("--scenes", help="生成するシーンを限定 (例: 3,7)")
    args = ap.parse_args()

    sl = load_shotlist()
    (HERE / "input").mkdir(exist_ok=True)
    only = [int(v) for v in args.scenes.split(",")] if args.scenes else None
    prefix = "previz_" if args.previz else ""

    if args.assemble_only:
        clips = [HERE / "input" / f"{prefix}scene{sc['n']}.mp4" for sc in sl["scenes"]]
    elif args.previz:
        clips = build_previz(sl)
    else:
        clips = build_generated(sl, only)

    name = "mother-film-01_previz.mp4" if args.previz else "mother-film-01.mp4"
    dst = HERE / "output" / name
    total = assemble(clips, dst, sl["xfade_duration"], sl["end_fade_duration"])

    actual = common.probe_duration(dst)
    target = sl["target_duration"]
    print(f"\n[done] {dst}")
    print(f"       {actual:.2f}s (計算値 {total:.2f}s / 目標 {target:.0f}s)")
    if abs(actual - target) > 1.5:
        print(f"       ※ 目標尺から {actual - target:+.1f}s ずれています")
    if args.previz:
        print("       これは尺・並び確認用の仮編集です。本編は GEMINI_API_KEY を設定して")
        print("       python build.py を実行してください。")


if __name__ == "__main__":
    try:
        main()
    except PipelineError as e:
        common.die(e)
