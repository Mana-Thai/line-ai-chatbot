# -*- coding: utf-8 -*-
"""シーン素材から完成動画を組み立てる。

    python scripts/assemble.py sample-001
    python scripts/assemble.py sample-001 --keep-work   # 成功時も中間ファイルを残す

処理内容:
  1. input/scene*.mp4 を番号順に連結 (シーン数は可変)
  2. シーン間は紙テクスチャ(assets/transition.png)を挟んだ約1秒のクロスフェード
  3. テキストオーバーレイ (scene1_caption / message / couple_names + anniversary_date)
  4. BGM を loudnorm でノーマライズして全体にミックス、末尾2秒フェードアウト
  5. H.264 + AAC で縦型(1080x1920)・横型(1920x1080)を output/ に書き出し

エラー時は output/work/ に中間ファイル(フィルタグラフ・ログ・テキスト)を残す。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common
from common import (AUDIO_FADE, CAPTION_END, CAPTION_FADE, CAPTION_START, FORMATS,
                    FPS, LOUDNORM_I, LOUDNORM_LRA, LOUDNORM_TP, MESSAGE_FADE,
                    MIX_BGM_VOL, NAMES_FADE, NAMES_LEAD, PAPER_HOLD, XFADE_DUR,
                    PipelineError, ff_quote)


# ---------------------------------------------------------------------------
# alpha 式 (drawtext のフェードイン/アウト)
# ---------------------------------------------------------------------------
def alpha_fade_in(start: float, fade: float) -> str:
    # 式全体を drawtext 側で単一引用符クォートするため、カンマはそのままでよい
    return (f"if(lt(t,{start}),0,"
            f"if(lt(t,{start + fade}),(t-{start})/{fade},1))")


def alpha_fade_in_out(start: float, end: float, fade: float) -> str:
    return (f"if(lt(t,{start}),0,"
            f"if(lt(t,{start + fade}),(t-{start})/{fade},"
            f"if(lt(t,{end - fade}),1,"
            f"if(lt(t,{end}),({end}-t)/{fade},0))))")


# ---------------------------------------------------------------------------
# メッセージの自動折り返し (drawtext は折り返さないため事前に改行を入れる)
# ---------------------------------------------------------------------------
def _est_width(text: str, fontsize: int) -> float:
    """全角≈1.0em / 半角≈0.55em / 空白≈0.3em の概算で描画幅を見積もる。"""
    w = 0.0
    for c in text:
        if c == " ":
            w += 0.30
        elif ord(c) > 0x2E7F:   # CJK・かな・全角記号
            w += 1.00
        else:
            w += 0.55
    return w * fontsize


_NO_LINE_START = set("、。,.!?」』)〉》…!?ー")


def wrap_text(text: str, fontsize: int, max_width: float) -> str:
    """欧文単語は分割せず、行頭禁則(、。など)を避けつつ greedy に折り返す。"""
    lines: list[str] = []
    for para in text.split("\n"):
        # 半角の連続(欧文単語+続く空白)は1トークン、それ以外は1文字ずつ
        tokens = re.findall(r"[!-~]+\s*|.", para)
        cur = ""
        for tok in tokens:
            if not cur or _est_width(cur + tok, fontsize) <= max_width \
                    or tok.strip() in _NO_LINE_START:
                cur += tok
            else:
                lines.append(cur.rstrip())
                cur = tok.lstrip()
        lines.append(cur.rstrip())
    return "\n".join(lines)


def drawtext(font: Path, textfile: Path, fontsize: int, color: str,
             x: str, y: str, alpha: str, enable_from: float, enable_to: float,
             line_spacing: int = 0) -> str:
    return (f"drawtext=fontfile={ff_quote(font)}:textfile={ff_quote(textfile)}:"
            f"fontsize={fontsize}:fontcolor={color}:line_spacing={line_spacing}:"
            f"shadowcolor=black@0.35:shadowx=2:shadowy=2:"
            f"x={x}:y={y}:alpha='{alpha}':"
            f"enable='between(t,{enable_from},{enable_to})'")


# ---------------------------------------------------------------------------
# フィルタグラフ構築
# ---------------------------------------------------------------------------
def build_filtergraph(order: dict, scene_durs: list[float], fmt: str,
                      font: Path, work: Path) -> tuple[str, float, dict]:
    """1フォーマット分の filter_complex 文字列と総再生時間、タイミング情報を返す。"""
    W, H = FORMATS[fmt]
    n = len(scene_durs)
    parts: list[str] = []

    # --- 各シーンを正規化 (解像度 / fps / SAR / ピクセルフォーマット) ---
    if fmt == "portrait" and order["portrait_mode"] == "pad":
        fit = (f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
               f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0xF8F4EC")
    else:  # 横型、および縦型のセンタークロップ
        fit = (f"scale={W}:{H}:force_original_aspect_ratio=increase,"
               f"crop={W}:{H}")
    norm = f"{fit},fps={FPS},settb=AVTB,setsar=1,format=yuv420p"

    for i in range(n):
        parts.append(f"[{i}:v]{norm}[v{i}]")

    # --- 紙テクスチャを (n-1) 枚に複製 ---
    if n >= 2:
        paper_norm = (f"[{n}:v]scale={W}:{H}:force_original_aspect_ratio=increase,"
                      f"crop={W}:{H},fps={FPS},settb=AVTB,setsar=1,format=yuv420p")
        if n == 2:
            parts.append(f"{paper_norm}[p0]")
        else:
            outs = "".join(f"[p{j}]" for j in range(n - 1))
            parts.append(f"{paper_norm},split={n - 1}{outs}")

    # --- xfade 連鎖: scene → 紙 → scene → 紙 → ... ---
    cur = "v0"
    cur_dur = scene_durs[0]
    for i in range(1, n):
        off1 = round(cur_dur - XFADE_DUR, 3)
        parts.append(f"[{cur}][p{i - 1}]xfade=transition=fade:duration={XFADE_DUR}:offset={off1}[x{i}]")
        cur, cur_dur = f"x{i}", cur_dur + PAPER_HOLD - XFADE_DUR
        off2 = round(cur_dur - XFADE_DUR, 3)
        parts.append(f"[{cur}][v{i}]xfade=transition=fade:duration={XFADE_DUR}:offset={off2}[y{i}]")
        cur, cur_dur = f"y{i}", cur_dur + scene_durs[i] - XFADE_DUR

    total = round(cur_dur, 3)
    color = order["text_color"]
    timing: dict = {"total_duration": total}

    # --- テキストオーバーレイ ---
    texts: list[str] = []

    if order["scene1_caption"]:
        cap_txt = work / "caption.txt"
        cap_txt.write_text(order["scene1_caption"], encoding="utf-8")
        cap_end = min(CAPTION_END, scene_durs[0] - 1.0)
        texts.append(drawtext(
            font, cap_txt, fontsize=int(H * 0.030), color=color,
            x=str(int(W * 0.05)), y=f"h-text_h-{int(H * 0.05)}",
            alpha=alpha_fade_in_out(CAPTION_START, cap_end, CAPTION_FADE),
            enable_from=CAPTION_START, enable_to=cap_end))
        timing["caption"] = {"text": order["scene1_caption"],
                             "start": CAPTION_START, "end": cap_end, "fade": CAPTION_FADE}

    if order["message"]:
        msg_start = order["message_start_sec"]
        if not 0 <= msg_start < total - 1:
            raise PipelineError(
                f"message_start_sec={msg_start} が総再生時間 {total:.1f}s の範囲外です")
        msg_size = int(H * 0.048)
        wrapped = wrap_text(order["message"], msg_size, W * 0.86)
        msg_txt = work / "message.txt"
        msg_txt.write_text(wrapped, encoding="utf-8")
        texts.append(drawtext(
            font, msg_txt, fontsize=msg_size, color=color,
            x="(w-text_w)/2", y="(h-text_h)/2",
            alpha=alpha_fade_in(msg_start, MESSAGE_FADE),
            enable_from=msg_start, enable_to=total,
            line_spacing=int(msg_size * 0.5)))
        timing["message"] = {"text": order["message"],
                             "start": msg_start, "fade": MESSAGE_FADE}

    if order["show_names"]:
        names_start = round(total - NAMES_LEAD, 3)
        names_txt = work / "names.txt"
        names_txt.write_text(order["couple_names"], encoding="utf-8")
        date_txt = work / "date.txt"
        date_txt.write_text(order["anniversary_date"], encoding="utf-8")
        names_alpha = alpha_fade_in(names_start, NAMES_FADE)
        texts.append(drawtext(font, names_txt, fontsize=int(H * 0.042), color=color,
                              x="(w-text_w)/2", y=f"h-text_h-{int(H * 0.135)}",
                              alpha=names_alpha, enable_from=names_start, enable_to=total))
        texts.append(drawtext(font, date_txt, fontsize=int(H * 0.028), color=color,
                              x="(w-text_w)/2", y=f"h-text_h-{int(H * 0.09)}",
                              alpha=names_alpha, enable_from=names_start, enable_to=total))
        timing["names"] = {"start": names_start, "fade": NAMES_FADE,
                           "couple_names": order["couple_names"],
                           "anniversary_date": order["anniversary_date"]}

    # テキストを一切出さない設定でも filtergraph が途切れないよう null を通す
    parts.append(f"[{cur}]{','.join(texts) if texts else 'null'}[vout]")

    # --- 音声 ---
    bgm_idx = n + 1 if n >= 2 else 1
    fade_start = round(total - AUDIO_FADE, 3)
    if order["mix_scene_audio"]:
        # ドラマ動画向け: シーン音声(セリフ・環境音)を連結して残し、BGMを下げて重ねる。
        # 既定の転換設定(PAPER_HOLD=2*XFADE_DUR)では総尺=シーン合計なので、
        # 音声の単純連結で映像とズレない。最後に loudnorm でミックス全体を目標音量に揃える
        fmt_a = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo"
        for i in range(n):
            parts.append(f"[{i}:a]{fmt_a}[sa{i}]")
        ins = "".join(f"[sa{i}]" for i in range(n))
        parts.append(f"{ins}concat=n={n}:v=0:a=1,"
                     f"apad=whole_dur={total},atrim=0:{total},asetpts=PTS-STARTPTS[dlg]")
        parts.append(f"[{bgm_idx}:a]{fmt_a},atrim=0:{total},asetpts=PTS-STARTPTS,"
                     f"apad=whole_dur={total},volume={MIX_BGM_VOL}[bgmq]")
        parts.append(
            f"[dlg][bgmq]amix=inputs=2:duration=first:normalize=0,"
            f"loudnorm=I={LOUDNORM_I}:TP={LOUDNORM_TP}:LRA={LOUDNORM_LRA},"
            f"aresample=48000,afade=t=out:st={fade_start}:d={AUDIO_FADE}[aout]")
    else:
        # 既定: BGMのみ (loudnorm → 長さ合わせ → 末尾フェードアウト)
        parts.append(
            f"[{bgm_idx}:a]loudnorm=I={LOUDNORM_I}:TP={LOUDNORM_TP}:LRA={LOUDNORM_LRA},"
            f"aresample=48000,atrim=0:{total},asetpts=PTS-STARTPTS,"
            f"apad=whole_dur={total},afade=t=out:st={fade_start}:d={AUDIO_FADE}[aout]")
    timing["audio"] = {"loudnorm_target_i": LOUDNORM_I,
                       "mix_scene_audio": order["mix_scene_audio"],
                       "fade_out_start": fade_start, "fade_out_dur": AUDIO_FADE}

    return ";\n".join(parts), total, timing


# ---------------------------------------------------------------------------
# 組み立て本体
# ---------------------------------------------------------------------------
def assemble(order_id: str, keep_work: bool) -> None:
    ffmpeg = common.find_tool("ffmpeg")
    order = common.load_order(order_id)
    scenes = common.discover_scenes(order_id)
    font = common.find_font()
    paper = common.ensure_transition_png()

    odir = common.order_dir(order_id)
    input_dir = odir / "input"
    output_dir = odir / "output"
    work = output_dir / "work"
    work.mkdir(parents=True, exist_ok=True)

    bgm = input_dir / "bgm.mp3"
    if not bgm.is_file():
        raise PipelineError(f"BGM がありません: {bgm}")

    scene_durs = [common.probe_duration(p) for p in scenes]
    print(f"[probe] scenes={len(scenes)} " +
          " ".join(f"{p.name}={d:.2f}s" for p, d in zip(scenes, scene_durs)))

    if order["mix_scene_audio"]:
        # セリフを重ねる場合は全シーンに音声トラックが必須 (エンコード後に無音で気づくのを防ぐ)
        silent = [p.name for p in scenes
                  if not any(s.get("codec_type") == "audio"
                             for s in common.ffprobe_json(p).get("streams", []))]
        if silent:
            raise PipelineError(
                f"mix_scene_audio: true ですが音声トラックの無いシーンがあります: {', '.join(silent)}\n"
                f"  - drama_clip.py で生成したクリップは音声付きです\n"
                f"  - animate.py 等の無音素材を混ぜる場合は mix_scene_audio を false にするか、"
                f"該当シーンに無音音声を付けてください")

    # エンコード前に総再生時間を検算する (時間のかかるエンコード後に QC で落ちるのを防ぐ)
    target = order["target_duration"]
    dmin, dmax = common.duration_range(target)
    total_planned = common.planned_total(scene_durs)
    print(f"[plan]  総再生時間 {total_planned:.1f}s (目標 {target:.0f}s / 規定 {dmin:.0f}-{dmax:.0f}s)")
    if not dmin <= total_planned <= dmax:
        raise PipelineError(
            f"計算上の総再生時間 {total_planned:.1f}s が目標 {target:.0f}s の"
            f"許容範囲 ({dmin:.0f}〜{dmax:.0f}s) 外です。\n"
            f"  - シーンの追加/削除、または各シーンの尺を調整してください\n"
            f"  - この尺で良い場合は order.yaml の target_duration を変更してください")

    manifest = {
        "order_id": order_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scenes": [p.name for p in scenes],
        "scene_durations": [round(d, 3) for d in scene_durs],
        "order": {k: order[k] for k in ("message_start_sec", "scene1_caption",
                                        "couple_names", "anniversary_date",
                                        "target_duration",
                                        "output_formats", "portrait_mode")},
        "formats": {},
    }

    for fmt in order["output_formats"]:
        W, H = FORMATS[fmt]
        graph, total, timing = build_filtergraph(order, scene_durs, fmt, font, work)

        graph_file = work / f"filtergraph_{fmt}.txt"
        graph_file.write_text(graph, encoding="utf-8")

        out_path = output_dir / f"{order_id}_{fmt}_{W}x{H}.mp4"
        cmd = [ffmpeg, "-y"]
        for p in scenes:
            cmd += ["-i", str(p)]
        if len(scenes) >= 2:
            cmd += ["-loop", "1", "-t", str(PAPER_HOLD), "-r", str(FPS), "-i", str(paper)]
        cmd += ["-i", str(bgm)]
        cmd += ["-filter_complex_script", str(graph_file),
                "-map", "[vout]", "-map", "[aout]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                "-t", f"{total}", str(out_path)]

        print(f"[encode] {fmt} {W}x{H} → {out_path.name} (total {total:.1f}s)")
        common.run(cmd, log_file=work / f"ffmpeg_{fmt}.log")

        manifest["formats"][fmt] = {
            "file": out_path.name, "width": W, "height": H,
            "fps": FPS, **timing,
        }

    manifest_path = work / "assemble_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2),
                             encoding="utf-8")
    print(f"[done] manifest: {manifest_path}")

    if not keep_work:
        # 成功時はテキスト等の一時ファイルを整理 (manifest とフィルタグラフは QC 用に残す)
        for p in work.glob("*.txt"):
            if not p.name.startswith("filtergraph_"):
                p.unlink()
        for p in work.glob("ffmpeg_*.log"):
            p.unlink()

    print("\n組み立て完了。次: python scripts/qc.py " + order_id)


def main() -> None:
    ap = argparse.ArgumentParser(description="ギフト動画を組み立てる")
    ap.add_argument("order_id")
    ap.add_argument("--keep-work", action="store_true",
                    help="成功時も中間ファイル (ログ・テキスト) をすべて残す")
    args = ap.parse_args()
    try:
        assemble(args.order_id, keep_work=args.keep_work)
    except PipelineError as e:
        print("\n中間ファイルを output/work/ に残しています (デバッグ用)。", file=sys.stderr)
        common.die(e)


if __name__ == "__main__":
    main()
