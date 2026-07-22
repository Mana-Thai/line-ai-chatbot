# -*- coding: utf-8 -*-
"""Generate a sparse 30-second stereo soundscape for Mother's Day Film v3."""

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


def bell(t: float, start: float, frequency: float, decay: float, amplitude: float) -> float:
    local = t - start
    if local < 0:
        return 0.0
    attack = smoothstep(local / 0.08)
    envelope = attack * math.exp(-local / decay)
    partials = (
        math.sin(2 * math.pi * frequency * local)
        + 0.32 * math.sin(2 * math.pi * frequency * 2.013 * local)
        + 0.12 * math.sin(2 * math.pi * frequency * 3.97 * local)
    )
    return amplitude * envelope * partials


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("soundscape.wav")
    total = int(SR * DURATION)
    phase_low = phase_high = 0.0
    filtered_noise = 0.0
    frames = bytearray()
    events = [(1.8, 146.83), (9.7, 196.0), (18.9, 164.81), (24.4, 220.0)]

    for index in range(total):
        t = index / SR
        fade_in = smoothstep(t / 4.0)
        fade_out = smoothstep((DURATION - t) / 4.5)
        master = fade_in * fade_out

        # Slowly beating low partials: felt more than heard.
        phase_low += 2 * math.pi * (48.0 + 0.7 * math.sin(t * 0.13)) / SR
        phase_high += 2 * math.pi * (73.0 + 0.4 * math.sin(t * 0.09 + 1.2)) / SR
        drone = 0.10 * math.sin(phase_low) + 0.055 * math.sin(phase_high)

        # Filtered room air and intermittent paper-fibre crackle.
        white = RNG.uniform(-1.0, 1.0)
        filtered_noise = 0.9985 * filtered_noise + 0.0015 * white
        air = filtered_noise * 1.8
        crackle = RNG.uniform(-0.18, 0.18) if RNG.random() < 0.00012 else 0.0

        sparse = sum(bell(t, start, freq, 3.8, 0.13) for start, freq in events)
        transition = 0.035 * math.sin(2 * math.pi * 293.66 * (t - 20.2)) * math.exp(-(t - 20.2) / 5.0) if t >= 20.2 else 0.0

        mono = master * (drone + air + crackle + sparse + transition)
        pan = 0.12 * math.sin(t * 0.17)
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
