"""
Generate rokki-architecture.pdf — the printable map of how Claude,
Rokki, files, and the backend modules hang together.

Run:  python scripts/make_architecture_pdf.py
Output: ./rokki-architecture.pdf (repo root)

Keeps the ASCII diagram in a monospace font so the box characters
line up. Everything else is a normal paragraph stream.
"""

from pathlib import Path
import os

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    PageBreak,
)


# ---------------------------------------------------------------------------
# Register a Unicode-capable monospace font so box-drawing glyphs render.
# ReportLab's built-in Courier is Type-1 with a narrow repertoire; it
# turns Unicode ═ ║ ╔ chars into blanks. Courier New (TTF, shipped with
# Windows) has the full BMP and renders cleanly.
# ---------------------------------------------------------------------------

def _register_mono() -> str:
    candidates = [
        ("CourierNew", r"C:\Windows\Fonts\cour.ttf"),
        ("CourierNewBold", r"C:\Windows\Fonts\courbd.ttf"),
        ("Consolas", r"C:\Windows\Fonts\consola.ttf"),
        # Linux / Mac fallbacks if someone runs this elsewhere.
        ("DejaVuSansMono", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
        (
            "DejaVuSansMono",
            "/System/Library/Fonts/Supplemental/Courier New.ttf",
        ),
    ]
    for name, path in candidates:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(name, path))
                return name
            except Exception:
                continue
    # Last resort — built-in Courier. Box chars won't render correctly.
    return "Courier"


MONO = _register_mono()


DIAGRAM = """\
╔═══════════════════════════════════════════════════════════════════════════════╗
║                               WHO USES IT                                     ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║     👤 YOU                                    🤖 CLAUDE                       ║
║     (browser)                              (Claude Desktop / API)             ║
║         │                                         │                           ║
║         │ cookies                                 │ rk_* bearer token         ║
║         │ HTTPS                                   │ MCP over SSE              ║
╚═════════╪═════════════════════════════════════════╪═══════════════════════════╝
          │                                         │
          ▼                                         ▼
╔═══════════════════════╗                ╔═══════════════════════╗
║    Rokki WEB          ║                ║   Rokki MCP SERVER    ║
║    apps/web           ║                ║   apps/mcp-server     ║
║    Next.js 15 + SSR   ║                ║   30 tools:           ║
║                       ║                ║   • list_terminals    ║
║   /              ◄── dashboard         ║   • create_task       ║
║   /p/[ticker]    ◄── terminal shell    ║   • read_file         ║
║   /s/[slug]      ◄── space settings    ║   • ask_terminal  ◄── RAG
║   /admin         ◄── ops console       ║   • run_tool          ║
║   /settings      ◄── account           ║   • etc.              ║
╚═══════════╦═══════════╝                ╚═══════════╦═══════════╝
            │                                        │
            │ same cookie or bearer; same RLS rules  │
            │                                        │
            ▼                                        ▼
   ┌─────────────────────────────────────────────────────────┐
   │                                                         │
   │              SUPABASE  (Postgres + RLS)                 │
   │              =================================          │
   │                                                         │
   │   auth.users ── profiles (is_platform_admin)            │
   │        │                                                │
   │        │                                                │
   │   SPACES  (tenants: company / family / household)       │
   │   │   │                                                 │
   │   │   └── space_members(owner/admin/member)             │
   │   │                                                     │
   │   └── TERMINALS  (projects / matters / goals)           │
   │       │                                                 │
   │       ├── terminal_members                              │
   │       │                                                 │
   │       ├── tasks                                         │
   │       ├── messages, threads                             │
   │       ├── calendar_events (read from Google/Outlook)    │
   │       │                                                 │
   │       ├── files  ─────────► blob_key ─────────┐         │
   │       │    │                                  │         │
   │       │    ├── virus_scan_status              │         │
   │       │    ├── visibility (project|owners|    │         │
   │       │    │    custom roles + users)         │         │
   │       │    └── indexed_at                     │         │
   │       │                                       │         │
   │       ├── file_chunks (pgvector embeddings)   │         │
   │       ├── drawings + annotations + revisions  │         │
   │       ├── budget / schedule / permits /       │         │
   │       │     vendors                           │         │
   │       └── activity + domain_events  ◄── realtime publ.  │
   │                                               │         │
   │   tools, tool_versions, tool_invocations,     │         │
   │   approvals, quotas, access_tokens,           │         │
   │   api_keys (BYOK, encrypted)                  │         │
   │                                               │         │
   │   announcements, feature_flags,               │         │
   │   platform_config, webhook_destinations,      │         │
   │   emergency_access_events, impersonation_     │         │
   │   events, rate_limit_hits, session_           │         │
   │   revocations                                 │         │
   │                                               │         │
   └───────────────────────────────────────────────┼─────────┘
                                                   │
                                                   │ S3 API
                                                   ▼
                                         ┌──────────────────┐
                                         │  BLOB STORAGE    │
                                         │  MinIO (local)   │
                                         │  Azure (prod)    │
                                         │                  │
                                         │  file bytes only │
                                         └──────────────────┘
"""

WORKERS = """\
╔═══════════════════════════════════════════════════════════════════════════════╗
║                        BACKGROUND WORKERS                                     ║
║                        (polling on an interval)                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ┌─────────────────────────┐        ┌─────────────────────────┐              ║
║  │  INDEXER                │        │  TOOL-EXECUTOR          │              ║
║  │  apps/indexer           │        │  apps/tool-executor     │              ║
║  │                         │        │                         │              ║
║  │  every 5s:              │        │  on each invocation:    │              ║
║  │                         │        │                         │              ║
║  │  1. files.virus_scan_   │        │  1. quota check         │              ║
║  │     status = 'pending'  │        │  2. approval check      │              ║
║  │     │                   │        │  3. worker_thread spawn │              ║
║  │     ├─► ClamAV (:3310)  │        │  4. timeout enforced    │              ║
║  │     └─► clean / infected│        │  5. rokki.sample() ──┐  │              ║
║  │                         │        │     (Anthropic via   │  │              ║
║  │  2. files.indexed_at IS │        │      caller's keys)  │  │              ║
║  │     NULL + scan OK      │        │                      │  │              ║
║  │     │                   │        │  6. result → tool_   │  │              ║
║  │     ├─► download bytes  │        │     invocations      │  │              ║
║  │     ├─► extract text    │        │                      │  │              ║
║  │     │    (pdf/docx/md)  │        └──────────────────────┼──┘              ║
║  │     ├─► chunk           │                               │                 ║
║  │     ├─► embed (OpenAI)  │                               │                 ║
║  │     └─► insert          │                               ▼                 ║
║  │         file_chunks     │                   ╔═══════════════════╗         ║
║  │                         │                   ║  Anthropic API    ║         ║
║  │  also: calendar sync    │                   ║  (claude-sonnet,  ║         ║
║  │        every ~15min     │                   ║   haiku, etc.)    ║         ║
║  └─────────────────────────┘                   ╚═══════════════════╝         ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

GLOSSARY = """\
╔═══════════════════════════════════════════════════════════════════════════════╗
║                        HOW THE PIECES NAME EACH OTHER                         ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   SPACE        ═  a tenant. "Helios AI", "McKerley Family"                    ║
║                   Only platform admins create these.                          ║
║                                                                               ║
║   TERMINAL     ═  one working context inside a space. A project, a matter,    ║
║                   a client, a goal. "HLX", "BRKL", "MIA-LEGAL-2026".          ║
║                   Space owner/admin creates these.                            ║
║                                                                               ║
║   TASK         ═  a unit of work inside a terminal.                           ║
║                   Any terminal member creates these.                          ║
║                                                                               ║
║   FILE         ═  a blob uploaded into a terminal, scanned, indexed for RAG.  ║
║                                                                               ║
║   TOOL         ═  a piece of code in the marketplace. Runs in the executor    ║
║                   sandbox. Reachable from the UI (/tools), from MCP           ║
║                   (rokki_run_tool), and from the CLI (rokki publish).         ║
║                                                                               ║
║   MCP          ═  Model Context Protocol — the open standard Claude uses      ║
║                   to call your own data and actions. Rokki's MCP server       ║
║                   is what makes "the terminal for your projects" work         ║
║                   *inside Claude*.                                            ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""


READING_POINTS = [
    (
        "1. You + Claude read the same data.",
        "You sign in on the left, Claude connects from the right — both end "
        "up reading and writing the same Postgres, governed by the same RLS "
        "rules. Claude can't do anything in the MCP that you couldn't do in "
        "the UI, and vice versa.",
    ),
    (
        "2. The web app is the whole UI.",
        "<b>apps/web</b> is the dashboard, terminal shell, admin console, "
        "settings. Server components pull from Postgres directly; client "
        "components call <b>/api/v1/*</b> routes.",
    ),
    (
        "3. The MCP server is Claude's entry point.",
        "Same permissions model, same data. Claude Desktop points at the "
        "SSE URL, uses your <b>rk_*</b> token, and calls <b>rokki_*</b> tools.",
    ),
    (
        "4. Postgres is the hub.",
        "Spaces contain terminals contain files/tasks/etc. Files live as "
        "<i>metadata</i> in Postgres (with <b>blob_key</b> pointing to S3) "
        "and as <i>bytes</i> in MinIO/Azure.",
    ),
    (
        "5. Two background workers chew on the queue.",
        "The <b>indexer</b> scans for viruses then embeds text for RAG. The "
        "<b>tool-executor</b> runs user-published tools in sandboxed Node "
        "workers.",
    ),
    (
        "6. How Claude answers about a terminal.",
        "When Claude calls <b>ask_terminal</b>, the MCP server runs hybrid "
        "RRF search over <b>file_chunks</b>, returns the best passages as "
        "context, and Claude answers using them.",
    ),
]


def build_pdf(out_path: Path) -> None:
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=letter,
        leftMargin=0.5 * inch,
        rightMargin=0.5 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
        title="Rokki — System Architecture",
        author="Rokki",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        spaceAfter=6,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        textColor="#555555",
        spaceAfter=16,
    )
    h2_style = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        spaceBefore=12,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        alignment=TA_LEFT,
        spaceAfter=6,
    )
    mono_style = ParagraphStyle(
        "Mono",
        parent=styles["Code"],
        fontName=MONO,
        fontSize=7,
        leading=8.4,
        textColor="#000000",
        spaceBefore=4,
        spaceAfter=10,
    )

    story = []

    # Cover-ish header
    story.append(Paragraph("Rokki — System Architecture", title_style))
    story.append(
        Paragraph(
            "A one-page map of how Claude, the web app, Postgres, blob "
            "storage, and the background workers fit together. Printable. "
            "Updated as the platform evolves.",
            subtitle_style,
        )
    )

    # Diagram
    story.append(Paragraph("Map", h2_style))
    story.append(Preformatted(DIAGRAM, mono_style))

    story.append(PageBreak())
    story.append(Paragraph("Background workers", h2_style))
    story.append(Preformatted(WORKERS, mono_style))

    story.append(Paragraph("Glossary", h2_style))
    story.append(Preformatted(GLOSSARY, mono_style))

    # Reading the map
    story.append(PageBreak())
    story.append(Paragraph("Reading the map", h2_style))
    for heading, body in READING_POINTS:
        story.append(
            Paragraph(f"<b>{heading}</b>", body_style)
        )
        story.append(Paragraph(body, body_style))
        story.append(Spacer(1, 4))

    doc.build(story)


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    out = root / "rokki-architecture.pdf"
    build_pdf(out)
    print(f"Wrote {out}")
