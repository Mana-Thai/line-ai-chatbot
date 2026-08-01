# -*- coding: utf-8 -*-
"""思い出アルバム動画(モンタージュ)の注文を CSV から一括生成する。

母の日・誕生日・還暦・退職・クリスマス向けの「写真+手紙」動画カードを
量産するための入口。make_orders.py のモンタージュ版。

    python3 scripts/make_montage_orders.py orders.csv
    python3 scripts/make_montage_orders.py --template          # 雛形CSVを表示
    python3 scripts/make_montage_orders.py --sync mom-001 mom-002
                # montage.yaml から target_duration / scene_captions を order.yaml に反映
    python3 scripts/make_montage_orders.py --sync --set-formats portrait mom-001
                # 縦型2パス目の前に output_formats を切り替える

CSV列 (1行 = 1注文。order_id / occasion は必須、他は省略可):
  order_id, occasion, language, sender, closing_title, closing_date,
  letter_opening, letter_closing, formats, portrait_mode

  occasion : mothers-day / birthday / kanreki / retirement / christmas
  language : ja(既定) / th
  sender   : daughter(既定) / son — タイ語の自称(หนู/ผม)と文末を切り替える
  letter_* : 手紙本文。省略すると行事×言語のプリセット文が入る。改行は \\n で書ける
  formats  : landscape(既定) / portrait / both — both は横型で作った後に
             --sync --set-formats portrait で縦型2パスを回す

動きかた(量産の流れに合わせて再実行できる):
  - 注文フォルダと order.yaml を作る(既存はスキップ。--force で上書き)
  - photos/ に写真があれば、手紙カード2枚+写真の montage.yaml を作る
  - photos/ が空なら手紙カードだけの montage.yaml を作り、写真が届いてから
    再実行すると **編集済みの手紙を保ったまま** 写真の行を差し込む

Excel保存のCSV (BOM付きUTF-8) に対応。
"""
from __future__ import annotations

import argparse
import csv
import datetime
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import PipelineError

PHOTO_EXTS = (".jpg", ".jpeg", ".png", ".webp")
LETTER_SEC = 7          # 手紙カードの表示秒数(build_montage.py の既定と揃える)
PHOTO_SEC = 5           # 写真1枚の既定表示秒数

OCCASIONS = ["mothers-day", "birthday", "kanreki", "retirement", "christmas"]
_YEAR = datetime.date.today().year
_BE_YEAR = _YEAR + 543   # タイの仏暦

# 行事×言語のプリセット。文面はあくまで下書きで、ヒアリングした内容で
# 必ず書き替える(Skill memorial-video-batch のチェックリスト参照)。
# タイ語は references/thai-templates.md(memorial-photo-video)の検証済み文例が正本。
# {p} = 自称(หนู/ผม)。娘/息子で置き換える。
PRESETS = {
    ("mothers-day", "ja"): {
        "opening": "お母さんへ\n\nあなたが私にしてくれたことを\nひとつずつ、思い出してみました",
        "closing": "言葉にしなかっただけで\nぜんぶ、覚えています",
        "title": "お母さん、ありがとう",
        "date": f"{_YEAR} 母の日",
    },
    ("birthday", "ja"): {
        "opening": "お誕生日おめでとう\n\nいままでの「ありがとう」を\nこの動画にこめました",
        "closing": "これからも、ずっと\n元気でいてね",
        "title": "お誕生日おめでとう",
        "date": "",
    },
    ("kanreki", "ja"): {
        "opening": "60年分の「ありがとう」を\nつたえたくて",
        "closing": "これからは、じぶんの時間を\nたのしんでください",
        "title": "還暦おめでとう",
        "date": "",
    },
    ("retirement", "ja"): {
        "opening": "長い間、\nおつかれさまでした",
        "closing": "第二の人生を、\n楽しんでね",
        "title": "おつかれさまでした",
        "date": "",
    },
    ("christmas", "ja"): {
        "opening": "メリークリスマス\n\nことしも いっしょに\n過ごせますように",
        "closing": "たいせつな思い出を\nありがとう",
        "title": "メリークリスマス",
        "date": f"{_YEAR}.12.25",
    },
    ("mothers-day", "th"): {
        "opening": "ถึงแม่ที่รักของ{p}\n\n{p}ได้นึกถึงสิ่งที่แม่ทำเพื่อ{p}\nทีละอย่าง ทีละอย่าง",
        "closing": "{p}ไม่เคยพูดออกมา\nแต่{p}จำได้ทุกอย่าง\n\nต่อจากนี้ ถึงตา{p}บ้าง\nที่จะดูแลแม่",
        "title_daughter": "ขอบคุณนะแม่",
        "title_son": "ขอบคุณครับแม่",
        "date": f"12 สิงหาคม {_BE_YEAR}",
    },
    ("birthday", "th"): {
        "opening": "สุขสันต์วันเกิดนะแม่\n\nขอบคุณที่อยู่ข้างๆ {p}เสมอ\nในทุกช่วงเวลาของชีวิต",
        "closing": "{p}ไม่เคยพูดออกมา\nแต่{p}จำได้ทุกอย่าง",
        "title": "สุขสันต์วันเกิดนะแม่",
        "date": "",
    },
    ("kanreki", "th"): {
        "opening": "หกสิบปีของแม่\nคือหกสิบปีแห่งการให้\n\nวันนี้ขอให้แม่ได้รับบ้าง",
        "closing": "{p}ไม่เคยพูดออกมา\nแต่{p}จำได้ทุกอย่าง",
        "title": "ขอให้แม่มีความสุข",
        "date": "ครบรอบ 60 ปี",
    },
    # 退職・クリスマスのタイ語は検証済み文例が無いため、明示的な穴埋めにする
    # (間違ったタイ語をプリセットに入れるより、書く場所を示す方が安全)
    ("retirement", "th"): {
        "opening": "(ここにタイ語の手紙を書く)",
        "closing": "(ここにタイ語の手紙を書く)",
        "title": "(ここにタイ語の締めの言葉)",
        "date": "",
    },
    ("christmas", "th"): {
        "opening": "(ここにタイ語の手紙を書く)",
        "closing": "(ここにタイ語の手紙を書く)",
        "title": "(ここにタイ語の締めの言葉)",
        "date": "",
    },
}

TEMPLATE = """\
order_id,occasion,language,sender,closing_title,closing_date,letter_opening,letter_closing,formats,portrait_mode
mom-001,mothers-day,ja,daughter,,,,,landscape,crop
mom-002,mothers-day,th,son,,,,,both,crop
bday-001,birthday,ja,daughter,これからもよろしくね,60th Birthday,お母さん\\nお誕生日おめでとう,ずっと元気でいてね,portrait,crop
"""

ORDER_YAML_TEMPLATE = """\
order_id: "{order_id}"
couple_names: "{title}"             # ラスト2秒に大きく出る(この商品では締めの言葉に使う)
anniversary_date: "{date}"
scene1_caption: ""                  # 写真ごとの文字は scene_captions で入れるので未使用
message: ""                         # 手紙は letter カードで見せるので未使用
message_start_sec: 0
target_duration: {duration:g}       # --sync で montage.yaml から自動反映される
output_formats: ["{fmt}"]           # both の注文は横型の後に --sync --set-formats portrait
portrait_mode: "{portrait_mode}"
mix_scene_audio: false              # 写真素材に音声は無いのでBGMのみ
show_names: true                    # ラストの締めの言葉を表示する

# シーンごとのキャプション(--sync で montage.yaml から自動反映される)
scene_captions: []
"""

CLOSING_MARK = "# ── 結びの手紙カード"


def find_photos(order_id):
    photo_dir = common.order_dir(order_id) / "photos"
    if not photo_dir.is_dir():
        return []
    return sorted(p for p in photo_dir.iterdir() if p.suffix.lower() in PHOTO_EXTS)


def parse_row(row, line_no):
    data = {}
    for key in ("order_id", "occasion"):
        val = (row.get(key) or "").strip()
        if not val:
            raise PipelineError(f"{line_no}行目: 必須列 {key} が空です")
        data[key] = val
    if data["occasion"] not in OCCASIONS:
        raise PipelineError(
            f"{line_no}行目: occasion は {' / '.join(OCCASIONS)} から選んでください: {data['occasion']}")
    data["language"] = (row.get("language") or "ja").strip() or "ja"
    if data["language"] not in ("ja", "th"):
        raise PipelineError(f"{line_no}行目: language は ja か th です: {data['language']}")
    data["sender"] = (row.get("sender") or "daughter").strip() or "daughter"
    if data["sender"] not in ("daughter", "son"):
        raise PipelineError(f"{line_no}行目: sender は daughter か son です: {data['sender']}")
    data["formats"] = (row.get("formats") or "landscape").strip() or "landscape"
    if data["formats"] not in ("landscape", "portrait", "both"):
        raise PipelineError(
            f"{line_no}行目: formats は landscape / portrait / both です: {data['formats']}")
    data["portrait_mode"] = (row.get("portrait_mode") or "crop").strip() or "crop"
    if data["portrait_mode"] not in ("crop", "pad"):
        raise PipelineError(f"{line_no}行目: portrait_mode は crop か pad です: {data['portrait_mode']}")
    for key in ("closing_title", "closing_date", "letter_opening", "letter_closing"):
        # CSVでは改行を \n と書く(Excelのセル内改行もそのまま通る)
        data[key] = (row.get(key) or "").strip().replace("\\n", "\n")
    return data


def resolve_preset(data):
    """行事×言語のプリセットに、CSVで書かれた文面を上書きして確定させる。"""
    preset = PRESETS[(data["occasion"], data["language"])]
    p = "หนู" if data["sender"] == "daughter" else "ผม"

    def fill(text):
        return text.replace("{p}", p)

    title_key = f"title_{data['sender']}"
    title = preset.get(title_key) or preset.get("title", "")
    return {
        "opening": data["letter_opening"] or fill(preset["opening"]),
        "closing": data["letter_closing"] or fill(preset["closing"]),
        "title": data["closing_title"] or fill(title),
        "date": data["closing_date"] or preset["date"],
    }


def yaml_block_literal(text, indent):
    """複数行テキストを YAML のブロックリテラル(|- の中身)に整形する。"""
    pad = " " * indent
    return "\n".join(f"{pad}{line}" if line else "" for line in text.splitlines())


def photo_entry_lines(photos):
    lines = []
    for p in photos:
        lines += [f'  - file: "{p.name}"', '    caption: ""']
    return lines


def write_montage_yaml(path, letters, photos):
    lines = [
        "# 思い出アルバム動画の構成。上から順に再生される。",
        "#   - file:   photos/ の写真(caption は画面下の一言。空なら出ない)",
        "#   - letter: 手紙カード(水彩調の背景に文章を全画面表示。改行はそのまま反映)",
        "# 手紙はプリセットの下書き。ヒアリング内容で必ず書き替えること。",
        "",
        f"default_duration: {PHOTO_SEC}",
        "",
        "photos:",
        "  # ── 冒頭の手紙カード(宛名と書き出し) ──",
        "  - letter: |-",
        yaml_block_literal(letters["opening"], 6),
        f"    duration: {LETTER_SEC}",
        "",
        "  # ── 時系列の写真(01-.., 02-.. の順) ──",
    ]
    if photos:
        lines += photo_entry_lines(photos)
    else:
        lines.append("  # (photos/ に写真を入れて、このスクリプトをもう一度実行すると入る)")
    lines += [
        "",
        f"  {CLOSING_MARK}(いちばん伝えたい言葉。締めのタイトルは order.yaml 側) ──",
        "  - letter: |-",
        yaml_block_literal(letters["closing"], 6),
        f"    duration: {LETTER_SEC}",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def insert_photos(path, photos):
    """写真の行が無い既存 montage.yaml に、結びカードの直前へ写真を差し込む。

    手紙は編集済みかもしれないので、ファイルは書き替えずに行を挿入するだけにする。
    """
    text = path.read_text(encoding="utf-8")
    if re.search(r"^\s*-\s*file:", text, re.M):
        return False        # もう写真がある(手で追加済み)
    lines = [ln for ln in text.splitlines()
             if "このスクリプトをもう一度実行すると入る" not in ln]
    at = next((i for i, ln in enumerate(lines) if CLOSING_MARK in ln), None)
    if at is None:
        # 目印が消されていたら最後の letter カードの直前に入れる
        letter_idx = [i for i, ln in enumerate(lines) if re.match(r"^\s*-\s*letter:", ln)]
        if len(letter_idx) < 2:
            raise PipelineError(
                f"{path} に写真を差し込む位置が見つかりません。手で file: 行を追加してください")
        at = letter_idx[-1]
    new_lines = lines[:at] + photo_entry_lines(photos) + [""] + lines[at:]
    path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    return True


# --------------------------------------------------------------------------
# --sync: montage.yaml → order.yaml(target_duration / scene_captions)
# --------------------------------------------------------------------------
def load_montage_items(order_id):
    try:
        import yaml
    except ImportError:
        raise PipelineError("PyYAML が必要です。 pip install pyyaml")
    path = common.order_dir(order_id) / "montage.yaml"
    if not path.is_file():
        raise PipelineError(f"montage.yaml がありません: {path}")
    with open(path, encoding="utf-8") as f:
        doc = yaml.safe_load(f) or {}
    default_sec = float(doc.get("default_duration", PHOTO_SEC))
    items = doc.get("photos") or []
    if not items:
        raise PipelineError(f"{path} に photos: がありません")
    out = []
    for it in items:
        letter = str(it.get("letter") or "").strip()
        default = LETTER_SEC if letter else default_sec
        out.append({
            "caption": str(it.get("caption") or ""),
            "duration": float(it.get("duration", default)),
        })
    return out


def patch_order_yaml(order_id, total, captions, set_formats):
    """order.yaml のコメントを保ったまま、対象の行だけ書き替える。"""
    path = common.order_dir(order_id) / "order.yaml"
    if not path.is_file():
        raise PipelineError(f"order.yaml がありません: {path}")
    text = path.read_text(encoding="utf-8")

    def replace_scalar(key, value, txt):
        pattern = re.compile(rf"^({key}\s*:)[^\n]*", re.M)

        def repl(m):
            # 行末の # コメントは残す(コメントの前にスペースが要る)
            cpos = m.group(0).find("#")
            comment = f"   {m.group(0)[cpos:]}" if cpos != -1 else ""
            return f"{m.group(1)} {value}{comment}"

        if not pattern.search(txt):
            return txt + f"\n{key}: {value}\n"
        return pattern.sub(repl, txt, count=1)

    text = replace_scalar("target_duration", f"{total:g}", text)
    if set_formats:
        fmts = '["portrait", "landscape"]' if set_formats == "both" else f'["{set_formats}"]'
        text = replace_scalar("output_formats", fmts, text)

    # scene_captions ブロックを丸ごと置き換える(無ければ末尾に足す)
    cap_lines = "scene_captions:\n" + "".join(
        f'  - "{c}"\n' for c in captions) if captions else "scene_captions: []\n"
    block = re.compile(r"^scene_captions\s*:.*(?:\n(?:[ \t]+.*|[ \t]*)?)*?(?=^\S|\Z)", re.M)
    if block.search(text):
        text = block.sub(cap_lines, text, count=1)
    else:
        text = text.rstrip("\n") + "\n\n" + cap_lines
    path.write_text(text, encoding="utf-8")


def run_sync(order_ids, set_formats):
    for oid in order_ids:
        items = load_montage_items(oid)
        total = sum(it["duration"] for it in items)
        captions = [it["caption"] for it in items]
        patch_order_yaml(oid, total, captions, set_formats)
        note = f" / output_formats={set_formats}" if set_formats else ""
        print(f"[sync] orders/{oid}/order.yaml  target_duration={total:g} "
              f"scene_captions={len(captions)}件{note}")


# --------------------------------------------------------------------------
def run_generate(csv_path, force):
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

    created, filled, waiting, skipped = [], [], [], []
    for _, data in rows:
        oid = data["order_id"]
        odir = common.order_dir(oid)
        (odir / "photos").mkdir(parents=True, exist_ok=True)
        (odir / "input").mkdir(parents=True, exist_ok=True)
        (odir / "output").mkdir(parents=True, exist_ok=True)
        photos = find_photos(oid)
        letters = resolve_preset(data)

        order_yaml = odir / "order.yaml"
        if not order_yaml.exists() or force:
            initial_fmt = "portrait" if data["formats"] == "portrait" else "landscape"
            order_yaml.write_text(ORDER_YAML_TEMPLATE.format(
                order_id=oid, title=letters["title"], date=letters["date"],
                duration=LETTER_SEC * 2 + len(photos) * PHOTO_SEC,
                fmt=initial_fmt, portrait_mode=data["portrait_mode"]), encoding="utf-8")
            created.append(oid)
        else:
            skipped.append(oid)

        montage_yaml = odir / "montage.yaml"
        if not montage_yaml.exists() or force:
            write_montage_yaml(montage_yaml, letters, photos)
            if not photos:
                waiting.append(oid)
        elif photos and insert_photos(montage_yaml, photos):
            filled.append(oid)

        if data["language"] == "th" and "(ここに" in letters["opening"]:
            print(f"注意: {oid} はタイ語の検証済みプリセットが無い行事です。"
                  f"montage.yaml の手紙を書いてください")

    for oid in created:
        print(f"[new]  orders/{oid}/  (order.yaml + montage.yaml)")
    for oid in filled:
        print(f"[fill] orders/{oid}/montage.yaml に写真を差し込みました(caption を書く)")
    for oid in skipped:
        print(f"[skip] orders/{oid}/order.yaml は既に存在します (--force で上書き)")
    if waiting:
        print(f"\n写真待ち: {', '.join(waiting)}"
              f"\n  photos/ に時系列順の名前(01-.., 02-..)で入れて、もう一度実行してください")

    print(f"""
次のステップ(量産の流れは Skill memorial-video-batch 参照):
  1. 各注文の photos/ に写真、montage.yaml の手紙・caption を仕上げる(お客様確認)
  2. python3 scripts/make_montage_orders.py --sync {' '.join(ids[:2])}{' ...' if len(ids) > 2 else ''}
  3. 各注文: python3 scripts/build_montage.py <order_id>
  4. input/bgm.mp3 を置いて: python3 scripts/batch.py {' '.join(ids[:2])}{' ...' if len(ids) > 2 else ''}
""")


def main():
    ap = argparse.ArgumentParser(description="モンタージュ注文をCSVから一括生成する")
    ap.add_argument("args", nargs="*", help="CSVファイル、または --sync のときは注文ID")
    ap.add_argument("--template", action="store_true", help="雛形CSVを標準出力に表示")
    ap.add_argument("--force", action="store_true", help="既存の order.yaml / montage.yaml を上書きする")
    ap.add_argument("--sync", action="store_true",
                    help="montage.yaml から order.yaml へ target_duration / scene_captions を反映")
    ap.add_argument("--set-formats", choices=["landscape", "portrait", "both"], default="",
                    help="--sync と併用: output_formats を切り替える(縦型2パス用)")
    args = ap.parse_args()

    if args.template:
        print(TEMPLATE, end="")
        return
    if args.sync:
        if not args.args:
            ap.error("--sync には注文IDを指定してください")
        run_sync(args.args, args.set_formats)
        return
    if len(args.args) != 1:
        ap.error("CSVファイルを1つ指定してください (雛形は --template で表示)")
    csv_path = Path(args.args[0])
    if not csv_path.is_file():
        raise PipelineError(f"CSVファイルが見つかりません: {csv_path}")
    run_generate(csv_path, args.force)


if __name__ == "__main__":
    try:
        main()
    except PipelineError as e:
        common.die(e)
