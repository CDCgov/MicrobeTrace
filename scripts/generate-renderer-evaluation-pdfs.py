from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"

NAVY = colors.HexColor("#17324D")
BLUE = colors.HexColor("#236A8D")
TEAL = colors.HexColor("#007C91")
GREEN = colors.HexColor("#2C8C69")
PALE_TEAL = colors.HexColor("#E8F3F5")
PALE_BLUE = colors.HexColor("#EDF3F7")
PALE_GRAY = colors.HexColor("#F4F6F8")
MID_GRAY = colors.HexColor("#62717E")
GRID = colors.HexColor("#CAD3D9")
WHITE = colors.white


def ascii_text(value: str) -> str:
    replacements = {
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2212": "-",
        "\u2192": "->",
        "\u00d7": "x",
        "\u00a0": " ",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    return value


def inline_markup(value: str) -> str:
    value = ascii_text(value.strip())
    links: list[tuple[str, str]] = []

    def hold_link(match: re.Match[str]) -> str:
        links.append((match.group(1), match.group(2)))
        return f"@@LINK{len(links) - 1}@@"

    value = re.sub(r"\[([^]]+)]\(([^)]+)\)", hold_link, value)
    value = html.escape(value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", value)
    for index, (label, url) in enumerate(links):
        safe_label = html.escape(ascii_text(label))
        safe_url = html.escape(url, quote=True)
        value = value.replace(
            f"@@LINK{index}@@",
            f"<link href='{safe_url}' color='#236A8D'>{safe_label}</link>",
        )
    return value


def make_styles(plain_language: bool) -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    body_size = 9.2 if plain_language else 8.0
    leading = body_size * (1.32 if plain_language else 1.27)
    return {
        "cover_kicker": ParagraphStyle(
            "CoverKicker",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=TEAL,
            tracking=1.1,
            alignment=TA_CENTER,
            spaceAfter=12,
        ),
        "cover_title": ParagraphStyle(
            "CoverTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=26 if plain_language else 24,
            leading=30,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceAfter=9,
        ),
        "cover_subtitle": ParagraphStyle(
            "CoverSubtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=15,
            textColor=MID_GRAY,
            alignment=TA_CENTER,
            spaceAfter=18,
        ),
        "cover_callout": ParagraphStyle(
            "CoverCallout",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=15,
            textColor=NAVY,
            alignment=TA_CENTER,
        ),
        "metric": ParagraphStyle(
            "Metric",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=17,
            leading=20,
            textColor=TEAL,
            alignment=TA_CENTER,
        ),
        "metric_label": ParagraphStyle(
            "MetricLabel",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=9,
            textColor=MID_GRAY,
            alignment=TA_CENTER,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=18,
            textColor=NAVY,
            spaceBefore=13,
            spaceAfter=7,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "H3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11.5,
            leading=14,
            textColor=TEAL,
            spaceBefore=9,
            spaceAfter=5,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=body_size,
            leading=leading,
            textColor=colors.HexColor("#263746"),
            spaceAfter=6,
        ),
        "list": ParagraphStyle(
            "List",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=body_size,
            leading=leading,
            leftIndent=13,
            firstLineIndent=-10,
            textColor=colors.HexColor("#263746"),
            spaceAfter=3,
        ),
        "code": ParagraphStyle(
            "Code",
            parent=base["Code"],
            fontName="Courier",
            fontSize=7.5,
            leading=10,
            textColor=NAVY,
            backColor=PALE_GRAY,
            borderPadding=7,
            spaceBefore=3,
            spaceAfter=7,
        ),
        "table_header": ParagraphStyle(
            "TableHeader",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.1 if plain_language else 6.5,
            leading=8.4 if plain_language else 7.8,
            textColor=WHITE,
        ),
        "table_cell": ParagraphStyle(
            "TableCell",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.1 if plain_language else 6.5,
            leading=8.6 if plain_language else 7.9,
            textColor=colors.HexColor("#263746"),
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.3,
            leading=9.5,
            textColor=MID_GRAY,
            alignment=TA_CENTER,
        ),
    }


def table_widths(rows: list[list[str]], total_width: float) -> list[float]:
    columns = len(rows[0])
    maxima = []
    for column in range(columns):
        maximum = max(len(re.sub(r"<[^>]+>", "", row[column])) for row in rows)
        maxima.append(max(8.0, min(36.0, maximum ** 0.72)))
    scale = total_width / sum(maxima)
    return [value * scale for value in maxima]


def make_table(
    rows: list[list[str]],
    styles: dict[str, ParagraphStyle],
    available_width: float,
) -> Table:
    formatted: list[list[Paragraph]] = []
    for row_index, row in enumerate(rows):
        style = styles["table_header"] if row_index == 0 else styles["table_cell"]
        formatted.append([Paragraph(inline_markup(cell), style) for cell in row])

    table = Table(
        formatted,
        colWidths=table_widths(rows, available_width),
        repeatRows=1,
        hAlign="LEFT",
        splitByRow=1,
    )
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, GRID),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for row_index in range(1, len(rows)):
        if row_index % 2 == 0:
            commands.append(("BACKGROUND", (0, row_index), (-1, row_index), PALE_GRAY))
    table.setStyle(TableStyle(commands))
    return table


def parse_markdown(
    source: str,
    styles: dict[str, ParagraphStyle],
    available_width: float,
) -> list:
    lines = source.splitlines()
    story: list = []
    paragraph: list[str] = []
    index = 0
    in_code = False
    code_lines: list[str] = []

    def flush_paragraph() -> None:
        if not paragraph:
            return
        story.append(Paragraph(inline_markup(" ".join(paragraph)), styles["body"]))
        paragraph.clear()

    while index < len(lines):
        line = lines[index].rstrip()
        stripped = line.strip()

        if stripped.startswith("```"):
            flush_paragraph()
            if in_code:
                story.append(Preformatted(ascii_text("\n".join(code_lines)), styles["code"]))
                code_lines = []
                in_code = False
            else:
                in_code = True
            index += 1
            continue

        if in_code:
            code_lines.append(line)
            index += 1
            continue

        if stripped.startswith("| ") and index + 1 < len(lines):
            separator = lines[index + 1].strip()
            if separator.startswith("|") and re.fullmatch(r"[| :\-]+", separator):
                flush_paragraph()
                raw_rows: list[list[str]] = []
                while index < len(lines) and lines[index].strip().startswith("|"):
                    current = lines[index].strip()
                    if not re.fullmatch(r"[| :\-]+", current):
                        raw_rows.append([cell.strip() for cell in current.strip("|").split("|")])
                    index += 1
                if raw_rows:
                    column_count = len(raw_rows[0])
                    normalized = [row[:column_count] + [""] * max(0, column_count - len(row)) for row in raw_rows]
                    story.append(make_table(normalized, styles, available_width))
                    story.append(Spacer(1, 7))
                continue

        if stripped.startswith("# "):
            flush_paragraph()
            index += 1
            continue
        if stripped.startswith("## "):
            flush_paragraph()
            heading = stripped[3:]
            heading_style = styles["h3"] if heading == "Technical references" else styles["h2"]
            story.append(Paragraph(inline_markup(heading), heading_style))
            index += 1
            continue
        if stripped.startswith("### "):
            flush_paragraph()
            story.append(Paragraph(inline_markup(stripped[4:]), styles["h3"]))
            index += 1
            continue
        if re.match(r"^-\s+", stripped):
            flush_paragraph()
            story.append(Paragraph(f"- {inline_markup(stripped[2:])}", styles["list"]))
            index += 1
            continue
        number_match = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if number_match:
            flush_paragraph()
            story.append(
                Paragraph(
                    f"{number_match.group(1)}. {inline_markup(number_match.group(2))}",
                    styles["list"],
                )
            )
            index += 1
            continue
        if not stripped:
            flush_paragraph()
            index += 1
            continue

        paragraph.append(stripped)
        index += 1

    flush_paragraph()
    return story


class ReportDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, report_label: str, **kwargs):
        super().__init__(filename, **kwargs)
        self.report_label = report_label
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="body",
        )
        self.addPageTemplates([
            PageTemplate(id="report", frames=[frame], onPage=self.draw_page),
        ])

    def draw_page(self, canvas, doc) -> None:
        canvas.saveState()
        if doc.page > 1:
            canvas.setFillColor(NAVY)
            canvas.rect(0, doc.pagesize[1] - 24, doc.pagesize[0], 24, stroke=0, fill=1)
            canvas.setFillColor(WHITE)
            canvas.setFont("Helvetica-Bold", 7.5)
            canvas.drawString(self.leftMargin, doc.pagesize[1] - 16, self.report_label)
        canvas.setFillColor(MID_GRAY)
        canvas.setFont("Helvetica", 7.2)
        canvas.drawRightString(doc.pagesize[0] - self.rightMargin, 17, f"Page {doc.page}")
        canvas.restoreState()


def metric_card(value: str, label: str, styles: dict[str, ParagraphStyle]) -> Table:
    card = Table(
        [[Paragraph(value, styles["metric"])], [Paragraph(label, styles["metric_label"])]],
        colWidths=[1.55 * inch],
        rowHeights=[0.38 * inch, 0.31 * inch],
    )
    card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
        ("BOX", (0, 0), (-1, -1), 0.7, GRID),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    return card


def cover_story(plain_language: bool, styles: dict[str, ParagraphStyle]) -> list:
    if plain_language:
        title = "MicrobeTrace Network Display Comparison"
        subtitle = "Cytoscape WebGL vs Sigma - plain-language summary of current benchmark evidence"
        callout = (
            "Sigma is the leading option for feature-rich networks: it is smoother and uses less complete "
            "browser and graphics memory. Cytoscape remains faster for immediate selection and group collapse."
        )
        metrics = [
            ("60.1 FPS", "Sigma pan speed"),
            ("1.20 sec", "Sigma network ready"),
            ("554 MiB", "Sigma added Chrome memory"),
            ("2.2 ms", "Cytoscape selection"),
        ]
        kicker = "MICROBETRACE | PLAIN-LANGUAGE REPORT"
    else:
        title = "Optimized Cytoscape WebGL and Sigma Evaluation"
        subtitle = "Current Chrome evidence, product-feature parity, grouping architecture, and implementation tradeoffs"
        callout = (
            "Continue with Sigma as the leading renderer candidate while retaining the renderer-neutral "
            "grouping and entity model."
        )
        metrics = [
            ("60.1 FPS", "Sigma feature-rich pan"),
            ("1.20 sec", "Sigma target ready"),
            ("554 MiB", "Sigma added working set"),
            ("328 MiB", "Sigma added graphics memory"),
        ]
        kicker = "MICROBETRACE | RENDERER EVALUATION"

    callout_box = Table(
        [[Paragraph(inline_markup(callout), styles["cover_callout"])]],
        colWidths=[6.45 * inch],
    )
    callout_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE_TEAL),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#A9CED4")),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("TOPPADDING", (0, 0), (-1, -1), 13),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 13),
    ]))

    cards = Table(
        [[metric_card(value, label, styles) for value, label in metrics]],
        colWidths=[1.65 * inch] * 4,
        hAlign="CENTER",
    )
    cards.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))

    return [
        Spacer(1, 0.55 * inch),
        Paragraph(kicker, styles["cover_kicker"]),
        Paragraph(title, styles["cover_title"]),
        Paragraph(subtitle, styles["cover_subtitle"]),
        callout_box,
        Spacer(1, 0.28 * inch),
        cards,
        Spacer(1, 0.23 * inch),
        Paragraph(
            "Primary test environment: Chrome 152 | Five runs per renderer | Complete memory measured September 14, 2026",
            styles["small"],
        ),
        PageBreak(),
    ]


def build_report(source_path: Path, output_path: Path, plain_language: bool) -> None:
    page_size = landscape(letter)
    margin = 0.43 * inch
    styles = make_styles(plain_language)
    document = ReportDocTemplate(
        str(output_path),
        report_label=(
            "MICROBETRACE NETWORK DISPLAY COMPARISON"
            if plain_language
            else "MICROBETRACE RENDERER EVALUATION"
        ),
        pagesize=page_size,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=0.48 * inch,
        bottomMargin=0.38 * inch,
        title=(
            "MicrobeTrace Network Display Comparison"
            if plain_language
            else "Optimized Cytoscape WebGL and Sigma Evaluation"
        ),
        author="MicrobeTrace renderer evaluation",
        subject="Current optimized Cytoscape WebGL and Sigma benchmark evidence",
    )
    source = source_path.read_text(encoding="utf-8")
    story = cover_story(plain_language, styles)
    story.extend(parse_markdown(source, styles, document.width))
    document.build(story)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    build_report(
        ROOT / "docs" / "performance" / "network-renderer-comparison.md",
        OUTPUT_DIR / "microbetrace-renderer-evaluation.pdf",
        plain_language=False,
    )
    build_report(
        ROOT / "docs" / "performance" / "network-renderer-comparison-plain-language.md",
        OUTPUT_DIR / "microbetrace-renderer-evaluation-plain-language.pdf",
        plain_language=True,
    )


if __name__ == "__main__":
    main()
