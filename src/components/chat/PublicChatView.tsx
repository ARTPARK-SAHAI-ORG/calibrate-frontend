"use client";

import { useEffect, useRef, useState } from "react";
import {
  PublicLoading,
  PublicNotFound,
  PublicPageLayout,
} from "@/components/PublicPageLayout";
import { ErrorNote, InfoNote } from "@/components/ui";
import { Tooltip } from "@/components/Tooltip";
import { ThumbsDownIcon, ThumbsUpIcon } from "@/components/icons";
import {
  TURN_BUBBLE_CLASS,
  ToolCallCard,
} from "@/components/test-results/shared";
import {
  fetchChatAgent,
  sendChatMessage,
  setChatFeedback,
  type ChatAgent,
  type ChatRating,
  type ChatToolCall,
} from "@/lib/publicChatApi";

const MAX_MESSAGE_LENGTH = 4000;

/** What the reader is told for each way a message can fail. */
const SEND_ERRORS: Record<string, string> = {
  not_found: "This chat link is not available",
  daily_limit: "This chat link has reached its limit for today",
  trace_limit: "This agent cannot take more messages right now",
  agent_failed: "The agent did not reply. Try again",
  agent_unavailable:
    "This agent cannot reply right now. Tell the person who shared this link",
  conversation_too_long: "This chat is too long. Start a new one",
};
const FALLBACK_ERROR = "The message could not be sent. Try again";

/** Failures worth sending the same message again for. */
const RETRYABLE = new Set(["agent_failed", "unknown", "network"]);

type Turn =
  | { role: "user"; text: string }
  | {
      role: "agent";
      traceUuid: string;
      reply: string | null;
      toolCalls: ChatToolCall[];
    };

type Feedback = {
  rating: ChatRating | null;
  comment: string;
  draft: string;
  saving: boolean;
  failed: boolean;
};

const EMPTY_FEEDBACK: Feedback = {
  rating: null,
  comment: "",
  draft: "",
  saving: false,
  failed: false,
};

export function PublicChatView({ token }: { token: string }) {
  const [agent, setAgent] = useState<ChatAgent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchChatAgent(token).then((res) => {
      if (cancelled) return;
      if (res.ok) setAgent(res.data);
      else setLoadError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (agent) document.title = `${agent.agent_name} chat`;
  }, [agent]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns, sendError]);

  if (loadError === "not_found") {
    return (
      <PublicPageLayout>
        <PublicNotFound
          message="This chat link is not available"
          detail="The link may have been turned off, or it may be incorrect"
        />
      </PublicPageLayout>
    );
  }
  if (loadError) {
    return (
      <PublicPageLayout contentClassName="max-w-3xl">
        <ErrorNote>This chat could not be opened. Reload the page to try again</ErrorNote>
      </PublicPageLayout>
    );
  }
  if (!agent) {
    return (
      <PublicPageLayout>
        <PublicLoading />
      </PublicPageLayout>
    );
  }

  const tooLong = draft.length > MAX_MESSAGE_LENGTH;
  const locked =
    ended || sendError === "conversation_too_long" || sendError === "not_found";
  const canSend = !sending && !locked && draft.trim() !== "" && !tooLong;

  const send = async (text: string, retry = false) => {
    setSending(true);
    setSendError(null);
    if (!retry) setTurns((t) => [...t, { role: "user", text }]);
    const res = await sendChatMessage(token, {
      conversation_id: conversationId,
      message: text,
    });
    setSending(false);
    if (!res.ok) {
      setSendError(res.error);
      setFailedMessage(text);
      return;
    }
    setFailedMessage(null);
    setConversationId(res.data.conversation_id);
    setTurns((t) => [
      ...t,
      {
        role: "agent",
        traceUuid: res.data.trace_uuid,
        reply: res.data.reply,
        toolCalls: res.data.tool_calls ?? [],
      },
    ]);
    if (res.data.ended) setEnded(true);
  };

  const submit = () => {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    void send(text);
  };

  const newChat = () => {
    setTurns([]);
    setConversationId(null);
    setDraft("");
    setSendError(null);
    setFailedMessage(null);
    setEnded(false);
    setFeedback({});
  };

  const patchFeedback = (traceUuid: string, patch: Partial<Feedback>) =>
    setFeedback((all) => ({
      ...all,
      [traceUuid]: { ...(all[traceUuid] ?? EMPTY_FEEDBACK), ...patch },
    }));

  const saveFeedback = async (
    traceUuid: string,
    rating: ChatRating | null,
    comment: string,
  ) => {
    patchFeedback(traceUuid, { saving: true, failed: false });
    const res = await setChatFeedback(token, traceUuid, {
      rating,
      comment: rating && comment.trim() ? comment.trim() : null,
    });
    if (!res.ok) {
      patchFeedback(traceUuid, { saving: false, failed: true });
      return;
    }
    // A comment typed but not saved stays in the box when the thumb changes.
    patchFeedback(traceUuid, {
      saving: false,
      rating,
      comment: rating ? comment.trim() : "",
      ...(rating ? {} : { draft: "" }),
    });
  };

  const clickThumb = (traceUuid: string, rating: ChatRating) => {
    const current = feedback[traceUuid] ?? EMPTY_FEEDBACK;
    if (current.rating === rating) void saveFeedback(traceUuid, null, "");
    else void saveFeedback(traceUuid, rating, current.comment);
  };

  return (
    <PublicPageLayout contentClassName="max-w-3xl flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-lg md:text-xl font-semibold truncate">
          {agent.agent_name}
        </h1>
        <button
          type="button"
          onClick={newChat}
          disabled={sending || turns.length === 0}
          className="h-8 px-3 rounded-md text-sm font-medium border border-border bg-background text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          New chat
        </button>
      </div>

      <div className="flex-1 space-y-4 pb-6">
        {turns.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            Send a message to start chatting with {agent.agent_name}
          </p>
        )}
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div key={i} className="flex flex-col items-end">
              <div className="max-w-[88%] md:max-w-3/4 w-fit">
                <div className={`${TURN_BUBBLE_CLASS} bg-muted`}>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {turn.text}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <AgentTurn
              key={i}
              turn={turn}
              feedback={feedback[turn.traceUuid] ?? EMPTY_FEEDBACK}
              onThumb={(rating) => clickThumb(turn.traceUuid, rating)}
              onDraft={(text) => patchFeedback(turn.traceUuid, { draft: text })}
              onSaveComment={() => {
                const f = feedback[turn.traceUuid];
                if (f?.rating) void saveFeedback(turn.traceUuid, f.rating, f.draft);
              }}
            />
          ),
        )}
        {sending && (
          <p className="text-sm text-muted-foreground">
            {agent.agent_name} is replying...
          </p>
        )}
        {sendError && (
          <ErrorNote className="flex items-center justify-between gap-3">
            <span>{SEND_ERRORS[sendError] ?? FALLBACK_ERROR}</span>
            {RETRYABLE.has(sendError) && failedMessage && (
              <button
                type="button"
                onClick={() => void send(failedMessage, true)}
                className="h-7 px-3 rounded-md text-xs font-medium border border-border bg-background text-foreground hover:bg-accent transition-colors cursor-pointer flex-shrink-0"
              >
                Retry
              </button>
            )}
          </ErrorNote>
        )}
        {ended && (
          <InfoNote>
            The agent ended the conversation
          </InfoNote>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 bg-background pt-2 pb-4 border-t border-border">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={locked}
            rows={2}
            aria-label="Message"
            placeholder={
              locked ? "Start a new chat to send more messages" : "Type a message"
            }
            className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
        {tooLong && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            A message can be at most {MAX_MESSAGE_LENGTH.toLocaleString("en-US")}{" "}
            characters. This one has {draft.length.toLocaleString("en-US")}
          </p>
        )}
        {agent.interaction_type === "general" && (
          <p className="mt-1 text-xs text-muted-foreground">
            Each message is answered on its own
          </p>
        )}
      </div>
    </PublicPageLayout>
  );
}

function AgentTurn({
  turn,
  feedback,
  onThumb,
  onDraft,
  onSaveComment,
}: {
  turn: Extract<Turn, { role: "agent" }>;
  feedback: Feedback;
  onThumb: (rating: ChatRating) => void;
  onDraft: (text: string) => void;
  onSaveComment: () => void;
}) {
  const thumb = (rating: ChatRating) => {
    const on = feedback.rating === rating;
    const Icon = rating === "up" ? ThumbsUpIcon : ThumbsDownIcon;
    const label = rating === "up" ? "Good reply" : "Bad reply";
    return (
      <Tooltip content={on ? "Clear your rating" : label} position="top">
        <button
          type="button"
          aria-label={label}
          aria-pressed={on}
          disabled={feedback.saving}
          onClick={() => onThumb(rating)}
          className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            on
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
      </Tooltip>
    );
  };

  return (
    <div className="space-y-1">
      <span className="text-sm font-medium text-foreground">Agent</span>
      {turn.toolCalls.length > 0 && (
        <div className="w-[88%] md:w-3/4 flex flex-col gap-2">
          {turn.toolCalls.map((tc, i) => (
            <ToolCallCard
              key={i}
              toolName={tc.tool}
              args={tc.arguments ?? {}}
              output={tc.output}
            />
          ))}
        </div>
      )}
      {turn.reply && (
        <div className="max-w-[88%] md:max-w-3/4 w-fit">
          <div className={`${TURN_BUBBLE_CLASS} bg-background`}>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {turn.reply}
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center gap-1 pt-1">
        {thumb("up")}
        {thumb("down")}
        {feedback.failed && (
          <span className="text-xs text-red-600 dark:text-red-400 ml-2">
            Your rating could not be saved. Try again
          </span>
        )}
      </div>
      {feedback.rating && (
        <div className="max-w-[88%] md:max-w-3/4 flex items-start gap-2 pt-1">
          <textarea
            value={feedback.draft}
            onChange={(e) => onDraft(e.target.value)}
            rows={2}
            maxLength={2000}
            aria-label="Comment on this reply"
            placeholder="Add a comment (optional)"
            className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="button"
            onClick={onSaveComment}
            disabled={feedback.saving || feedback.draft.trim() === feedback.comment}
            className="h-8 px-3 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {feedback.draft.trim() === feedback.comment && feedback.comment
              ? "Saved"
              : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
