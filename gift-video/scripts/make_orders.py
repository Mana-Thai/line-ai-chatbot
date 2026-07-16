# -*- coding: utf-8 -*-
"""注文リスト (CSV) から注文フォルダと order.yaml を一括生成する。

    python scripts/make_orders.py orders.csv
    python scripts/make_orders.py --template          # 雛形CSVを標準出力に表示

CSV列 (1行 = 1注文。order_id / couple_names / anniversary_date は必須、他は省略可):
  order_id, couple_names, anniversary_date, scene1_caption, message,
  message_start_sec, target_duration, portrait_mode

Excel保存のCSV (BOM付きUTF-8) に対応。既存の order.yaml は上書きしない (--force で上書き)。
生成後は各注文の input/ に scene1.mp4... と bgm.mp3 を配置し、
precheck.py → batch.py の順に実行する。
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import PipelineError

REQUIRED = ["order_id", "couple_names", "anniversary_date"]
OPTIONAL = ["scene1_caption", "message", "message_start_sec",
            "target_duration", "portrait_mode"]
NUMERIC = {"message_start_sec", "target_duration"}

TEMPLATE = """\
order_id,couple_names,anniversary_date,scene1_caption,message,message_start_sec,target_duration,portrait_mode
order-001,Kenji & Yuki,2021.10.15,"Autumn, 2019",Thank you for dropping that book.,22,60,crop
order-002,健二 & 由紀,2021.10.15,2019年 秋,あの日落とした本がすべての始まりでした。,40,60,pad
"""


def parse_row(row: dict, line_no: int) -> dict:
    data: dict = {}
    for key in REQUIRED:
        val = (row.get(key) or "").strip()
        if not val:
            raise PipelineError(f"{line_no}行目: 必須列 {key} が空です")
        data[key] = val
    for key in OPTIONAL:
        val = (row.get(key) or "").strip()
        if not val:
            continue
        if key in NUMERIC:
            try:
                num = float(val)
            except ValueError:
                raise PipelineError(f"{line_no}行目: {key} は数値で指定してください: {val}")
            data[key] = int(num) if num.is_integer() else num
        else:
            data[key] = val
    if "portrait_mode" in data and data["portrait_mode"] not in ("crop", "pad"):
        raise PipelineError(f"{line_no}行目: portrait_mode は crop か pad です: {data['portrait_mode']}")
    return data


def main() -> None:
    ap = argparse.ArgumentParser(description="CSVから注文フォルダを一括生成")
    ap.add_argument("csv_file", nargs="?", help="注文リストのCSVファイル")
    ap.add_argument("--template", action="store_true", help="雛形CSVを標準出力に表示")
    ap.add_argument("--force", action="store_true", help="既存の order.yaml を上書きする")
    args = ap.parse_args()

    if args.template:
        print(TEMPLATE, end="")
        return
    if not args.csv_file:
        ap.error("CSVファイルを指定してください (雛形は --template で表示)")

    csv_path = Path(args.csv_file)
    if not csv_path.is_file():
        raise PipelineError(f"CSVファイルが見つかりません: {csv_path}")

    # utf-8-sig で Excel の BOM 付きCSVにも対応
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or "order_id" not in reader.fieldnames:
            raise PipelineError("CSVに order_id 列がありません (--template で雛形を確認)")
        rows = [(i + 2, parse_row(row, i + 2)) for i, row in enumerate(reader)
                if any((v or "").strip() for v in row.values())]

    if not rows:
        raise PipelineError("CSVに注文データがありません")
    ids = [d["order_id"] for _, d in rows]
    dup = {x for x in ids if ids.count(x) > 1}
    if dup:
        raise PipelineError(f"order_id が重複しています: {', '.join(sorted(dup))}")

    created, skipped = [], []
    for _, data in rows:
        odir = common.order_dir(data["order_id"])
        yaml_path = odir / "order.yaml"
        (odir / "input").mkdir(parents=True, exist_ok=True)
        (odir / "output").mkdir(parents=True, exist_ok=True)
        if yaml_path.exists() and not args.force:
            skipped.append(data["order_id"])
            continue
        yaml_path.write_text(
            yaml.safe_dump(data, allow_unicode=True, sort_keys=False,
                           default_flow_style=False),
            encoding="utf-8")
        created.append(data["order_id"])

    for oid in created:
        print(f"[new]  orders/{oid}/order.yaml")
    for oid in skipped:
        print(f"[skip] orders/{oid}/order.yaml は既に存在します (--force で上書き)")

    print(f"""
生成: {len(created)}件 / スキップ: {len(skipped)}件

次のステップ:
  1. 各注文の orders/<order_id>/input/ に scene1.mp4, scene2.mp4, ... と bgm.mp3 を配置
  2. python scripts/precheck.py --all      (素材の事前チェック)
  3. python scripts/batch.py {' '.join(ids[:2])}{' ...' if len(ids) > 2 else ''}   (一括組み立て+QC)
""")


if __name__ == "__main__":
    try:
        main()
    except PipelineError as e:
        common.die(e)
