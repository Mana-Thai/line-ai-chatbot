# -*- coding: utf-8 -*-
"""Generate restrained original ambience and story foley; no music."""

from __future__ import annotations

import math
import random
import struct
import sys
import wave
from pathlib import Path

SR = 48_000
DURATION = 30.0
RNG = random.Random(12081990)


def smooth(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return x * x * (3.0 - 2.0 * x)


def hit(t: float, start: float, freq: float, gain: float, decay: float) -> float:
    p = t - start
    if p < 0 or p > 0.8:
        return 0.0
    return gain * math.exp(-decay * p) * math.sin(2 * math.pi * freq * p)


def rustle(t: float, start: float, duration: float, white: float, gain: float) -> float:
    p = t - start
    if p < 0 or p > duration:
        return 0.0
    return white * gain * math.sin(math.pi * p / duration) ** 2


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("foley.wav")
    frames = bytearray()
    air_l = air_r = rain_l = rain_r = 0.0

    for i in range(int(SR * DURATION)):
        t = i / SR
        wl, wr = RNG.uniform(-1, 1), RNG.uniform(-1, 1)
        air_l = .9991 * air_l + .0009 * wl
        air_r = .9990 * air_r + .0010 * wr
        rain_l = .972 * rain_l + .028 * wl
        rain_r = .969 * rain_r + .031 * wr

        rural = (1.0 - smooth((t - 6.7) / .8)) * .020
        office = smooth((t - 6.7) / .8) * (1.0 - smooth((t - 16.0) / .8))
        home = smooth((t - 15.8) / .9) * .016

        coin = hit(t, 4.10, 2120, .045, 14) + hit(t, 4.10, 680, .020, 22)
        paper = (
            rustle(t, 10.25, 1.05, wl, .055)
            + rustle(t, 13.35, 1.35, wr, .048)
            + rustle(t, 19.55, .95, wl, .038)
        )
        pen = hit(t, 12.15, 1180, .013, 45)
        window_rain_l = office * (.022 * rain_l + .0035 * wl)
        window_rain_r = office * (.022 * rain_r + .0035 * wr)
        room_l = rural * air_l + home * air_l
        room_r = rural * air_r + home * air_r
        # A nearly subliminal shared contact tone links coin and envelope.
        return_contact = hit(t, 20.25, 680, .024, 12) + hit(t, 20.25, 1360, .010, 17)

        fade_in = smooth(t / 1.0)
        fade_out = smooth((DURATION - t) / 1.3)
        left = fade_in * fade_out * (
            room_l + window_rain_l + coin + paper + pen + return_contact
        )
        right = fade_in * fade_out * (
            room_r + window_rain_r + coin * .91 + paper * .96 + pen + return_contact * 1.05
        )
        frames += struct.pack(
            "<hh",
            int(max(-.98, min(.98, left)) * 32767),
            int(max(-.98, min(.98, right)) * 32767),
        )

    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SR)
        wav.writeframes(frames)
    print(f"wrote {out} ({DURATION:.1f}s, 48kHz stereo)")


if __name__ == "__main__":
    main()

