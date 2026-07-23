#!/usr/bin/env python3
"""stylize.py — 数枚の写真から実写映画風・アニメ風などの画像をAI生成する。

Gemini の画像生成API(gemini-2.5-flash-image)を使い、入力画像の被写体・構図を
保ったままスタイル変換した画像を生成する。依存は Python 標準ライブラリのみ。

使い方:
    python3 artwork/tools/stylize.py photo1.jpg photo2.jpg --style cinematic --out out/scene.png

必要なもの:
    環境変数 GEMINI_API_KEY(旧チャットボットと同じキー。リポジトリ直下の .env でも可)
    キーの取得: https://aistudio.google.com/apikey

詳しい手順は Skill `image-stylize` を参照。
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

DEFAULT_MODEL = "gemini-2.5-flash-image"
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# スタイルプリセット。画像生成モデルは英語プロンプトの方が安定するため英語で持つ。
# どのプリセットも「被写体の見た目(顔・体型・服・色)と構図を保つ」指示を含める。
STYLE_PRESETS = {
    "cinematic": (
        "Transform this into a photorealistic still frame from a live-action feature film. "
        "Dramatic cinematic lighting, shallow depth of field, professional film color grading, "
        "anamorphic 35mm film look, subtle film grain. "
        "Keep the subject's identity, likeness, clothing and the overall composition faithful to the input photos."
    ),
    "anime": (
        "Redraw this as a high-quality still frame from a Japanese anime film. "
        "Clean line art, cel shading, expressive eyes, vibrant colors, "
        "beautifully detailed painted background with soft light. "
        "Keep the subject's identity, hairstyle, clothing and the overall composition faithful to the input photos."
    ),
    "3d": (
        "Recreate this as a still frame from a modern 3D CG animated family movie. "
        "Stylized appealing character design, soft global illumination, subsurface scattering, "
        "rich detailed environment, warm color palette. "
        "Keep the subject's identity, hairstyle, clothing and the overall composition faithful to the input photos."
    ),
    "custom": "",  # --prompt の内容のみを使う
}

MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]

# インライン画像はリクエスト全体で20MBが上限。余裕を見て警告する
TOTAL_INPUT_WARN_BYTES = 14 * 1024 * 1024


def load_api_key():
    """環境変数 → リポジトリ直下の .env の順で GEMINI_API_KEY を探す。"""
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


def read_image_part(path):
    ext = os.path.splitext(path)[1].lower()
    mime = MIME_BY_EXT.get(ext)
    if not mime:
        sys.exit(f"エラー: 対応していない画像形式です: {path}(JPG/PNG/WebPのみ)")
    with open(path, "rb") as f:
        data = f.read()
    return {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode("ascii")}}, len(data)


def build_prompt(style, extra_prompt, num_images):
    parts = []
    if num_images > 1:
        parts.append(
            f"All {num_images} input photos show the same subject from different angles. "
            "Use them together to capture the subject's likeness accurately."
        )
    preset = STYLE_PRESETS[style]
    if preset:
        parts.append(preset)
    if extra_prompt:
        parts.append(extra_prompt)
    if not preset and not extra_prompt:
        sys.exit("エラー: --style custom のときは --prompt で指示文を指定してください")
    return " ".join(parts)


def call_api(api_key, model, body, max_retries=3):
    url = f"{API_BASE}/{model}:generateContent"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    for attempt in range(max_retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=180) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")
            if e.code in (429, 500, 503) and attempt < max_retries:
                wait = 2 ** (attempt + 1)
                print(f"  APIエラー {e.code}。{wait}秒待って再試行します({attempt + 1}/{max_retries})")
                time.sleep(wait)
                continue
            sys.exit(f"エラー: APIリクエストが失敗しました(HTTP {e.code})\n{detail[:2000]}")
        except urllib.error.URLError as e:
            if attempt < max_retries:
                wait = 2 ** (attempt + 1)
                print(f"  通信エラー({e.reason})。{wait}秒待って再試行します({attempt + 1}/{max_retries})")
                time.sleep(wait)
                continue
            sys.exit(f"エラー: APIに接続できませんでした: {e.reason}")


def extract_image(response):
    """レスポンスから最初の画像パートを返す。無ければ (None, 理由テキスト)。"""
    feedback = response.get("promptFeedback", {})
    if feedback.get("blockReason"):
        return None, f"入力がブロックされました(blockReason: {feedback['blockReason']})"
    for cand in response.get("candidates", []):
        texts = []
        for part in cand.get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"]), None
            if part.get("text"):
                texts.append(part["text"])
        reason = cand.get("finishReason", "")
        if texts or reason:
            return None, f"画像が返されませんでした(finishReason: {reason or '不明'})\n{' '.join(texts)[:500]}"
    return None, "画像が返されませんでした(候補なし)"


def main():
    parser = argparse.ArgumentParser(
        description="数枚の写真から実写映画風・アニメ風などの画像を生成する(Gemini画像生成API)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("images", nargs="+", help="入力画像(JPG/PNG/WebP、同じ被写体を1〜4枚)")
    parser.add_argument("--style", choices=sorted(STYLE_PRESETS), default="cinematic",
                        help="スタイル: cinematic=実写映画風 / anime=アニメ風 / 3d=3DCG映画風 / custom=--promptのみ")
    parser.add_argument("--prompt", default="", help="追加の指示文(シーン・場所・雰囲気など。日本語でも可)")
    parser.add_argument("--out", default="stylized.png", help="出力PNGのパス(--count 2以上なら _1, _2... を付ける)")
    parser.add_argument("--count", type=int, default=1, help="生成枚数(1〜4。1枚ずつAPIを呼ぶ)")
    parser.add_argument("--aspect", choices=ASPECT_RATIOS, default=None,
                        help="出力のアスペクト比(例: 16:9=横型シーン, 9:16=縦型)。未指定なら入力に合わせる")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="使用モデル")
    parser.add_argument("--dry-run", action="store_true", help="APIを呼ばず、送る内容の確認だけ行う")
    args = parser.parse_args()

    if not 1 <= args.count <= 4:
        sys.exit("エラー: --count は1〜4で指定してください")
    if len(args.images) > 4:
        sys.exit("エラー: 入力画像は4枚までにしてください(多すぎると被写体の再現が不安定になる)")

    parts = []
    total_bytes = 0
    for path in args.images:
        if not os.path.exists(path):
            sys.exit(f"エラー: 画像が見つかりません: {path}")
        part, size = read_image_part(path)
        parts.append(part)
        total_bytes += size
        print(f"入力: {path} ({size / 1024:.0f} KB)")
    if total_bytes > TOTAL_INPUT_WARN_BYTES:
        sys.exit("エラー: 入力画像の合計が大きすぎます(約14MB超)。画像を縮小してから実行してください")

    prompt = build_prompt(args.style, args.prompt, len(args.images))
    parts.append({"text": prompt})

    body = {"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}}
    if args.aspect:
        body["generationConfig"]["imageConfig"] = {"aspectRatio": args.aspect}

    print(f"スタイル: {args.style} / モデル: {args.model}" + (f" / アスペクト比: {args.aspect}" if args.aspect else ""))
    print(f"プロンプト: {prompt}")

    if args.dry_run:
        print("--dry-run のためAPIは呼びません")
        return

    api_key = load_api_key()
    if not api_key:
        sys.exit(
            "エラー: GEMINI_API_KEY が設定されていません。\n"
            "  https://aistudio.google.com/apikey でAPIキーを取得し、\n"
            "  環境変数 GEMINI_API_KEY か、リポジトリ直下の .env に設定してください"
        )

    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    base, ext = os.path.splitext(args.out)
    if ext.lower() != ".png":
        base, ext = args.out, ".png"

    saved = []
    for i in range(args.count):
        out_path = f"{base}{ext}" if args.count == 1 else f"{base}_{i + 1}{ext}"
        print(f"生成中 ({i + 1}/{args.count}) ...")
        response = call_api(api_key, args.model, body)
        image_bytes, error = extract_image(response)
        if image_bytes is None:
            print(f"  失敗: {error}")
            continue
        with open(out_path, "wb") as f:
            f.write(image_bytes)
        print(f"  保存: {out_path} ({len(image_bytes) / 1024:.0f} KB)")
        saved.append(out_path)

    if not saved:
        sys.exit("エラー: 1枚も生成できませんでした。プロンプトや入力画像を変えて再試行してください")
    print(f"完了: {len(saved)}枚を保存しました")


if __name__ == "__main__":
    main()
