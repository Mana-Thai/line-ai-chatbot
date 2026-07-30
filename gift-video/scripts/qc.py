# -*- coding: utf-8 -*-
"""組み立て済み動画の品質チェック (QC)。

    python scripts/qc.py sample-001

チェック項目:
  - 総再生時間が order.yaml の target_duration −2〜+5 秒の範囲内か
    (既定30秒なら 28〜35 秒、60秒=約1分なら 58〜65 秒。組み立て時の想定値とも照合)
  - 解像度・コーデック (H.264 / AAC) が仕様通りか
  - 音声の統合ラウドネス (loudnorm 目標 -14 LUFS との差)
  - テキスト表示タイミングが order.yaml の指定と一致しているか
    (assemble が書き出した manifest のフィルタ設定値を照合)

すべて合格なら exit 0、1件でも不合格なら exit 1。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import FORMATS, LOUDNORM_I, NAMES_LEAD, PipelineError

DURATION_TOL = 0.5      # manifest の想定総時間との許容差 (秒)
LOUDNESS_TOL = 3.0      # 目標 LUFS との許容差 (dB) ※1パス loudnorm のばらつきを考慮
TIMING_TOL = 0.05       # テキストタイミングの許容差 (秒)


class Report:
    def __init__(self) -> None:
        self.rows: list[tuple[bool, str, str]] = []

    def check(self, ok: bool, item: str, detail: str) -> None:
        self.rows.append((ok, item, detail))

    def render(self) -> bool:
        width = max(len(item) for _, item, _ in self.rows) if self.rows else 0
        all_ok = True
        for ok, item, detail in self.rows:
            mark = "PASS" if ok else "FAIL"
            if not ok:
                all_ok = False
            print(f"  [{mark}] {item.ljust(width)}  {detail}")
        return all_ok


def measure_loudness(path: Path) -> dict:
    """loudnorm の解析モードでファイルの実測ラウドネスを取得する。"""
    ffmpeg = common.find_tool("ffmpeg")
    proc = common.run([ffmpeg, "-hide_banner", "-nostats", "-i", str(path),
                       "-af", "loudnorm=print_format=json", "-f", "null", "-"])
    # ffmpeg は解析結果 JSON を stderr に出力する
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", proc.stderr, re.DOTALL)
    if not m:
        raise PipelineError(f"loudnorm の解析結果を取得できませんでした: {path}")
    return json.loads(m.group(0))


def qc_format(fmt: str, fmt_info: dict, order: dict, output_dir: Path,
              report: Report) -> None:
    W, H = FORMATS[fmt]
    out_path = output_dir / fmt_info["file"]
    label = f"[{fmt}] "

    if not out_path.is_file():
        report.check(False, label + "ファイル存在", f"{out_path} がありません")
        return
    report.check(True, label + "ファイル存在", out_path.name)

    info = common.ffprobe_json(out_path)
    duration = float(info["format"]["duration"])
    vstreams = [s for s in info["streams"] if s["codec_type"] == "video"]
    astreams = [s for s in info["streams"] if s["codec_type"] == "audio"]

    # --- 総再生時間 (order.yaml の target_duration 基準) ---
    dmin, dmax = common.duration_range(order["target_duration"])
    in_range = dmin <= duration <= dmax
    matches_plan = abs(duration - fmt_info["total_duration"]) <= DURATION_TOL
    report.check(in_range and matches_plan, label + "総再生時間",
                 f"{duration:.2f}s (目標 {order['target_duration']:.0f}s → "
                 f"規定 {dmin:.0f}-{dmax:.0f}s / 想定 {fmt_info['total_duration']:.2f}s)")

    # --- 解像度・コーデック ---
    if vstreams:
        v = vstreams[0]
        res_ok = v["width"] == W and v["height"] == H
        codec_ok = v["codec_name"] == "h264"
        report.check(res_ok, label + "解像度",
                     f"{v['width']}x{v['height']} (期待 {W}x{H})")
        report.check(codec_ok, label + "映像コーデック",
                     f"{v['codec_name']} (期待 h264)")
    else:
        report.check(False, label + "映像ストリーム", "映像がありません")
    if astreams:
        a = astreams[0]
        report.check(a["codec_name"] == "aac", label + "音声コーデック",
                     f"{a['codec_name']} (期待 aac)")
    else:
        report.check(False, label + "音声ストリーム", "音声がありません")

    # --- ラウドネス ---
    loud = measure_loudness(out_path)
    measured_i = float(loud["input_i"])
    target = fmt_info["audio"]["loudnorm_target_i"]
    report.check(abs(measured_i - target) <= LOUDNESS_TOL, label + "ラウドネス",
                 f"{measured_i:.1f} LUFS (目標 {target:.0f} ±{LOUDNESS_TOL:.0f} / "
                 f"TP {loud['input_tp']} dBTP)")

    # --- テキストタイミング (フィルタ設定値と yaml の照合) ---
    total = fmt_info["total_duration"]
    if order["message"]:
        if "message" in fmt_info:
            diff = abs(fmt_info["message"]["start"] - order["message_start_sec"])
            report.check(diff <= TIMING_TOL, label + "メッセージ開始秒",
                         f"filter={fmt_info['message']['start']}s / "
                         f"yaml={order['message_start_sec']}s")
        else:
            report.check(False, label + "メッセージ開始秒", "フィルタに未設定")
    if order["scene1_caption"]:
        report.check("caption" in fmt_info, label + "Scene1キャプション",
                     "フィルタに設定済み" if "caption" in fmt_info else "フィルタに未設定")
    if not order["show_names"]:
        # 文字を入れない作品(show_names: false)。意図どおり出ていないことを確認する
        report.check("names" not in fmt_info, label + "名前・日付表示 (show_names: false)",
                     "意図どおり非表示" if "names" not in fmt_info else "非表示のはずが設定されている")
    elif "names" in fmt_info:
        expected = total - NAMES_LEAD
        diff = abs(fmt_info["names"]["start"] - expected)
        report.check(diff <= TIMING_TOL, label + "名前・日付表示 (ラスト2秒)",
                     f"filter={fmt_info['names']['start']}s / 期待 {expected:.2f}s")
    else:
        report.check(False, label + "名前・日付表示", "フィルタに未設定")


def main() -> None:
    ap = argparse.ArgumentParser(description="ギフト動画の品質チェック")
    ap.add_argument("order_id")
    args = ap.parse_args()

    order = common.load_order(args.order_id)
    output_dir = common.order_dir(args.order_id) / "output"
    manifest_path = output_dir / "work" / "assemble_manifest.json"
    if not manifest_path.is_file():
        raise PipelineError(f"manifest がありません: {manifest_path}\n"
                            f"先に  python scripts/assemble.py {args.order_id}  を実行してください。")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    print(f"\nQC レポート: {args.order_id}")
    print("=" * 72)
    report = Report()
    for fmt in order["output_formats"]:
        if fmt not in manifest["formats"]:
            report.check(False, f"[{fmt}] 組み立て結果", "manifest に記録がありません")
            continue
        qc_format(fmt, manifest["formats"][fmt], order, output_dir, report)

    all_ok = report.render()
    print("=" * 72)
    print("結果: " + ("ALL PASS ✅" if all_ok else "FAIL ❌ (上記の FAIL 項目を確認してください)"))
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    try:
        main()
    except PipelineError as e:
        common.die(e)
