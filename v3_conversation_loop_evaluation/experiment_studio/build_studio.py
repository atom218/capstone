"""Build experiment-studio.html, a single self-contained page.

Reads the saved interviews, journeys, product packs and screens that are
embedded in ../conversation-loop-evaluation-dashboard.html (the v3 dashboard),
and inlines them with the studio's CSS and JavaScript. Nothing in the v3
folder is modified.

    cd v3_conversation_loop_evaluation/experiment_studio
    python3 build_studio.py
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / "conversation-loop-evaluation-dashboard.html"
OUT = HERE / "experiment-studio.html"
JS_ORDER = ["core.js", "design.js", "interviews.js", "evaluate.js", "compare.js", "app.js"]
KEEP = ["persona_texts", "format_block", "cycles", "products", "sessions", "azure_default", "insights"]


def load_v3_data():
    html = SOURCE.read_text(encoding="utf-8")
    marker = "const D = "
    start = html.index(marker) + len(marker)
    data, _ = json.JSONDecoder().raw_decode(html[start:])
    return {k: data[k] for k in KEEP if k in data}


def main():
    data = load_v3_data()
    template = (HERE / "studio_template.html").read_text(encoding="utf-8")
    css = (HERE / "studio.css").read_text(encoding="utf-8")
    js = "\n\n".join((HERE / "js" / name).read_text(encoding="utf-8") for name in JS_ORDER)
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    page = template.replace("/*__CSS__*/", css).replace("/*__JS__*/", js).replace("/*__DATA__*/", payload)
    OUT.write_text(page, encoding="utf-8")
    sessions = len(data["sessions"])
    print(f"Wrote {OUT.name} ({OUT.stat().st_size / 1024:.0f} KB) with {sessions} saved interviews.")


if __name__ == "__main__":
    main()
