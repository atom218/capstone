"""Serve the evaluation dashboard locally and relay its live calls to Azure model endpoints.

Use this when "Try It Live" shows "Failed to fetch": the browser never talks to
Azure directly, so extensions, browser security settings and editor previews
cannot block the call.

    cd v3_conversation_loop_evaluation
    python3 run_dashboard.py

Optional: export AZURE_OPENAI_API_KEY=... beforehand and the key box in the
dashboard can stay empty. Only standard-library modules are used.
"""

import http.server
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

PORT = int(os.environ.get("DASHBOARD_PORT", "8765"))
HERE = Path(__file__).resolve().parent
PAGE = "conversation-loop-evaluation-dashboard.html"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HERE), **kwargs)

    def do_GET(self):
        if self.path == "/api/health":
            return self._json(200, {"ok": True, "has_key": bool(os.environ.get("AZURE_OPENAI_API_KEY"))})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/chat":
            return self._json(404, {"error": {"message": "Unknown path."}})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            url = body["url"]
            payload = body["payload"]
            extra_headers = body.get("headers") if isinstance(body.get("headers"), dict) else {}
        except (ValueError, KeyError):
            return self._json(400, {"error": {"message": "Malformed request from the dashboard."}})

        parsed = urllib.parse.urlparse(url)
        host = parsed.hostname or ""
        allowed_host = (
            host.endswith(".openai.azure.com")
            or host.endswith(".services.ai.azure.com")
            or host.endswith(".models.ai.azure.com")
            or host.endswith(".inference.ai.azure.com")
        )
        allowed_path = parsed.path.startswith("/openai/") or parsed.path.startswith("/models/") or parsed.path.startswith("/anthropic/")
        if not url.startswith("https://") or not allowed_host or not allowed_path:
            return self._json(400, {"error": {"message": "The helper only forwards to Azure model endpoints under /openai/... or /models/..."}})

        key = self.headers.get("api-key") or os.environ.get("AZURE_OPENAI_API_KEY", "")
        fwd = {}
        if isinstance(extra_headers.get("anthropic-version"), str):
            fwd["anthropic-version"] = extra_headers["anthropic-version"]
        is_anthropic = parsed.path.startswith("/anthropic/")
        auth = {
            "api-key": key,
            "x-api-key": key,
            "Ocp-Apim-Subscription-Key": key,
        } if is_anthropic else {"api-key": key}
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={**auth, "Content-Type": "application/json", **fwd},
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return self._raw(resp.status, resp.read())
        except urllib.error.HTTPError as exc:
            return self._raw(exc.code, exc.read())
        except Exception as exc:
            return self._json(502, {"error": {"message": f"The helper could not reach Azure: {exc}"}})

    def _raw(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        self._raw(code, json.dumps(obj).encode("utf-8"))

    def log_message(self, fmt, *args):
        if self.command == "POST":
            print(f"  live call -> HTTP {args[1] if len(args) > 1 else ''}")


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    link = f"http://127.0.0.1:{PORT}/{PAGE}"
    print(f"Dashboard running at {link}\nKeep this window open while you use it. Press Ctrl+C to stop.")
    webbrowser.open(link)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
