# -*- coding: utf-8 -*-
"""Generate the handcrafted score and restrained foley for Mother's Day Film v6."""

from __future__ import annotations

import math
import random
import struct
import sys
import wave
from pathlib import Path

SR = 48_000
DURATION = 56.0
RNG = random.Random(12082026)


def smooth(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def bell(t: float, start: float, frequency: float, gain: float) -> float:
    local = t - start
    if local < 0.0 or local > 5.5:
        return 0.0
    env = smooth(local / 0.045) * math.exp(-local / 3.4)
    return gain * env * (
        math.sin(2 * math.pi * frequency * local)
        + 0.20 * math.sin(2 * math.pi * frequency * 2.003 * local)
        + 0.05 * math.sin(2 * math.pi * frequency * 4.01 * local)
    )


def soft_hit(t: float, start: float, frequency: float, gain: float, decay: float = 18.0) -> float:
    local = t - start
    if local < 0.0 or local > 0.7:
        return 0.0
    return gain * math.exp(-local * decay) * math.sin(2 * math.pi * frequency * local)


def noise_cue(t: float, start: float, duration: float, noise: float, gain: float) -> float:
    local = t - start
    if local < 0.0 or local > duration:
        return 0.0
    env = math.sin(math.pi * local / duration) ** 2
    return noise * gain * env


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("soundscape.wav")
    total = int(SR * DURATION)
    frames = bytearray()
    air_l = air_r = 0.0

    notes = [
        (0.8, 293.66, .038), (4.3, 369.99, .031),
        (8.7, 440.00, .030), (12.3, 329.63, .034),
        (16.7, 369.99, .040), (20.3, 493.88, .034),
        (24.5, 329.63, .022), (29.0, 293.66, .020),
        (32.5, 369.99, .030), (36.0, 440.00, .033),
        (40.4, 493.88, .040), (43.4, 587.33, .043),
        (47.4, 440.00, .044), (50.2, 493.88, .046),
        (52.8, 587.33, .043),
    ]
    sewing = [8.55 + .43 * i for i in range(17)]
    footsteps = (32.75, 33.62, 34.49)
    keyboard = (40.75, 41.08, 41.43, 42.02, 42.35, 42.83, 43.28, 44.05)
    paper = ((16.25, .72), (45.15, .55))

    for index in range(total):
        t = index / SR
        white_l = RNG.uniform(-1.0, 1.0)
        white_r = RNG.uniform(-1.0, 1.0)
        air_l = .99925 * air_l + .00075 * white_l
        air_r = .99921 * air_r + .00079 * white_r

        entrance = smooth(t / 2.2)
        exit_env = smooth((DURATION - t) / 3.8)
        master = entrance * exit_env
        conflict_space = 1.0 - .55 * smooth((t - 23.5) / 2.0) * smooth((32.0 - t) / 2.0)
        resolve = smooth((t - 38.0) / 10.0)

        # Warm chamber bed, intentionally asymmetric for width.
        bed_l = (
            .014 * math.sin(2 * math.pi * 146.83 * t)
            + .010 * math.sin(2 * math.pi * 220.00 * t + .31)
            + .007 * math.sin(2 * math.pi * 293.66 * t + 1.0)
        )
        bed_r = (
            .014 * math.sin(2 * math.pi * 146.83 * t + .015)
            + .010 * math.sin(2 * math.pi * 220.00 * t + .42)
            + .007 * math.sin(2 * math.pi * 293.66 * t + .92)
        )
        melody = sum(bell(t, start, freq, gain) for start, freq, gain in notes)

        # Story foley: sewing, footsteps, keyboard, paper and tablet start.
        sewing_cue = sum(
            soft_hit(t, start, 620.0 + (i % 3) * 75.0, .010, 48.0)
            + soft_hit(t, start, 118.0, .006, 26.0)
            for i, start in enumerate(sewing)
        )
        step_cue = sum(soft_hit(t, start, 82.0, .020, 14.0) for start in footsteps)
        key_cue = sum(
            soft_hit(t, start, 1320.0 + (i % 2) * 160.0, .006, 70.0)
            for i, start in enumerate(keyboard)
        )
        paper_cue = sum(noise_cue(t, start, dur, white_l, .010) for start, dur in paper)
        tablet = soft_hit(t, 48.15, 880.0, .013, 8.0) + bell(t, 48.15, 1760.0, .010)

        pulse_level = .004 if 24.0 <= t < 32.0 else (.008 + .004 * resolve)
        pulse = pulse_level * math.exp(-(t % 1.0) * 9.0) * math.sin(2 * math.pi * 110.0 * t)
        lift_l = resolve * .007 * math.sin(2 * math.pi * 369.99 * t + .5)
        lift_r = resolve * .007 * math.sin(2 * math.pi * 369.99 * t + .65)

        common = melody + sewing_cue + step_cue + key_cue + paper_cue + tablet + pulse
        left = master * (conflict_space * bed_l + common + lift_l + air_l * .34)
        right = master * (conflict_space * bed_r + common * .97 + lift_r + air_r * .34)
        left = max(-.98, min(.98, left))
        right = max(-.98, min(.98, right))
        frames += struct.pack("<hh", int(left * 32767), int(right * 32767))

    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SR)
        wav.writeframes(frames)
    print(f"wrote {out} ({DURATION:.0f}s / 48kHz stereo)")


if __name__ == "__main__":
    main()
