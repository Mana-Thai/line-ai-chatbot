# -*- coding: utf-8 -*-
"""Render the handcrafted 56-second picture master for Mother's Day Film v6."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "gift-video" / "scripts"))
import common  # noqa: E402

FPS = 30
W, H = 1080, 1920
CHAPTER_DURATION = 8.5
SHOT_DURATIONS = (3.4, 3.2, 2.9)
SHOT_XFADE = 0.5
CHAPTER_XFADE = 7.0 / 12.0

# (focus-x, focus-y, zoom-start, zoom-end, drift-x, drift-y)
SHOT_MAP = [
    [(0.50, 0.44, 1.00, 1.055, 0.010, -0.008),
     (0.57, 0.29, 1.10, 1.175, -0.010, 0.004),
     (0.45, 0.58, 1.12, 1.19, 0.012, -0.010)],
    [(0.50, 0.46, 1.00, 1.050, -0.008, 0.005),
     (0.48, 0.61, 1.13, 1.21, 0.014, -0.012),
     (0.55, 0.27, 1.11, 1.18, -0.008, 0.006)],
    [(0.50, 0.43, 1.00, 1.060, 0.008, -0.008),
     (0.52, 0.29, 1.12, 1.20, -0.010, 0.004),
     (0.43, 0.54, 1.13, 1.20, 0.014, -0.006)],
    [(0.50, 0.44, 1.00, 1.045, -0.006, 0.004),
     (0.62, 0.30, 1.12, 1.19, -0.014, 0.006),
     (0.51, 0.70, 1.14, 1.22, 0.010, -0.014)],
    [(0.50, 0.47, 1.00, 1.055, 0.009, -0.005),
     (0.49, 0.69, 1.13, 1.21, -0.010, -0.010),
     (0.58, 0.32, 1.11, 1.18, -0.012, 0.004)],
    [(0.50, 0.48, 1.00, 1.050, -0.008, -0.004),
     (0.45, 0.67, 1.14, 1.22, 0.012, -0.012),
     (0.57, 0.29, 1.11, 1.18, -0.010, 0.005)],
    [(0.50, 0.45, 1.00, 1.050, 0.006, -0.006),
     (0.37, 0.28, 1.10, 1.17, 0.008, 0.004),
     (0.54, 0.71, 1.12, 1.19, -0.008, -0.010)],
]

CHAPTER_TRANSITIONS = ("fade", "smoothleft", "dissolve", "fade", "smoothup", "dissolve")


def zoompan_filter(spec: tuple[float, ...], duration: float) -> str:
    cx, cy, z0, z1, dx, dy = spec
    frames = round(duration * FPS)
    n = max(frames - 1, 1)
    ease = f"(0.5-0.5*cos(PI*on/{n}))"
    zoom = f"({z0}+({z1-z0})*{ease})"
    xpos = f"(iw*{cx}-iw/zoom/2+iw*{dx}*{ease})"
    ypos = f"(ih*{cy}-ih/zoom/2+ih*{dy}*{ease})"
    return (
        "scale=2560:3840:force_original_aspect_ratio=increase,"
        "crop=2160:3840,"
        f"zoompan=z='{zoom}':"
        f"x='min(max({xpos},0),iw-iw/zoom)':"
        f"y='min(max({ypos},0),ih-ih/zoom)':"
        f"d={frames}:s={W}x{H}:fps={FPS},"
        "settb=AVTB,setsar=1,format=yuv420p"
    )


def render_chapter(ffmpeg: str, src: Path, out: Path, specs: list[tuple[float, ...]]) -> None:
    parts = ["[0:v]split=3[s0][s1][s2]"]
    for index, (spec, duration) in enumerate(zip(specs, SHOT_DURATIONS)):
        parts.append(f"[s{index}]{zoompan_filter(spec, duration)}[z{index}]")

    first_offset = SHOT_DURATIONS[0] - SHOT_XFADE
    second_total = SHOT_DURATIONS[0] + SHOT_DURATIONS[1] - SHOT_XFADE
    second_offset = second_total - SHOT_XFADE
    parts.append(
        f"[z0][z1]xfade=transition=fade:duration={SHOT_XFADE}:"
        f"offset={first_offset}[m1]"
    )
    parts.append(
        f"[m1][z2]xfade=transition=fade:duration={SHOT_XFADE}:"
        f"offset={second_offset}[m2]"
    )
    parts.append(
        "[m2]eq=contrast=1.035:saturation=0.91:"
        "brightness='0.004*sin(2*PI*t/7)':eval=frame,"
        "colorbalance=rs=.018:gs=.008:bs=-.010:rm=-.006:bm=.012,"
        "split=2[base][halo]"
    )
    parts.append(
        "[halo]gblur=sigma=13,eq=brightness=.015:saturation=.72[soft]"
    )
    parts.append(
        "[base][soft]blend=all_mode=screen:all_opacity=.075,"
        "unsharp=5:5:.32:3:3:0,"
        "vignette=PI/10:eval=frame,"
        "noise=alls=1.7:allf=t+u,format=yuv420p[vout]"
    )

    graph = out.with_suffix(".filter.txt")
    graph.write_text(";\n".join(parts), encoding="utf-8")
    common.run([
        ffmpeg, "-y", "-i", str(src),
        "-filter_complex_script", str(graph),
        "-map", "[vout]", "-frames:v", str(round(CHAPTER_DURATION * FPS)),
        "-c:v", "libx264", "-preset", "slow", "-crf", "16",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(out),
    ])


def render_master(ffmpeg: str, chapters: list[Path], out: Path, work: Path) -> None:
    parts: list[str] = []
    for index in range(len(chapters)):
        parts.append(f"[{index}:v]fps={FPS},settb=AVTB,setpts=PTS-STARTPTS[v{index}]")

    current = "v0"
    duration = CHAPTER_DURATION
    for index, transition in enumerate(CHAPTER_TRANSITIONS, start=1):
        offset = duration - CHAPTER_XFADE
        parts.append(
            f"[{current}][v{index}]xfade=transition={transition}:"
            f"duration={CHAPTER_XFADE}:offset={offset:.6f}[x{index}]"
        )
        current = f"x{index}"
        duration = duration + CHAPTER_DURATION - CHAPTER_XFADE
    parts.append(f"[{current}]format=yuv420p[vout]")

    graph = work / "master.filter.txt"
    graph.write_text(";\n".join(parts), encoding="utf-8")
    cmd = [ffmpeg, "-y"]
    for chapter in chapters:
        cmd += ["-i", str(chapter)]
    cmd += [
        "-filter_complex_script", str(graph), "-map", "[vout]",
        "-t", "56", "-c:v", "libx264", "-preset", "slow", "-crf", "16",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(out),
    ]
    common.run(cmd, log_file=work / "master-ffmpeg.log")


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

    chapters: list[Path] = []
    for index, specs in enumerate(SHOT_MAP, start=1):
        chapter = work / f"chapter{index}.mp4"
        reusable = False
        if chapter.is_file() and chapter.stat().st_size > 100_000:
            try:
                duration_ok = abs(common.probe_duration(chapter) - CHAPTER_DURATION) < 0.1
                decode_ok = subprocess.run(
                    [ffmpeg, "-v", "error", "-i", str(chapter), "-f", "null", "-"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                ).returncode == 0
                reusable = duration_ok and decode_ok
            except Exception:
                reusable = False
        if reusable:
            print(f"[chapter {index}/7] reuse {chapter}")
        else:
            render_chapter(ffmpeg, src_dir / f"scene{index}.png", chapter, specs)
        chapters.append(chapter)
        print(f"[chapter {index}/7] {chapter}")

    render_master(ffmpeg, chapters, out, work)
    duration = common.probe_duration(out)
    print(f"[done] {out} / {duration:.2f}s / {W}x{H} / {FPS}fps")


if __name__ == "__main__":
    main()
