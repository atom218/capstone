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
import hmac
import http.server
import json
import secrets
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
    "STUDIO_FIREBASE_ENABLED": "firebaseEnabled",
    "STUDIO_FIREBASE_WORKSPACE_ID": "firebaseWorkspaceId",
    "STUDIO_SHARED_PASSCODE": "firebasePasscode",
    "STUDIO_FIREBASE_API_KEY": "firebaseApiKey",
    "STUDIO_FIREBASE_AUTH_DOMAIN": "firebaseAuthDomain",
    "STUDIO_FIREBASE_PROJECT_ID": "firebaseProjectId",
    "STUDIO_FIREBASE_APP_ID": "firebaseAppId",
    "STUDIO_FIREBASE_STORAGE_BUCKET": "firebaseStorageBucket",
    "STUDIO_FIREBASE_MESSAGING_SENDER_ID": "firebaseMessagingSenderId",
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


# A fresh secret per run. Only the dashboard page can read it (same origin, no CORS headers),
# and every model call must echo it back, so other websites cannot use this relay or your key.
SESSION_TOKEN = secrets.token_urlsafe(32)


class QuietHandler(Handler):
    allowed_hosts = set()  # filled in once the port is known

    def _host_ok(self):
        # Blocks DNS rebinding: a hostile domain pointed at 127.0.0.1 arrives with its own Host header.
        return (self.headers.get("Host") or "").lower() in self.allowed_hosts

    def _origin_ok(self):
        origin = self.headers.get("Origin")
        return origin is None or origin.lower() in {f"http://{h}" for h in self.allowed_hosts}

    def _refuse(self, why):
        return self._json(403, {"error": {"message": f"Refused by the local helper: {why}"}})

    def do_GET(self):
        if self.path.startswith("/api/"):
            if not self._host_ok():
                return self._refuse("unexpected host.")
            if self.path == "/api/config":
                cfg = {name: os.environ[var] for var, name in CONFIG_VARS.items() if os.environ.get(var)}
                cfg["has_key"] = bool(os.environ.get("AZURE_OPENAI_API_KEY"))
                cfg["token"] = SESSION_TOKEN
                return self._json(200, cfg)
        return super().do_GET()

    def do_POST(self):
        if not self._host_ok():
            return self._refuse("unexpected host.")
        if not self._origin_ok():
            return self._refuse("requests must come from the Experiment Studio page.")
        if not (self.headers.get("Content-Type") or "").lower().startswith("application/json"):
            return self._refuse("expected a JSON request.")
        if not hmac.compare_digest(self.headers.get("X-Studio-Token", ""), SESSION_TOKEN):
            return self._refuse("missing or wrong session token. Reload the dashboard page.")
        return super().do_POST()

    def do_OPTIONS(self):
        # No cross-origin access is offered, so browsers block other sites before they can send anything.
        return self._refuse("cross-origin requests are not allowed.")

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
    QuietHandler.allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
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
