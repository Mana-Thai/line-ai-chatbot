# -*- coding: utf-8 -*-
"""Render the 30-second, 24 fps Mother's Day match-cut picture master."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "gift-video" / "scripts"))
import common  # noqa: E402

FPS = 24
W, H = 1080, 1920
SHOT_DURATIONS = (7.6, 9.6, 7.6, 7.0)
XFADE = 0.6
TOTAL = sum(SHOT_DURATIONS) - XFADE * 3

# focus x/y, initial/final zoom, horizontal/vertical drift
MOVES = (
    (0.48, 0.61, 1.000, 1.042, 0.004, -0.006),
    (0.53, 0.57, 1.020, 1.085, -0.008, -0.010),
    (0.48, 0.61, 1.000, 1.042, 0.004, -0.006),
    (0.50, 0.70, 1.015, 1.065, -0.004, -0.012),
)
SOURCES = (
    "scene1-coin.png",
    "scene2-envelope.png",
    "scene3-return.png",
    "scene3-jasmine.png",
)


def zoompan(spec: tuple[float, ...], duration: float) -> str:
    cx, cy, z0, z1, dx, dy = spec
    frames = round(duration * FPS)
    last = max(frames - 1, 1)
    ease = f"(0.5-0.5*cos(PI*on/{last}))"
    zoom = f"({z0}+({z1-z0})*{ease})"
    x = f"(iw*{cx}-iw/zoom/2+iw*{dx}*{ease})"
    y = f"(ih*{cy}-ih/zoom/2+ih*{dy}*{ease})"
    return (
        "scale=2160:3840:force_original_aspect_ratio=increase,"
        "crop=2160:3840,"
        f"zoompan=z='{zoom}':"
        f"x='min(max({x},0),iw-iw/zoom)':"
        f"y='min(max({y},0),ih-ih/zoom)':"
        f"d={frames}:s={W}x{H}:fps={FPS},"
        "settb=AVTB,setsar=1,"
        "eq=contrast=1.025:saturation=.92,"
        "noise=alls=1.25:allf=t+u,"
        "vignette=PI/12:eval=frame,format=yuv420p"
    )


def escape_filter_path(path: Path) -> str:
    return str(path).replace("\\", "/").replace(":", r"\:")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--work", required=True)
    args = parser.parse_args()

    src_dir = Path(__file__).resolve().parent
    out = Path(args.out).resolve()
    work = Path(args.work).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)
    ffmpeg = common.find_tool("ffmpeg")

    clips: list[Path] = []
    for index, (name, duration, move) in enumerate(
        zip(SOURCES, SHOT_DURATIONS, MOVES), start=1
    ):
        clip = work / f"shot{index}.mp4"
        graph = work / f"shot{index}.filter.txt"
        graph.write_text(f"[0:v]{zoompan(move, duration)}[v]", encoding="utf-8")
        common.run([
            ffmpeg, "-y", "-i", str(src_dir / name),
            "-filter_complex_script", str(graph), "-map", "[v]",
            "-frames:v", str(round(duration * FPS)),
            "-c:v", "libx264", "-preset", "slow", "-crf", "16",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(clip),
        ])
        clips.append(clip)

    parts = [
        f"[{i}:v]fps={FPS},settb=AVTB,setpts=PTS-STARTPTS[v{i}]"
        for i in range(len(clips))
    ]
    duration = SHOT_DURATIONS[0]
    current = "v0"
    transitions = ("fade", "fade", "fade")
    for i, transition in enumerate(transitions, start=1):
        offset = duration - XFADE
        parts.append(
            f"[{current}][v{i}]xfade=transition={transition}:"
            f"duration={XFADE}:offset={offset:.3f}[x{i}]"
        )
        current = f"x{i}"
        duration += SHOT_DURATIONS[i] - XFADE

    thai = work / "final-thai.txt"
    thai.write_text("ตอนนี้…ถึงตาลูกดูแลแม่บ้างนะ", encoding="utf-8")
    font = Path(r"C:\Windows\Fonts\LeelawUI.ttf")
    parts.append(
        f"[{current}]"
        f"drawtext=fontfile='{escape_filter_path(font)}':"
        f"textfile='{escape_filter_path(thai)}':"
        "fontcolor=0x17383B:fontsize=46:"
        "x=(w-text_w)/2:y=468:"
        "alpha='if(lt(t,25.15),0,if(lt(t,26.15),(t-25.15),"
        "if(lt(t,29.1),1,(29.55-t)/.45)))':"
        "shadowcolor=white@.55:shadowx=0:shadowy=2,"
        "fade=t=out:st=29.25:d=0.75:color=0xFFF9ED,"
        "format=yuv420p[vout]"
    )

    master_graph = work / "master.filter.txt"
    master_graph.write_text(";\n".join(parts), encoding="utf-8")
    cmd = [ffmpeg, "-y"]
    for clip in clips:
        cmd += ["-i", str(clip)]
    cmd += [
        "-filter_complex_script", str(master_graph), "-map", "[vout]",
        "-t", f"{TOTAL:.3f}", "-r", str(FPS),
        "-c:v", "libx264", "-preset", "slow", "-crf", "16",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(out),
    ]
    common.run(cmd, log_file=work / "master-ffmpeg.log")

    ffprobe = str(Path(ffmpeg).with_name("ffprobe.exe"))
    probe = subprocess.run(
        [ffprobe, "-v", "error",
         "-show_entries", "stream=width,height,r_frame_rate:format=duration",
         "-of", "default=nw=1", str(out)],
        capture_output=True, text=True, check=True
    ).stdout.strip()
    print(f"[done] {out}\n{probe}")


if __name__ == "__main__":
    main()
