function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    try { return JSON.parse(req.body); } catch (e) { return null; }
  }
  return null;
}

function allowedAzureUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ""));
    const host = u.hostname || "";
    const hostOk = host.endsWith(".openai.azure.com")
      || host.endsWith(".services.ai.azure.com")
      || host.endsWith(".models.ai.azure.com")
      || host.endsWith(".inference.ai.azure.com");
    const pathOk = u.pathname.startsWith("/openai/") || u.pathname.startsWith("/models/") || u.pathname.startsWith("/anthropic/");
    return u.protocol === "https:" && hostOk && pathOk;
  } catch (e) {
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed." } });
    return;
  }
  const body = parseBody(req);
  if (!body || typeof body.url !== "string" || !body.payload || typeof body.payload !== "object") {
    res.status(400).json({ error: { message: "Malformed request from Experiment Studio." } });
    return;
  }
  if (!allowedAzureUrl(body.url)) {
    res.status(400).json({ error: { message: "Only Azure model endpoints under /openai/... or /models/... are allowed." } });
    return;
  }

  const key = req.headers["api-key"] || process.env.AZURE_OPENAI_API_KEY || "";
  const extraHeaders = {};
  if (body.headers && typeof body.headers === "object" && typeof body.headers["anthropic-version"] === "string") {
    extraHeaders["anthropic-version"] = body.headers["anthropic-version"];
  }
  try {
    const upstream = await fetch(body.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key, ...extraHeaders },
      body: JSON.stringify(body.payload),
    });
    const text = await upstream.text();
    res.status(upstream.status).setHeader("Content-Type", upstream.headers.get("content-type") || "application/json").send(text);
  } catch (err) {
    res.status(502).json({ error: { message: `The helper could not reach Azure: ${err && err.message ? err.message : String(err)}` } });
  }
};
