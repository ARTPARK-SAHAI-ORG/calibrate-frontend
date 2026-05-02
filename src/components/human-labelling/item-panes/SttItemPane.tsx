import { Section } from "./shared";

export function SttItemPane({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const reference =
    typeof payload.reference_transcript === "string"
      ? (payload.reference_transcript as string)
      : "";
  const predicted =
    typeof payload.predicted_transcript === "string"
      ? (payload.predicted_transcript as string)
      : "";
  return (
    <div className="space-y-4">
      <Section
        title="Reference transcript"
        subtitle="What the speaker actually said"
      >
        <p className="text-sm whitespace-pre-wrap break-words">
          {reference || "—"}
        </p>
      </Section>
      <Section
        title="Predicted transcript"
        subtitle="What the STT model produced"
      >
        <p className="text-sm whitespace-pre-wrap break-words">
          {predicted || "—"}
        </p>
      </Section>
    </div>
  );
}
