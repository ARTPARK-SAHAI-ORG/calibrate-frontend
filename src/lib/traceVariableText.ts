import type { AgentNature } from "@/components/traces/ingestSnippets";
import {
  isMetadataSource,
  lowerFirst,
  metadataKey,
  traceSourceLabel,
} from "./traceScoring";

/** What a trace lacks when a variable's part of it is empty, e.g. "No labels". */
export function missingValueText(
  source: string,
  agentNature?: AgentNature,
): string {
  if (isMetadataSource(source)) return `No ${metadataKey(source)} in the metadata`;
  return `No ${lowerFirst(traceSourceLabel(source, agentNature))}`;
}

/** The same, as the start of a sentence about one trace. */
export function missingValueSentence(
  source: string,
  agentNature?: AgentNature,
): string {
  if (isMetadataSource(source))
    return `This trace's metadata has no ${metadataKey(source)}`;
  return `This trace has no ${lowerFirst(traceSourceLabel(source, agentNature))}`;
}
