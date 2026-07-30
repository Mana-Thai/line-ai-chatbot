#!/usr/bin/env python3
"""drama_clip.py — Veo 3.1 でドラマ用の動画クリップ(人物が動き・話す)を生成する。

Gemini API の動画生成モデル(Veo)を呼び、参照画像で人物の見た目を保ったまま、
セリフ音声・効果音付きの数秒クリップを生成する。生成したクリップは
orders/<注文ID>/input/sceneN.mp4 に置けば通常の assemble → qc フローに乗る。

使い方:
    # 絵づくりの下見を最安ティアで(8秒 約$0.40。ただし参照画像は使えない)
    python3 scripts/drama_clip.py --prompt "教室で少女が微笑んで「おはよう」と言う" \
        --out test.mp4 --tier lite

    # 人物を固定してテスト(参照画像は fast 以上が必要。8秒 約$0.80)
    python3 scripts/drama_clip.py --prompt "..." --refs chara1.png chara2.png \
        --out test.mp4 --tier fast

    # 脚本(YAML)から全シーンを本生成(standard・1080p)
    python3 scripts/drama_clip.py --scenes drama.yaml --out-dir orders/x-001/input

必要なもの:
    環境変数 GEMINI_API_KEY(リポジトリ直下の .env でも可)。
    Veo は無料枠では使えないため、キーに有料課金の設定が必要。
    料金が高い(standardは8秒で約$3)ので、必ず --dry-run と下見生成から始めること。

APIの制約(スクリプト側で自動調整・検証する):
    - 参照画像あり、または 1080p のときは 8秒クリップしか返らない(4/6秒指定は8秒に調整)
    - lite は 720p 専用で参照画像に非対応
    - standard は 720p と 1080p が同額のため 1080p を既定にしている

詳しい手順は Skill `drama-video-liveaction` / `drama-video-anime` を参照。
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

API_BASE = "https://generativelanguage.googleapis.com/v1beta"

# ティア別のモデルIDと料金(USD/出力秒・音声込み。2026年7月時点)。
# 料金は見積もり表示にのみ使う。Standardは720pと1080pが同額なので1080pが既定。
TIERS = {
    "standard": {"model": "veo-3.1-generate-preview",
                 "cost": {"720p": 0.40, "1080p": 0.40}, "default_res": "1080p"},
    "fast": {"model": "veo-3.1-fast-generate-preview",
             "cost": {"720p": 0.10, "1080p": 0.12}, "default_res": "720p"},
    # Lite は最安だが 720p 専用で参照画像に非対応(下でチェックする)
    "lite": {"model": "veo-3.1-lite-generate-preview",
             "cost": {"720p": 0.05}, "default_res": "720p"},
}

MIME_BY_EXT = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
ASPECT_RATIOS = ["16:9", "9:16"]
RESOLUTIONS = ["720p", "1080p"]
DURATIONS = [4, 6, 8]
# 参照画像あり / 1080p のときは 8秒クリップしか返らない(APIの仕様)。
# 4・6秒を指定していても8秒が返るため、課金後に尺が合わず assemble で落ちるのを防ぐ
FORCED_8S_DURATION = 8
POLL_INTERVAL_SEC = 15
POLL_TIMEOUT_SEC = 15 * 60


def load_api_key():
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_path = os.path.join(repo_root, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("GEMINI_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def image_payload(path):
    ext = os.path.splitext(path)[1].lower()
    mime = MIME_BY_EXT.get(ext)
    if not mime:
        sys.exit(f"エラー: 対応していない画像形式です: {path}(JPG/PNG/WebPのみ)")
    if not os.path.exists(path):
        sys.exit(f"エラー: 画像が見つかりません: {path}")
    with open(path, "rb") as f:
        return {"bytesBase64Encoded": base64.b64encode(f.read()).decode("ascii"), "mimeType": mime}


def http_json(url, api_key, body=None, method="GET"):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read().decode("utf-8"))


def start_generation(api_key, model, scene, refs, params):
    instance = {"prompt": scene["prompt"]}
    if scene.get("image"):
        instance["image"] = image_payload(scene["image"])
    if refs:
        instance["referenceImages"] = [{"image": image_payload(p), "referenceType": "asset"} for p in refs]
    body = {"instances": [instance], "parameters": params}
    try:
        op = http_json(f"{API_BASE}/models/{model}:predictLongRunning", api_key, body, method="POST")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        hint = ""
        if e.code == 404:
            hint = (f"\nヒント: モデルID '{model}' が変わった可能性があります。"
                    f"\n  curl -H \"x-goog-api-key: $GEMINI_API_KEY\" {API_BASE}/models で一覧を確認し、"
                    "--model で指定してください")
        elif e.code == 429:
            hint = "\nヒント: レート制限か課金未設定の可能性。キーの課金設定(有料プラン)を確認してください"
        sys.exit(f"エラー: 生成リクエストが失敗しました(HTTP {e.code})\n{detail[:2000]}{hint}")
    return op["name"]


def wait_for_video(api_key, op_name):
    """long-running operation の完了を待ち、動画のURIを返す。"""
    deadline = time.time() + POLL_TIMEOUT_SEC
    while time.time() < deadline:
        time.sleep(POLL_INTERVAL_SEC)
        op = http_json(f"{API_BASE}/{op_name}", api_key)
        if not op.get("done"):
            print("  生成中...")
            continue
        if op.get("error"):
            return None, f"生成が失敗しました: {op['error'].get('message', op['error'])}"
        resp = op.get("response", {})
        gen = resp.get("generateVideoResponse", resp)
        samples = gen.get("generatedSamples") or gen.get("generatedVideos") or []
        for s in samples:
            uri = (s.get("video") or {}).get("uri")
            if uri:
                return uri, None
        filtered = gen.get("raiMediaFilteredCount")
        reasons = gen.get("raiMediaFilteredReasons")
        if filtered:
            return None, (f"安全フィルタでブロックされました({reasons})。"
                          "プロンプトの表現を穏当にする・参照画像を替えると通ることが多い")
        return None, f"動画が返されませんでした: {json.dumps(gen, ensure_ascii=False)[:500]}"
    return None, f"タイムアウト({POLL_TIMEOUT_SEC // 60}分)。時間を置いて再実行してください"


def download_video(api_key, uri, out_path):
    req = urllib.request.Request(uri, headers={"x-goog-api-key": api_key})
    with urllib.request.urlopen(req, timeout=300) as res, open(out_path, "wb") as f:
        while True:
            chunk = res.read(1024 * 256)
            if not chunk:
                break
            f.write(chunk)


def load_scenes_yaml(path):
    try:
        import yaml
    except ImportError:
        sys.exit("エラー: PyYAML が必要です(gift-video の requirements.txt に含まれる)。\n  pip install pyyaml")
    with open(path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    if not isinstance(doc, dict) or not doc.get("scenes"):
        sys.exit(f"エラー: {path} に scenes: が見つかりません")
    return doc


def main():
    parser = argparse.ArgumentParser(
        description="Veo 3.1 でドラマ用クリップ(人物が動き・話す)を生成する",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--prompt", default="", help="シーンの指示(演技・カメラ・セリフは「」で)。--scenes と排他")
    parser.add_argument("--scenes", default="", help="脚本YAML(style/refs/scenes)。--prompt と排他")
    parser.add_argument("--image", default="", help="開始フレームにする画像(この絵から動き出す)")
    parser.add_argument("--refs", nargs="*", default=[], help="人物の参照画像(最大3枚。全シーン共通で渡すと一貫する)")
    parser.add_argument("--style", default="", help="全シーン共通のスタイル文(プロンプトの先頭に付く)")
    parser.add_argument("--negative", default="",
                        help="出したくない要素(negativePrompt)。例: 派手な色, 作り笑い")
    parser.add_argument("--out", default="clip.mp4", help="出力mp4(1クリップ生成時)")
    parser.add_argument("--out-dir", default=".", help="出力先フォルダ(--scenes 時。sceneN.mp4 で保存)")
    parser.add_argument("--aspect", choices=ASPECT_RATIOS, default="",
                        help="16:9=横型 / 9:16=縦型(既定: 16:9)")
    parser.add_argument("--resolution", choices=RESOLUTIONS, default="",
                        help="解像度(既定: standardは1080p=720pと同額 / fast・liteは720p)")
    parser.add_argument("--duration", type=int, choices=DURATIONS, default=8,
                        help="クリップ秒数(参照画像あり・1080p では8秒に自動調整される)")
    parser.add_argument("--tier", choices=sorted(TIERS), default="",
                        help="standard=高品質($0.40/秒) / fast=下見向き($0.10) / "
                             "lite=最安($0.05・720p専用・参照画像不可)")
    parser.add_argument("--fast", action="store_true", help="--tier fast の別名(下位互換)")
    parser.add_argument("--model", default="", help="モデルIDの上書き(既定: ティアに応じたVeo 3.1)")
    parser.add_argument("--overwrite", action="store_true", help="出力が既にあっても生成し直す(既定はスキップ=課金防止)")
    parser.add_argument("--dry-run", action="store_true", help="APIを呼ばず、送る内容と概算費用だけ確認")
    args = parser.parse_args()

    if bool(args.prompt) == bool(args.scenes):
        sys.exit("エラー: --prompt(1クリップ)か --scenes(脚本YAML)のどちらか一方を指定してください")
    if len(args.refs) > 3:
        sys.exit("エラー: 参照画像は3枚までです")

    # シーン一覧に正規化。脚本YAMLの値は既定値として使い、CLI指定があればそちらを優先する
    if args.scenes:
        doc = load_scenes_yaml(args.scenes)
        style = args.style or doc.get("style", "")
        negative = args.negative or doc.get("negative", "")
        refs = args.refs or doc.get("refs", [])
        aspect = args.aspect or doc.get("aspect", "")
        resolution = args.resolution or doc.get("resolution", "")
        tier = args.tier or ("fast" if args.fast else doc.get("tier", "standard"))
        scenes = []
        for i, s in enumerate(doc["scenes"], 1):
            if not s.get("prompt"):
                sys.exit(f"エラー: scenes[{i}] に prompt がありません")
            scenes.append({
                "id": s.get("id", i),
                "prompt": s["prompt"],
                "image": s.get("image", ""),
                "duration": int(s.get("duration", doc.get("duration", args.duration))),
            })
        out_paths = [os.path.join(args.out_dir, f"scene{s['id']}.mp4") for s in scenes]
    else:
        style, refs, negative = args.style, args.refs, args.negative
        aspect, resolution = args.aspect, args.resolution
        tier = args.tier or ("fast" if args.fast else "standard")
        scenes = [{"id": 1, "prompt": args.prompt, "image": args.image, "duration": args.duration}]
        out_paths = [args.out]

    if tier not in TIERS:
        sys.exit(f"エラー: tier は {sorted(TIERS)} から選んでください(指定: {tier})")
    spec = TIERS[tier]
    aspect = aspect or "16:9"
    resolution = resolution or spec["default_res"]
    if resolution not in spec["cost"]:
        sys.exit(f"エラー: {tier} は {resolution} に対応していません"
                 f"(対応: {', '.join(spec['cost'])})")
    if refs and tier == "lite":
        sys.exit("エラー: lite は参照画像に対応していません。\n"
                 "  人物の一貫性が要るシーンは --tier fast か standard を使ってください")
    if len(refs) > 3:
        sys.exit("エラー: 参照画像は3枚までです")

    # 参照画像あり・1080p では8秒クリップしか返らない。指定を先に合わせておかないと、
    # 課金後に実尺が食い違って assemble の尺チェックで落ちる
    force_reason = ("参照画像あり" if refs else "1080p") if (refs or resolution == "1080p") else ""
    for s in scenes:
        if s["duration"] not in DURATIONS:
            sys.exit(f"エラー: scene{s['id']} の duration は {DURATIONS} から選んでください")
        if force_reason and s["duration"] != FORCED_8S_DURATION:
            print(f"注意: scene{s['id']} の {s['duration']}秒 → {FORCED_8S_DURATION}秒 に調整"
                  f"({force_reason}のときは8秒クリップのみ生成できるため)")
            s["duration"] = FORCED_8S_DURATION
        if style:
            s["prompt"] = f"{style.strip()}\n{s['prompt'].strip()}"

    model = args.model or spec["model"]
    rate = spec["cost"][resolution]
    total_sec = sum(s["duration"] for s in scenes)
    est = total_sec * rate

    negative = " ".join(negative.split())
    print(f"モデル: {model}(tier={tier}) / {aspect} / {resolution} / 参照画像{len(refs)}枚")
    if negative:
        print(f"除外指定(negativePrompt): {negative}")
    for s, out in zip(scenes, out_paths):
        start = f" / 開始フレーム: {s['image']}" if s["image"] else ""
        print(f"  scene{s['id']} ({s['duration']}秒{start}) → {out}")
        print(f"    {s['prompt'][:200]}")
    print(f"概算費用: 約${est:.2f}({total_sec}秒 × ${rate}/秒・目安)")

    if args.dry_run:
        print("--dry-run のためAPIは呼びません")
        return

    pending = []
    for s, out_path in zip(scenes, out_paths):
        if os.path.exists(out_path) and not args.overwrite:
            print(f"scene{s['id']}: {out_path} が既にあるためスキップ(作り直すなら --overwrite)")
        else:
            pending.append((s, out_path))
    if not pending:
        print("全シーンが出力済みです(生成なし)")
        return

    api_key = load_api_key()
    if not api_key:
        sys.exit(
            "エラー: GEMINI_API_KEY が設定されていません。\n"
            "  環境変数か、リポジトリ直下の .env に設定してください。\n"
            "  ※Veo は有料課金の設定があるキーでのみ使えます"
        )

    ok, failed = [], []
    for s, out_path in pending:
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        print(f"scene{s['id']}: 生成を開始(完了まで数分かかる)")
        params = {
            "aspectRatio": aspect,
            "resolution": resolution,
            "durationSeconds": s["duration"],
            "personGeneration": "allow_adult",
            "sampleCount": 1,
        }
        if negative:
            params["negativePrompt"] = negative
        op_name = start_generation(api_key, model, s, refs, params)
        uri, error = wait_for_video(api_key, op_name)
        if not uri:
            print(f"  失敗: {error}")
            failed.append(s["id"])
            continue
        download_video(api_key, uri, out_path)
        print(f"  保存: {out_path} ({os.path.getsize(out_path) / 1024 / 1024:.1f} MB)")
        ok.append(out_path)

    print(f"完了: 成功{len(ok)}件 / 失敗{len(failed)}件" + (f"(失敗シーン: {failed})" if failed else ""))
    if failed:
        sys.exit("失敗したシーンはプロンプトや参照画像を調整して再実行してください(成功済みはスキップされる)")


if __name__ == "__main__":
    main()
