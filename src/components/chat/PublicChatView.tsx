"use client";

import { useEffect, useRef, useState } from "react";
import {
  PublicLoading,
  PublicNotFound,
  PublicPageLayout,
} from "@/components/PublicPageLayout";
import { EmptyState, ErrorNote, InfoNote } from "@/components/ui";
import { Tooltip } from "@/components/Tooltip";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import {
  ChatIcon,
  InfoIcon,
  SpinnerIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@/components/icons";
import {
  TURN_BUBBLE_CLASS,
  ToolCallCard,
} from "@/components/test-results/shared";
import { useAuth } from "@/hooks";
import { StoppedEarlyNote } from "@/components/chat/StoppedEarlyNote";
import {
  fetchChatAgent,
  sendChatMessage,
  setChatFeedback,
  type ChatAgent,
  type ChatToolCall,
} from "@/lib/publicChatApi";

const MAX_MESSAGE_LENGTH = 4000;

/** What the reader is told for each way a message can fail. */
const SEND_ERRORS: Record<string, string> = {
  not_found: "This chat is not available",
  daily_limit: "This agent has reached its limit of messages for today",
  agent_failed: "The agent did not reply. Try again",
  agent_unavailable:
    "This agent cannot reply right now. Tell the person who shared this link",
  conversation_too_long: "This chat is too long. Start a new one",
};
const FALLBACK_ERROR = "The message could not be sent. Try again";

/** Failures worth sending the same message again for. */
const RETRYABLE = new Set(["agent_failed", "unknown", "network"]);
/** Failures after which nothing more can be sent until a new chat. */
const BLOCKING = new Set([
  "not_found",
  "daily_limit",
  "agent_unavailable",
  "conversation_too_long",
]);

/** Ready-made first messages, put in the message box when clicked. */
const STARTER_MESSAGES = [
  {
    text: "Hi, what can you help me with?",
    color:
      "border-blue-500/40 bg-blue-500/10 text-blue-900 dark:text-blue-200 hover:bg-blue-500/20",
  },
  {
    text: "What do you need from me to get started?",
    color:
      "border-violet-500/40 bg-violet-500/10 text-violet-900 dark:text-violet-200 hover:bg-violet-500/20",
  },
  {
    text: "Can you explain how this works?",
    color:
      "border-teal-500/40 bg-teal-500/10 text-teal-900 dark:text-teal-200 hover:bg-teal-500/20",
  },
];

const BUTTON_CLASS =
  "h-8 px-3 rounded-md text-sm font-medium border border-border bg-background text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0";

type Turn =
  | { role: "user"; text: string }
  | {
      role: "agent";
      traceUuid: string | null;
      reply: string | null;
      toolCalls: ChatToolCall[];
      stoppedEarly?: boolean;
    };

type Feedback = {
  /** true for a thumbs up, false for a thumbs down, null for none. */
  isCorrect: boolean | null;
  /** The comment box is open. */
  open: boolean;
  draft: string;
  saving: boolean;
  failed: boolean;
};

const NO_FEEDBACK: Feedback = {
  isCorrect: null,
  open: false,
  draft: "",
  saving: false,
  failed: false,
};

export function PublicChatView({ token }: { token: string }) {
  const { accessToken, isLoading: authLoading } = useAuth();
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
  const [clearing, setClearing] = useState<string | null>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  // Bumped by New chat, so a reply still on its way to the old chat is dropped.
  const chatRun = useRef(0);

  // Wait for the login, so a member of the workspace can open a private chat.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    fetchChatAgent(token, accessToken).then((res) => {
      if (cancelled) return;
      if (res.ok) setAgent(res.data);
      else setLoadError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [token, accessToken, authLoading]);

  useEffect(() => {
    if (agent) document.title = `${agent.agent_name} chat`;
  }, [agent]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns, sendError, sending]);

  if (loadError === "not_found") {
    return (
      <PublicPageLayout>
        <PublicNotFound
          message="This chat is not available"
          detail="The link may have been turned off, or it may be incorrect"
        />
      </PublicPageLayout>
    );
  }
  if (loadError) {
    return (
      <PublicPageLayout contentClassName="max-w-3xl">
        <ErrorNote>
          This chat could not be opened. Reload the page to try again
        </ErrorNote>
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
    sending || ended || (sendError !== null && BLOCKING.has(sendError));
  const canSend = !locked && draft.trim() !== "" && !tooLong;

  const send = async (text: string, retry = false) => {
    const run = chatRun.current;
    setSending(true);
    setSendError(null);
    if (!retry) setTurns((t) => [...t, { role: "user", text }]);
    const res = await sendChatMessage(
      token,
      { conversation_id: conversationId, message: text },
      accessToken,
    );
    if (run !== chatRun.current) return;
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
        stoppedEarly: res.data.stopped_early,
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
    // Nothing sent yet: this already is a new chat.
    if (turns.length === 0) return;
    chatRun.current += 1;
    setSending(false);
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
      [traceUuid]: { ...(all[traceUuid] ?? NO_FEEDBACK), ...patch },
    }));

  /** Saves the thumb, or clears it with `null`. True when it saved. */
  const saveFeedback = async (
    traceUuid: string,
    isCorrect: boolean | null,
    comment: string | null,
  ) => {
    patchFeedback(traceUuid, { saving: true, failed: false });
    const res = await setChatFeedback(
      token,
      traceUuid,
      { is_correct: isCorrect, comment },
      accessToken,
    );
    patchFeedback(traceUuid, { saving: false, failed: !res.ok });
    return res.ok;
  };

  const pickThumb = async (traceUuid: string, isCorrect: boolean) => {
    if (await saveFeedback(traceUuid, isCorrect, null)) {
      patchFeedback(traceUuid, { isCorrect, open: true, draft: "" });
    }
  };

  const saveComment = async (traceUuid: string) => {
    const f = feedback[traceUuid] ?? NO_FEEDBACK;
    if (await saveFeedback(traceUuid, f.isCorrect, f.draft.trim() || null)) {
      patchFeedback(traceUuid, { open: false });
    }
  };

  const clearFeedback = async () => {
    if (!clearing) return;
    setClearBusy(true);
    const ok = await saveFeedback(clearing, null, null);
    setClearBusy(false);
    if (ok) patchFeedback(clearing, NO_FEEDBACK);
    setClearing(null);
  };

  const clearingThumb =
    clearing && feedback[clearing]?.isCorrect ? "thumbs up" : "thumbs down";

  return (
    <PublicPageLayout
      title={agent.agent_name}
      contentClassName="max-w-3xl flex flex-col"
      actions={
        <button type="button" onClick={newChat} className={BUTTON_CLASS}>
          New chat
        </button>
      }
    >
      <div className="flex-1 space-y-4 pb-6">
        {turns.length === 0 && (
          <EmptyState
            className="mt-6"
            icon={<ChatIcon className="w-6 h-6 text-muted-foreground" />}
            title="Talk to the agent"
            actions={
              <div className="flex flex-col gap-2 w-full max-w-md">
                <p className="text-sm font-medium text-foreground">
                  Here are a few examples
                </p>
                {STARTER_MESSAGES.map(({ text, color }) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => {
                      setDraft(text);
                      messageRef.current?.focus();
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md border text-sm font-medium transition-colors cursor-pointer ${color}`}
                  >
                    {text}
                  </button>
                ))}
                <p className="flex items-center justify-center gap-1.5 text-sm text-foreground mt-1">
                  <InfoIcon className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  Click one to put it in the message box
                </p>
              </div>
            }
          />
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
              feedback={
                (turn.traceUuid && feedback[turn.traceUuid]) || NO_FEEDBACK
              }
              onPick={(isCorrect) =>
                turn.traceUuid && void pickThumb(turn.traceUuid, isCorrect)
              }
              onClear={() => turn.traceUuid && setClearing(turn.traceUuid)}
              onDraft={(text) =>
                turn.traceUuid && patchFeedback(turn.traceUuid, { draft: text })
              }
              onCancel={() =>
                turn.traceUuid &&
                patchFeedback(turn.traceUuid, { open: false, draft: "" })
              }
              onSave={() => turn.traceUuid && void saveComment(turn.traceUuid)}
            />
          ),
        )}
        {sending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <SpinnerIcon className="w-4 h-4 animate-spin" />
            The agent is replying
          </p>
        )}
        {sendError && (
          <ErrorNote className="flex items-center justify-between gap-3">
            <span>{SEND_ERRORS[sendError] ?? FALLBACK_ERROR}</span>
            {RETRYABLE.has(sendError) && failedMessage && (
              <button
                type="button"
                onClick={() => void send(failedMessage, true)}
                className={BUTTON_CLASS}
              >
                Retry
              </button>
            )}
          </ErrorNote>
        )}
        {ended && (
          <InfoNote className="items-center">
            <span className="flex-1">The agent ended the conversation</span>
            <button type="button" onClick={newChat} className={BUTTON_CLASS}>
              New chat
            </button>
          </InfoNote>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 bg-background pt-2 pb-4">
        <div
          className={`flex items-end gap-2.5 rounded-xl border p-2 pl-3.5 ${
            tooLong ? "border-red-500/60" : "border-border"
          } ${locked ? "opacity-50" : ""}`}
        >
          <textarea
            ref={messageRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={locked}
            rows={1}
            aria-label="Message"
            placeholder="Type a message"
            className="flex-1 resize-none self-center bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="h-10 px-4 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
        {tooLong && (
          <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
            This message is {draft.length.toLocaleString("en-US")} characters.
            Shorten it to {MAX_MESSAGE_LENGTH.toLocaleString("en-US")} or fewer
            to send it
          </p>
        )}
        {agent.interaction_type === "general" && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Each message is answered on its own
          </p>
        )}
      </div>

      <DeleteConfirmationDialog
        isOpen={clearing !== null}
        onClose={() => setClearing(null)}
        onConfirm={() => void clearFeedback()}
        title="Clear your feedback?"
        message={`This removes your ${clearingThumb} and your comment from this reply.`}
        confirmText="Clear feedback"
        busyText="Clearing..."
        isDeleting={clearBusy}
      />
    </PublicPageLayout>
  );
}

const THUMB_CLASS =
  "w-8 h-8 flex items-center justify-center rounded-lg border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

function AgentTurn({
  turn,
  feedback,
  onPick,
  onClear,
  onDraft,
  onCancel,
  onSave,
}: {
  turn: Extract<Turn, { role: "agent" }>;
  feedback: Feedback;
  onPick: (isCorrect: boolean) => void;
  onClear: () => void;
  onDraft: (text: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const picked = feedback.isCorrect;

  const thumb = (isCorrect: boolean) => {
    const Icon = isCorrect ? ThumbsUpIcon : ThumbsDownIcon;
    const label = isCorrect ? "Good reply" : "Bad reply";
    if (picked === null) {
      return (
        <Tooltip content={label} position="top">
          <button
            type="button"
            aria-label={label}
            disabled={feedback.saving}
            onClick={() => onPick(isCorrect)}
            className={`${THUMB_CLASS} border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted`}
          >
            <Icon className="w-4 h-4" />
          </button>
        </Tooltip>
      );
    }
    if (picked !== isCorrect) return null;
    return (
      <Tooltip content="Clear your feedback" position="top">
        <button
          type="button"
          aria-label={label}
          aria-pressed
          disabled={feedback.saving}
          onClick={onClear}
          className={`${THUMB_CLASS} ${
            isCorrect
              ? "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
              : "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400"
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
      </Tooltip>
    );
  };

  return (
    <div className="space-y-2 max-w-[88%] md:max-w-[80%]">
      {turn.toolCalls.length > 0 && (
        <div className="flex flex-col gap-2">
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
        <div className={`${TURN_BUBBLE_CLASS} bg-background w-fit`}>
          <p className="text-sm font-medium text-foreground mb-1">Agent</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {turn.reply}
          </p>
        </div>
      )}
      {turn.stoppedEarly && <StoppedEarlyNote />}
      {turn.traceUuid && (
        <div className="flex items-center gap-1">
          {thumb(true)}
          {thumb(false)}
          {feedback.failed && (
            <span className="text-xs text-red-600 dark:text-red-400 ml-2">
              Your feedback could not be saved. Try again
            </span>
          )}
        </div>
      )}
      {feedback.open && picked !== null && (
        <div className="w-full md:w-[520px] rounded-xl border border-border p-3 flex flex-col gap-2">
          <label
            htmlFor={`comment-${turn.traceUuid}`}
            className="text-sm font-medium text-foreground"
          >
            {picked
              ? "What was good about this reply? (optional)"
              : "What was wrong with this reply? (optional)"}
          </label>
          <textarea
            id={`comment-${turn.traceUuid}`}
            value={feedback.draft}
            onChange={(e) => onDraft(e.target.value)}
            rows={2}
            maxLength={2000}
            className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={feedback.saving}
              className={BUTTON_CLASS}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={feedback.saving}
              className="h-8 px-3 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {feedback.saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
