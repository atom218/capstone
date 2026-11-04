"""Run Experiment Studio as a local web app.

Rebuilds the page from source, serves it at http://127.0.0.1:8766 (or the next
free port), opens it in your browser, and relays live model calls to Azure
OpenAI through the same helper as ../run_dashboard.py.

    cd v3_conversation_loop_evaluation/experiment_studio
    python3 run_studio.py

Or double-click "Start Experiment Studio.command" in Finder.

The Azure key is read from a local .env file (see .env.example), from
experiment_studio/.env first and then the repo root's .env. Values already set
in your shell win. .env files are git-ignored, so the key never reaches GitHub.
The key stays in this process; the browser only learns that one exists.
"""

import errno
import http.server
import json
import os
import sys
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
from run_dashboard import Handler  # noqa: E402  (serves the v3 folder, adds /api/chat and /api/health)
import build_studio  # noqa: E402

ENV_FILES = [HERE / ".env", HERE.parent.parent / ".env"]
CONFIG_VARS = {  # sent to the page so the connection dialog is prefilled; never the key
    "AZURE_OPENAI_ENDPOINT": "endpoint",
    "AZURE_OPENAI_DEPLOYMENT": "deployment",
    "AZURE_OPENAI_API_VERSION": "apiVersion",
}


def load_env_files():
    """Read KEY=VALUE lines from the first .env files found. Shell values take precedence."""
    loaded = []
    for path in ENV_FILES:
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[len("export "):].strip()
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                value = value[1:-1]
            elif " #" in value:
                value = value.split(" #", 1)[0].rstrip()
            if key and key not in os.environ:
                os.environ[key] = value
        loaded.append(path)
    return loaded


FIRST_PORT = int(os.environ.get("STUDIO_PORT", "8766"))
PAGE = "experiment_studio/experiment-studio.html"


class QuietHandler(Handler):
    def do_GET(self):
        if self.path == "/api/config":
            cfg = {name: os.environ[var] for var, name in CONFIG_VARS.items() if os.environ.get(var)}
            cfg["has_key"] = bool(os.environ.get("AZURE_OPENAI_API_KEY"))
            return self._json(200, cfg)
        return super().do_GET()

    def end_headers(self):
        # Always serve the freshest build; nothing here should be cached between restarts.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def bind(first_port, attempts=10):
    for port in range(first_port, first_port + attempts):
        try:
            return http.server.ThreadingHTTPServer(("127.0.0.1", port), QuietHandler), port
        except OSError as exc:
            if exc.errno not in (errno.EADDRINUSE, errno.EACCES):
                raise
    raise SystemExit(f"Ports {first_port}-{first_port + attempts - 1} are all in use. Set STUDIO_PORT to another port.")


def main():
    env_files = load_env_files()
    build_studio.main()
    server, port = bind(FIRST_PORT)
    link = f"http://127.0.0.1:{port}/{PAGE}"
    where = ", ".join(str(p.relative_to(HERE.parent.parent)) for p in env_files) or "your shell"
    if os.environ.get("AZURE_OPENAI_API_KEY"):
        key = f"loaded from {where}"
    else:
        key = "not found. Copy .env.example to .env and paste the key, or paste it in the app's connection dialog"
    print(f"\nExperiment Studio is running at {link}")
    print(f"Azure API key: {key}")
    print("Keep this window open while you use it. Press Ctrl+C to stop.\n")
    if os.environ.get("STUDIO_NO_BROWSER") != "1":
        webbrowser.open(link)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
