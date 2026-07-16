# -*- coding: utf-8 -*-
"""複数注文の一括処理 (プリチェック → 組み立て → QC)。

    python scripts/batch.py                     # orders/ 直下の全注文
    python scripts/batch.py id-001 id-002       # 指定した注文のみ
    python scripts/batch.py --skip-precheck     # プリチェックを飛ばす

1件が失敗しても止まらず全件を処理し、最後に PASS/FAIL の一覧表を表示する。
1件でも失敗があれば exit 1。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common

SCRIPTS = Path(__file__).resolve().parent


def run_step(script: str, order_id: str) -> tuple[bool, str]:
    """スクリプトを子プロセスで実行し、(成功?, 出力) を返す。"""
    proc = subprocess.run([sys.executable, str(SCRIPTS / script), order_id],
                          capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = (proc.stdout + proc.stderr).strip()
    return proc.returncode == 0, out


def error_summary(output: str) -> str:
    """失敗出力から一覧表向けの短い理由を抜き出す。"""
    for line in output.splitlines():
        if line.startswith("ERROR:") or "[FAIL]" in line:
            return line.strip()[:80]
    tail = output.splitlines()[-1] if output.splitlines() else ""
    return tail.strip()[:80]


def result_duration(order_id: str) -> str:
    """manifest から完成尺を読む (未生成なら '-')"""
    path = common.order_dir(order_id) / "output" / "work" / "assemble_manifest.json"
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        fmt = next(iter(manifest["formats"].values()))
        return f"{fmt['total_duration']:.1f}s"
    except Exception:
        return "-"


def main() -> None:
    ap = argparse.ArgumentParser(description="複数注文の一括組み立て+QC")
    ap.add_argument("order_ids", nargs="*",
                    help="注文ID (省略時は orders/ 直下の全注文)")
    ap.add_argument("--skip-precheck", action="store_true",
                    help="プリチェック (precheck.py) を飛ばす")
    args = ap.parse_args()

    ids = args.order_ids or sorted(
        p.parent.name for p in common.ORDERS_DIR.glob("*/order.yaml"))
    if not ids:
        print("注文がありません。先に make_orders.py か new_order.py で作成してください。")
        sys.exit(1)

    steps = (["precheck.py"] if not args.skip_precheck else []) + ["assemble.py", "qc.py"]
    results: list[dict] = []

    for i, oid in enumerate(ids, 1):
        print(f"\n{'#' * 72}\n# [{i}/{len(ids)}] {oid}\n{'#' * 72}")
        res = {"id": oid, "failed_step": None, "reason": ""}
        for script in steps:
            print(f"\n--- {script} {oid} ---")
            ok, out = run_step(script, oid)
            print(out)
            if not ok:
                res["failed_step"] = script.replace(".py", "")
                res["reason"] = error_summary(out)
                break
        res["duration"] = result_duration(oid)
        results.append(res)

    # --- 一覧表 ---
    print(f"\n{'=' * 72}\n一括処理の結果 ({len(ids)}件)\n{'=' * 72}")
    id_w = max(len(r["id"]) for r in results)
    print(f"  {'注文ID'.ljust(id_w)}  {'尺'.rjust(6)}  結果")
    fail_count = 0
    for r in results:
        if r["failed_step"]:
            fail_count += 1
            status = f"FAIL ❌ ({r['failed_step']}) {r['reason']}"
        else:
            status = "PASS ✅"
        print(f"  {r['id'].ljust(id_w)}  {r['duration'].rjust(6)}  {status}")
    print("=" * 72)
    print(f"結果: {len(results) - fail_count} PASS / {fail_count} FAIL")
    sys.exit(1 if fail_count else 0)


if __name__ == "__main__":
    main()
