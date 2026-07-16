# -*- coding: utf-8 -*-
"""新規注文フォルダを生成する。

使い方:
    python scripts/new_order.py sample-001
    python scripts/new_order.py sample-001 --dummy   # テスト用ダミー素材も生成
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import PipelineError

ORDER_YAML_TEMPLATE = """\
order_id: "{order_id}"
couple_names: "Kenji & Yuki"
anniversary_date: "2021.10.15"
scene1_caption: "Autumn, 2019"      # Scene 1に小さく表示
message: "Thank you for dropping that book."
message_start_sec: 22               # メッセージのフェードイン開始秒(BGMの山に合わせて調整可能)
output_formats: ["portrait", "landscape"]  # 1080x1920 と 1920x1080
portrait_mode: "crop"               # 縦型変換: crop=センタークロップ / pad=余白パディング
"""

# ダミーシーンの配色 (グラデーション2色 × シーン数分ローテーション)
_DUMMY_COLORS = [
    ("0x7FB4D9", "0xE8F1F5"),   # 秋空ブルー
    ("0xE9B87A", "0xF7E7CE"),   # 夕暮れオレンジ
    ("0xB48CC8", "0xF0E6F5"),   # 夜のラベンダー
    ("0x8FBF9F", "0xE9F5EC"),   # 予備 (4シーン以上用)
]


def make_dummy_assets(order_id: str, num_scenes: int, scene_sec: float) -> None:
    """単色グラデ+テキストのダミー動画と、正弦波のダミーBGMを生成する。"""
    ffmpeg = common.find_tool("ffmpeg")
    font = common.find_font()
    input_dir = common.order_dir(order_id) / "input"
    input_dir.mkdir(parents=True, exist_ok=True)

    for i in range(1, num_scenes + 1):
        c0, c1 = _DUMMY_COLORS[(i - 1) % len(_DUMMY_COLORS)]
        out = input_dir / f"scene{i}.mp4"
        label = f"DUMMY SCENE {i}"
        vf = (
            f"drawtext=fontfile={common.ff_quote(font)}:text='{label}':"
            f"fontsize=120:fontcolor=white:borderw=3:bordercolor=black@0.4:"
            f"x=(w-text_w)/2:y=(h-text_h)/2,"
            f"drawtext=fontfile={common.ff_quote(font)}:text='t=%{{pts\\:hms}}':"
            f"fontsize=48:fontcolor=white@0.8:x=40:y=40"
        )
        common.run([
            ffmpeg, "-y",
            "-f", "lavfi",
            "-i", f"gradients=s=1920x1080:c0={c0}:c1={c1}:d={scene_sec}:r={common.FPS}:speed=0.02",
            "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-an", str(out),
        ])
        print(f"[dummy] {out}  ({scene_sec:.0f}s)")

    bgm = input_dir / "bgm.mp3"
    bgm_sec = num_scenes * scene_sec + 3  # 全体より少し長め (末尾トリムのテストを兼ねる)
    common.run([
        ffmpeg, "-y",
        "-f", "lavfi", "-i", f"sine=frequency=392:duration={bgm_sec}",
        "-f", "lavfi", "-i", f"sine=frequency=523.25:duration={bgm_sec}",
        "-filter_complex",
        "[0:a][1:a]amix=inputs=2,tremolo=f=0.5:d=0.6,volume=-6dB[a]",
        "-map", "[a]", "-c:a", "libmp3lame", "-q:a", "4", str(bgm),
    ])
    print(f"[dummy] {bgm}  ({bgm_sec:.0f}s)")


def main() -> None:
    ap = argparse.ArgumentParser(description="新規注文フォルダを生成")
    ap.add_argument("order_id", help="注文ID (例: sample-001)")
    ap.add_argument("--dummy", action="store_true",
                    help="テスト用ダミー素材 (sceneN.mp4 / bgm.mp3) も生成する")
    ap.add_argument("--scenes", type=int, default=3, help="ダミーのシーン数 (既定: 3)")
    ap.add_argument("--scene-sec", type=float, default=10.0, help="ダミー1シーンの秒数 (既定: 10)")
    ap.add_argument("--force", action="store_true", help="既存の order.yaml を上書きする")
    args = ap.parse_args()

    odir = common.order_dir(args.order_id)
    yaml_path = odir / "order.yaml"
    if yaml_path.exists() and not args.force:
        print(f"[skip] {yaml_path} は既に存在します (--force で上書き)")
    else:
        (odir / "input").mkdir(parents=True, exist_ok=True)
        (odir / "output").mkdir(parents=True, exist_ok=True)
        yaml_path.write_text(ORDER_YAML_TEMPLATE.format(order_id=args.order_id), encoding="utf-8")
        print(f"[new]  {yaml_path}")

    (odir / "input").mkdir(parents=True, exist_ok=True)
    (odir / "output").mkdir(parents=True, exist_ok=True)

    # 環境確認 (ffmpeg / フォント / 紙テクスチャ)
    common.find_tool("ffmpeg")
    common.find_tool("ffprobe")
    font = common.find_font()
    print(f"[env]  ffmpeg OK / font: {font.name}")
    common.ensure_transition_png()

    if args.dummy:
        make_dummy_assets(args.order_id, args.scenes, args.scene_sec)

    print(f"""
次のステップ:
  1. {odir / 'order.yaml'} を編集
  2. {odir / 'input'} に scene1.mp4, scene2.mp4, ... と bgm.mp3 を配置
     (--dummy を付けた場合はテスト素材が配置済み)
  3. python scripts/assemble.py {args.order_id}
  4. python scripts/qc.py {args.order_id}
""")


if __name__ == "__main__":
    try:
        main()
    except PipelineError as e:
        common.die(e)
