# -*- coding: utf-8 -*-
"""Generate a warm 30-second stereo score for Mother's Day Film v4."""

from __future__ import annotations

import math
import random
import struct
import sys
import wave
from pathlib import Path

SR = 48_000
DURATION = 30.0
RNG = random.Random(8122026)


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def chime(t: float, start: float, frequency: float, amplitude: float = 0.09) -> float:
    local = t - start
    if local < 0:
        return 0.0
    attack = smoothstep(local / 0.12)
    envelope = attack * math.exp(-local / 4.8)
    tone = (
        math.sin(2 * math.pi * frequency * local)
        + 0.24 * math.sin(2 * math.pi * frequency * 2.002 * local)
        + 0.07 * math.sin(2 * math.pi * frequency * 3.01 * local)
    )
    return amplitude * envelope * tone


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("soundscape.wav")
    total = int(SR * DURATION)
    air = wave_motion = 0.0
    frames = bytearray()
    # D-major pentatonic fragments: open and warm, but never a jingle.
    events = [
        (0.8, 293.66, 0.07), (4.7, 369.99, 0.065), (9.2, 440.00, 0.06),
        (12.0, 329.63, 0.07), (16.8, 493.88, 0.055), (21.1, 369.99, 0.07),
        (24.7, 440.00, 0.065), (27.0, 587.33, 0.045),
    ]

    for index in range(total):
        t = index / SR
        master = smoothstep(t / 2.8) * smoothstep((DURATION - t) / 3.5)

        white = RNG.uniform(-1.0, 1.0)
        air = 0.9991 * air + 0.0009 * white
        wave_motion = 0.997 * wave_motion + 0.003 * RNG.uniform(-1.0, 1.0)
        morning_air = air * 0.72
        distant_water = wave_motion * (0.18 + 0.07 * math.sin(2 * math.pi * 0.11 * t))

        warm_bed = (
            0.026 * math.sin(2 * math.pi * 146.83 * t)
            + 0.018 * math.sin(2 * math.pi * 220.00 * t + 0.4)
            + 0.012 * math.sin(2 * math.pi * 293.66 * t + 1.1)
        )
        melody = sum(chime(t, start, freq, amp) for start, freq, amp in events)
        mono = master * (morning_air + distant_water + warm_bed + melody)
        pan = 0.08 * math.sin(t * 0.12)
        left = max(-1.0, min(1.0, mono * (1.0 - pan)))
        right = max(-1.0, min(1.0, mono * (1.0 + pan)))
        frames += struct.pack("<hh", int(left * 32767), int(right * 32767))

    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SR)
        wav.writeframes(frames)
    print(f"wrote {out} ({DURATION:.0f}s stereo)")


if __name__ == "__main__":
    main()
