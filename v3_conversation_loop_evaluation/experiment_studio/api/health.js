const { BACKEND_AZURE_KEY } = require("./_shared");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: { message: "Method not allowed." } });
    return;
  }
  res.status(200).json({ ok: true, has_key: !!BACKEND_AZURE_KEY });
};
