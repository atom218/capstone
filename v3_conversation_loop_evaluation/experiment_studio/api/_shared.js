const BACKEND_AZURE_KEY = process.env.AZURE_OPENAI_API_KEY || "";

const DEFAULT_CONNECTION = {
  provider: "azure-anthropic",
  endpoint: "https://clc3650-2032-resource.services.ai.azure.com/",
  model: "claude-opus-5-5-fast",
  apiVersion: "2024-05-01-preview",
};

module.exports = { BACKEND_AZURE_KEY, DEFAULT_CONNECTION };
