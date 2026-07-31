#!/usr/bin/env python3
"""drama_clip.py — ドラマ用の動画クリップ(人物が動き・話す)を生成する。

参照画像で人物の見た目を保ったまま数秒のクリップを生成する。生成したクリップは
orders/<注文ID>/input/sceneN.mp4 に置けば通常の assemble → qc フローに乗る。

プロバイダは2つ。**セリフの有無で選ぶ**のが基本:

| provider | 単価(目安) | 向いている作品 |
|---|---|---|
| `veo`(既定) | $0.05〜0.40/秒 | 登場人物が**しゃべる**作品。口パク付きのセリフ音声を同時生成できる |
| `kling` | $0.084〜0.168/秒 | **セリフの無い**映像作品。安く、複数ショットにまたがる人物の一貫性が強い |

セリフが無い作品に veo standard を使うのは、使わない機能に高い単価を払うことになる。

使い方:
    # 1クリップだけ試す(Kling standard・10秒で約$0.84)
    python3 scripts/drama_clip.py --provider kling --prompt "母が娘の髪を編む" \
        --refs chara.jpg --out test.mp4

    # 脚本(YAML)から全シーンを本生成。provider / tier はYAMLにも書ける
    python3 scripts/drama_clip.py --scenes drama.yaml --out-dir orders/x-001/input

    # セリフのある作品を Veo で(下見は lite → fast → 本番 standard の順に上げる)
    python3 scripts/drama_clip.py --prompt "少女が「おはよう」と言う" --out t.mp4 --tier lite

必要なもの:
    veo   → GEMINI_API_KEY(有料課金の設定が必要。無料枠では使えない)
    kling → FAL_KEY(https://fal.ai でキーを発行し残高を入れる)
    いずれもリポジトリ直下の .env でも可。必ず --dry-run と1シーンの試し生成から始める。

各プロバイダの制約(スクリプト側で自動調整・検証する):
    veo   - クリップは4/6/8秒。ただし参照画像あり・1080p では8秒のみ(自動で8秒に調整)
          - lite は 720p 専用で参照画像に非対応
          - standard は 720p と 1080p が同額なので 1080p が既定
    kling - クリップは5秒か10秒。参照画像は4枚まで
          - 参照画像は elements として渡し、プロンプト内で @Element1.. として参照される
          - シーンごとに `ref:` を書けば、人物が変わる作品でもシーン単位で切り替わる

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
FAL_QUEUE_BASE = "https://queue.fal.run"

# プロバイダ別のティア定義。cost は USD/出力秒(音声込み・2026年7月時点)で見積もり表示のみに使う。
#
# veo:   セリフのリップシンクが要る作品向け。standardは720pと1080pが同額なので1080pが既定
# kling: 単価が安く、複数ショットにまたがる人物の一貫性(elements)が強い。
#        セリフが無い作品なら kling の方が費用対効果が高い
PROVIDERS = {
    "veo": {
        "env": "GEMINI_API_KEY",
        "durations": [4, 6, 8],
        "max_refs": 3,
        "tiers": {
            "standard": {"model": "veo-3.1-generate-preview",
                         "cost": {"720p": 0.40, "1080p": 0.40}, "default_res": "1080p"},
            "fast": {"model": "veo-3.1-fast-generate-preview",
                     "cost": {"720p": 0.10, "1080p": 0.12}, "default_res": "720p"},
            # Lite は最安だが 720p 専用で参照画像に非対応(下でチェックする)
            "lite": {"model": "veo-3.1-lite-generate-preview",
                     "cost": {"720p": 0.05}, "default_res": "720p"},
        },
    },
    "kling": {
        "env": "FAL_KEY",
        "durations": [5, 10],
        "max_refs": 4,
        "tiers": {
            "standard": {"model": "fal-ai/kling-video/v3/standard/image-to-video",
                         "cost": {"1080p": 0.084}, "default_res": "1080p"},
            "pro": {"model": "fal-ai/kling-video/v3/pro/image-to-video",
                    "cost": {"1080p": 0.168}, "default_res": "1080p"},
        },
    },
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


def load_api_key(name):
    key = os.environ.get(name, "").strip()
    if key:
        return key
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_path = os.path.join(repo_root, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith(f"{name}="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def as_list(value):
    """YAMLの値を文字列1つでもリストでも受け取れるようにする。"""
    if not value:
        return []
    return list(value) if isinstance(value, (list, tuple)) else [value]


def data_uri(path):
    """fal はローカルファイルを受け取れないので data URI にして渡す。"""
    ext = os.path.splitext(path)[1].lower()
    mime = MIME_BY_EXT.get(ext)
    if not mime:
        sys.exit(f"エラー: 対応していない画像形式です: {path}(JPG/PNG/WebPのみ)")
    if not os.path.exists(path):
        sys.exit(f"エラー: 画像が見つかりません: {path}")
    with open(path, "rb") as f:
        return f"data:{mime};base64," + base64.b64encode(f.read()).decode("ascii")


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


# --------------------------------------------------------------------------
# Kling (fal.ai の queue API)
# --------------------------------------------------------------------------
def fal_request(url, api_key, body=None, method="GET"):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers={"Content-Type": "application/json", "Authorization": f"Key {api_key}"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read().decode("utf-8"))


def kling_start(api_key, model, scene, refs, aspect, negative):
    """生成を投入し、状態確認用のURLを返す。"""
    prompt = scene["prompt"]
    payload = {
        "prompt": prompt,
        "duration": str(scene["duration"]),
        "aspect_ratio": aspect,
    }
    if negative:
        payload["negative_prompt"] = negative
    if scene.get("image"):
        # 開始フレーム(この絵から動き出す)
        payload["image_url"] = data_uri(scene["image"])
    if refs:
        # elements に入れた画像は、プロンプト内で @Element1.. として参照する仕様
        payload["elements"] = [{"image_url": data_uri(p)} for p in refs]
        tags = ", ".join(f"@Element{i + 1}" for i in range(len(refs)))
        payload["prompt"] = (f"{prompt}\nKeep the appearance of {tags} exactly consistent "
                             f"with the reference image(s).")
    try:
        res = fal_request(f"{FAL_QUEUE_BASE}/{model}", api_key, payload, method="POST")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        hint = ""
        if e.code in (401, 403):
            hint = "\nヒント: FAL_KEY が正しいか、fal.ai の残高があるか確認してください"
        elif e.code == 404:
            hint = (f"\nヒント: モデルID '{model}' が変わった可能性があります。"
                    "\n  https://fal.ai/models で現在のIDを確認し --model で指定してください")
        elif e.code == 422:
            hint = ("\nヒント: 入力の形式が想定と違う可能性があります(上のJSONに詳細)。"
                    "\n  fal のモデルページのスキーマを確認し、必要なら --model を変えてください")
        sys.exit(f"エラー: 生成リクエストが失敗しました(HTTP {e.code})\n{detail[:2000]}{hint}")
    return res.get("status_url"), res.get("response_url")


def kling_wait(api_key, status_url, response_url):
    """完了を待ち、動画のURLを返す。"""
    deadline = time.time() + POLL_TIMEOUT_SEC
    while time.time() < deadline:
        time.sleep(POLL_INTERVAL_SEC)
        try:
            st = fal_request(status_url, api_key)
        except urllib.error.HTTPError as e:
            return None, f"状態の取得に失敗しました(HTTP {e.code})"
        status = st.get("status", "")
        if status in ("IN_QUEUE", "IN_PROGRESS"):
            print(f"  生成中...({status})")
            continue
        if status != "COMPLETED":
            return None, f"生成が失敗しました(status={status}): {json.dumps(st, ensure_ascii=False)[:400]}"
        try:
            result = fal_request(response_url, api_key)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")
            return None, f"結果の取得に失敗しました(HTTP {e.code}): {detail[:400]}"
        url = (result.get("video") or {}).get("url")
        if url:
            return url, None
        return None, f"動画が返されませんでした: {json.dumps(result, ensure_ascii=False)[:400]}"
    return None, f"タイムアウト({POLL_TIMEOUT_SEC // 60}分)。時間を置いて再実行してください"


def download_plain(url, out_path):
    with urllib.request.urlopen(url, timeout=300) as res, open(out_path, "wb") as f:
        while True:
            chunk = res.read(1024 * 256)
            if not chunk:
                break
            f.write(chunk)


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


ANIMATIC_MARKER = ".animatic"


def read_animatic_marker(out_paths):
    """build_animatic.py が置いた印を読み、仮の絵コンテのパス集合を返す。

    仮素材は本生成で上書きされるべきなので、「出力済みだからスキップ」の対象外にする。
    """
    dirs = {os.path.dirname(os.path.abspath(p)) for p in out_paths}
    placeholders = set()
    for d in dirs:
        marker = os.path.join(d, ANIMATIC_MARKER)
        if not os.path.isfile(marker):
            continue
        with open(marker, encoding="utf-8") as f:
            for name in f:
                name = name.strip()
                if name:
                    placeholders.add(os.path.join(d, name))
    return placeholders


def clear_animatic_marker(out_paths, replaced):
    """置き換え済みのファイルを印から外す(全部消えたら印そのものを削除)。"""
    dirs = {os.path.dirname(os.path.abspath(p)) for p in out_paths}
    done = {os.path.abspath(p) for p in replaced}
    for d in dirs:
        marker = os.path.join(d, ANIMATIC_MARKER)
        if not os.path.isfile(marker):
            continue
        with open(marker, encoding="utf-8") as f:
            names = [n.strip() for n in f if n.strip()]
        remain = [n for n in names if os.path.join(d, n) not in done]
        if remain:
            with open(marker, "w", encoding="utf-8") as f:
                f.write("\n".join(remain) + "\n")
        else:
            os.remove(marker)


def write_prompt_sheet(path, scenes, out_paths, negative, aspect):
    """Web UI に手で貼るためのプロンプト集を書き出す(APIを使わないので無料)。

    Google Flow の無料クレジットや、各サービスのWeb版で試すときに使う。
    生成した動画は各シーンの「保存先」に置けば、そのまま assemble に乗る。
    """
    lines = [
        "# 生成用プロンプト集(Web UIに貼り付ける)",
        "",
        f"アスペクト比: **{aspect}** / 全{len(scenes)}シーン",
        "",
        "使い方: 各シーンの「プロンプト」をコピーしてWeb UIに貼り、参照画像があれば",
        "アップロードして生成する。できた動画を「保存先」のファイル名で保存すれば、",
        "`assemble.py` がそのまま1本に繋ぐ。",
        "",
        "※ Web UI 側のクリップ長は選べる範囲が決まっている。下の秒数どおりに作れない",
        "場合はできる長さで作り、あとで `order.yaml` の `target_duration` を合計に合わせる。",
        "",
    ]
    if negative:
        lines += ["## 全シーン共通:出したくない要素(Negative欄がある場合はそこへ)", "",
                  "```", negative, "```", ""]
    for s, out in zip(scenes, out_paths):
        lines += [f"## シーン {s['id']}(目安 {s['duration']}秒)", ""]
        if s["refs"]:
            names = ", ".join(os.path.basename(p) for p in s["refs"])
            lines += [f"参照画像としてアップロード: `{names}`", ""]
        else:
            lines += ["参照画像: なし(人物の顔が写らないシーン)", ""]
        lines += [f"保存先: `{os.path.basename(out)}`", "", "```", s["prompt"].strip(), "```", ""]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"プロンプト集を書き出しました: {path}")
    print(f"  {len(scenes)}シーン分。APIは呼んでいないので費用はかかっていません")


def main():
    parser = argparse.ArgumentParser(
        description="ドラマ用クリップ(人物が動き・話す)を生成する(Veo 3.1 / Kling 3.0)",
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
    parser.add_argument("--duration", type=int, default=0,
                        help="クリップ秒数(veo: 4/6/8、kling: 5/10。既定 veo=8 / kling=10)")
    parser.add_argument("--provider", choices=sorted(PROVIDERS), default="",
                        help="veo=セリフのリップシンク対応(高め) / kling=安く人物の一貫性が強い")
    parser.add_argument("--tier", default="",
                        help="veo: standard($0.40/秒) / fast($0.10) / lite($0.05・参照画像不可)。"
                             "kling: standard($0.084) / pro($0.168)")
    parser.add_argument("--fast", action="store_true", help="--tier fast の別名(下位互換)")
    parser.add_argument("--model", default="", help="モデルIDの上書き(既定: ティアに応じたVeo 3.1)")
    parser.add_argument("--overwrite", action="store_true", help="出力が既にあっても生成し直す(既定はスキップ=課金防止)")
    parser.add_argument("--dry-run", action="store_true", help="APIを呼ばず、送る内容と概算費用だけ確認")
    parser.add_argument("--export-prompts", default="",
                        help="Web UI(Google Flow・Kling等)に貼るためのプロンプト集を書き出す。"
                             "APIキー不要・課金なし")
    args = parser.parse_args()

    if bool(args.prompt) == bool(args.scenes):
        sys.exit("エラー: --prompt(1クリップ)か --scenes(脚本YAML)のどちらか一方を指定してください")

    # シーン一覧に正規化。脚本YAMLの値は既定値として使い、CLI指定があればそちらを優先する。
    # 画像パス(image / ref)はYAMLからの相対で書けるようにする
    base_dir = os.path.dirname(os.path.abspath(args.scenes)) if args.scenes else os.getcwd()

    def resolve(p):
        return p if not p or os.path.isabs(p) else os.path.join(base_dir, p)

    if args.scenes:
        doc = load_scenes_yaml(args.scenes)
        style = args.style or doc.get("style", "")
        negative = args.negative or doc.get("negative", "")
        refs = args.refs or doc.get("refs", [])
        aspect = args.aspect or doc.get("aspect", "")
        resolution = args.resolution or doc.get("resolution", "")
        provider = args.provider or doc.get("provider", "veo")
        tier = args.tier or ("fast" if args.fast else doc.get("tier", ""))
        scenes = []
        for i, s in enumerate(doc["scenes"], 1):
            if not s.get("prompt"):
                sys.exit(f"エラー: scenes[{i}] に prompt がありません")
            scenes.append({
                "id": s.get("id", i),
                "prompt": s["prompt"],
                "image": resolve(s.get("image", "")),
                # ref: はそのシーンだけの参照画像(人物が変わる作品ではこちらを使う)。
                # 2人以上が写るシーンはリストで複数指定できる
                "ref": [resolve(p) for p in as_list(s.get("ref"))],
                "duration": int(s.get("duration", doc.get("duration", 0)) or 0),
            })
        out_paths = [os.path.join(args.out_dir, f"scene{s['id']}.mp4") for s in scenes]
    else:
        style, refs, negative = args.style, args.refs, args.negative
        aspect, resolution = args.aspect, args.resolution
        provider = args.provider or "veo"
        tier = args.tier or ("fast" if args.fast else "")
        scenes = [{"id": 1, "prompt": args.prompt, "image": args.image, "ref": [],
                   "duration": args.duration}]
        out_paths = [args.out]

    if provider not in PROVIDERS:
        sys.exit(f"エラー: provider は {sorted(PROVIDERS)} から選んでください(指定: {provider})")
    pspec = PROVIDERS[provider]
    tier = tier or ("standard" if provider == "veo" else "standard")
    if tier not in pspec["tiers"]:
        sys.exit(f"エラー: {provider} の tier は {sorted(pspec['tiers'])} から選んでください(指定: {tier})")
    refs = [resolve(p) for p in refs]
    if len(refs) > pspec["max_refs"]:
        sys.exit(f"エラー: {provider} の参照画像は{pspec['max_refs']}枚までです")
    default_dur = 8 if provider == "veo" else 10
    for s in scenes:
        s["duration"] = s["duration"] or args.duration or default_dur

    spec = pspec["tiers"][tier]
    aspect = aspect or "16:9"
    resolution = resolution or spec["default_res"]
    if resolution not in spec["cost"]:
        sys.exit(f"エラー: {provider}/{tier} は {resolution} に対応していません"
                 f"(対応: {', '.join(spec['cost'])})")
    if refs and provider == "veo" and tier == "lite":
        sys.exit("エラー: veo の lite は参照画像に対応していません。\n"
                 "  人物の一貫性が要るシーンは --tier fast か standard、または --provider kling を使ってください")

    # veo は「参照画像あり・1080p では8秒クリップしか返らない」。指定を先に合わせておかないと、
    # 課金後に実尺が食い違って assemble の尺チェックで落ちる
    force_reason = ""
    if provider == "veo" and (refs or resolution == "1080p"):
        force_reason = "参照画像あり" if refs else "1080p"
    for s in scenes:
        if s["duration"] not in pspec["durations"]:
            sys.exit(f"エラー: scene{s['id']} の duration は {provider} では "
                     f"{pspec['durations']} から選んでください(指定: {s['duration']})")
        if force_reason and s["duration"] != FORCED_8S_DURATION:
            print(f"注意: scene{s['id']} の {s['duration']}秒 → {FORCED_8S_DURATION}秒 に調整"
                  f"({force_reason}のときは8秒クリップのみ生成できるため)")
            s["duration"] = FORCED_8S_DURATION
        if style:
            s["prompt"] = f"{style.strip()}\n{s['prompt'].strip()}"
        # kling はシーンごとの ref を使える(人物が変わる作品向け)。無ければ全体の refs
        s["refs"] = (s["ref"] or list(refs))[:pspec["max_refs"]]

    model = args.model or spec["model"]
    rate = spec["cost"][resolution]
    total_sec = sum(s["duration"] for s in scenes)
    est = total_sec * rate

    negative = " ".join(negative.split())
    print(f"プロバイダ: {provider} / モデル: {model}(tier={tier}) / {aspect} / {resolution}")
    if negative:
        print(f"除外指定(negativePrompt): {negative}")
    for s, out in zip(scenes, out_paths):
        start = f" / 開始フレーム: {os.path.basename(s['image'])}" if s["image"] else ""
        ref_note = f" / 参照{len(s['refs'])}枚" if s["refs"] else ""
        print(f"  scene{s['id']} ({s['duration']}秒{start}{ref_note}) → {out}")
        print(f"    {s['prompt'][:200]}")
    print(f"概算費用: 約${est:.2f}({total_sec}秒 × ${rate}/秒・目安)")

    if args.export_prompts:
        write_prompt_sheet(args.export_prompts, scenes, out_paths, negative, aspect)
        return

    if args.dry_run:
        print("--dry-run のためAPIは呼びません")
        return

    # build_animatic.py が作った仮の絵コンテは「出力済み」と見なさず、実素材で置き換える
    placeholders = read_animatic_marker(out_paths)
    if placeholders:
        print(f"注意: 仮の絵コンテ{len(placeholders)}本を実素材で置き換えます")

    pending = []
    for s, out_path in zip(scenes, out_paths):
        is_placeholder = os.path.abspath(out_path) in placeholders
        if os.path.exists(out_path) and not args.overwrite and not is_placeholder:
            print(f"scene{s['id']}: {out_path} が既にあるためスキップ(作り直すなら --overwrite)")
        else:
            pending.append((s, out_path))
    if not pending:
        print("全シーンが出力済みです(生成なし)")
        return

    key_env = pspec["env"]
    api_key = load_api_key(key_env)
    if not api_key:
        hint = ("  ※Veo は有料課金の設定があるキーでのみ使えます"
                if provider == "veo" else
                "  ※fal.ai (https://fal.ai) でキーを発行し、残高を入れておいてください")
        sys.exit(
            f"エラー: {key_env} が設定されていません。\n"
            "  環境変数か、リポジトリ直下の .env に設定してください。\n" + hint
        )

    ok, failed = [], []
    for s, out_path in pending:
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        print(f"scene{s['id']}: 生成を開始(完了まで数分かかる)")
        if provider == "veo":
            params = {
                "aspectRatio": aspect,
                "resolution": resolution,
                "durationSeconds": s["duration"],
                "personGeneration": "allow_adult",
                "sampleCount": 1,
            }
            if negative:
                params["negativePrompt"] = negative
            op_name = start_generation(api_key, model, s, s["refs"], params)
            uri, error = wait_for_video(api_key, op_name)
            if uri:
                download_video(api_key, uri, out_path)
        else:
            status_url, response_url = kling_start(api_key, model, s, s["refs"], aspect, negative)
            uri, error = kling_wait(api_key, status_url, response_url)
            if uri:
                download_plain(uri, out_path)
        if not uri:
            print(f"  失敗: {error}")
            failed.append(s["id"])
            continue
        print(f"  保存: {out_path} ({os.path.getsize(out_path) / 1024 / 1024:.1f} MB)")
        ok.append(out_path)
        clear_animatic_marker(out_paths, ok)

    print(f"完了: 成功{len(ok)}件 / 失敗{len(failed)}件" + (f"(失敗シーン: {failed})" if failed else ""))
    if failed:
        sys.exit("失敗したシーンはプロンプトや参照画像を調整して再実行してください(成功済みはスキップされる)")


if __name__ == "__main__":
    main()
