const { BACKEND_AZURE_KEY, DEFAULT_CONNECTION } = require("./_shared");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: { message: "Method not allowed." } });
    return;
  }
  res.status(200).json({
    ...DEFAULT_CONNECTION,
    has_key: !!BACKEND_AZURE_KEY,
  });
};
