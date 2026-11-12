module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: { message: "Method not allowed." } });
    return;
  }
  res.status(200).json({ ok: true, has_key: !!process.env.AZURE_OPENAI_API_KEY });
};
