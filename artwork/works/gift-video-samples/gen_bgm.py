# -*- coding: utf-8 -*-
"""サンプル動画用のシンプルなBGM(アルペジオ+ベース)をWAVで合成する。

    python gen_bgm.py <theme> <out.wav> [seconds]
    theme: mothersday | birthday | anniversary
"""
import math
import struct
import sys
import wave

SR = 44100

THEMES = {
    # (BPM, 進行[各コードのMIDIノート(root, 3rd, 5th, oct)])
    "mothersday": (84, [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]]),
    "birthday": (104, [[55, 59, 62, 67], [60, 64, 67, 72], [52, 55, 59, 64], [50, 53, 57, 62]]),
    "anniversary": (72, [[53, 57, 60, 65], [50, 53, 57, 62], [58, 62, 65, 70], [55, 59, 62, 67]]),
}


def freq(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def add_note(buf, start_sec, midi, dur, vol):
    f = freq(midi)
    n0 = int(start_sec * SR)
    n = min(int(dur * SR), len(buf) - n0)
    for i in range(max(n, 0)):
        t = i / SR
        env = math.exp(-2.6 * t) * min(1.0, t * 200)  # 短いアタック+指数減衰
        v = (math.sin(2 * math.pi * f * t)
             + 0.35 * math.sin(2 * math.pi * 2 * f * t)
             + 0.12 * math.sin(2 * math.pi * 3 * f * t))
        buf[n0 + i] += vol * env * v


def main():
    theme, out = sys.argv[1], sys.argv[2]
    total = float(sys.argv[3]) if len(sys.argv) > 3 else 40.0
    bpm, prog = THEMES[theme]
    beat = 60.0 / bpm
    buf = [0.0] * int(total * SR)

    t = 0.0
    ci = 0
    while t < total - 0.5:
        chord = prog[ci % len(prog)]
        add_note(buf, t, chord[0] - 12, beat * 4, 0.16)          # ベース
        arp = [chord[0], chord[1], chord[2], chord[3], chord[2], chord[1], chord[2], chord[3]]
        for k, m in enumerate(arp):                               # 8分アルペジオ
            add_note(buf, t + k * beat / 2, m, 1.1, 0.11)
        ci += 1
        t += beat * 4

    peak = max(abs(v) for v in buf) or 1.0
    gain = 0.85 / peak
    # 末尾3秒フェードアウト
    fade_n = int(3 * SR)
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for i, v in enumerate(buf):
            g = gain
            if i > len(buf) - fade_n:
                g *= (len(buf) - i) / fade_n
            frames += struct.pack("<h", int(max(-1, min(1, v * g)) * 32767))
        w.writeframes(bytes(frames))
    print(f"wrote {out} ({total:.0f}s, {theme})")


if __name__ == "__main__":
    main()
