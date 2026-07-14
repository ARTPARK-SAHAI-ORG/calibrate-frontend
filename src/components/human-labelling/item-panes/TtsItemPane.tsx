import { LazyAudioPlayer } from "@/components/evaluations/LazyAudioPlayer";
import { Section } from "./shared";

export function TtsItemPane({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const name =
    typeof payload.name === "string" ? (payload.name as string) : "";
  const text =
    typeof payload.text === "string" ? (payload.text as string) : "";
  const audioPath =
    typeof payload.audio_path === "string"
      ? (payload.audio_path as string)
      : "";
  return (
    <div className="space-y-4">
      {name && (
        <p className="text-sm font-semibold text-foreground">{name}</p>
      )}
      <Section title="Text" subtitle="The text the TTS model was asked to speak">
        <p className="text-sm whitespace-pre-wrap break-words">
          {text || "—"}
        </p>
      </Section>
      <Section
        title="Generated audio"
        subtitle="What the TTS model produced — listen and judge its quality"
      >
        {audioPath ? (
          <LazyAudioPlayer src={audioPath} className="w-full" />
        ) : (
          <p className="text-sm text-muted-foreground">No audio provided</p>
        )}
      </Section>
    </div>
  );
}
