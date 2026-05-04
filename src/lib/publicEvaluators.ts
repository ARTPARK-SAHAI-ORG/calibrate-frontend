export type PublicDefaultEvaluator = {
  uuid: string;
  name: string;
  description?: string | null;
  evaluator_type: "stt" | "tts" | "llm" | "simulation" | string;
  output_type: "binary" | "rating";
  live_version?: {
    output_config?: {
      scale?: { value: number | boolean | string }[];
    } | null;
  } | null;
};

export async function getPublicDefaultEvaluator(
  backendUrl: string,
  shareToken: string,
  type: "stt" | "tts" | "llm" | "simulation",
): Promise<PublicDefaultEvaluator | null> {
  const response = await fetch(
    `${backendUrl}/public/evaluators/defaults?share_token=${encodeURIComponent(
      shareToken,
    )}&types=${type}`,
    {
      headers: {
        accept: "application/json",
      },
    },
  );

  if (!response.ok) return null;

  const data: PublicDefaultEvaluator[] = await response.json();
  return data.find((e) => e.evaluator_type === type) ?? null;
}
