# -*- coding: utf-8 -*-
"""思い出アルバム動画用のBGMを合成する(著作権フリー・完全オリジナル)。

ピアノ風の音を加算合成し、コード進行に沿ってアルペジオ+旋律を鳴らす。
**すべて計算で作るので権利関係の心配がなく**、商用の納品物にそのまま使える。
市販音源のような表現力は無いが、写真+手紙の動画に敷く「静かなピアノ」としては
十分に成立する(この商品はBGMが主役ではなく、手紙を読ませるための土台)。

使い方:
    # 動画の尺に合わせて作る(order.yaml の target_duration と同じ秒数を指定)
    python3 scripts/make_bgm.py --seconds 50 --out orders/x-001/input/bgm.mp3

    # 曲調を変える(量産で全部同じ曲になるのを避ける)
    python3 scripts/make_bgm.py --seconds 50 --mood tender --key F --out bgm.mp3
    python3 scripts/make_bgm.py --seconds 60 --mood hopeful --tempo 72 --out bgm.mp3

    --mood warm    : I-V-vi-IV。素直で温かい。母の日・誕生日の定番
    --mood tender  : vi-IV-I-V。少し切なく、しみじみ。還暦・退職向け
    --mood hopeful : I-IV-vi-V。前向きで明るい。卒業・新生活向け

依存: numpy(合成)と ffmpeg(mp3化)。どちらもこのリポジトリの他の処理で既に使う。
"""
from __future__ import annotations

import argparse
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import PipelineError

SR = 44100

# 度数(スケール上の位置)で進行を持ち、--key で移調する。
# どれも「4小節1巡」で、繰り返しても飽きにくい定番進行にしてある
MOODS = {
    "warm":    [(0, "maj"), (7, "maj"), (9, "min"), (5, "maj")],   # I  V  vi IV
    "tender":  [(9, "min"), (5, "maj"), (0, "maj"), (7, "maj")],   # vi IV I  V
    "hopeful": [(0, "maj"), (5, "maj"), (9, "min"), (7, "maj")],   # I  IV vi V
}
KEYS = {"C": 0, "D": 2, "Eb": 3, "E": 4, "F": 5, "G": 7, "A": 9, "Bb": 10}
TRIAD = {"maj": (0, 4, 7), "min": (0, 3, 7)}


def midi_hz(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12.0)


def piano_note(freq: float, dur: float, amp: float) -> np.ndarray:
    """ピアノ風の1音。倍音を重ね、低音ほど長く響かせる。

    完全な模倣は狙わない。耳障りな倍音を削り、立ち上がりを少し鈍らせると
    「柔らかいアップライトピアノ」くらいの質感になり、語りの邪魔をしない。
    """
    n = int(dur * SR)
    if n <= 0:
        return np.zeros(0, dtype=np.float32)
    t = np.arange(n) / SR
    # 減衰は低音ほど長い(実際のピアノと同じ傾向)
    decay = np.clip(2.6 - 0.0016 * freq, 0.7, 2.6)
    env = (1.0 - np.exp(-t / 0.012)) * np.exp(-t / decay)
    wave_ = np.zeros(n)
    for k in range(1, 9):
        # 弦の硬さによる非整数倍音のずれ。わずかに入れると響きが自然になる
        f = freq * k * (1.0 + 0.00045 * k * k)
        if f > SR / 2.2:
            break
        # 高次ほど速く減衰させる(これをしないと金属的になる)
        wave_ += (1.0 / k ** 1.55) * np.sin(2 * np.pi * f * t) * np.exp(-t * (0.6 + 0.5 * k))
    return (wave_ * env * amp).astype(np.float32)


def reverb(x: np.ndarray, mix: float = 0.32, tail: float = 1.4) -> np.ndarray:
    """合成した残響(部屋鳴り)を FFT 畳み込みで足す。乾いた音のままだと硬い。"""
    n_ir = int(tail * SR)
    t = np.arange(n_ir) / SR
    rng = np.random.default_rng(7)          # 毎回同じ響きにする(再現性のため)
    ir = rng.standard_normal(n_ir) * np.exp(-t / (tail * 0.32))
    ir[: int(0.012 * SR)] = 0               # プリディレイ(壁までの距離)
    ir /= np.abs(ir).sum() / 8.0
    size = 1 << int(np.ceil(np.log2(len(x) + n_ir)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size))[: len(x)]
    return ((1 - mix) * x + mix * wet).astype(np.float32)


def compose(seconds: float, mood: str, key: str, tempo: float) -> np.ndarray:
    """進行に沿ってアルペジオ+旋律を並べ、最後に主和音で解決させる。"""
    beat = 60.0 / tempo
    bar = 4 * beat
    n_bars = max(4, int(np.ceil((seconds + 1.5) / bar)))
    total = int((n_bars * bar + 2.5) * SR)
    buf = np.zeros(total, dtype=np.float32)
    prog = MOODS[mood]
    root = 60 + KEYS[key]                    # 中央ド基準

    def place(sig: np.ndarray, at: float) -> None:
        i = int(at * SR)
        end = min(i + len(sig), total)
        if i < total:
            buf[i:end] += sig[: end - i]

    rng = np.random.default_rng(11)
    for b in range(n_bars):
        deg, quality = prog[b % len(prog)]
        chord = [root + deg + iv for iv in TRIAD[quality]]
        t0 = b * bar
        is_intro = b < 2                      # 冒頭の手紙カード: 音数を絞る
        is_outro = b >= n_bars - 2            # 結び: 収束させる

        # 低音(ルート)。1小節に1回、長く響かせる
        place(piano_note(midi_hz(chord[0] - 12), bar * 1.6, 0.30), t0)

        # アルペジオ。8分音符で上下する。イントロと結びは半分の音数にする
        pattern = [0, 1, 2, 1] if (is_intro or is_outro) else [0, 1, 2, 1, 2, 1, 0, 1]
        step = bar / len(pattern)
        for i, idx in enumerate(pattern):
            note = chord[idx] + (12 if i % 4 == 2 and not is_intro else 0)
            vel = 0.16 + 0.03 * rng.standard_normal()      # 打鍵の強弱を少し揺らす
            place(piano_note(midi_hz(note), step * 2.2, max(0.08, vel)), t0 + i * step)

        # 旋律。主音・3度・5度を中心に、小節ごとにゆっくり動かす
        if not is_intro:
            mel_deg = [0, 4, 7, 4, 9, 7, 4, 0][b % 8]
            place(piano_note(midi_hz(root + 12 + mel_deg), bar * 0.9, 0.20), t0 + beat * 0.5)
            if not is_outro:
                place(piano_note(midi_hz(root + 12 + mel_deg + 3), bar * 0.7, 0.13),
                      t0 + beat * 2.5)

    # 最後は主和音を長く置いて解決させる(進行の途中で切れると落ち着かない)
    for iv in (0, 4, 7, 12):
        place(piano_note(midi_hz(root + iv), 3.2, 0.20), n_bars * bar)
    place(piano_note(midi_hz(root - 12), 3.6, 0.26), n_bars * bar)

    buf = reverb(buf)
    # 動画の尺ぴったり+余韻。頭は静かに入り、最後は自然に消える
    out = buf[: int((seconds + 2.0) * SR)]
    fi = int(1.2 * SR)
    out[:fi] *= np.linspace(0, 1, fi)
    fo = int(3.0 * SR)
    out[-fo:] *= np.linspace(1, 0, fo)
    peak = float(np.abs(out).max())
    return out / peak * 0.82 if peak > 0 else out


def write_wav(path: Path, x: np.ndarray) -> None:
    """わずかに左右をずらしてステレオ幅を出す(モノラルのままだと平板に聞こえる)。"""
    d = int(0.011 * SR)
    left = x
    right = np.concatenate([np.zeros(d, dtype=np.float32), x[:-d]]) * 0.97
    inter = np.empty(len(x) * 2, dtype=np.float32)
    inter[0::2], inter[1::2] = left, right
    pcm = np.clip(inter, -1, 1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(struct.pack(f"<{len(pcm)}h", *(pcm * 32767).astype(np.int16)))


def main() -> None:
    ap = argparse.ArgumentParser(description="思い出アルバム動画用のBGMを合成する")
    ap.add_argument("--out", required=True, help="出力mp3のパス(例: orders/x-001/input/bgm.mp3)")
    ap.add_argument("--seconds", type=float, required=True,
                    help="動画の尺(order.yaml の target_duration と同じ値)")
    ap.add_argument("--mood", choices=sorted(MOODS), default="warm",
                    help="warm=温かい / tender=しみじみ / hopeful=前向き")
    ap.add_argument("--key", choices=sorted(KEYS), default="C", help="調(高いほど明るい印象)")
    ap.add_argument("--tempo", type=float, default=66, help="テンポ(BPM。60〜76が落ち着く)")
    args = ap.parse_args()

    if args.seconds < 8:
        raise PipelineError("--seconds は8秒以上にしてください")
    ffmpeg = common.find_tool("ffmpeg")
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    audio = compose(args.seconds, args.mood, args.key, args.tempo)
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "bgm.wav"
        write_wav(wav, audio)
        common.run([ffmpeg, "-y", "-i", str(wav), "-c:a", "libmp3lame", "-q:a", "2", str(out)])

    print(f"[bgm] {out}  {len(audio) / SR:.1f}s / {args.mood} / key={args.key} / {args.tempo:g}BPM")
    print("      合成音なので権利関係の心配なく納品できます。")
    print("      曲調を変えるときは --mood / --key / --tempo を変えて作り直してください。")


if __name__ == "__main__":
    try:
        main()
    except PipelineError as e:
        common.die(e)
