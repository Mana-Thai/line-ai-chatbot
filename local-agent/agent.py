# -*- coding: utf-8 -*-
"""自分のWindows PCの中で動かすAIエージェント。

PC内のファイル・フォルダをそのまま扱えるようにするのが目的。Claude API を呼び、
返ってきた指示をこのスクリプトが**ローカルで実行**する(ツールはクライアント実行型)。

    python agent.py                              # 対話モード(ホームフォルダのみ許可)
    python agent.py --task "請求書フォルダを整理して"   # 1回だけ実行
    python agent.py --root D:\\work --root C:\\Users\\me\\Documents
    python agent.py --gui                        # 画面操作(クリック/入力)も許可
    python agent.py --auto-approve               # 確認プロンプトなし(自己責任)

ツール:
  str_replace_based_edit_tool  ファイルの閲覧・作成・部分置換(Anthropic定義)
  search_files                 ファイル名/中身の検索
  shell                        PowerShell コマンド実行
  computer                     画面キャプチャ + マウス/キーボード操作(--gui のときだけ)

安全策:
  - --root で指定したフォルダの外は読み書きしない(既定はホームフォルダ)
  - 書き込み・シェル実行・画面操作は毎回 y/n で確認(--auto-approve で省略)
  - --read-only を付けると閲覧と検索だけになる
  - マウスを画面の左上隅に飛ばすと pyautogui のフェイルセーフで中断できる
"""
from __future__ import annotations

import argparse
import base64
import io
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import anthropic

DEFAULT_MODEL = "claude-opus-5"
GUI_TOOL_TYPE = "computer_20251124"
GUI_BETA = "computer-use-2025-11-24"

MAX_SCREEN_W, MAX_SCREEN_H = 1920, 1080   # スクショはこのサイズ以下に縮小して送る
KEEP_SCREENSHOTS = 3                      # 直近何枚のスクショを履歴に残すか
MAX_OUTPUT_CHARS = 30000                  # 1ツール結果の上限(超えたら切り詰め)
MAX_VIEW_LINES = 2000

SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", ".next", "dist",
    "AppData", "$RECYCLE.BIN", "System Volume Information", ".cache",
}
TEXT_SUFFIXES = {
    ".txt", ".md", ".csv", ".tsv", ".json", ".yaml", ".yml", ".xml", ".html",
    ".htm", ".css", ".js", ".ts", ".py", ".rb", ".go", ".java", ".c", ".h",
    ".cpp", ".cs", ".sh", ".bat", ".ps1", ".ini", ".cfg", ".toml", ".log", ".sql",
}


class ToolError(Exception):
    """ツール実行の失敗。モデルには is_error 付きで返す(会話は継続する)。"""


# --------------------------------------------------------------------------
# 権限まわり(パス制限と承認プロンプト)
# --------------------------------------------------------------------------
class Guard:
    def __init__(self, roots: list[Path], auto_approve: bool, read_only: bool) -> None:
        self.roots = roots
        self.auto_approve = auto_approve
        self.read_only = read_only

    def resolve(self, raw: str) -> Path:
        """モデルが指定したパスを許可フォルダ内に限定して解決する。"""
        if not raw:
            raise ToolError("path が空です。")
        p = Path(os.path.expandvars(str(raw))).expanduser()
        if not p.is_absolute():
            # 相対パスは許可フォルダ基準で解決する(存在するものを優先)
            candidates = [root / p for root in self.roots]
            p = next((c for c in candidates if c.exists()), candidates[0])
        try:
            rp = p.resolve()
        except OSError as e:
            raise ToolError(f"パスを解決できません: {raw} ({e})") from e
        for root in self.roots:
            if rp == root or root in rp.parents:
                return rp
        allowed = " / ".join(str(r) for r in self.roots)
        raise ToolError(
            f"{rp} は許可フォルダの外です。許可されているのは: {allowed}\n"
            "必要ならユーザーに --root で追加してもらってください。"
        )

    def approve(self, title: str, detail: str) -> None:
        """副作用のある操作の前に確認する。拒否されたら ToolError。"""
        if self.read_only:
            raise ToolError(f"読み取り専用モードのため実行できません({title})。")
        if self.auto_approve:
            return
        print(f"\n\033[33m[確認] {title}\033[0m")
        for line in detail.splitlines()[:20]:
            print(f"  {line}")
        try:
            ans = input("  実行しますか? [y/N] ").strip().lower()
        except EOFError:
            ans = ""
        if ans not in ("y", "yes"):
            raise ToolError("ユーザーがこの操作を拒否しました。別の方法を検討するか理由を尋ねてください。")


def clip(text: str, limit: int = MAX_OUTPUT_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n...(以下 {len(text) - limit} 文字を省略)"


# --------------------------------------------------------------------------
# ツール1: ファイル閲覧・編集 (Anthropic定義の text_editor)
# --------------------------------------------------------------------------
def numbered(text: str, start: int = 1) -> str:
    lines = text.splitlines()
    width = len(str(start + len(lines) - 1))
    return "\n".join(f"{str(i).rjust(width)}\t{ln}" for i, ln in enumerate(lines, start))


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        # 日本語Windowsのテキストは cp932 のことが多い
        for enc in ("cp932", "utf-16", "latin-1"):
            try:
                return path.read_text(encoding=enc)
            except (UnicodeDecodeError, UnicodeError):
                continue
        raise ToolError(f"{path} をテキストとして読めません(バイナリの可能性)。")
    except OSError as e:
        raise ToolError(f"{path} を読めません: {e}") from e


def tool_text_editor(inp: dict[str, Any], guard: Guard) -> str:
    cmd = inp.get("command")
    path = guard.resolve(inp.get("path", ""))

    if cmd == "view":
        if path.is_dir():
            try:
                entries = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
            except OSError as e:
                raise ToolError(f"{path} を一覧できません: {e}") from e
            rows = []
            for e in entries[:500]:
                if e.is_dir():
                    rows.append(f"[DIR ] {e.name}/")
                else:
                    try:
                        rows.append(f"[FILE] {e.name}  ({e.stat().st_size:,} bytes)")
                    except OSError:
                        rows.append(f"[FILE] {e.name}")
            more = "" if len(entries) <= 500 else f"\n...(他 {len(entries) - 500} 件)"
            return f"{path}\n" + "\n".join(rows) + more
        if not path.exists():
            raise ToolError(f"{path} が存在しません。")
        text = read_text(path)
        rng = inp.get("view_range")
        if rng:
            lines = text.splitlines()
            start = max(1, int(rng[0]))
            end = len(lines) if int(rng[1]) == -1 else min(len(lines), int(rng[1]))
            if start > len(lines):
                raise ToolError(f"開始行 {start} はファイルの行数 {len(lines)} を超えています。")
            return clip(numbered("\n".join(lines[start - 1:end]), start))
        lines = text.splitlines()
        if len(lines) > MAX_VIEW_LINES:
            head = numbered("\n".join(lines[:MAX_VIEW_LINES]))
            return clip(head + f"\n...(全 {len(lines)} 行。続きは view_range で指定)")
        return clip(numbered(text))

    if cmd == "create":
        body = inp.get("file_text", "")
        exists = path.exists()
        guard.approve(
            "ファイルの上書き" if exists else "ファイルの新規作成",
            f"{path}\n{len(body):,} 文字" + ("\n※既存ファイルは .bak に退避します" if exists else ""),
        )
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            if exists:
                shutil.copy2(path, path.with_suffix(path.suffix + ".bak"))
            path.write_text(body, encoding="utf-8")
        except OSError as e:
            raise ToolError(f"{path} に書き込めません: {e}") from e
        return f"書き込みました: {path} ({len(body):,} 文字)"

    if cmd == "str_replace":
        old, new = inp.get("old_str", ""), inp.get("new_str", "")
        text = read_text(path)
        n = text.count(old)
        if n == 0:
            raise ToolError("old_str が見つかりません。view で現在の内容を確認してください。")
        if n > 1:
            raise ToolError(f"old_str が {n} 箇所ありました。前後を含めて一意になるようにしてください。")
        guard.approve("ファイルの部分置換", f"{path}\n- {old.splitlines()[0][:80] if old else ''}\n+ {new.splitlines()[0][:80] if new else ''}")
        try:
            path.write_text(text.replace(old, new, 1), encoding="utf-8")
        except OSError as e:
            raise ToolError(f"{path} に書き込めません: {e}") from e
        return f"置換しました: {path}"

    if cmd == "insert":
        line_no = int(inp.get("insert_line", 0))
        addition = inp.get("insert_text", "")
        lines = read_text(path).splitlines(keepends=True)
        if not 0 <= line_no <= len(lines):
            raise ToolError(f"insert_line は 0〜{len(lines)} で指定してください。")
        guard.approve("ファイルへの挿入", f"{path} の {line_no} 行目のあと")
        if addition and not addition.endswith("\n"):
            addition += "\n"
        lines.insert(line_no, addition)
        try:
            path.write_text("".join(lines), encoding="utf-8")
        except OSError as e:
            raise ToolError(f"{path} に書き込めません: {e}") from e
        return f"挿入しました: {path} ({line_no} 行目のあと)"

    raise ToolError(f"未対応のコマンドです: {cmd}")


# --------------------------------------------------------------------------
# ツール2: 検索
# --------------------------------------------------------------------------
def tool_search(inp: dict[str, Any], guard: Guard) -> str:
    raw = inp.get("path")
    bases = [guard.resolve(raw)] if raw else list(guard.roots)
    pattern = inp.get("pattern")
    glob = inp.get("glob") or "*"
    limit = int(inp.get("max_results") or 100)

    try:
        regex = re.compile(pattern, re.IGNORECASE) if pattern else None
    except re.error as e:
        raise ToolError(f"正規表現が不正です: {e}") from e

    hits: list[str] = []
    scanned = 0
    for base in bases:
        if not base.exists():
            continue
        for path in base.rglob(glob):
            if len(hits) >= limit:
                break
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            if not path.is_file():
                continue
            scanned += 1
            if regex is None:
                hits.append(str(path))
                continue
            if path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            try:
                if path.stat().st_size > 5_000_000:
                    continue
                content = read_text(path)
            except (ToolError, OSError):
                continue
            for i, line in enumerate(content.splitlines(), 1):
                if regex.search(line):
                    hits.append(f"{path}:{i}: {line.strip()[:200]}")
                    if len(hits) >= limit:
                        break

    if not hits:
        return f"該当なし(走査 {scanned} ファイル)。glob や pattern を緩めて再試行してください。"
    header = f"{len(hits)} 件" + (f"(上限 {limit} に到達)" if len(hits) >= limit else "")
    return clip(header + "\n" + "\n".join(hits))


# --------------------------------------------------------------------------
# ツール3: シェル (Windows は PowerShell)
# --------------------------------------------------------------------------
def shell_argv(command: str) -> list[str]:
    if os.name == "nt" or shutil.which("powershell") or shutil.which("pwsh"):
        exe = shutil.which("pwsh") or shutil.which("powershell") or "powershell"
        prelude = "$ErrorActionPreference='Continue'; $OutputEncoding=[Console]::OutputEncoding=[Text.Encoding]::UTF8; "
        return [exe, "-NoProfile", "-NonInteractive", "-Command", prelude + command]
    return ["bash", "-lc", command]   # 開発用フォールバック(WindowsではPowerShellが使われる)


def tool_shell(inp: dict[str, Any], guard: Guard) -> str:
    command = (inp.get("command") or "").strip()
    if not command:
        raise ToolError("command が空です。")
    cwd = guard.resolve(inp["cwd"]) if inp.get("cwd") else guard.roots[0]
    timeout = min(int(inp.get("timeout_sec") or 120), 900)
    guard.approve("シェルコマンドの実行", f"作業フォルダ: {cwd}\n{command}")
    try:
        proc = subprocess.run(
            shell_argv(command), cwd=str(cwd), capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise ToolError(f"{timeout} 秒でタイムアウトしました。処理を分割してください。") from None
    except OSError as e:
        raise ToolError(f"シェルを起動できません: {e}") from e
    out = (proc.stdout or "") + (("\n[stderr]\n" + proc.stderr) if proc.stderr else "")
    return clip(f"exit code: {proc.returncode}\n{out.strip() or '(出力なし)'}")


# --------------------------------------------------------------------------
# ツール4: 画面操作 (--gui のときだけ)
# --------------------------------------------------------------------------
KEY_ALIASES = {
    "return": "enter", "kp_enter": "enter", "escape": "esc", "super": "win",
    "cmd": "win", "meta": "win", "control": "ctrl", "prior": "pageup",
    "next": "pagedown", "page_up": "pageup", "page_down": "pagedown",
    "back_space": "backspace", "bracketleft": "[", "bracketright": "]",
    "minus": "-", "plus": "+", "equal": "=", "semicolon": ";", "slash": "/",
    "period": ".", "comma": ",", "grave": "`", "apostrophe": "'",
}


class Screen:
    """プライマリモニタのキャプチャと操作。座標は縮小後の画像基準で受け取る。"""

    def __init__(self) -> None:
        try:
            import pyautogui
            from PIL import ImageGrab
        except ImportError as e:
            raise SystemExit(
                "--gui には追加パッケージが必要です:  pip install pyautogui pillow"
            ) from e
        pyautogui.FAILSAFE = True     # マウスを左上隅に飛ばすと中断
        pyautogui.PAUSE = 0.15
        self.pyautogui = pyautogui
        self._grab = ImageGrab.grab
        img = self._grab()
        self.real_w, self.real_h = img.size
        self.scale = min(1.0, MAX_SCREEN_W / self.real_w, MAX_SCREEN_H / self.real_h)
        self.width = int(self.real_w * self.scale)
        self.height = int(self.real_h * self.scale)

    def to_real(self, xy: Any) -> tuple[int, int]:
        try:
            x, y = int(xy[0]), int(xy[1])
        except (TypeError, ValueError, IndexError):
            raise ToolError("coordinate は [x, y] の形式で指定してください。") from None
        return int(x / self.scale), int(y / self.scale)

    def shot(self) -> dict[str, Any]:
        img = self._grab()
        if self.scale < 1.0:
            img = img.resize((self.width, self.height))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="PNG")
        return {
            "type": "image",
            "source": {"type": "base64", "media_type": "image/png",
                       "data": base64.b64encode(buf.getvalue()).decode()},
        }

    def type_text(self, text: str) -> None:
        if text.isascii():
            self.pyautogui.write(text, interval=0.01)
            return
        # 日本語などはキーストロークで打てないのでクリップボード経由で貼り付ける
        try:
            subprocess.run(shell_argv("Set-Clipboard -Value $input"), input=text,
                           text=True, encoding="utf-8", timeout=15, check=True)
        except (OSError, subprocess.SubprocessError) as e:
            raise ToolError(f"クリップボードに書き込めません: {e}") from e
        self.pyautogui.hotkey("ctrl", "v")


def tool_computer(inp: dict[str, Any], guard: Guard, screen: Screen) -> list[dict[str, Any]]:
    action = inp.get("action")
    pg = screen.pyautogui
    coord = inp.get("coordinate")

    if action in ("screenshot", "cursor_position"):
        if action == "cursor_position":
            x, y = pg.position()
            return [{"type": "text", "text": f"cursor: ({int(x * screen.scale)}, {int(y * screen.scale)})"}]
        return [screen.shot()]

    guard.approve("画面操作", f"{action}  {inp.get('text') or ''} {coord or ''}".strip())

    if action == "mouse_move":
        pg.moveTo(*screen.to_real(coord))
    elif action in ("left_click", "right_click", "middle_click", "double_click", "triple_click"):
        if coord:
            pg.moveTo(*screen.to_real(coord))
        button = "right" if action.startswith("right") else "middle" if action.startswith("middle") else "left"
        clicks = 2 if action == "double_click" else 3 if action == "triple_click" else 1
        pg.click(button=button, clicks=clicks, interval=0.08)
    elif action == "left_click_drag":
        start = inp.get("start_coordinate")
        if start:
            pg.moveTo(*screen.to_real(start))
        pg.mouseDown()
        pg.moveTo(*screen.to_real(coord), duration=0.3)
        pg.mouseUp()
    elif action == "left_mouse_down":
        pg.mouseDown()
    elif action == "left_mouse_up":
        pg.mouseUp()
    elif action == "key":
        keys = [KEY_ALIASES.get(k.strip().lower(), k.strip().lower())
                for k in (inp.get("text") or "").split("+") if k.strip()]
        if not keys:
            raise ToolError("text にキー名を指定してください(例: ctrl+s)。")
        pg.hotkey(*keys)
    elif action == "hold_key":
        key = KEY_ALIASES.get((inp.get("text") or "").lower(), (inp.get("text") or "").lower())
        pg.keyDown(key)
        time.sleep(float(inp.get("duration") or 1))
        pg.keyUp(key)
    elif action == "type":
        screen.type_text(inp.get("text") or "")
    elif action == "scroll":
        if coord:
            pg.moveTo(*screen.to_real(coord))
        amount = int(inp.get("scroll_amount") or 3) * 120
        if (inp.get("scroll_direction") or "down") in ("down", "right"):
            amount = -amount
        if (inp.get("scroll_direction") or "down") in ("left", "right"):
            pg.hscroll(-amount)
        else:
            pg.scroll(amount)
    elif action == "wait":
        time.sleep(min(float(inp.get("duration") or 1), 30))
    else:
        raise ToolError(f"未対応の action です: {action}")

    time.sleep(0.6)   # 画面が更新されるのを待ってから撮る
    return [{"type": "text", "text": f"{action} を実行しました。実行後の画面:"}, screen.shot()]


# --------------------------------------------------------------------------
# 会話ループ
# --------------------------------------------------------------------------
SYSTEM_TEMPLATE = """あなたはユーザー本人のWindows PC上で動いているアシスタントです。
このPCのファイルとアプリを使って、ユーザーの作業を実際に片づけてください。

## 環境
- OS: {osname} / ユーザー: {user} / 現在時刻: {now}
- 読み書きが許可されたフォルダ: {roots}
  この外にはアクセスできません。必要なら「--root で追加してください」と伝えること。
- モード: {mode}

## ツールの使い分け
- ファイルを探す: search_files(名前は glob、中身は pattern)。まず探してから開くこと。
- 中身を見る/直す: str_replace_based_edit_tool の view / create / str_replace / insert。
- それ以外の処理: shell(PowerShell)。Excel等の一括処理、コピー、圧縮、起動など。
- computer(画面操作)は最後の手段。ファイルやコマンドで済むことを画面クリックでやらないこと。
  GUIしか手段がないアプリを操作するときだけ使い、操作前に必ず screenshot で現状を確認する。

## 進め方
- ユーザーのPCの実データを扱っている。削除・上書き・送信など元に戻せない操作は、
  対象と件数を具体的に示してから行うこと。確認を拒否されたら別の方法を提案する。
- 推測で報告しない。実行したツールの結果に基づいて事実だけを述べる。失敗したらそのまま伝える。
- 頼まれた範囲を仕上げる。周辺の整理や改善を勝手に足さない。
- 返答は簡潔に。何をしたか・結果はどうかを最初の1文で述べ、詳細はそのあとに書く。
"""


def build_tools(screen: Screen | None) -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = [
        {"type": "text_editor_20250728", "name": "str_replace_based_edit_tool"},
        {
            "name": "search_files",
            "description": (
                "許可フォルダの中からファイルを探す。glob でファイル名、pattern でファイルの中身"
                "(正規表現)を検索する。pattern を省略するとファイル一覧だけを返す。"
                "どこにあるか分からないファイルを探すときは、まずこれを使うこと。"
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "検索を始めるフォルダ。省略時は許可フォルダ全体"},
                    "glob": {"type": "string", "description": "ファイル名パターン。例: *.xlsx, *請求*.pdf"},
                    "pattern": {"type": "string", "description": "ファイル内容を探す正規表現(テキストファイルのみ)"},
                    "max_results": {"type": "integer", "description": "最大件数(既定100)"},
                },
            },
        },
        {
            "name": "shell",
            "description": (
                "このPCのシェル(Windows では PowerShell)でコマンドを実行し、標準出力と終了コードを返す。"
                "ファイルのコピー・移動・圧縮、アプリの起動、Excel/PDF の一括処理などに使う。"
                "対話入力を求めるコマンドは使えない(応答できずタイムアウトする)。"
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "実行するコマンド"},
                    "cwd": {"type": "string", "description": "作業フォルダ(省略時は許可フォルダの先頭)"},
                    "timeout_sec": {"type": "integer", "description": "タイムアウト秒(既定120、最大900)"},
                },
                "required": ["command"],
            },
        },
    ]
    if screen:
        tools.append({
            "type": GUI_TOOL_TYPE, "name": "computer",
            "display_width_px": screen.width, "display_height_px": screen.height,
        })
    return tools


def run_tool(name: str, inp: dict[str, Any], guard: Guard, screen: Screen | None) -> Any:
    if name == "str_replace_based_edit_tool":
        return tool_text_editor(inp, guard)
    if name == "search_files":
        return tool_search(inp, guard)
    if name == "shell":
        return tool_shell(inp, guard)
    if name == "computer":
        if not screen:
            raise ToolError("画面操作は無効です(--gui を付けて起動する必要があります)。")
        return tool_computer(inp, guard, screen)
    raise ToolError(f"未知のツールです: {name}")


def prune_screenshots(messages: list[dict[str, Any]], keep: int = KEEP_SCREENSHOTS) -> None:
    """古いスクリーンショットを差し替えて、コンテキストの肥大を抑える。"""
    images: list[dict[str, Any]] = []
    for msg in messages:
        content = msg.get("content") if isinstance(msg, dict) else None
        if not isinstance(content, list):
            continue
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_result":
                for sub in block.get("content") or []:
                    if isinstance(sub, dict) and sub.get("type") == "image":
                        images.append(sub)
    for img in images[:-keep] if keep else images:
        img.clear()
        img.update({"type": "text", "text": "(古いスクリーンショットは省略されました)"})


def agent_turn(client: anthropic.Anthropic, args, guard: Guard, screen: Screen | None,
               tools: list[dict[str, Any]], messages: list[Any], system: str) -> None:
    for step in range(args.max_steps):
        kwargs: dict[str, Any] = {
            "model": args.model,
            "max_tokens": 16000,
            "system": system,
            "tools": tools,
            "messages": messages,
            "output_config": {"effort": args.effort},
        }
        if screen:
            kwargs["betas"] = [GUI_BETA]
        try:
            with client.beta.messages.stream(**kwargs) as stream:
                for event in stream:
                    if event.type == "content_block_delta" and event.delta.type == "text_delta":
                        print(event.delta.text, end="", flush=True)
                message = stream.get_final_message()
        except anthropic.APIStatusError as e:
            print(f"\n\033[31mAPIエラー ({e.status_code}): {e.message}\033[0m")
            if screen and "computer" in str(e.message):
                print("  → --model claude-sonnet-5 で試してください。")
            return
        except anthropic.APIConnectionError as e:
            print(f"\n\033[31m接続できません: {e}\033[0m")
            return
        print()
        messages.append({"role": "assistant", "content": message.content})

        if message.stop_reason == "refusal":
            print("\033[31m(このリクエストは拒否されました)\033[0m")
            return
        if message.stop_reason == "max_tokens":
            print("\033[33m(出力上限に達しました。作業を分けて依頼してください)\033[0m")
            return
        if message.stop_reason != "tool_use":
            return

        results = []
        for block in message.content:
            if block.type != "tool_use":
                continue
            print(f"\033[90m  → {block.name}\033[0m")
            try:
                output = run_tool(block.name, dict(block.input), guard, screen)
                content = output if isinstance(output, list) else [{"type": "text", "text": str(output)}]
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": content})
            except ToolError as e:
                print(f"\033[31m     {e}\033[0m")
                results.append({"type": "tool_result", "tool_use_id": block.id,
                                "content": [{"type": "text", "text": str(e)}], "is_error": True})
            except Exception as e:  # ツールの想定外エラーでループを止めない
                print(f"\033[31m     予期しないエラー: {e}\033[0m")
                results.append({"type": "tool_result", "tool_use_id": block.id,
                                "content": [{"type": "text", "text": f"予期しないエラー: {e}"}], "is_error": True})
        messages.append({"role": "user", "content": results})
        prune_screenshots(messages)
    print(f"\033[33m(ステップ上限 {args.max_steps} に達しました。--max-steps で増やせます)\033[0m")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser(description="自分のPCの中で動くAIエージェント")
    ap.add_argument("--task", help="1回だけ実行する指示(省略すると対話モード)")
    ap.add_argument("--root", action="append", default=[],
                    help="読み書きを許可するフォルダ(複数指定可。既定はホームフォルダ)")
    ap.add_argument("--gui", action="store_true", help="画面操作(クリック・キー入力)を有効にする")
    ap.add_argument("--auto-approve", action="store_true", help="確認プロンプトを出さない")
    ap.add_argument("--read-only", action="store_true", help="閲覧と検索だけに制限する")
    ap.add_argument("--model", default=os.environ.get("AGENT_MODEL", DEFAULT_MODEL))
    ap.add_argument("--effort", default="high", choices=["low", "medium", "high", "xhigh", "max"])
    ap.add_argument("--max-steps", type=int, default=40, help="1つの指示あたりのツール実行回数の上限")
    args = ap.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("環境変数 ANTHROPIC_API_KEY が設定されていません。", file=sys.stderr)
        print('  PowerShell: setx ANTHROPIC_API_KEY "sk-ant-..."  (設定後に窓を開き直す)', file=sys.stderr)
        return 1

    roots: list[Path] = []
    for raw in args.root or [str(Path.home())]:
        p = Path(os.path.expandvars(raw)).expanduser()
        if not p.exists():
            print(f"フォルダが存在しません: {p}", file=sys.stderr)
            return 1
        roots.append(p.resolve())

    screen = Screen() if args.gui else None
    guard = Guard(roots, args.auto_approve, args.read_only)
    tools = build_tools(screen)
    client = anthropic.Anthropic()
    system = SYSTEM_TEMPLATE.format(
        osname=f"{os.name} ({sys.platform})",
        user=os.environ.get("USERNAME") or os.environ.get("USER") or "unknown",
        now=time.strftime("%Y-%m-%d %H:%M"),
        roots=" / ".join(str(r) for r in roots),
        mode="読み取り専用" if args.read_only else ("自動承認(確認なし)" if args.auto_approve else "変更前に都度確認"),
    )

    print(f"\033[36mモデル: {args.model} / 許可フォルダ: {' , '.join(str(r) for r in roots)}\033[0m")
    print(f"\033[36m画面操作: {'有効 ' + str(screen.width) + 'x' + str(screen.height) if screen else '無効'}"
          f" / 承認: {'自動' if args.auto_approve else '都度確認'}\033[0m")

    messages: list[Any] = []
    if args.task:
        messages.append({"role": "user", "content": args.task})
        agent_turn(client, args, guard, screen, tools, messages, system)
        return 0

    print("\033[36m指示を入力してください(exit で終了)\033[0m")
    while True:
        try:
            user_input = input("\n\033[1mあなた>\033[0m ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if user_input.lower() in ("exit", "quit", ":q"):
            return 0
        if not user_input:
            continue
        messages.append({"role": "user", "content": user_input})
        try:
            agent_turn(client, args, guard, screen, tools, messages, system)
        except KeyboardInterrupt:
            print("\n\033[33m(中断しました)\033[0m")


if __name__ == "__main__":
    sys.exit(main())
