#!/usr/bin/env python3
"""Generate the original 13-second soundtrack for the Mother's Day marquee.

The score is intentionally sparse: a warm music-box pulse, soft felt-piano
chords and tiny placement chimes synchronized to the canvas animation.
Only Python's standard library is required.
"""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path


SAMPLE_RATE = 48_000
DURATION = 13.0
FRAMES = int(SAMPLE_RATE * DURATION)
OUT = Path(__file__).with_name("stc-mothersday-marquee-music.wav")
TAU = math.tau


def hz(midi: float) -> float:
    return 440.0 * (2.0 ** ((midi - 69.0) / 12.0))


left = [0.0] * FRAMES
right = [0.0] * FRAMES


def add_tone(
    start: float,
    duration: float,
    midi: float,
    gain: float,
    *,
    kind: str = "bell",
    pan: float = 0.0,
) -> None:
    """Add a shaped stereo tone; pan is -1 left to +1 right."""
    begin = max(0, int(start * SAMPLE_RATE))
    end = min(FRAMES, int((start + duration) * SAMPLE_RATE))
    freq = hz(midi)
    lg = math.sqrt((1.0 - pan) * 0.5)
    rg = math.sqrt((1.0 + pan) * 0.5)
    for i in range(begin, end):
        t = i / SAMPLE_RATE - start
        if kind == "bell":
            env = min(1.0, t / 0.008) * math.exp(-4.3 * t / duration)
            sample = (
                math.sin(TAU * freq * t)
                + 0.34 * math.sin(TAU * freq * 2.01 * t + 0.3)
                + 0.13 * math.sin(TAU * freq * 3.98 * t + 0.8)
            ) / 1.47
        elif kind == "felt":
            attack = min(1.0, t / 0.035)
            release = min(1.0, (duration - t) / 0.24)
            env = attack * max(0.0, release) * math.exp(-1.1 * t / duration)
            sample = (
                math.sin(TAU * freq * t)
                + 0.18 * math.sin(TAU * freq * 2.0 * t + 0.1)
                + 0.06 * math.sin(TAU * freq * 3.0 * t)
            ) / 1.24
        else:  # airy sine pad
            attack = min(1.0, t / 0.45)
            release = min(1.0, (duration - t) / 0.75)
            env = attack * max(0.0, release)
            drift = 0.0025 * math.sin(TAU * 0.19 * t)
            sample = 0.75 * math.sin(TAU * freq * (1.0 + drift) * t)
            sample += 0.25 * math.sin(TAU * freq * 0.5 * t + 0.4)
        value = gain * env * sample
        left[i] += value * lg
        right[i] += value * rg


def add_chord(start: float, duration: float, notes: tuple[int, ...], gain: float) -> None:
    pans = (-0.35, 0.0, 0.35, 0.12)
    for idx, note in enumerate(notes):
        add_tone(start, duration, note, gain, kind="pad", pan=pans[idx % len(pans)])


def add_soft_step(start: float, pan: float, pitch: float = 145.0, gain: float = 0.055) -> None:
    """A felted wooden step used for the girl's entrance and gentle fall."""
    begin = int(start * SAMPLE_RATE)
    end = min(FRAMES, begin + int(0.12 * SAMPLE_RATE))
    lg = math.sqrt((1.0 - pan) * 0.5)
    rg = math.sqrt((1.0 + pan) * 0.5)
    for i in range(begin, end):
        t = (i - begin) / SAMPLE_RATE
        env = math.exp(-38.0 * t)
        freq = pitch - 35.0 * min(1.0, t / 0.12)
        value = gain * env * (
            math.sin(TAU * freq * t) + 0.24 * math.sin(TAU * freq * 2.0 * t)
        )
        left[i] += value * lg
        right[i] += value * rg


# Harmonic bed: F major with added sixth/ninth colors for warmth.
add_chord(0.00, 3.15, (41, 48, 57, 60), 0.030)   # F6/9
add_chord(3.00, 2.85, (45, 52, 55, 60), 0.030)   # Am7
add_chord(5.70, 2.45, (46, 53, 57, 60), 0.029)   # Bbmaj9
add_chord(8.00, 2.45, (43, 50, 53, 57), 0.030)   # Gm9
add_chord(10.25, 2.75, (41, 48, 53, 57), 0.038)  # Fmaj7, home

# Opening motif follows the ball's approach and ladder setup.
for start, note, pan in (
    (0.34, 72, -0.40), (0.82, 76, -0.15), (1.30, 79, 0.10),
    (1.92, 81, 0.32), (2.48, 79, 0.15), (3.12, 76, -0.08),
):
    add_tone(start, 0.72, note, 0.115, pan=pan)

# Letter placements: LOVE then MOM, matching the animation timestamps.
for start, note, pan in (
    (4.10, 72, -0.44), (4.50, 74, -0.17), (4.90, 76, 0.10), (5.30, 79, 0.38),
    (7.80, 76, -0.28), (8.20, 79, 0.00), (8.60, 81, 0.30),
):
    add_tone(start, 0.62, note, 0.135, pan=pan)

# A few grounded felt notes stop the music-box color becoming childish.
for start, note in ((3.40, 53), (5.65, 57), (6.65, 60), (9.05, 55), (9.65, 57)):
    add_tone(start, 0.82, note, 0.055, kind="felt", pan=-0.08)

# Sign-light sparkle and the final gratitude cadence.
for idx, note in enumerate((72, 76, 79, 84, 88)):
    add_tone(10.16 + idx * 0.105, 0.90, note, 0.105 - idx * 0.006,
             pan=-0.42 + idx * 0.21)
for start, note, pan in (
    (10.82, 81, -0.24), (11.28, 79, 0.22), (11.76, 76, -0.10),
    (12.18, 72, 0.08), (12.18, 77, -0.20), (12.18, 81, 0.25),
):
    add_tone(start, 0.82, note, 0.115, pan=pan)

# Footsteps, a soft stumble and an upward recovery tone replace the old rolling cue.
add_soft_step(0.16, -0.46)
add_soft_step(0.48, -0.30)
add_soft_step(0.73, -0.14, pitch=172.0, gain=0.042)
add_soft_step(1.03, 0.02, pitch=92.0, gain=0.090)
add_tone(1.50, 0.72, 72, 0.095, pan=-0.08)
add_tone(1.64, 0.76, 76, 0.090, pan=0.12)

# Near-silent air texture keeps the pauses alive without audible hiss.
rng = random.Random(20260812)
air_l = 0.0
air_r = 0.0
for i in range(FRAMES):
    air_l = 0.992 * air_l + 0.008 * rng.uniform(-1.0, 1.0)
    air_r = 0.992 * air_r + 0.008 * rng.uniform(-1.0, 1.0)
    left[i] += air_l * 0.0045
    right[i] += air_r * 0.0045

# Gentle master compression and a short fade to avoid a hard file boundary.
peak = max(max(abs(v) for v in left), max(abs(v) for v in right), 1e-9)
makeup = min(1.0, 0.84 / peak)
with wave.open(str(OUT), "wb") as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(SAMPLE_RATE)
    frames = bytearray()
    for i, (lv, rv) in enumerate(zip(left, right)):
        fade = min(1.0, i / (0.03 * SAMPLE_RATE), (FRAMES - i) / (0.16 * SAMPLE_RATE))
        lv = math.tanh(lv * makeup * 1.15) * fade
        rv = math.tanh(rv * makeup * 1.15) * fade
        frames += struct.pack("<hh", int(lv * 32767), int(rv * 32767))
    wav.writeframes(frames)

print(OUT)
