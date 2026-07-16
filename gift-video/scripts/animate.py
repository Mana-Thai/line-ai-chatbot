# -*- coding: utf-8 -*-
"""静止画イラストからアニメーション動画(mp4)を作る。

    # 1枚のイラストに動きを付ける (カメラワーク)
    python scripts/animate.py illust.png --out scene1.mp4 --preset zoom-in --duration 10

    # 連番フレーム(パラパラ漫画)を動画にする
    python scripts/animate.py frames_dir/ --out scene2.mp4 --frame-fps 8 --duration 10

プリセット (1枚絵モード):
  zoom-in   ゆっくり寄る (既定)      zoom-out  ゆっくり引く
  pan-left  左へ流れる              pan-right 右へ流れる
  pan-up    上へ流れる              pan-down  下へ流れる
  sway      その場でゆらゆら漂う (水彩イラスト向き)

出力は H.264 / yuv420p / 音声なし。--size は既定 1920x1080 (ギフト動画のシーン素材と
同じ仕様。縦型イラストなら --size 1080x1920)。
入力イラストは出力サイズの1.5〜2倍以上の解像度を推奨 (ズーム・パンの余白になる)。
"""
from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import PipelineError

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")
OVERSAMPLE = 2      # zoompan のカクつき防止のため、内部では出力の2倍で処理する
MAX_ZOOM = 1.25     # 寄り/引きの最大ズーム率


def parse_size(s: str) -> tuple[int, int]:
    try:
        w, h = (int(v) for v in s.lower().split("x"))
    except ValueError:
        raise PipelineError(f"--size は 1920x1080 の形式で指定してください: {s}")
    if w % 2 or h % 2:
        raise PipelineError("--size の幅と高さは偶数にしてください (H.264の制約)")
    return w, h


def build_zoompan(preset: str, frames: int, fps: int, W: int, H: int) -> str:
    """プリセットに応じた zoompan フィルタ式を作る。"""
    n = max(frames - 1, 1)
    t = f"(on/{n})"                       # 0→1 の進行度
    z_in = f"1+{MAX_ZOOM - 1}*{t}"        # 1 → MAX_ZOOM
    z_out = f"{MAX_ZOOM}-{MAX_ZOOM - 1}*{t}"
    center_x = "iw/2-(iw/zoom/2)"
    center_y = "ih/2-(ih/zoom/2)"
    span_x = "(iw-iw/zoom)"               # x が動ける全幅
    span_y = "(ih-ih/zoom)"

    presets = {
        "zoom-in":  (z_in, center_x, center_y),
        "zoom-out": (z_out, center_x, center_y),
        "pan-right": (str(MAX_ZOOM), f"{span_x}*{t}", center_y),
        "pan-left":  (str(MAX_ZOOM), f"{span_x}*(1-{t})", center_y),
        "pan-down":  (str(MAX_ZOOM), center_x, f"{span_y}*{t}"),
        "pan-up":    (str(MAX_ZOOM), center_x, f"{span_y}*(1-{t})"),
        # ゆらゆら: 中央固定ズームのまま、小さな円を描くように視点を動かす
        "sway": ("1.12",
                 f"{center_x}+{span_x}*0.10*sin(2*PI*{t})",
                 f"{center_y}+{span_y}*0.10*cos(2*PI*{t})"),
    }
    if preset not in presets:
        raise PipelineError(f"未知のプリセット: {preset} (候補: {', '.join(presets)})")
    z, x, y = presets[preset]
    return (f"zoompan=z='{z}':x='{x}':y='{y}':d={frames}:s={W}x{H}:fps={fps}")


def animate_still(src: Path, out: Path, preset: str, duration: float,
                  W: int, H: int, fps: int, crf: int) -> None:
    """1枚のイラストにカメラワークを付けて動画化する。"""
    ffmpeg = common.find_tool("ffmpeg")
    frames = round(duration * fps)
    # 出力アスペクト比の2倍キャンバスに整えてから zoompan (歪み・カクつき防止)
    fit = (f"scale={W * OVERSAMPLE}:{H * OVERSAMPLE}:force_original_aspect_ratio=increase,"
           f"crop={W * OVERSAMPLE}:{H * OVERSAMPLE}")
    vf = f"{fit},{build_zoompan(preset, frames, fps, W, H)},format=yuv420p"
    common.run([ffmpeg, "-y", "-i", str(src), "-vf", vf,
                "-frames:v", str(frames),
                "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
                "-movflags", "+faststart", "-an", str(out)])


def animate_frames(src_dir: Path, out: Path, duration: float | None,
                   W: int, H: int, fps: int, frame_fps: float, crf: int) -> None:
    """連番フレーム(パラパラ漫画)を動画化する。duration 指定時はループして埋める。"""
    ffmpeg = common.find_tool("ffmpeg")
    frames = sorted(p for p in src_dir.iterdir()
                    if p.suffix.lower() in IMAGE_EXTS)
    if len(frames) < 2:
        raise PipelineError(f"フレーム画像が2枚未満です: {src_dir} (png/jpg/webpを連番で配置)")

    one_loop = len(frames) / frame_fps
    loops = max(1, round(duration / one_loop)) if duration else 1
    per_frame = 1.0 / frame_fps

    # concat demuxer 用のリスト (globはWindowsのffmpegで使えないことがあるため使わない)
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False,
                                     encoding="utf-8") as f:
        for _ in range(loops):
            for p in frames:
                f.write(f"file '{p.resolve().as_posix()}'\n")
                f.write(f"duration {per_frame}\n")
        f.write(f"file '{frames[-1].resolve().as_posix()}'\n")  # concat仕様: 最後に1回余分に
        list_path = f.name

    fit = (f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}")
    try:
        common.run([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", list_path,
                    "-vf", f"{fit},fps={fps},format=yuv420p",
                    "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
                    "-movflags", "+faststart", "-an", str(out)])
    finally:
        Path(list_path).unlink(missing_ok=True)
    print(f"[frames] {len(frames)}枚 × {loops}ループ ({one_loop * loops:.1f}s)")


def main() -> None:
    ap = argparse.ArgumentParser(description="イラストからアニメーション動画を作る")
    ap.add_argument("src", help="イラスト画像 (1枚絵) または連番フレームのフォルダ")
    ap.add_argument("--out", required=True, help="出力mp4のパス (例: orders/x/input/scene1.mp4)")
    ap.add_argument("--preset", default="zoom-in",
                    help="1枚絵の動き (zoom-in/zoom-out/pan-left/pan-right/pan-up/pan-down/sway)")
    ap.add_argument("--duration", type=float, default=10.0,
                    help="出力の秒数 (既定: 10。ギフト動画のシーンなら 目標尺÷シーン数)")
    ap.add_argument("--size", default="1920x1080",
                    help="出力解像度 (既定: 1920x1080。縦型は 1080x1920)")
    ap.add_argument("--fps", type=int, default=common.FPS, help=f"出力fps (既定: {common.FPS})")
    ap.add_argument("--frame-fps", type=float, default=8.0,
                    help="連番モード: 1秒あたりのフレーム数 (既定: 8。パラパラ感を残すなら4〜12)")
    ap.add_argument("--crf", type=int, default=18, help="画質 (小さいほど高画質。既定: 18)")
    args = ap.parse_args()

    src = Path(args.src)
    out = Path(args.out)
    W, H = parse_size(args.size)
    if not 0.5 <= args.duration <= 600:
        raise PipelineError("--duration は 0.5〜600 秒で指定してください")
    out.parent.mkdir(parents=True, exist_ok=True)

    if src.is_dir():
        animate_frames(src, out, args.duration, W, H, args.fps, args.frame_fps, args.crf)
    elif src.is_file() and src.suffix.lower() in IMAGE_EXTS:
        animate_still(src, out, args.preset, args.duration, W, H, args.fps, args.crf)
    else:
        raise PipelineError(f"入力が画像ファイルでもフォルダでもありません: {src}")

    dur = common.probe_duration(out)
    print(f"[done] {out}  {W}x{H} / {dur:.2f}s / {args.fps}fps")
    print(f"       ギフト動画のシーンに使う場合: orders/<注文ID>/input/sceneN.mp4 に配置")


if __name__ == "__main__":
    try:
        main()
    except PipelineError as e:
        common.die(e)
