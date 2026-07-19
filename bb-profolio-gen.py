#!/usr/bin/env python3
"""
Bingle Portfolio Gen — tkinter 極簡 GUI
掃描作品集變更、版本化輸出 PDF，並同步網站下載連結。
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import messagebox, scrolledtext

# —— 品牌色 ——
BG = "#F1EAD7"
BORDER = "#D4C4A8"
FOCUS = "#8A6BBE"
HOVER = "#B6B9FF"
TEXT = "#3d3d3d"

ROOT = Path(__file__).resolve().parent
PORTFOLIO_DIR = ROOT / "src" / "content" / "portfolio"
PDF_OUT_DIR = ROOT / "profolio-pdf"
PUBLIC_DOWNLOADS_DIR = ROOT / "public" / "downloads"
INDEX_ASTRO = ROOT / "src" / "pages" / "index.astro"
VENV_PYTHON = ROOT / "pdf-generator" / ".venv" / "Scripts" / "python.exe"
GEN_SCRIPT = ROOT / "pdf-generator" / "generate.py"
GTK_BIN = Path(r"C:\Program Files\GTK3-Runtime Win64\bin")

VERSION_FILE_PATTERN = re.compile(r"^bb_profolio_(?:v)?(\d+)\.(\d+)\.(\d+)\.pdf$", re.I)
DEFAULT_VERSION = (1, 0, 0)

SITE_URL = "https://cbobw.github.io/bb-portfolio/"
GIT_COMMIT_MSG = "Auto-update: Generate PDF and site content"
GIT_BRANCH = "main"


def version_filename(major: int, minor: int, patch: int) -> str:
    return f"bb_profolio_{major}.{minor}.{patch}.pdf"


def version_download_href(major: int, minor: int, patch: int) -> str:
    return f"/downloads/{version_filename(major, minor, patch)}"


def parse_title(md_path: Path) -> str:
    try:
        text = md_path.read_text(encoding="utf-8")
    except OSError:
        return md_path.parent.name
    if not text.startswith("---"):
        return md_path.parent.name
    match = re.search(r"^title:\s*[\"']?(.+?)[\"']?\s*$", text, re.MULTILINE)
    if match:
        return match.group(1).strip()
    match = re.search(r"^id:\s*[\"']?(.+?)[\"']?\s*$", text, re.MULTILINE)
    return match.group(1).strip() if match else md_path.parent.name


def scan_recent_changes(limit: int = 3) -> list[tuple[str, Path, datetime]]:
    if not PORTFOLIO_DIR.is_dir():
        return []
    entries: list[tuple[str, Path, datetime]] = []
    for md in PORTFOLIO_DIR.rglob("*.md"):
        mtime = datetime.fromtimestamp(md.stat().st_mtime)
        title = parse_title(md)
        entries.append((title, md, mtime))
    entries.sort(key=lambda x: x[2], reverse=True)
    return entries[:limit]


def format_changes_report() -> str:
    rows = scan_recent_changes(3)
    if not rows:
        return "未找到 src/content/portfolio/ 下的 Markdown 檔案。\n"
    lines = ["最近修改的作品（Top 3）", "─" * 36, ""]
    for i, (title, path, mtime) in enumerate(rows, 1):
        rel = path.relative_to(ROOT)
        lines.append(f"{i}. {title}")
        lines.append(f"   時間：{mtime.strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append(f"   檔案：{rel}")
        lines.append("")
    return "\n".join(lines)


def detect_latest_version() -> tuple[int, int, int]:
    """從 profolio-pdf/ 解析最新版本號；無檔案則 1.0.0。"""
    if not PDF_OUT_DIR.is_dir():
        return DEFAULT_VERSION

    versions: list[tuple[int, int, int]] = []
    for pdf in PDF_OUT_DIR.glob("bb_profolio*.pdf"):
        match = VERSION_FILE_PATTERN.match(pdf.name)
        if match:
            versions.append(tuple(map(int, match.groups())))

    if not versions:
        return DEFAULT_VERSION
    return max(versions)


def read_version(major: tk.Entry, minor: tk.Entry, patch: tk.Entry) -> tuple[int, int, int]:
    def as_int(entry: tk.Entry, default: int) -> int:
        raw = entry.get().strip()
        if not raw:
            return default
        return max(0, int(raw))

    return as_int(major, 1), as_int(minor, 0), as_int(patch, 0)


def build_output_path(major: int, minor: int, patch: int) -> Path:
    PDF_OUT_DIR.mkdir(parents=True, exist_ok=True)
    return PDF_OUT_DIR / version_filename(major, minor, patch)


def publish_to_public(source: Path, major: int, minor: int, patch: int) -> Path:
    """複製版本化 PDF 至 public/downloads/ 供網站讀取。"""
    PUBLIC_DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    dest = PUBLIC_DOWNLOADS_DIR / version_filename(major, minor, patch)
    shutil.copy2(source, dest)
    return dest


def update_index_download_link(major: int, minor: int, patch: int) -> str:
    """更新 index.astro 的 portfolioPdf 常數與 download 屬性。"""
    if not INDEX_ASTRO.is_file():
        raise FileNotFoundError(f"找不到 {INDEX_ASTRO}")

    filename = version_filename(major, minor, patch)
    text = INDEX_ASTRO.read_text(encoding="utf-8")

    new_text, pdf_count = re.subn(
        r"const portfolioPdf = 'bb_profolio[^']*\.pdf';",
        f"const portfolioPdf = '{filename}';",
        text,
        count=1,
    )
    if pdf_count == 0:
        raise RuntimeError("index.astro 中找不到 portfolioPdf 常數，請確認 markup 結構。")

    new_text, dl_count = re.subn(
        r'download="bb_profolio[^"]*\.pdf"',
        f'download="{filename}"',
        new_text,
        count=1,
    )
    if dl_count == 0:
        raise RuntimeError("index.astro 中找不到 download 屬性，請確認 markup 結構。")

    INDEX_ASTRO.write_text(new_text, encoding="utf-8")
    return filename


def ensure_generator() -> Path:
    if not GEN_SCRIPT.is_file():
        raise FileNotFoundError(f"找不到 {GEN_SCRIPT}")
    if VENV_PYTHON.is_file():
        return VENV_PYTHON
    return Path(sys.executable)


def run_pdf_generation(output: Path, log: scrolledtext.ScrolledText) -> None:
    python = ensure_generator()
    env = os.environ.copy()
    if GTK_BIN.is_dir():
        env["PATH"] = str(GTK_BIN) + os.pathsep + env.get("PATH", "")

    cmd = [str(python), str(GEN_SCRIPT), "-o", str(output.resolve())]
    log.insert(tk.END, f"\n▶ 執行：{' '.join(cmd)}\n")
    log.see(tk.END)
    log.update_idletasks()

    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.stdout:
        log.insert(tk.END, proc.stdout + "\n")
    if proc.stderr:
        log.insert(tk.END, proc.stderr + "\n")
    log.see(tk.END)

    if proc.returncode != 0:
        raise RuntimeError("PDF 產生失敗，請確認 pdf-generator/.venv 與 GTK3 Runtime。")
    if not output.is_file():
        raise RuntimeError(f"未找到輸出檔：{output}")


def find_git() -> str | None:
    """尋找 git 可執行檔（PATH 或 Windows 預設安裝路徑）。"""
    found = shutil.which("git")
    if found:
        return found
    for candidate in (
        r"C:\Program Files\Git\cmd\git.exe",
        r"C:\Program Files (x86)\Git\cmd\git.exe",
    ):
        if Path(candidate).is_file():
            return candidate
    return None


def run_git(
    git: str,
    args: list[str],
    log: scrolledtext.ScrolledText,
) -> subprocess.CompletedProcess[str]:
    cmd = [git, *args]
    log.insert(tk.END, f"▶ git {' '.join(args)}\n")
    log.see(tk.END)
    log.update_idletasks()

    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.stdout.strip():
        log.insert(tk.END, proc.stdout.strip() + "\n")
    if proc.stderr.strip():
        log.insert(tk.END, proc.stderr.strip() + "\n")
    log.see(tk.END)
    return proc


def git_auto_push(log: scrolledtext.ScrolledText) -> tuple[bool, str]:
    """
    執行 git add / commit / push。
    認證依賴本機已設定的 SSH 或 Git Credential Manager。
    回傳 (成功與否, 訊息)；失敗時不拋出例外。
    """
    git = find_git()
    if not git:
        return False, "找不到 git 指令，請確認已安裝 Git 並加入 PATH。"

    if not (ROOT / ".git").is_dir():
        return False, f"找不到 Git repository：{ROOT}"

    try:
        add_proc = run_git(git, ["add", "."], log)
        if add_proc.returncode != 0:
            detail = (add_proc.stderr or add_proc.stdout or "").strip()
            return False, f"git add 失敗（exit {add_proc.returncode}）\n{detail}"

        status_proc = run_git(git, ["status", "--porcelain"], log)
        if status_proc.returncode != 0:
            detail = (status_proc.stderr or status_proc.stdout or "").strip()
            return False, f"git status 失敗（exit {status_proc.returncode}）\n{detail}"

        if not status_proc.stdout.strip():
            return True, "無新變更可提交，已略過 commit / push。"

        commit_proc = run_git(git, ["commit", "-m", GIT_COMMIT_MSG], log)
        if commit_proc.returncode != 0:
            detail = (commit_proc.stderr or commit_proc.stdout or "").strip()
            return False, f"git commit 失敗（exit {commit_proc.returncode}）\n{detail}"

        push_proc = run_git(git, ["push", "origin", GIT_BRANCH], log)
        if push_proc.returncode != 0:
            detail = (push_proc.stderr or push_proc.stdout or "").strip()
            return False, f"git push 失敗（exit {push_proc.returncode}）\n{detail}"

        return True, f"已成功推送至 origin/{GIT_BRANCH}。"
    except OSError as exc:
        return False, f"Git 執行錯誤：{exc}"
    except Exception as exc:  # noqa: BLE001 — 避免 GUI 崩潰
        return False, f"Git 未預期錯誤：{exc}"


class PortfolioGenApp:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Bingle Portfolio Gen")
        self.root.configure(bg=BG)
        self.root.minsize(460, 540)
        self.root.geometry("500x600")

        self._status = tk.StringVar(value="就緒")
        self._initial_version = detect_latest_version()

        self._build_ui()

    def _build_ui(self) -> None:
        pad = {"padx": 16, "pady": 6}

        header = tk.Label(
            self.root,
            text="Bingle 作品集生成器",
            bg=BG,
            fg=FOCUS,
            font=("Segoe UI", 14, "normal"),
        )
        header.pack(pady=(18, 4))

        rule = tk.Frame(self.root, bg=BORDER, height=1)
        rule.pack(fill=tk.X, padx=16, pady=(0, 10))

        btn_scan = tk.Button(
            self.root,
            text="顯示內容更改",
            command=self.on_show_changes,
            bg=BG,
            fg=FOCUS,
            activebackground=HOVER,
            activeforeground=FOCUS,
            relief=tk.FLAT,
            highlightthickness=1,
            highlightbackground=BORDER,
            highlightcolor=FOCUS,
            padx=12,
            pady=6,
            cursor="hand2",
        )
        btn_scan.pack(anchor=tk.W, **pad)

        log_frame = tk.Frame(self.root, bg=BORDER, bd=0)
        log_frame.pack(fill=tk.BOTH, expand=True, padx=16, pady=4)

        self.log = scrolledtext.ScrolledText(
            log_frame,
            height=12,
            wrap=tk.WORD,
            bg="#faf6ec",
            fg=TEXT,
            relief=tk.FLAT,
            highlightthickness=1,
            highlightbackground=BORDER,
            font=("Consolas", 10),
        )
        self.log.pack(fill=tk.BOTH, expand=True, padx=1, pady=1)
        self.log.insert(tk.END, "按「顯示內容更改」掃描 portfolio Markdown 修改時間。\n")

        version_frame = tk.Frame(self.root, bg=BG)
        version_frame.pack(fill=tk.X, **pad)

        tk.Label(
            version_frame,
            text="版本",
            bg=BG,
            fg=BORDER,
            font=("Segoe UI", 9),
        ).pack(side=tk.LEFT, padx=(0, 6))

        maj, mino, pat = self._initial_version
        self.major = self._version_spinner(version_frame, str(maj))
        tk.Label(version_frame, text=".", bg=BG, fg=FOCUS).pack(side=tk.LEFT)
        self.minor = self._version_spinner(version_frame, str(mino))
        tk.Label(version_frame, text=".", bg=BG, fg=FOCUS).pack(side=tk.LEFT)
        self.patch = self._version_spinner(version_frame, str(pat))

        btn_pdf = tk.Button(
            self.root,
            text="輸出完整最新版 PDF",
            command=self.on_export_pdf,
            bg=FOCUS,
            fg=BG,
            activebackground=HOVER,
            activeforeground=BG,
            relief=tk.FLAT,
            padx=16,
            pady=8,
            cursor="hand2",
            font=("Segoe UI", 10),
        )
        btn_pdf.pack(pady=(8, 6))

        link_frame = tk.Frame(self.root, bg=BG)
        link_frame.pack(fill=tk.X, padx=16, pady=(4, 8))

        tk.Label(
            link_frame,
            text="網站已上線：",
            bg=BG,
            fg=TEXT,
            font=("Segoe UI", 9),
        ).pack(side=tk.LEFT)

        self.link_label = tk.Label(
            link_frame,
            text=SITE_URL,
            bg=BG,
            fg=FOCUS,
            font=("Segoe UI", 9, "underline"),
            cursor="hand2",
        )
        self.link_label.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.link_label.bind("<Button-1>", self.on_copy_link)

        tk.Label(
            link_frame,
            text="（點擊複製）",
            bg=BG,
            fg=BORDER,
            font=("Segoe UI", 8),
        ).pack(side=tk.LEFT, padx=(6, 0))

        status = tk.Label(
            self.root,
            textvariable=self._status,
            bg=BG,
            fg=BORDER,
            font=("Segoe UI", 8),
            anchor=tk.W,
        )
        status.pack(fill=tk.X, padx=16, pady=(0, 12))

    def _version_spinner(self, parent: tk.Frame, default: str) -> tk.Entry:
        group = tk.Frame(parent, bg=BG)
        group.pack(side=tk.LEFT, padx=2)

        entry = tk.Entry(
            group,
            width=3,
            justify=tk.CENTER,
            bg="#faf6ec",
            fg=FOCUS,
            relief=tk.FLAT,
            highlightthickness=1,
            highlightbackground=BORDER,
            highlightcolor=FOCUS,
            insertbackground=FOCUS,
            font=("Segoe UI", 10),
        )
        entry.insert(0, default)

        controls = tk.Frame(group, bg=BG)
        btn_up = tk.Button(
            controls,
            text="▲",
            command=lambda e=entry: self._bump_version(e, 1),
            bg=BG,
            fg=FOCUS,
            activebackground=HOVER,
            activeforeground=FOCUS,
            relief=tk.FLAT,
            width=2,
            height=1,
            padx=0,
            pady=0,
            font=("Segoe UI", 7),
            cursor="hand2",
        )
        btn_down = tk.Button(
            controls,
            text="▼",
            command=lambda e=entry: self._bump_version(e, -1),
            bg=BG,
            fg=FOCUS,
            activebackground=HOVER,
            activeforeground=FOCUS,
            relief=tk.FLAT,
            width=2,
            height=1,
            padx=0,
            pady=0,
            font=("Segoe UI", 7),
            cursor="hand2",
        )

        btn_up.pack(side=tk.TOP)
        btn_down.pack(side=tk.TOP)
        controls.pack(side=tk.LEFT, padx=(0, 2))
        entry.pack(side=tk.LEFT)

        return entry

    def _bump_version(self, entry: tk.Entry, delta: int) -> None:
        try:
            value = max(0, int(entry.get().strip() or "0") + delta)
        except ValueError:
            value = max(0, delta if delta > 0 else 0)
        entry.delete(0, tk.END)
        entry.insert(0, str(value))

    def on_show_changes(self) -> None:
        self.log.delete("1.0", tk.END)
        self.log.insert(tk.END, format_changes_report())
        self._status.set("已更新內容變更列表")

    def on_export_pdf(self) -> None:
        try:
            major, minor, patch = read_version(self.major, self.minor, self.patch)
        except ValueError:
            messagebox.showerror("版本錯誤", "Major / Minor / Patch 請輸入非負整數。")
            return

        filename = version_filename(major, minor, patch)
        output = build_output_path(major, minor, patch)
        self._status.set(f"正在產生 {filename}…")
        self.root.update_idletasks()

        try:
            run_pdf_generation(output, self.log)
            public_copy = publish_to_public(output, major, minor, patch)
            filename = update_index_download_link(major, minor, patch)
        except Exception as exc:  # noqa: BLE001 — GUI 層提示
            messagebox.showerror("PDF 失敗", str(exc))
            self._status.set("PDF 產生失敗")
            return

        self.log.insert(tk.END, f"\n✓ 已儲存：{output}\n")
        self.log.insert(tk.END, f"✓ 已複製至：{public_copy}\n")
        self.log.insert(tk.END, f"✓ 已更新 index.astro → {filename}\n")
        self.log.see(tk.END)

        self._status.set(f"正在推送 Git…")
        self.root.update_idletasks()

        git_ok, git_msg = git_auto_push(self.log)
        if git_ok:
            self.log.insert(tk.END, f"✓ Git：{git_msg}\n")
            self._status.set(f"完成 · {filename} · 已推送")
            messagebox.showinfo(
                "完成",
                f"正式版 PDF 已輸出：\n{output}\n\n"
                f"網站靜態檔：\n{public_copy}\n\n"
                f"下載連結已同步：\n{href}\n\n"
                f"Git：{git_msg}",
            )
        else:
            self.log.insert(tk.END, f"⚠ Git 推送失敗：\n{git_msg}\n")
            self._status.set(f"PDF 完成 · Git 推送失敗")
            messagebox.showwarning(
                "PDF 完成 · Git 推送失敗",
                f"PDF 與網站檔案已成功更新，但 Git 推送失敗。\n\n"
                f"詳細訊息：\n{git_msg}\n\n"
                f"請檢查 SSH / Git Credential Manager 設定後手動推送。",
            )

        self.log.see(tk.END)

    def on_copy_link(self, _event: tk.Event | None = None) -> None:
        self.root.clipboard_clear()
        self.root.clipboard_append(SITE_URL)
        self._status.set("已複製 GitHub Pages 連結")

    def run(self) -> None:
        self.root.mainloop()


def main() -> None:
    PortfolioGenApp().run()


if __name__ == "__main__":
    main()
