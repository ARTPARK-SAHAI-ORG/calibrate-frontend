/**
 * The model providers an agent can route benchmark requests through, shared by
 * the Connection tab picker and the "Compare models" setup dialog on the Tests
 * tab so the two lists cannot drift apart.
 */
export const BENCHMARK_PROVIDERS: Array<{ value: string; label: string }> = [
  { value: "openrouter", label: "OpenRouter (all providers)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "meta-llama", label: "Meta" },
  { value: "mistralai", label: "Mistral" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "x-ai", label: "xAI" },
  { value: "cohere", label: "Cohere" },
  { value: "qwen", label: "Qwen" },
  { value: "ai21", label: "AI21" },
];

export const DEFAULT_BENCHMARK_PROVIDER = "openrouter";
