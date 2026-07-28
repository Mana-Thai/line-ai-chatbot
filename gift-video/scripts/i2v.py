# -*- coding: utf-8 -*-
"""静止画1枚をAI(Veo / Gemini API)でプロンプトの指示通りに動く動画にする。

    # 生成 (要 GEMINI_API_KEY)
    python scripts/i2v.py photo.png --prompt "The couple slowly turn to each other and smile" \
        --out orders/x-001/input/scene1.mp4 --fit-duration 10

    # 外部サービス(Kling/Hailuo等)でダウンロードした動画をシーン素材の仕様に整える
    python scripts/i2v.py --normalize-only downloaded.mp4 --out orders/x-001/input/scene1.mp4 --fit-duration 10

    # 利用できるVeoモデルの一覧を表示
    python scripts/i2v.py --list-models

出力は animate.py と同じ H.264 / yuv420p / 30fps (既定は音声なし。--keep-audio で残せる)。
生成した元動画は <出力名>.raw.mp4 として残すので、整形だけやり直せる。
カメラワーク(ズーム/パン)だけで良いなら animate.py の方が速い・無料・確実。
使い分けとプロンプトの書き方は Skill `image-to-video` を参照。
"""
from __future__ import annotations

import argparse
import base64
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import PipelineError

API_BASE = "https://generativelanguage.googleapis.com/v1beta"
# Veo 3.0 / 2.0 系は 2026-06-30 に停止済み。3.1 系のみ使える。
# 料金は出力1秒あたり: Lite $0.05 / Fast $0.10 / 標準 $0.40 (720p基準)
DEFAULT_MODEL = "veo-3.1-fast-generate-001"
FALLBACK_MODELS = [
    "veo-3.1-lite-generate-preview",    # 最安 (Fastの半額以下)
    "veo-3.1-generate-preview",         # 最高品質・高価
]
IMAGE_MIMES = {".png": "image/png", ".jpg": "image/jpeg",
               ".jpeg": "image/jpeg", ".webp": "image/webp"}
STRETCH_MAX = 1.6       # これ以上のスロー再生は不自然になるのでループで埋める
POLL_SEC = 15
POLL_TIMEOUT_SEC = 15 * 60

KEY_HELP = """\
環境変数 GEMINI_API_KEY が設定されていません。

  https://aistudio.google.com/apikey でAPIキーを取得して設定してください。
  ※ Veo(動画生成)に無料枠はありません。キー作成後にそのプロジェクトで
    課金を有効化する必要があります(有効化しないと 429/403 で失敗します)。
    料金は出力1秒あたり Lite $0.05 / Fast $0.10 / 標準 $0.40 (720p基準)。

APIが使えない場合は、外部サービス(Kling / Hailuo / Runway 等)のWeb画面で
画像から動画を生成してダウンロードし、このスクリプトの --normalize-only で
シーン素材の仕様に整えることもできます。
"""


def api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise PipelineError(KEY_HELP)
    return key


def api_call(url: str, key: str, payload: dict | None = None, timeout: int = 120) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, headers={
        "x-goog-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:1500]
        hint = ""
        if e.code == 404:
            hint = "\nモデル名が変わった可能性があります。--list-models で現在使える名前を確認してください。"
        elif e.code == 429:
            hint = "\nクォータ超過です。時間を置くか、Google AI Studio で課金設定・上限を確認してください。"
        elif e.code in (400, 403) and "API_KEY" in body.upper():
            hint = "\nAPIキーが無効です。GEMINI_API_KEY の値を確認してください。"
        raise PipelineError(f"APIエラー HTTP {e.code}: {url}\n{body}{hint}")
    except urllib.error.URLError as e:
        raise PipelineError(f"APIに接続できません: {e.reason}\nネットワーク・プロキシ設定を確認してください。")


def list_models() -> None:
    key = api_key()
    url = f"{API_BASE}/models?pageSize=200"
    names = []
    while url:
        res = api_call(url, key)
        for m in res.get("models", []):
            if "veo" in m.get("name", ""):
                names.append((m["name"].removeprefix("models/"),
                              m.get("displayName", "")))
        token = res.get("nextPageToken")
        url = f"{API_BASE}/models?pageSize=200&pageToken={token}" if token else None
    if not names:
        print("Veo系モデルが見つかりませんでした (このAPIキーでは動画生成が使えない可能性があります)")
        return
    print("利用できるVeoモデル:")
    for name, disp in names:
        print(f"  {name:40s} {disp}")


# ---------------------------------------------------------------------------
# レスポンス解析 (モデル世代によりJSONの形が違うため、再帰的に動画を探す)
# ---------------------------------------------------------------------------
def find_video_payload(obj) -> tuple[str, str] | None:
    """('b64', データ) または ('uri', URL) を返す。見つからなければ None。"""
    if isinstance(obj, dict):
        v = obj.get("bytesBase64Encoded")
        if isinstance(v, str) and len(v) > 1000:
            return ("b64", v)
        for k in ("uri", "videoUri"):
            v = obj.get(k)
            if isinstance(v, str) and v.startswith("http"):
                return ("uri", v)
        for v in obj.values():
            found = find_video_payload(v)
            if found:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = find_video_payload(v)
            if found:
                return found
    return None


def find_filter_reasons(obj, acc: list[str]) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if "raiMediaFiltered" in k and isinstance(v, list):
                acc.extend(str(x) for x in v)
            else:
                find_filter_reasons(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            find_filter_reasons(v, acc)


# ---------------------------------------------------------------------------
# 生成
# ---------------------------------------------------------------------------
def image_aspect(src: Path) -> str:
    """画像の縦横からVeoに渡すアスペクト比 (16:9 / 9:16) を自動判定する。"""
    info = common.ffprobe_json(src)
    st = next(s for s in info["streams"] if s.get("width"))
    return "16:9" if int(st["width"]) >= int(st["height"]) else "9:16"


def generate(src: Path, prompt: str, raw_out: Path, model: str, aspect: str,
             resolution: str | None, negative: str | None, gen_seconds: int | None) -> None:
    key = api_key()
    mime = IMAGE_MIMES.get(src.suffix.lower())
    if not mime:
        raise PipelineError(f"対応していない画像形式です: {src} (png/jpg/webpのみ)")
    b64 = base64.b64encode(src.read_bytes()).decode("ascii")

    params: dict = {"aspectRatio": aspect}
    if resolution:
        params["resolution"] = resolution
    if negative:
        params["negativePrompt"] = negative
    if gen_seconds:
        params["durationSeconds"] = gen_seconds
    payload = {
        "instances": [{"prompt": prompt,
                       "image": {"bytesBase64Encoded": b64, "mimeType": mime}}],
        "parameters": params,
    }

    print(f"[i2v] モデル {model} / {aspect} で生成を開始 (通常1〜5分)...")
    op = api_call(f"{API_BASE}/models/{model}:predictLongRunning", key, payload)
    op_name = op.get("name")
    if not op_name:
        raise PipelineError(f"想定外のAPI応答です:\n{json.dumps(op, ensure_ascii=False)[:1000]}")

    start = time.time()
    while True:
        if time.time() - start > POLL_TIMEOUT_SEC:
            raise PipelineError(f"生成がタイムアウトしました ({POLL_TIMEOUT_SEC // 60}分)。"
                                f"時間を置いて再実行してください。")
        time.sleep(POLL_SEC)
        op = api_call(f"{API_BASE}/{op_name}", key)
        if op.get("done"):
            break
        print(f"  ... 生成中 ({int(time.time() - start)}s)")

    if "error" in op:
        raise PipelineError(f"生成に失敗しました: {json.dumps(op['error'], ensure_ascii=False)[:800]}")

    video = find_video_payload(op.get("response", {}))
    if not video:
        reasons: list[str] = []
        find_filter_reasons(op, reasons)
        detail = ("安全フィルタで除外されました: " + "; ".join(reasons)) if reasons else \
            f"応答に動画がありません:\n{json.dumps(op, ensure_ascii=False)[:1000]}"
        raise PipelineError(detail + "\n人物写真はフィルタされることがあります。"
                                     "プロンプトを穏当な表現にする・別の画像で試すなどしてください。")

    raw_out.parent.mkdir(parents=True, exist_ok=True)
    kind, value = video
    if kind == "b64":
        raw_out.write_bytes(base64.b64decode(value))
    else:
        req = urllib.request.Request(value, headers={"x-goog-api-key": key})
        with urllib.request.urlopen(req, timeout=300) as res, open(raw_out, "wb") as f:
            while chunk := res.read(1 << 20):
                f.write(chunk)
    print(f"[i2v] 生成完了: {raw_out} ({raw_out.stat().st_size / 1e6:.1f}MB)")


# ---------------------------------------------------------------------------
# 整形 (パイプラインのシーン素材仕様に合わせる)
# ---------------------------------------------------------------------------
def normalize(src: Path, out: Path, W: int, H: int, fps: int, crf: int,
              fit_duration: float | None, keep_audio: bool) -> None:
    ffmpeg = common.find_tool("ffmpeg")
    dur = common.probe_duration(src)
    in_args = ["-i", str(src)]
    t_args: list[str] = []
    vf = [f"scale={W}:{H}:force_original_aspect_ratio=increase", f"crop={W}:{H}"]

    if fit_duration:
        if fit_duration <= dur + 0.05:
            t_args = ["-t", f"{fit_duration}"]
        elif fit_duration / dur <= STRETCH_MAX:
            # 少し足りないだけならスロー再生で自然に伸ばす (音はズレるので落とす)
            vf.append(f"setpts={fit_duration / dur:.6f}*PTS")
            t_args = ["-t", f"{fit_duration}"]
            keep_audio = False
            print(f"[fit] {dur:.1f}s → {fit_duration:.1f}s ({dur / fit_duration:.2f}倍速のスロー再生)")
        else:
            loops = math.ceil(fit_duration / dur) - 1
            in_args = ["-stream_loop", str(loops), "-i", str(src)]
            t_args = ["-t", f"{fit_duration}"]
            print(f"[fit] {dur:.1f}s をループして {fit_duration:.1f}s に (つなぎ目は要目視確認)")

    vf += [f"fps={fps}", "format=yuv420p"]
    audio = ["-c:a", "aac", "-b:a", "192k"] if keep_audio else ["-an"]
    out.parent.mkdir(parents=True, exist_ok=True)
    common.run([ffmpeg, "-y", *in_args, "-vf", ",".join(vf), *t_args,
                "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
                "-movflags", "+faststart", *audio, str(out)])


def main() -> None:
    ap = argparse.ArgumentParser(description="静止画をAI(Veo)でプロンプト通りに動く動画にする")
    ap.add_argument("src", nargs="?", help="入力画像 (png/jpg/webp)。--normalize-only なら動画(mp4等)")
    ap.add_argument("--prompt", help="動きの指示 (英語推奨。書き方は Skill image-to-video 参照)")
    ap.add_argument("--out", help="出力mp4のパス (例: orders/x/input/scene1.mp4)")
    ap.add_argument("--model", default=DEFAULT_MODEL,
                    help=f"Veoモデル名 (既定: {DEFAULT_MODEL}。他候補: {', '.join(FALLBACK_MODELS)})")
    ap.add_argument("--aspect", choices=["16:9", "9:16"],
                    help="生成アスペクト比 (省略時は画像の縦横から自動判定)")
    ap.add_argument("--resolution", choices=["720p", "1080p"],
                    help="生成解像度 (veo-3系のみ対応。省略時はモデル既定)")
    ap.add_argument("--negative-prompt", help="出したくない要素 (例: distortion, morphing, extra fingers)")
    ap.add_argument("--gen-seconds", type=int,
                    help="生成する秒数 (モデルにより4/6/8等。省略時はモデル既定=8秒)")
    ap.add_argument("--fit-duration", type=float,
                    help="出力をこの秒数に合わせる (短ければスロー/ループで延長。シーンなら 目標尺÷シーン数)")
    ap.add_argument("--size", help="出力解像度WxH (省略時: 16:9→1920x1080 / 9:16→1080x1920)")
    ap.add_argument("--fps", type=int, default=common.FPS, help=f"出力fps (既定: {common.FPS})")
    ap.add_argument("--crf", type=int, default=18, help="画質 (小さいほど高画質。既定: 18)")
    ap.add_argument("--keep-audio", action="store_true",
                    help="生成された音声を残す (既定は削除。ギフト動画のシーンはBGMが別に付くため)")
    ap.add_argument("--no-normalize", action="store_true", help="整形せず生成した動画をそのまま出力する")
    ap.add_argument("--normalize-only", action="store_true",
                    help="生成せず、既存の動画(外部サービス製など)をシーン素材の仕様に整えるだけ")
    ap.add_argument("--list-models", action="store_true", help="利用できるVeoモデルを一覧表示して終了")
    args = ap.parse_args()

    if args.list_models:
        list_models()
        return
    if not args.src or not args.out:
        ap.error("src と --out は必須です (--list-models を除く)")
    src, out = Path(args.src), Path(args.out)
    if not src.is_file():
        raise PipelineError(f"入力ファイルがありません: {src}")
    if args.fit_duration is not None and not 1 <= args.fit_duration <= 120:
        raise PipelineError("--fit-duration は 1〜120 秒で指定してください")

    if args.normalize_only:
        raw = src
        aspect = None
    else:
        if not args.prompt:
            ap.error("--prompt は必須です (動きの指示。例: \"Her hair sways gently in the wind\")")
        aspect = args.aspect or image_aspect(src)
        raw = out.with_name(out.stem + ".raw.mp4") if not args.no_normalize else out
        generate(src, args.prompt, raw, args.model, aspect,
                 args.resolution, args.negative_prompt, args.gen_seconds)
        if args.no_normalize:
            print(f"[done] {out} (整形なし)")
            return

    if args.size:
        try:
            W, H = (int(v) for v in args.size.lower().split("x"))
        except ValueError:
            raise PipelineError(f"--size は 1920x1080 の形式で指定してください: {args.size}")
        if W % 2 or H % 2:
            raise PipelineError("--size の幅と高さは偶数にしてください (H.264の制約)")
    else:
        if aspect is None:  # normalize-only: 入力動画の縦横から決める
            info = common.ffprobe_json(raw)
            st = next(s for s in info["streams"] if s.get("width"))
            aspect = "16:9" if int(st["width"]) >= int(st["height"]) else "9:16"
        W, H = (1920, 1080) if aspect == "16:9" else (1080, 1920)

    normalize(raw, out, W, H, args.fps, args.crf, args.fit_duration, args.keep_audio)
    dur = common.probe_duration(out)
    print(f"[done] {out}  {W}x{H} / {dur:.2f}s / {args.fps}fps")
    if not args.normalize_only:
        print(f"       元動画: {raw} (整形をやり直すときは --normalize-only で再利用)")
    print("       ギフト動画のシーンに使う場合: orders/<注文ID>/input/sceneN.mp4 に配置")


if __name__ == "__main__":
    try:
        main()
    except PipelineError as e:
        common.die(e)
