#!/usr/bin/env python3
"""
Bingle Portfolio PDF Generator
掃描 src/content/portfolio/ 與 biography.md，以 WeasyPrint 輸出 A4 作品集 PDF。
"""

from __future__ import annotations

import argparse
import base64
import html
import mimetypes
import re
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import markdown
import yaml
from weasyprint import CSS, HTML

# —— 品牌色（.cursorrules）——
BG = "#F1EAD7"
BORDER = "#D4C4A8"
FOCUS = "#8A6BBE"
HOVER = "#B6B9FF"

REPO_ROOT = Path(__file__).resolve().parent.parent
PORTFOLIO_DIR = REPO_ROOT / "src" / "content" / "portfolio"
BIOGRAPHY_PATH = REPO_ROOT / "src" / "content" / "profile" / "biography.md"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "output" / "bingle-portfolio.pdf"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


@dataclass
class Project:
    folder: Path
    meta: dict
    body_html: str
    hero_path: Path | None
    detail_paths: list[Path] = field(default_factory=list)

    @property
    def has_details(self) -> bool:
        return len(self.detail_paths) > 0


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """解析 YAML frontmatter（--- ... ---）。"""
    if not text.startswith("---"):
        return {}, text
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.DOTALL)
    if not match:
        return {}, text
    meta_raw, body = match.group(1), match.group(2)
    meta = yaml.safe_load(meta_raw) or {}
    if not isinstance(meta, dict):
        meta = {}
    return meta, body


def md_to_html(text: str) -> str:
    return markdown.markdown(
        text.strip(),
        extensions=["extra", "sane_lists", "nl2br"],
        output_format="html5",
    )


def resolve_image(folder: Path, ref: str | None) -> Path | None:
    if not ref:
        return None
    path = (folder / ref).resolve()
    if path.is_file():
        return path
    # 容錯：去掉 ./
    path = (folder / Path(ref).name).resolve()
    return path if path.is_file() else None


def find_hero(folder: Path, meta: dict) -> Path | None:
    hero = resolve_image(folder, meta.get("heroImage"))
    if hero:
        return hero
    for name in ("hero.jpg", "hero.jpeg", "hero.png", "hero.webp"):
        candidate = folder / name
        if candidate.is_file():
            return candidate
    return None


def find_details(folder: Path, meta: dict) -> list[Path]:
    details: list[Path] = []
    raw = meta.get("detailImages") or []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, str):
                p = resolve_image(folder, item)
                if p:
                    details.append(p)

    # 同層 detail.jpg / detail-*.jpg 等（frontmatter 為空時仍可掃描）
    if not details:
        patterns = ("detail.jpg", "detail.jpeg", "detail.png", "detail.webp")
        for name in patterns:
            p = folder / name
            if p.is_file():
                details.append(p)
        for p in sorted(folder.glob("detail-*.*")):
            if p.suffix.lower() in IMAGE_EXTS and p not in details:
                details.append(p)
        for p in sorted(folder.glob("detail*.*")):
            if p.suffix.lower() in IMAGE_EXTS and p.name.lower() != "detail" and p not in details:
                # 避免重複；允許 detail1.png
                if re.match(r"detail[\w.-]+\.(jpg|jpeg|png|webp|gif)$", p.name, re.I):
                    if p not in details:
                        details.append(p)

    # 去重並維持順序
    seen: set[Path] = set()
    unique: list[Path] = []
    for p in details:
        if p not in seen:
            seen.add(p)
            unique.append(p)
    return unique


def file_to_data_uri(path: Path) -> str:
    mime, _ = mimetypes.guess_type(str(path))
    if not mime:
        mime = "image/jpeg"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{data}"


def scan_projects(portfolio_dir: Path) -> list[Project]:
    projects: list[Project] = []
    if not portfolio_dir.is_dir():
        raise FileNotFoundError(f"找不到作品集目錄：{portfolio_dir}")

    for folder in sorted(portfolio_dir.iterdir()):
        if not folder.is_dir():
            continue
        index = folder / "index.md"
        if not index.is_file():
            print(f"[skip] {folder.name}: 無 index.md")
            continue
        meta, body = parse_frontmatter(index.read_text(encoding="utf-8"))
        hero = find_hero(folder, meta)
        details = find_details(folder, meta)
        # frontmatter 明確空陣列 → 不使用掃描到的 detail（遵循 SSOT）
        if isinstance(meta.get("detailImages"), list) and len(meta["detailImages"]) == 0:
            details = []

        projects.append(
            Project(
                folder=folder,
                meta=meta,
                body_html=md_to_html(body),
                hero_path=hero,
                detail_paths=details,
            )
        )
        print(
            f"[ok] {folder.name}: hero={'yes' if hero else 'no'}, "
            f"details={len(details)}"
        )
    return projects


def load_biography(path: Path) -> tuple[dict, str]:
    if not path.is_file():
        print(f"[warn] 找不到 biography：{path}")
        return {}, "<p>Biography unavailable.</p>"
    meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
    return meta, md_to_html(body)


def esc(value: object) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def render_specs(specs: list) -> str:
    if not specs:
        return ""
    rows = []
    for item in specs:
        if not isinstance(item, dict):
            continue
        label = esc(item.get("label", ""))
        value = esc(item.get("value", ""))
        rows.append(
            f'<div class="spec"><dt>{label}</dt><dd>{value}</dd></div>'
        )
    if not rows:
        return ""
    return f'<dl class="specs">{"".join(rows)}</dl>'


def render_cover() -> str:
    return f"""
    <section class="page cover">
      <div class="cover-frame">
        <p class="eyebrow">Portfolio</p>
        <h1>Bingle</h1>
        <p class="cover-sub">陳禹賓 · Chen Yu-Bin</p>
        <p class="cover-tag">Industrial Design · Fine Art</p>
        <div class="cover-rule"></div>
        <p class="cover-meta">{date.today().isoformat()}</p>
      </div>
    </section>
    """


def render_biography(meta: dict, body_html: str) -> str:
    title = esc(meta.get("title") or "About Me")
    return f"""
    <section class="page bio">
      <header class="page-head">
        <p class="eyebrow">Biography</p>
        <h2>{title}</h2>
      </header>
      <div class="prose">{body_html}</div>
    </section>
    """


def render_project(project: Project, index: int) -> str:
    m = project.meta
    title = esc(m.get("title") or project.folder.name)
    subtitle = esc(m.get("subtitle") or "")
    year = esc(m.get("year") or "")
    category = esc(m.get("category") or "")
    tag = esc(m.get("tag") or "")
    pid = esc(m.get("id") or project.folder.name)

    hero_html = ""
    if project.hero_path:
        uri = file_to_data_uri(project.hero_path)
        hero_html = f'<img class="hero-img" src="{uri}" alt="{title}" />'
    else:
        hero_html = '<div class="hero-placeholder">No Hero Image</div>'

    details_html = ""
    layout_class = "project--hero-only"
    if project.has_details:
        layout_class = "project--with-details"
        cells = []
        for i, path in enumerate(project.detail_paths[:4]):
            uri = file_to_data_uri(path)
            cells.append(
                f'<figure class="detail-cell">'
                f'<img src="{uri}" alt="{title} detail {i + 1}" />'
                f"</figure>"
            )
        details_html = f'<div class="detail-grid">{"".join(cells)}</div>'

    specs_html = render_specs(m.get("specifications") or [])

    return f"""
    <section class="page project {layout_class}">
      <header class="page-head">
        <p class="eyebrow">{category} · {year} · {tag}</p>
        <h2>{title}</h2>
        <p class="subtitle">{subtitle}</p>
        <p class="project-id">{pid}</p>
      </header>

      <div class="media-block">
        <figure class="hero-figure">{hero_html}</figure>
        {details_html}
      </div>

      {specs_html}
      <div class="prose body">{project.body_html}</div>
      <footer class="page-foot">
        <span>{index:02d}</span>
        <span>Bingle Portfolio</span>
      </footer>
    </section>
    """


def build_html(projects: list[Project], bio_meta: dict, bio_html: str) -> str:
    project_pages = "\n".join(
        render_project(p, i + 1) for i, p in enumerate(projects)
    )
    return f"""<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="utf-8" />
  <title>Bingle Portfolio</title>
</head>
<body>
  {render_cover()}
  {render_biography(bio_meta, bio_html)}
  {project_pages}
</body>
</html>
"""


def build_css() -> str:
    return f"""
@page {{
  size: A4;
  margin: 14mm 16mm 16mm 16mm;
  background: {BG};

  @bottom-center {{
    content: counter(page);
    font-family: "IBM Plex Sans", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
    font-size: 8pt;
    color: {BORDER};
    letter-spacing: 0.12em;
  }}
}}

* {{
  box-sizing: border-box;
}}

html, body {{
  margin: 0;
  padding: 0;
  background: {BG};
  color: {FOCUS};
  font-family: "IBM Plex Sans", "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif;
  font-size: 10pt;
  line-height: 1.55;
}}

.page {{
  page-break-after: always;
  position: relative;
  min-height: 250mm;
}}

.page:last-child {{
  page-break-after: auto;
}}

.eyebrow {{
  margin: 0 0 6pt;
  font-size: 8pt;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: {BORDER};
}}

h1, h2, h3 {{
  margin: 0;
  font-weight: 500;
  color: {FOCUS};
}}

h1 {{
  font-size: 42pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}}

h2 {{
  font-size: 18pt;
  letter-spacing: 0.02em;
}}

.subtitle {{
  margin: 4pt 0 0;
  color: {BORDER};
  font-size: 10pt;
}}

.project-id {{
  margin: 8pt 0 0;
  font-size: 8pt;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: {BORDER};
}}

/* Cover */
.cover {{
  display: flex;
  align-items: center;
  justify-content: center;
}}

.cover-frame {{
  width: 100%;
  border: 1pt solid {BORDER};
  padding: 28mm 18mm;
  text-align: center;
}}

.cover-sub {{
  margin: 10pt 0 0;
  font-size: 12pt;
  color: {FOCUS};
}}

.cover-tag {{
  margin: 6pt 0 0;
  font-size: 9pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: {BORDER};
}}

.cover-rule {{
  width: 48pt;
  height: 1pt;
  background: {FOCUS};
  margin: 18pt auto;
}}

.cover-meta {{
  margin: 0;
  font-size: 8pt;
  letter-spacing: 0.14em;
  color: {BORDER};
}}

/* Biography */
.bio .prose {{
  margin-top: 14pt;
  border-top: 1pt solid {BORDER};
  padding-top: 12pt;
}}

.prose h1, .prose h2, .prose h3 {{
  font-size: 11pt;
  margin: 12pt 0 6pt;
  color: {FOCUS};
}}

.prose p, .prose li {{
  color: {FOCUS};
  font-size: 9.5pt;
}}

.prose ul {{
  padding-left: 14pt;
}}

.prose blockquote {{
  margin: 10pt 0;
  padding: 8pt 12pt;
  border-left: 2pt solid {FOCUS};
  color: {FOCUS};
  background: transparent;
}}

.prose strong {{
  font-weight: 600;
  color: {FOCUS};
}}

/* Project layout */
.page-head {{
  margin-bottom: 12pt;
  padding-bottom: 8pt;
  border-bottom: 1pt solid {BORDER};
}}

.media-block {{
  margin: 10pt 0 12pt;
}}

.hero-figure {{
  margin: 0;
  border: 1pt solid {BORDER};
  background: {BG};
  overflow: hidden;
}}

.hero-img {{
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
}}

.hero-placeholder {{
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80mm;
  color: {BORDER};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: 9pt;
}}

/* 有 detail：雙欄壓縮 hero */
.project--with-details .media-block {{
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 8pt;
  align-items: start;
}}

.project--with-details .hero-img {{
  max-height: 120mm;
  object-fit: cover;
}}

.detail-grid {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6pt;
}}

.detail-cell {{
  margin: 0;
  border: 1pt solid {BORDER};
  overflow: hidden;
  aspect-ratio: 1;
}}

.detail-cell img {{
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}}

/* 無 detail：hero 放大填補 */
.project--hero-only .hero-figure {{
  width: 100%;
}}

.project--hero-only .hero-img {{
  max-height: 165mm;
  width: 100%;
  object-fit: contain;
  object-position: center;
  background: {BG};
}}

.specs {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8pt 14pt;
  margin: 0 0 12pt;
  padding: 10pt 0;
  border-top: 1pt solid {BORDER};
  border-bottom: 1pt solid {BORDER};
}}

.spec {{
  margin: 0;
}}

.spec dt {{
  font-size: 7.5pt;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: {BORDER};
  margin: 0 0 2pt;
}}

.spec dd {{
  margin: 0;
  font-size: 9pt;
  color: {FOCUS};
}}

.body {{
  margin-top: 4pt;
}}

.page-foot {{
  position: running(pagefoot);
  display: flex;
  justify-content: space-between;
  margin-top: 16pt;
  padding-top: 8pt;
  border-top: 1pt solid {BORDER};
  font-size: 8pt;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: {BORDER};
}}
"""


def generate(output: Path, portfolio_dir: Path, biography_path: Path) -> Path:
    projects = scan_projects(portfolio_dir)
    if not projects:
        raise RuntimeError("未找到任何作品專案，請確認 src/content/portfolio/")

    bio_meta, bio_html = load_biography(biography_path)
    document = build_html(projects, bio_meta, bio_html)
    css = CSS(string=build_css())

    output.parent.mkdir(parents=True, exist_ok=True)
    HTML(string=document, base_url=str(REPO_ROOT)).write_pdf(
        target=str(output),
        stylesheets=[css],
    )
    return output


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate Bingle A4 portfolio PDF")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"輸出路徑（預設：{DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--portfolio",
        type=Path,
        default=PORTFOLIO_DIR,
        help="作品集目錄",
    )
    parser.add_argument(
        "--biography",
        type=Path,
        default=BIOGRAPHY_PATH,
        help="biography.md 路徑",
    )
    args = parser.parse_args(argv)

    try:
        path = generate(args.output.resolve(), args.portfolio.resolve(), args.biography.resolve())
    except Exception as exc:  # noqa: BLE001 — CLI 頂層回報
        print(f"[error] {exc}", file=sys.stderr)
        return 1

    print(f"\n[done] PDF 已輸出：{path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
