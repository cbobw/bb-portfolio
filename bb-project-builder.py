#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bb-project-builder.py
~~~~~~~~~~~~~~~~~~~~~
Chen Yu-Bin (Bingle) 作品集專案建立工具。

在 src/content/portfolio/ 下建立符合 Astro content schema 的專案資料夾與 index.md。
Schema 來源：src/content.config.ts

【所需套件】
  - tkinter …… Python 標準函式庫（Windows 隨 Python 安裝；macOS/Linux 可能需額外安裝）
  - tkinterdnd2 …… 可選，用於 Hero / Detail 圖片的拖放（Drag & Drop）
      安裝：pip install tkinterdnd2
      未安裝時仍可運作，僅改以「選擇檔案」按鈕選圖。

【啟動】
  於 my-portfolio/ 根目錄執行：
      python bb-project-builder.py
"""

from __future__ import annotations

import re
import shutil
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from typing import List, Optional, Tuple

# ---------------------------------------------------------------------------
# 可選：Drag & Drop（tkinterdnd2）
# ---------------------------------------------------------------------------
try:
    from tkinterdnd2 import DND_FILES, TkinterDnD  # type: ignore

    HAS_DND = True
except ImportError:
    DND_FILES = None  # type: ignore
    TkinterDnD = None  # type: ignore
    HAS_DND = False

# ---------------------------------------------------------------------------
# 品牌色（對齊 .cursorrules）
# ---------------------------------------------------------------------------
BG = "#F1EAD7"          # Light Beige
BORDER = "#D4C4A8"      # Dark Beige
ACCENT = "#8A6BBE"      # Dark Purple（按鈕 / 強焦點）
HOVER = "#B6B9FF"       # Light Purple
TEXT = "#4A3570"        # 暗紫文字
TEXT_MUTED = "#7A6A8A"  # 次要文字
ENTRY_BG = "#FFFBF3"    # 輸入框底色
WHITE = "#FFFFFF"

# 預設分類（可於介面自訂新增）
DEFAULT_CATEGORIES = ["Fine Art", "Industrial Design"]

# 允許的圖片副檔名
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff"}

# 專案根目錄（本腳本所在位置 = my-portfolio/）
ROOT = Path(__file__).resolve().parent
PORTFOLIO_DIR = ROOT / "src" / "content" / "portfolio"


# ===========================================================================
# 工具函式
# ===========================================================================

def yaml_quote(value: str) -> str:
    """簡單 YAML 雙引號轉義。"""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def sanitize_project_id(raw: str) -> str:
    """正規化專案 ID：小寫、空白改連字號、僅保留安全字元。"""
    s = raw.strip().lower().replace(" ", "-")
    s = re.sub(r"[^a-z0-9\-_]", "", s)
    return s


def next_suggested_id() -> str:
    """掃描現有專案，建議下一個 project-XXXX。"""
    if not PORTFOLIO_DIR.exists():
        return "project-0001"
    nums: List[int] = []
    for p in PORTFOLIO_DIR.iterdir():
        if p.is_dir():
            m = re.fullmatch(r"project-(\d+)", p.name)
            if m:
                nums.append(int(m.group(1)))
    n = (max(nums) + 1) if nums else 1
    return f"project-{n:04d}"


def collect_existing_categories() -> List[str]:
    """從現有 index.md 掃描 category，與預設合併。"""
    cats = set(DEFAULT_CATEGORIES)
    if not PORTFOLIO_DIR.exists():
        return sorted(cats)
    for md in PORTFOLIO_DIR.glob("**/index.md"):
        try:
            text = md.read_text(encoding="utf-8")
        except OSError:
            continue
        m = re.search(r'^category:\s*"([^"]+)"', text, re.MULTILINE)
        if m:
            cats.add(m.group(1))
    return sorted(cats)


def parse_dnd_paths(data: str) -> List[Path]:
    """
    解析 tkinterdnd2 回傳的檔案字串。
    Windows 常見格式：{C:/path with space/a.jpg} C:/other.jpg
    """
    paths: List[Path] = []
    # 花括號包起來的路徑（含空白）
    for m in re.finditer(r"\{([^}]+)\}", data):
        paths.append(Path(m.group(1)))
    # 其餘以空白分隔的路徑
    remainder = re.sub(r"\{[^}]+\}", " ", data).strip()
    if remainder:
        for part in remainder.split():
            paths.append(Path(part))
    return [p for p in paths if p.suffix.lower() in IMAGE_EXTS]


def copy_hero(src: Path, dest_dir: Path) -> str:
    """複製 Hero 圖為 hero.<ext>，回傳 frontmatter 相對路徑。"""
    ext = src.suffix.lower()
    if ext == ".jpeg":
        ext = ".jpg"
    dest_name = f"hero{ext}"
    shutil.copy2(src, dest_dir / dest_name)
    return f"./{dest_name}"


def copy_details(sources: List[Path], dest_dir: Path) -> List[str]:
    """
    複製 Detail 圖為 detail-01.<ext>, detail-02.<ext> …
    回傳 frontmatter 相對路徑陣列。
    """
    result: List[str] = []
    for i, src in enumerate(sources, start=1):
        ext = src.suffix.lower()
        if ext == ".jpeg":
            ext = ".jpg"
        dest_name = f"detail-{i:02d}{ext}"
        shutil.copy2(src, dest_dir / dest_name)
        result.append(f"./{dest_name}")
    return result


def build_index_md(
    *,
    project_id: str,
    title: str,
    subtitle: str,
    year: str,
    category: str,
    tag: str,
    hero_rel: str,
    detail_rels: List[str],
    specs: List[Tuple[str, str]],
    body: str,
) -> str:
    """
    產生符合 src/content.config.ts schema 的 index.md。
    欄位：id, title, subtitle, year, category, tag,
          heroImage, detailImages, specifications + Markdown 內文。
    """
    lines: List[str] = ["---"]
    lines.append(f"id: {yaml_quote(project_id)}")
    lines.append(f"title: {yaml_quote(title)}")
    lines.append(f"subtitle: {yaml_quote(subtitle)}")
    lines.append(f"year: {yaml_quote(year)}")
    lines.append(f"category: {yaml_quote(category)}")
    lines.append(f"tag: {yaml_quote(tag)}")
    lines.append(f"heroImage: {yaml_quote(hero_rel)}")

    if detail_rels:
        lines.append("detailImages:")
        for rel in detail_rels:
            lines.append(f'  - "{rel}"')
    else:
        lines.append("detailImages: []")

    filled_specs = [(k.strip(), v.strip()) for k, v in specs if k.strip() or v.strip()]
    if filled_specs:
        lines.append("specifications:")
        for label, value in filled_specs:
            lines.append(f"  - label: {yaml_quote(label)}")
            lines.append(f"    value: {yaml_quote(value)}")
    else:
        lines.append("specifications: []")

    lines.append("---")
    lines.append("")
    body_text = body.strip() if body.strip() else "## 創作論述與畫布肌理\n"
    lines.append(body_text)
    lines.append("")
    return "\n".join(lines)


# ===========================================================================
# GUI
# ===========================================================================

class SpecRow:
    """規格表單列：Key + Value + 刪除。"""

    def __init__(self, parent: tk.Frame, on_remove, bg: str = BG) -> None:
        self.frame = tk.Frame(parent, bg=bg)
        self.key_var = tk.StringVar()
        self.val_var = tk.StringVar()

        self.key_entry = tk.Entry(
            self.frame,
            textvariable=self.key_var,
            bg=ENTRY_BG,
            fg=TEXT,
            insertbackground=TEXT,
            relief="flat",
            highlightthickness=1,
            highlightbackground=BORDER,
            highlightcolor=ACCENT,
            font=("Segoe UI", 10),
            width=18,
        )
        self.val_entry = tk.Entry(
            self.frame,
            textvariable=self.val_var,
            bg=ENTRY_BG,
            fg=TEXT,
            insertbackground=TEXT,
            relief="flat",
            highlightthickness=1,
            highlightbackground=BORDER,
            highlightcolor=ACCENT,
            font=("Segoe UI", 10),
            width=36,
        )
        self.btn = tk.Button(
            self.frame,
            text="✕",
            command=lambda: on_remove(self),
            bg=BORDER,
            fg=TEXT,
            activebackground=HOVER,
            activeforeground=TEXT,
            relief="flat",
            cursor="hand2",
            font=("Segoe UI", 9),
            width=3,
            padx=4,
            pady=2,
        )
        self.key_entry.pack(side="left", padx=(0, 6), ipady=4)
        self.val_entry.pack(side="left", fill="x", expand=True, padx=(0, 6), ipady=4)
        self.btn.pack(side="left")

    def pack(self, **kwargs) -> None:
        self.frame.pack(**kwargs)

    def destroy(self) -> None:
        self.frame.destroy()

    def values(self) -> Tuple[str, str]:
        return self.key_var.get(), self.val_var.get()


class ProjectBuilderApp:
    def __init__(self) -> None:
        if HAS_DND and TkinterDnD is not None:
            self.root = TkinterDnD.Tk()
        else:
            self.root = tk.Tk()

        self.root.title("Bingle · Project Builder")
        self.root.configure(bg=BG)
        self.root.minsize(640, 780)
        self.root.geometry("720x900")

        self.hero_path: Optional[Path] = None
        self.detail_paths: List[Path] = []
        self.spec_rows: List[SpecRow] = []

        self._build_styles()
        self._build_ui()
        self._prefill_defaults()

    # ---- styles -----------------------------------------------------------

    def _build_styles(self) -> None:
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure(
            "Brand.TCombobox",
            fieldbackground=ENTRY_BG,
            background=ENTRY_BG,
            foreground=TEXT,
            arrowcolor=ACCENT,
        )

    # ---- UI ---------------------------------------------------------------

    def _build_ui(self) -> None:
        # 外層可捲動
        canvas = tk.Canvas(self.root, bg=BG, highlightthickness=0)
        scrollbar = tk.Scrollbar(self.root, orient="vertical", command=canvas.yview)
        self.scroll_frame = tk.Frame(canvas, bg=BG)

        self.scroll_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all")),
        )
        canvas_window = canvas.create_window((0, 0), window=self.scroll_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)

        def _on_canvas_configure(event: tk.Event) -> None:
            canvas.itemconfig(canvas_window, width=event.width)

        canvas.bind("<Configure>", _on_canvas_configure)

        # 滑鼠滾輪（Windows）
        def _on_mousewheel(event: tk.Event) -> None:
            canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

        canvas.bind_all("<MouseWheel>", _on_mousewheel)

        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        pad = {"padx": 28, "pady": 4}
        form = self.scroll_frame

        # Header
        header = tk.Frame(form, bg=BG)
        header.pack(fill="x", padx=28, pady=(24, 8))
        tk.Label(
            header,
            text="PROJECT BUILDER",
            bg=BG,
            fg=ACCENT,
            font=("Segoe UI", 18, "bold"),
        ).pack(anchor="w")
        tk.Label(
            header,
            text="建立符合 Astro content schema 的作品資料夾與 index.md",
            bg=BG,
            fg=TEXT_MUTED,
            font=("Segoe UI", 9),
        ).pack(anchor="w", pady=(2, 0))
        if not HAS_DND:
            tk.Label(
                header,
                text="提示：未安裝 tkinterdnd2，拖放功能已停用（pip install tkinterdnd2）",
                bg=BG,
                fg="#A07040",
                font=("Segoe UI", 8),
            ).pack(anchor="w", pady=(6, 0))

        # 分隔線
        tk.Frame(form, bg=BORDER, height=1).pack(fill="x", padx=28, pady=(8, 12))

        # --- 基本欄位 ---
        self.id_var = tk.StringVar()
        self.title_var = tk.StringVar()
        self.subtitle_var = tk.StringVar()
        self.year_var = tk.StringVar(value=str(datetime.now().year))
        self.category_var = tk.StringVar()
        self.tag_var = tk.StringVar()

        self._labeled_entry(form, "專案 ID / 資料夾名稱", self.id_var, **pad)
        self._labeled_entry(form, "作品標題 (Title)", self.title_var, **pad)
        self._labeled_entry(form, "副標題 (Subtitle)", self.subtitle_var, **pad)

        # Year
        year_wrap = tk.Frame(form, bg=BG)
        year_wrap.pack(fill="x", **pad)
        self._label(year_wrap, "年份 (Year)")
        year_box = ttk.Combobox(
            year_wrap,
            textvariable=self.year_var,
            values=[str(y) for y in range(datetime.now().year + 1, 2015, -1)],
            style="Brand.TCombobox",
            font=("Segoe UI", 10),
        )
        year_box.pack(fill="x", ipady=3)

        # Category（可選可自訂）
        cat_wrap = tk.Frame(form, bg=BG)
        cat_wrap.pack(fill="x", **pad)
        self._label(cat_wrap, "分類 (Category) — 可選現有或直接輸入新分類")
        self.category_box = ttk.Combobox(
            cat_wrap,
            textvariable=self.category_var,
            values=collect_existing_categories(),
            style="Brand.TCombobox",
            font=("Segoe UI", 10),
        )
        self.category_box.pack(fill="x", ipady=3)

        self._labeled_entry(form, "標籤 (Tag)", self.tag_var, **pad)

        # --- Hero ---
        hero_wrap = tk.Frame(form, bg=BG)
        hero_wrap.pack(fill="x", **pad)
        self._label(hero_wrap, "Hero 圖片")
        hero_row = tk.Frame(hero_wrap, bg=BG)
        hero_row.pack(fill="x")
        self._btn(hero_row, "選擇檔案", self._pick_hero).pack(side="left")
        self.hero_label = tk.Label(
            hero_row,
            text="尚未選擇",
            bg=BG,
            fg=TEXT_MUTED,
            font=("Segoe UI", 9),
            anchor="w",
        )
        self.hero_label.pack(side="left", fill="x", expand=True, padx=(10, 0))

        self.hero_drop = self._make_drop_zone(
            hero_wrap,
            "將 Hero 圖片拖放到此處",
            self._on_hero_drop,
        )
        self.hero_drop.pack(fill="x", pady=(8, 0))

        # --- Detail ---
        detail_wrap = tk.Frame(form, bg=BG)
        detail_wrap.pack(fill="x", **pad)
        self._label(detail_wrap, "Detail 圖片（可多選）")
        detail_btns = tk.Frame(detail_wrap, bg=BG)
        detail_btns.pack(fill="x")
        self._btn(detail_btns, "批次加入", self._pick_details).pack(side="left")
        self._btn(detail_btns, "清空列表", self._clear_details, muted=True).pack(
            side="left", padx=(8, 0)
        )

        self.detail_listbox = tk.Listbox(
            detail_wrap,
            height=4,
            bg=ENTRY_BG,
            fg=TEXT,
            selectbackground=ACCENT,
            selectforeground=WHITE,
            relief="flat",
            highlightthickness=1,
            highlightbackground=BORDER,
            font=("Segoe UI", 9),
            activestyle="none",
        )
        self.detail_listbox.pack(fill="x", pady=(8, 0))

        self.detail_drop = self._make_drop_zone(
            detail_wrap,
            "將 Detail 圖片拖放到此處（可多檔）",
            self._on_detail_drop,
        )
        self.detail_drop.pack(fill="x", pady=(8, 0))

        # --- Specifications ---
        spec_wrap = tk.Frame(form, bg=BG)
        spec_wrap.pack(fill="x", **pad)
        spec_head = tk.Frame(spec_wrap, bg=BG)
        spec_head.pack(fill="x")
        self._label(spec_head, "規格表 (Specifications) — Key / Value")
        self._btn(spec_head, "＋ 新增列", self._add_spec_row).pack(side="right")

        self.spec_container = tk.Frame(spec_wrap, bg=BG)
        self.spec_container.pack(fill="x", pady=(6, 0))

        # 預設三列常見規格
        for label, value in [
            ("Medium / 媒材", ""),
            ("Dimensions / 尺寸", ""),
            ("Inspiration / 靈感", ""),
        ]:
            self._add_spec_row(label=label, value=value)

        # --- Body ---
        body_wrap = tk.Frame(form, bg=BG)
        body_wrap.pack(fill="both", expand=True, **pad)
        self._label(body_wrap, "作品論述與介紹（Markdown，寫入 index.md 內文）")
        self.body_text = tk.Text(
            body_wrap,
            height=10,
            bg=ENTRY_BG,
            fg=TEXT,
            insertbackground=TEXT,
            relief="flat",
            highlightthickness=1,
            highlightbackground=BORDER,
            highlightcolor=ACCENT,
            font=("Segoe UI", 10),
            wrap="word",
            padx=10,
            pady=8,
        )
        self.body_text.pack(fill="both", expand=True)
        self.body_text.insert("1.0", "## 創作論述與畫布肌理\n")

        # --- Submit ---
        action = tk.Frame(form, bg=BG)
        action.pack(fill="x", padx=28, pady=(16, 32))
        submit = tk.Button(
            action,
            text="建立新作品",
            command=self._create_project,
            bg=ACCENT,
            fg=WHITE,
            activebackground=HOVER,
            activeforeground=TEXT,
            relief="flat",
            cursor="hand2",
            font=("Segoe UI", 12, "bold"),
            padx=24,
            pady=12,
        )
        submit.pack(fill="x")

    # ---- widgets helpers --------------------------------------------------

    def _label(self, parent: tk.Misc, text: str) -> tk.Label:
        lbl = tk.Label(
            parent,
            text=text,
            bg=BG,
            fg=TEXT,
            font=("Segoe UI", 9, "bold"),
            anchor="w",
        )
        lbl.pack(anchor="w", pady=(8, 3))
        return lbl

    def _labeled_entry(
        self,
        parent: tk.Misc,
        label: str,
        var: tk.StringVar,
        **pack_kwargs,
    ) -> tk.Entry:
        wrap = tk.Frame(parent, bg=BG)
        wrap.pack(fill="x", **pack_kwargs)
        self._label(wrap, label)
        entry = tk.Entry(
            wrap,
            textvariable=var,
            bg=ENTRY_BG,
            fg=TEXT,
            insertbackground=TEXT,
            relief="flat",
            highlightthickness=1,
            highlightbackground=BORDER,
            highlightcolor=ACCENT,
            font=("Segoe UI", 10),
        )
        entry.pack(fill="x", ipady=5)
        return entry

    def _btn(
        self,
        parent: tk.Misc,
        text: str,
        command,
        muted: bool = False,
    ) -> tk.Button:
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=BORDER if muted else ACCENT,
            fg=TEXT if muted else WHITE,
            activebackground=HOVER,
            activeforeground=TEXT,
            relief="flat",
            cursor="hand2",
            font=("Segoe UI", 9),
            padx=12,
            pady=6,
        )

    def _make_drop_zone(
        self,
        parent: tk.Misc,
        hint: str,
        on_drop,
    ) -> tk.Label:
        zone = tk.Label(
            parent,
            text=hint if HAS_DND else f"{hint}（需安裝 tkinterdnd2）",
            bg="#EDE4CE",
            fg=TEXT_MUTED,
            font=("Segoe UI", 9),
            relief="flat",
            highlightthickness=1,
            highlightbackground=BORDER,
            pady=18,
        )
        if HAS_DND and DND_FILES is not None:
            zone.drop_target_register(DND_FILES)  # type: ignore[attr-defined]
            zone.dnd_bind("<<Drop>>", on_drop)  # type: ignore[attr-defined]
        return zone

    # ---- defaults ---------------------------------------------------------

    def _prefill_defaults(self) -> None:
        self.id_var.set(next_suggested_id())
        cats = collect_existing_categories()
        if cats:
            self.category_var.set(cats[0])

    # ---- hero / detail pickers --------------------------------------------

    def _pick_hero(self) -> None:
        path = filedialog.askopenfilename(
            title="選擇 Hero 圖片",
            filetypes=[
                ("Images", "*.jpg *.jpeg *.png *.webp *.gif *.tif *.tiff"),
                ("All files", "*.*"),
            ],
        )
        if path:
            self._set_hero(Path(path))

    def _set_hero(self, path: Path) -> None:
        if path.suffix.lower() not in IMAGE_EXTS:
            messagebox.showwarning("格式不符", f"不支援的圖片格式：{path.suffix}")
            return
        self.hero_path = path
        self.hero_label.config(text=path.name, fg=TEXT)

    def _on_hero_drop(self, event) -> None:
        paths = parse_dnd_paths(event.data)
        if paths:
            self._set_hero(paths[0])

    def _pick_details(self) -> None:
        paths = filedialog.askopenfilenames(
            title="選擇 Detail 圖片（可多選）",
            filetypes=[
                ("Images", "*.jpg *.jpeg *.png *.webp *.gif *.tif *.tiff"),
                ("All files", "*.*"),
            ],
        )
        if paths:
            self._add_details([Path(p) for p in paths])

    def _add_details(self, paths: List[Path]) -> None:
        for p in paths:
            if p.suffix.lower() not in IMAGE_EXTS:
                continue
            if p not in self.detail_paths:
                self.detail_paths.append(p)
                self.detail_listbox.insert("end", p.name)

    def _on_detail_drop(self, event) -> None:
        paths = parse_dnd_paths(event.data)
        if paths:
            self._add_details(paths)

    def _clear_details(self) -> None:
        self.detail_paths.clear()
        self.detail_listbox.delete(0, "end")

    # ---- specifications ---------------------------------------------------

    def _add_spec_row(self, label: str = "", value: str = "") -> None:
        row = SpecRow(self.spec_container, on_remove=self._remove_spec_row)
        if label:
            row.key_var.set(label)
        if value:
            row.val_var.set(value)
        row.pack(fill="x", pady=3)
        self.spec_rows.append(row)

    def _remove_spec_row(self, row: SpecRow) -> None:
        if row in self.spec_rows:
            self.spec_rows.remove(row)
        row.destroy()

    # ---- create -----------------------------------------------------------

    def _create_project(self) -> None:
        project_id = sanitize_project_id(self.id_var.get())
        title = self.title_var.get().strip()
        subtitle = self.subtitle_var.get().strip()
        year = self.year_var.get().strip()
        category = self.category_var.get().strip()
        tag = self.tag_var.get().strip()
        body = self.body_text.get("1.0", "end-1c")

        # 驗證
        if not project_id:
            messagebox.showerror("缺少欄位", "請填寫專案 ID / 資料夾名稱。")
            return
        if not re.match(r"^[a-z0-9][a-z0-9\-_]*$", project_id):
            messagebox.showerror(
                "ID 格式錯誤",
                "專案 ID 僅允許小寫英數、連字號與底線，且須以英數開頭。",
            )
            return
        if not title:
            messagebox.showerror("缺少欄位", "請填寫作品標題。")
            return
        if not year:
            messagebox.showerror("缺少欄位", "請填寫年份。")
            return
        if not category:
            messagebox.showerror("缺少欄位", "請選擇或輸入分類。")
            return
        if self.hero_path is None or not self.hero_path.exists():
            messagebox.showerror("缺少 Hero", "請選擇一張 Hero 圖片。")
            return

        dest_dir = PORTFOLIO_DIR / project_id
        if dest_dir.exists():
            messagebox.showerror(
                "資料夾已存在",
                f"已有同名專案：{dest_dir.relative_to(ROOT)}\n請更換專案 ID。",
            )
            return

        try:
            PORTFOLIO_DIR.mkdir(parents=True, exist_ok=True)
            dest_dir.mkdir(parents=False)

            hero_rel = copy_hero(self.hero_path, dest_dir)
            detail_rels = copy_details(self.detail_paths, dest_dir)
            specs = [row.values() for row in self.spec_rows]

            md = build_index_md(
                project_id=project_id,
                title=title,
                subtitle=subtitle,
                year=year,
                category=category,
                tag=tag,
                hero_rel=hero_rel,
                detail_rels=detail_rels,
                specs=specs,
                body=body,
            )
            (dest_dir / "index.md").write_text(md, encoding="utf-8")

        except OSError as exc:
            # 建立失敗時盡量清掉半成品資料夾
            if dest_dir.exists():
                shutil.rmtree(dest_dir, ignore_errors=True)
            messagebox.showerror("建立失敗", str(exc))
            return

        # 若為新分類，更新下拉選單
        current = list(self.category_box["values"])
        if category not in current:
            self.category_box["values"] = sorted([*current, category])

        messagebox.showinfo(
            "建立成功",
            f"已建立作品：\n{dest_dir.relative_to(ROOT)}\n\n"
            f"Hero → {hero_rel}\n"
            f"Detail → {len(detail_rels)} 張\n"
            f"index.md 已寫入。",
        )
        self._reset_form()

    def _reset_form(self) -> None:
        self.id_var.set(next_suggested_id())
        self.title_var.set("")
        self.subtitle_var.set("")
        self.year_var.set(str(datetime.now().year))
        cats = list(self.category_box["values"])
        self.category_var.set(cats[0] if cats else "")
        self.tag_var.set("")
        self.hero_path = None
        self.hero_label.config(text="尚未選擇", fg=TEXT_MUTED)
        self._clear_details()
        self.body_text.delete("1.0", "end")
        self.body_text.insert("1.0", "## 創作論述與畫布肌理\n")

        for row in list(self.spec_rows):
            row.destroy()
        self.spec_rows.clear()
        for label in ("Medium / 媒材", "Dimensions / 尺寸", "Inspiration / 靈感"):
            self._add_spec_row(label=label)

    # ---- run --------------------------------------------------------------

    def run(self) -> None:
        self.root.mainloop()


def main() -> None:
    if not (ROOT / "src" / "content.config.ts").exists():
        # 容錯：仍可執行，但警告路徑可能不對
        print(
            "[警告] 未在腳本同層找到 src/content.config.ts，"
            "請確認 bb-project-builder.py 位於 my-portfolio/ 根目錄。"
        )
    app = ProjectBuilderApp()
    app.run()


if __name__ == "__main__":
    main()
