export const WHATSAPP_INVITE_URL =
  "https://chat.whatsapp.com/JygDNcZ943a3VmZDXYMg5Z";

/** Luma calendar for the Sahai @ARTPARK webinars, where the team teaches AI
 * evaluation. Linked from the landing footer; Luma's own Follow button is how
 * a reader subscribes. */
export const WEBINARS_URL = "https://luma.com/artpark-sahai";

/** Official ARTPARK marketing site (used on landing eyebrow etc.). */
export const ARTPARK_WEBSITE_URL = "https://www.artpark.in/";

/** Open-source Calibrate CLI repo (landing header + open-source section). */
export const GITHUB_REPO_URL =
  "https://github.com/artpark-sahai-org/";

/** Sarvam's "Evaluating Indian Language ASR" blog — the reference for the
 * LLM-based STT judge metrics (LLM-WER, LLM-CER, Intent, Entity). Linked from
 * the STT eval form's Sarvam-judges toggle and the STT results About tab. */
export const SARVAM_ASR_BLOG_URL =
  "https://www.sarvam.ai/blogs/evaluating-indian-language-asr";

/** Pipecat's STT benchmark — the reference for Semantic WER, an LLM-judged
 * word error rate that ignores errors which wouldn't change an agent's
 * understanding. Linked from the STT results About tab. */
export const PIPECAT_SEMANTIC_WER_URL =
  "https://github.com/pipecat-ai/stt-benchmark#semantic-wer";

/** Pipecat's STT benchmark — the reference for TTFS (Time To Final Segment),
 * the streaming latency from when the user stops speaking to when the final
 * transcription segment is received. Linked from the STT results About tab. */
export const PIPECAT_STT_TTFS_URL =
  "https://github.com/pipecat-ai/stt-benchmark#ttfs-measurement";

/** Calibrate's own documentation. Set NEXT_PUBLIC_DOCS_URL to point a
 * self-hosted copy at its own docs site. */
export const DOCS_URL = (
  process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.calibrate.artpark.ai"
).replace(/\/+$/, "");

/** How to connect an already-deployed agent to Calibrate: the endpoint shape,
 * configuring it, verifying it, and benchmarking across models. Linked from the
 * agent's Connection tab. */
export const AGENT_CONNECTIONS_DOCS_URL = `${DOCS_URL}/core-concepts/agent-connections`;
