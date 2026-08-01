# -*- coding: utf-8 -*-
"""ギフト動画パイプライン 共通モジュール。

ffmpeg/ffprobe の検出、order.yaml の読み込み、フォント解決、
シーン素材の探索などを scripts/ 配下の各スクリプトから共用する。
Windows / macOS / Linux で動作する。
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import yaml

# ---------------------------------------------------------------------------
# パス
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]          # gift-video/
ASSETS_DIR = ROOT / "assets"
FONTS_DIR = ASSETS_DIR / "fonts"
ORDERS_DIR = ROOT / "orders"
TRANSITION_PNG = ASSETS_DIR / "transition.png"

# ---------------------------------------------------------------------------
# 出力仕様
# ---------------------------------------------------------------------------
FORMATS = {
    "landscape": (1920, 1080),
    "portrait": (1080, 1920),
}
FPS = 30
LOUDNORM_I = -14.0      # 統合ラウドネス目標 (LUFS)
LOUDNORM_TP = -1.5
LOUDNORM_LRA = 11.0

# 転換(紙テクスチャ)まわりの秒数
PAPER_HOLD = 1.0        # 紙テクスチャクリップの長さ
XFADE_DUR = 0.5         # 紙への/紙からのクロスフェード長 (合計約1秒の転換)

# 総再生時間の許容範囲 (order.yaml の target_duration 基準)
# 既定30秒の注文なら 28〜35 秒、60秒(約1分)の注文なら 58〜65 秒が合格
DURATION_UNDER = 2.0
DURATION_OVER = 5.0

# テキスト演出の秒数
CAPTION_START = 1.0
CAPTION_END = 6.0
CAPTION_FADE = 0.8
MESSAGE_FADE = 3.0      # メッセージのゆっくりフェードイン
NAMES_LEAD = 2.0        # ラスト2秒
NAMES_FADE = 0.5
AUDIO_FADE = 2.0        # BGM末尾フェードアウト
MIX_BGM_VOL = 0.3       # mix_scene_audio 時にBGMを下げる倍率 (セリフを立たせる)


class PipelineError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# ffmpeg / ffprobe
# ---------------------------------------------------------------------------
FFMPEG_INSTALL_HELP = """\
ffmpeg が見つかりませんでした。先にインストールしてください。

  [Windows]
    winget install --id Gyan.FFmpeg
    (または choco install ffmpeg / https://www.gyan.dev/ffmpeg/builds/ のzipを
     展開して bin フォルダを PATH に追加)
    インストール後はターミナルを開き直してください。
  [macOS]   brew install ffmpeg
  [Linux]   sudo apt install ffmpeg

確認: ffmpeg -version
"""


def find_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise PipelineError(FFMPEG_INSTALL_HELP)
    return path


def run(cmd: list[str], log_file: Path | None = None) -> subprocess.CompletedProcess:
    """コマンドを実行。失敗時は stderr 末尾を添えて例外を送出する。"""
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if log_file is not None:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        with open(log_file, "a", encoding="utf-8") as f:
            f.write("$ " + " ".join(cmd) + "\n")
            f.write(proc.stderr + "\n")
    if proc.returncode != 0:
        tail = "\n".join(proc.stderr.splitlines()[-25:])
        raise PipelineError(f"コマンド失敗 (exit {proc.returncode}):\n  {' '.join(cmd)}\n--- stderr 末尾 ---\n{tail}")
    return proc


def ffprobe_json(path: Path) -> dict:
    ffprobe = find_tool("ffprobe")
    proc = run([ffprobe, "-v", "error", "-print_format", "json",
                "-show_format", "-show_streams", str(path)])
    return json.loads(proc.stdout)


def probe_duration(path: Path) -> float:
    info = ffprobe_json(path)
    return float(info["format"]["duration"])


# ---------------------------------------------------------------------------
# フォント解決 (日英両対応: Noto Sans JP / Noto Sans CJK JP)
# ---------------------------------------------------------------------------
FONT_INSTALL_HELP = f"""\
日本語対応フォントが見つかりませんでした。

Noto Sans JP を以下からダウンロードして、
  {FONTS_DIR}
に .ttf / .otf を配置してください。

  https://fonts.google.com/noto/specimen/Noto+Sans+JP
  ("Get font" → "Download all" → zip 内の NotoSansJP-Regular.ttf をコピー)
"""

FONT_INSTALL_HELP_TH = f"""\
タイ語対応フォントが見つかりませんでした。

**日本語フォント(Noto Sans CJK等)にタイ文字は入っていません。**
そのまま使うと文字がすべて □ になります。

Noto Sans Thai を以下からダウンロードして、
  {FONTS_DIR}
に .ttf を配置してください。

  https://fonts.google.com/noto/specimen/Noto+Sans+Thai
  Linux なら: sudo apt install fonts-noto-core
"""

_SYSTEM_FONT_CANDIDATES = [
    # Linux (fonts-noto-cjk)
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKjp-Regular.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    # Windows
    "C:/Windows/Fonts/NotoSansJP-Regular.ttf",
    "C:/Windows/Fonts/YuGothM.ttc",
    "C:/Windows/Fonts/meiryo.ttc",
    "C:/Windows/Fonts/msgothic.ttc",
    # macOS
    "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
    "/Library/Fonts/NotoSansJP-Regular.ttf",
]

# タイ文字を持つフォント。CJKフォントにタイ文字は含まれないので完全に別系統。
#
# 【重要】NotoSansThai / NotoSerifThai は**タイ文字だけのサブセット**で、
# 数字・ピリオド・カンマ・ラテン文字を持たない。「พ.ศ. 2026」のような実際の文面で
# □ になるため、ラテン文字と約物まで揃っている Loma / Tahoma を優先する。
# (下の check_font_coverage が実際に描画前に検査する)
_THAI_FONT_CANDIDATES = [
    # Linux (fonts-thai-tlwg) — タイ文字+ラテン+約物が揃っている
    "/usr/share/fonts/opentype/tlwg/Loma.otf",
    "/usr/share/fonts/truetype/tlwg/Loma.ttf",
    "/usr/share/fonts/opentype/tlwg/Garuda.otf",
    "/usr/share/fonts/opentype/tlwg/Sarabun.otf",
    # Windows
    "C:/Windows/Fonts/tahoma.ttf",          # Windows標準でタイ文字を持つ
    "C:/Windows/Fonts/leelawui.ttf",
    # macOS
    "/System/Library/Fonts/Thonburi.ttc",
    # Noto Thai は最後(タイ文字のみのサブセットの場合がある)
    "/usr/share/fonts/truetype/noto/NotoLoopedThai-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf",
]

# タイ文字のコードブロック
_THAI_RANGE = ("\u0e00", "\u0e7f")


def has_thai(text: str) -> bool:
    return any(_THAI_RANGE[0] <= ch <= _THAI_RANGE[1] for ch in str(text))


# タイ文字は字面(文字の本体)が em に対して小さく、さらに声調記号・母音記号が
# 上下に付く。日本語や欧文と同じ pt で組むと本体が潰れて読めない、という指摘が
# ネイティブチェックで出たため、タイ語の描画だけ一律で大きくする。
THAI_SIZE_FACTOR = 1.35


def text_size_scale(text: str) -> float:
    """描画する文字に応じた文字サイズの倍率を返す(タイ語だけ大きくする)。"""
    return THAI_SIZE_FACTOR if has_thai(text) else 1.0


# タイ語の結合文字(上下に付く母音記号・声調記号)。基底文字から切り離すと表示が壊れる
THAI_COMBINING = "ัิ-ฺ็-๎"


def wrap_tokens(text: str) -> list[str]:
    """折り返しの最小単位に分割する。

    欧文の単語は途中で切らず、タイ語の結合文字は基底文字にくっつけて1単位にする
    (文字数で機械的に切ると ก + ่ が分かれて別々に描画されてしまう)。
    """
    return re.findall(rf"[!-~]+\s*|.[{THAI_COMBINING}]*", text)


def wrap_units(text: str) -> list[str]:
    """空白で区切ったまとまり(後続の空白を含む)に分割する。

    タイ語は単語間に空白を置かないが、**文節の切れ目には空白を入れる**書き方が普通。
    そこを無視して文字数で折り返すと「เพื่อเอ / า」のように母音字が基底から離れ、
    タイ語話者には壊れて見える(結合文字ではないので wrap_tokens では防げない)。
    折り返しはまずこの単位で行い、1つが長すぎて入らないときだけ文字単位に落とす。
    """
    return re.findall(r"\S+\s*", text)


def missing_glyphs(font: Path, text: str) -> set[str] | None:
    """フォントに無い文字を返す。判定できない環境では None。

    ffmpeg の drawtext はフォントを1つしか使わず、字体の自動フォールバックをしない。
    無い文字は黙って □ になり、完成品を再生するまで気づけないため事前に検査する。
    """
    try:
        from fontTools.ttLib import TTCollection, TTFont
    except ImportError:
        return None
    try:
        fonts = (TTCollection(str(font)).fonts if font.suffix.lower() == ".ttc"
                 else [TTFont(str(font), fontNumber=0)])
        codepoints: set[int] = set()
        for f in fonts:
            for table in f["cmap"].tables:
                codepoints |= set(table.cmap.keys())
    except Exception:
        return None
    # 改行・タブは描画対象外
    return {ch for ch in set(text) if ch not in "\n\r\t" and ord(ch) not in codepoints}


def find_font(text: str | None = None) -> Path:
    """描画する文字に合ったフォントを返す。

    text にタイ文字が含まれる場合はタイ語フォントを探す。日本語フォント
    (Noto Sans CJK 等)にタイ文字は入っておらず、そのまま描画すると全部 □ に
    なるため、言語ごとに別のフォントを選ぶ必要がある。

    さらに、候補のうち **text の全文字を持つもの** を優先する。タイ語フォントには
    数字やピリオドを含まないサブセット(NotoSansThai 等)があり、「พ.ศ. 2026」の
    ような文面で約物だけが □ になる事故を防ぐ。
    """
    thai = text is not None and has_thai(text)
    candidates: list[Path] = []
    if FONTS_DIR.is_dir():
        hits: list[Path] = []
        for ext in ("*.ttf", "*.otf", "*.ttc"):
            hits += sorted(FONTS_DIR.glob(ext))
        # 手動配置したフォントを最優先(タイ語なら名前で絞る)
        if thai:
            candidates += [p for p in hits
                           if any(k in p.name.lower()
                                  for k in ("thai", "loma", "garuda", "sarabun", "tahoma"))]
        else:
            candidates += hits
    candidates += [Path(c) for c in
                   (_THAI_FONT_CANDIDATES if thai else _SYSTEM_FONT_CANDIDATES)]
    candidates = [p for p in candidates if p.is_file()]
    if not candidates:
        raise PipelineError(FONT_INSTALL_HELP_TH if thai else FONT_INSTALL_HELP)

    if not text:
        return candidates[0]

    fallback = None
    for p in candidates:
        missing = missing_glyphs(p, text)
        if missing is None:          # fontTools が無い環境。順番どおりに使う
            return p
        if not missing:
            return p
        if fallback is None:
            fallback = (p, missing)
    p, missing = fallback
    shown = " ".join(sorted(missing))
    print(f"警告: フォント {p.name} に無い文字があります → 完成品で □ になります: {shown}\n"
          f"  対処: その文字を使わない文面にするか、全文字を持つフォントを "
          f"{FONTS_DIR} に置いてください")
    return p


def ff_quote(value: str | Path) -> str:
    """filter_complex 内のオプション値(パス・式)を単一引用符でクォートする。"""
    s = str(value).replace("\\", "/")
    if "'" in s:
        raise PipelineError(f"パスに ' を含めないでください: {s}")
    return f"'{s}'"


# ---------------------------------------------------------------------------
# 注文 (order.yaml)
# ---------------------------------------------------------------------------
ORDER_DEFAULTS = {
    "scene1_caption": "",
    "message": "",
    "message_start_sec": 22,
    "target_duration": 30,     # 完成動画の目標秒数 (60 で約1分)
    "output_formats": ["portrait", "landscape"],
    "portrait_mode": "crop",   # crop: センタークロップ / pad: 余白パディング
    "text_color": "white",
    # true にするとシーン動画自体の音声(セリフ・環境音)を残し、BGMを下げて重ねる。
    # ドラマ動画(drama_clip.py のクリップ)用。全シーンに音声トラックが必要
    "mix_scene_audio": False,
    # false にするとラストの名前・日付テロップを出さない。映像に文字を入れない
    # 作品(シネマティックな短編等)用。既定 true はギフト動画の従来どおりの見た目
    "show_names": True,
    # シーン(写真)ごとのキャプション。写真アルバム動画で「1995年 初めての運動会」の
    # ように1枚ずつ言葉を添えるためのもの。シーン数と同じ数だけ並べる(空文字は非表示)。
    # 表示タイミングは各シーンの尺から自動計算されるので、秒数の指定は不要
    "scene_captions": [],
}


def order_dir(order_id: str) -> Path:
    return ORDERS_DIR / order_id


def load_order(order_id: str) -> dict:
    path = order_dir(order_id) / "order.yaml"
    if not path.is_file():
        raise PipelineError(f"order.yaml が見つかりません: {path}\n"
                            f"先に  python scripts/new_order.py {order_id}  を実行してください。")
    with open(path, encoding="utf-8") as f:
        order = yaml.safe_load(f) or {}

    merged = {**ORDER_DEFAULTS, **order}
    for key in ("order_id", "couple_names", "anniversary_date"):
        if not merged.get(key):
            raise PipelineError(f"order.yaml に {key} がありません: {path}")
    for fmt in merged["output_formats"]:
        if fmt not in FORMATS:
            raise PipelineError(f"未知の output_format: {fmt} (portrait / landscape のみ対応)")
    if merged["portrait_mode"] not in ("crop", "pad"):
        raise PipelineError("portrait_mode は crop か pad を指定してください")
    if not isinstance(merged["mix_scene_audio"], bool):
        raise PipelineError("mix_scene_audio は true か false を指定してください")
    if not isinstance(merged["show_names"], bool):
        raise PipelineError("show_names は true か false を指定してください")
    if not isinstance(merged["scene_captions"], list):
        raise PipelineError("scene_captions は文字列のリストで指定してください")
    merged["scene_captions"] = [str(c) if c is not None else "" for c in merged["scene_captions"]]
    merged["message_start_sec"] = float(merged["message_start_sec"])
    merged["target_duration"] = float(merged["target_duration"])
    if not 10 <= merged["target_duration"] <= 300:
        raise PipelineError("target_duration は 10〜300 秒の範囲で指定してください")
    return merged


def duration_range(target: float) -> tuple[float, float]:
    """target_duration に対する総再生時間の合格範囲 (下限, 上限)。"""
    return target - DURATION_UNDER, target + DURATION_OVER


def planned_total(scene_durs: list[float]) -> float:
    """シーン尺から xfade 連鎖後の総再生時間を計算する (assemble と同じ式)。"""
    n = len(scene_durs)
    return round(sum(scene_durs) + (n - 1) * (PAPER_HOLD - 2 * XFADE_DUR), 3)


def discover_scenes(order_id: str) -> list[Path]:
    """input/scene*.mp4 を番号順に列挙する(シーン数は可変・4シーン以上も可)。"""
    input_dir = order_dir(order_id) / "input"
    scenes = []
    for p in input_dir.glob("scene*.mp4"):
        m = re.fullmatch(r"scene(\d+)\.mp4", p.name)
        if m:
            scenes.append((int(m.group(1)), p))
    scenes.sort()
    if not scenes:
        raise PipelineError(f"シーン素材がありません: {input_dir}/scene1.mp4 ...\n"
                            f"テスト用ダミーは  python scripts/new_order.py {order_id} --dummy  で生成できます。")
    return [p for _, p in scenes]


# ---------------------------------------------------------------------------
# 紙テクスチャ (assets/transition.png) の自動生成
# ---------------------------------------------------------------------------
def ensure_transition_png() -> Path:
    """白系の紙テクスチャがなければ ffmpeg で生成する(生成物はリポジトリ同梱可)。"""
    if TRANSITION_PNG.is_file():
        return TRANSITION_PNG
    ffmpeg = find_tool("ffmpeg")
    TRANSITION_PNG.parent.mkdir(parents=True, exist_ok=True)
    # 生成: 生成りの単色 + 微細ノイズ + 軽いぼかしで紙の質感に寄せる
    run([ffmpeg, "-y", "-f", "lavfi",
         "-i", "color=c=0xF8F4EC:s=1024x1024:d=1:r=1",
         "-vf", "noise=alls=12:allf=u,gblur=sigma=0.6,eq=contrast=0.97:brightness=0.015",
         "-frames:v", "1", str(TRANSITION_PNG)])
    print(f"[assets] 紙テクスチャを生成しました: {TRANSITION_PNG}")
    return TRANSITION_PNG


def die(err: Exception) -> None:
    print(f"\nERROR: {err}", file=sys.stderr)
    sys.exit(1)
