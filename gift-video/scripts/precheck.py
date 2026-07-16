# -*- coding: utf-8 -*-
"""組み立て前の素材チェック (プリチェック)。

    python scripts/precheck.py sample-001            # 1注文
    python scripts/precheck.py sample-001 demo-002   # 複数指定
    python scripts/precheck.py --all                 # orders/ 直下の全注文

時間のかかるエンコードを始める前に、素材起因の失敗を洗い出す:
  - order.yaml が読み込めるか (必須項目・値の範囲)
  - シーン素材: 存在 / 連番の抜け / 映像ストリーム / 最低尺 (2秒以上)
  - 計算上の総再生時間が target_duration の許容範囲 (−2〜+5秒) に入るか
  - 解像度が出力 (1920x1080 相当) に足りているか (不足は WARN: 拡大で画質低下)
  - BGM: 存在 / 尺が総再生時間をカバーしているか (不足は WARN: 無音で埋まる)
  - message_start_sec が総再生時間の範囲内か
  - ffmpeg / 日本語フォントが使えるか

FAIL が1件でもあれば exit 1 (WARN のみなら exit 0)。
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import XFADE_DUR, PipelineError

SCENE_MIN_SEC = 2.0            # クロスフェード (0.5s×前後) が成立する最低尺
MIN_LONG, MIN_SHORT = 1920, 1080   # 出力に必要な長辺・短辺 (これ未満は拡大される)


class Report:
    """PASS / WARN / FAIL の3値レポート。FAIL のみ exit 1 の対象。"""

    def __init__(self) -> None:
        self.rows: list[tuple[str, str, str]] = []

    def add(self, status: str, item: str, detail: str) -> None:
        self.rows.append((status, item, detail))

    def ok(self, item, detail):
        self.add("PASS", item, detail)

    def warn(self, item, detail):
        self.add("WARN", item, detail)

    def fail(self, item, detail):
        self.add("FAIL", item, detail)

    def render(self) -> bool:
        width = max((len(item) for _, item, _ in self.rows), default=0)
        has_fail = False
        for status, item, detail in self.rows:
            if status == "FAIL":
                has_fail = True
            print(f"  [{status}] {item.ljust(width)}  {detail}")
        return not has_fail


def precheck_order(order_id: str, report: Report) -> None:
    label = f"[{order_id}] "

    # --- order.yaml ---
    try:
        order = common.load_order(order_id)
        report.ok(label + "order.yaml", "必須項目 OK")
    except PipelineError as e:
        report.fail(label + "order.yaml", str(e).splitlines()[0])
        return

    input_dir = common.order_dir(order_id) / "input"

    # --- シーン素材の存在と連番 ---
    try:
        scenes = common.discover_scenes(order_id)
    except PipelineError:
        report.fail(label + "シーン素材", f"{input_dir}/scene1.mp4 ... がありません")
        return
    numbers = [int(re.fullmatch(r"scene(\d+)\.mp4", p.name).group(1)) for p in scenes]
    expected = list(range(1, len(numbers) + 1))
    if numbers == expected:
        report.ok(label + "シーン素材", f"{len(scenes)}本 (scene1〜scene{len(scenes)})")
    else:
        report.warn(label + "シーン素材",
                    f"連番に抜けがあります: {numbers} (置き忘れがないか確認)")

    # --- 各シーンの中身 ---
    scene_durs: list[float] = []
    for p in scenes:
        try:
            info = common.ffprobe_json(p)
        except PipelineError:
            report.fail(label + p.name, "ffprobe で読めません (壊れている可能性)")
            return
        vstreams = [s for s in info["streams"] if s["codec_type"] == "video"]
        if not vstreams:
            report.fail(label + p.name, "映像ストリームがありません")
            return
        dur = float(info["format"]["duration"])
        scene_durs.append(dur)
        w, h = vstreams[0]["width"], vstreams[0]["height"]
        if dur < SCENE_MIN_SEC:
            report.fail(label + p.name,
                        f"{dur:.2f}s は短すぎます (クロスフェード{XFADE_DUR}s×2が成立する"
                        f"{SCENE_MIN_SEC:.0f}s 以上にしてください)")
        elif max(w, h) < MIN_LONG or min(w, h) < MIN_SHORT:
            report.warn(label + p.name,
                        f"{w}x{h} は出力より小さく拡大されます (推奨 {MIN_LONG}x{MIN_SHORT} 以上) / {dur:.2f}s")
        else:
            report.ok(label + p.name, f"{w}x{h} / {dur:.2f}s")

    # --- 総再生時間 ---
    target = order["target_duration"]
    dmin, dmax = common.duration_range(target)
    total = common.planned_total(scene_durs)
    if dmin <= total <= dmax:
        report.ok(label + "総再生時間(計算値)",
                  f"{total:.1f}s (目標 {target:.0f}s / 規定 {dmin:.0f}-{dmax:.0f}s)")
    else:
        need = target - total
        hint = (f"あと約{need:.0f}s 分のシーンを追加" if need > 0
                else f"約{-need:.0f}s 分シーンを短く/削除")
        report.fail(label + "総再生時間(計算値)",
                    f"{total:.1f}s が規定 {dmin:.0f}-{dmax:.0f}s 外 ({hint}、"
                    f"または target_duration を変更)")

    # --- message_start_sec ---
    if order["message"]:
        ms = order["message_start_sec"]
        if 0 <= ms < total - 1:
            report.ok(label + "message_start_sec", f"{ms:g}s (総再生時間 {total:.1f}s 内)")
        else:
            report.fail(label + "message_start_sec",
                        f"{ms:g}s が総再生時間 {total:.1f}s の範囲外です")

    # --- BGM ---
    bgm = input_dir / "bgm.mp3"
    if not bgm.is_file():
        report.fail(label + "BGM", f"{bgm} がありません")
    else:
        try:
            bgm_dur = common.probe_duration(bgm)
            if bgm_dur >= total:
                report.ok(label + "BGM", f"{bgm_dur:.1f}s (総再生時間 {total:.1f}s をカバー)")
            else:
                report.warn(label + "BGM",
                            f"{bgm_dur:.1f}s < 総再生時間 {total:.1f}s (不足分は無音で埋まります)")
        except PipelineError:
            report.fail(label + "BGM", "ffprobe で読めません (壊れている可能性)")


def main() -> None:
    ap = argparse.ArgumentParser(description="組み立て前の素材チェック")
    ap.add_argument("order_ids", nargs="*", help="注文ID (省略時は --all が必要)")
    ap.add_argument("--all", action="store_true", help="orders/ 直下の全注文をチェック")
    args = ap.parse_args()

    if args.all:
        ids = sorted(p.parent.name for p in common.ORDERS_DIR.glob("*/order.yaml"))
    else:
        ids = args.order_ids
    if not ids:
        ap.error("注文IDを指定するか --all を付けてください")

    report = Report()

    # --- 環境 (全注文共通) ---
    try:
        common.find_tool("ffmpeg")
        common.find_tool("ffprobe")
        font = common.find_font()
        report.ok("環境", f"ffmpeg OK / font: {font.name}")
    except PipelineError as e:
        report.fail("環境", str(e).splitlines()[0])

    for oid in ids:
        precheck_order(oid, report)

    print(f"\nプリチェック: {', '.join(ids)}")
    print("=" * 72)
    all_ok = report.render()
    print("=" * 72)
    print("結果: " + ("OK ✅ (組み立てに進めます)" if all_ok
                    else "FAIL ❌ (FAIL 項目を直してから組み立ててください)"))
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    try:
        main()
    except PipelineError as e:
        common.die(e)
