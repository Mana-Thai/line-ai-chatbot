# -*- coding: utf-8 -*-
"""Generate the 56-second original score for Mother's Day Film v5."""

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


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def bell(t: float, start: float, frequency: float, amplitude: float) -> float:
    local = t - start
    if local < 0.0:
        return 0.0
    attack = smoothstep(local / 0.10)
    envelope = attack * math.exp(-local / 4.6)
    return amplitude * envelope * (
        math.sin(2 * math.pi * frequency * local)
        + 0.22 * math.sin(2 * math.pi * frequency * 2.003 * local)
        + 0.06 * math.sin(2 * math.pi * frequency * 3.01 * local)
    )


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("soundscape.wav")
    total = int(SR * DURATION)
    air = 0.0
    frames = bytearray()

    # D-major pentatonic. The 24–32s argument chapter uses space, not a dark key change.
    events = [
        (1.0, 293.66, 0.050), (5.0, 369.99, 0.045),
        (9.0, 440.00, 0.040), (13.0, 329.63, 0.044),
        (17.0, 369.99, 0.050), (21.0, 493.88, 0.045),
        (25.0, 329.63, 0.030), (30.0, 293.66, 0.028),
        (33.0, 369.99, 0.042), (37.0, 440.00, 0.044),
        (41.0, 493.88, 0.050), (44.5, 587.33, 0.052),
        (48.0, 440.00, 0.055), (51.0, 493.88, 0.050),
        (53.5, 587.33, 0.045),
    ]

    for index in range(total):
        t = index / SR
        master = smoothstep(t / 2.5) * smoothstep((DURATION - t) / 4.0)
        white = RNG.uniform(-1.0, 1.0)
        air = 0.9992 * air + 0.0008 * white

        # A soft working pulse appears under childhood, thins during conflict, then returns as resolve.
        if t < 24.0:
            pulse_level = 0.010
        elif t < 32.0:
            pulse_level = 0.003
        elif t < 40.0:
            pulse_level = 0.007
        else:
            pulse_level = 0.012
        pulse_phase = t % 1.0
        pulse = pulse_level * math.exp(-pulse_phase * 9.0) * math.sin(2 * math.pi * 110.0 * t)

        warmth = (
            0.020 * math.sin(2 * math.pi * 146.83 * t)
            + 0.014 * math.sin(2 * math.pi * 220.00 * t + 0.35)
            + 0.010 * math.sin(2 * math.pi * 293.66 * t + 1.1)
        )
        melody = sum(bell(t, start, freq, amp) for start, freq, amp in events)
        understanding = smoothstep((t - 39.0) / 10.0)
        lift = understanding * 0.010 * math.sin(2 * math.pi * 369.99 * t + 0.7)
        mono = master * (air * 0.48 + pulse + warmth + melody + lift)

        pan = 0.06 * math.sin(t * 0.10)
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
