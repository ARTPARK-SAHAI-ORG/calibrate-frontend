"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";
import type { TurnExtras } from "@/lib/messageVersions";

const NAME_INPUT_CLASS =
  "h-7 pl-4 pr-2 rounded-md bg-transparent border border-transparent hover:border-border focus:border-border focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-muted-foreground";

/** True when every version has text. */
export function versionsComplete(extras: TurnExtras): boolean {
  return Object.values(extras.versions ?? {}).every((text) => text.trim());
}

/** Whether two headings-and-versions are the same, in order. */
export function sameExtras(a: TurnExtras, b: TurnExtras): boolean {
  return (
    (a.label ?? "") === (b.label ?? "") &&
    JSON.stringify(a.versions ?? {}) === JSON.stringify(b.versions ?? {})
  );
}

/** The tick and cross beside a typed heading or version name. */
export function ConfirmCancel({
  what,
  onConfirm,
  onCancel,
  canConfirm = true,
}: {
  what: string;
  onConfirm: () => void;
  onCancel: () => void;
  canConfirm?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        aria-label={`Confirm ${what}`}
        onClick={onConfirm}
        disabled={!canConfirm}
        className="w-7 h-7 shrink-0 rounded-md flex items-center justify-center cursor-pointer text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <CheckIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        aria-label={`Cancel ${what}`}
        onClick={onCancel}
        className="w-7 h-7 shrink-0 rounded-md flex items-center justify-center cursor-pointer text-muted-foreground hover:bg-muted transition-colors"
      >
        <CloseIcon className="w-4 h-4" />
      </button>
    </>
  );
}

/**
 * The heading and other versions of one text box (a basic-agent item's input
 * or output). The heading sits above the box and the versions below it. A
 * heading or version name is typed into a draft and applied only by its tick
 * or Enter. There is no way to add a version here: they come in through the
 * API.
 */
export function TextVersionsEditor({
  field,
  extras,
  onChange,
  onPendingChange,
  disabled = false,
  children,
}: {
  field: "input" | "output";
  extras: TurnExtras;
  onChange: (next: TurnExtras) => void;
  /** Told whether a typed heading or name is waiting for its tick. */
  onPendingChange?: (pending: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [toRemove, setToRemove] = useState<string | null>(null);

  const pending = Object.keys(drafts).length > 0;
  useEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
  }, [pending, onPendingChange]);

  const setDraft = (key: string, value: string) =>
    setDrafts((d) => ({ ...d, [key]: value }));
  const dropDraft = (key: string) =>
    setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== key)));

  const versions = extras.versions ?? {};
  const withVersions = (next: Record<string, string>): TurnExtras => ({
    ...(extras.label ? { label: extras.label } : {}),
    ...(Object.keys(next).length > 0 ? { versions: next } : {}),
  });

  const label = extras.label ?? "";
  const headingDraft = drafts.heading;
  const headingDirty =
    headingDraft !== undefined && headingDraft.trim() !== label;
  const confirmHeading = () => {
    if (headingDraft === undefined) return;
    dropDraft("heading");
    const to = headingDraft.trim();
    if (to === label) return;
    onChange({
      ...(to ? { label: to } : {}),
      ...(extras.versions ? { versions: extras.versions } : {}),
    });
  };

  const nameTaken = (from: string, to: string) =>
    to !== from && Object.hasOwn(versions, to);
  const confirmName = (from: string) => {
    const key = `version:${from}`;
    const draft = drafts[key];
    if (draft === undefined) return;
    const to = draft.trim();
    if (nameTaken(from, to)) return;
    dropDraft(key);
    if (!to || to === from) return;
    onChange(
      withVersions(
        Object.fromEntries(
          Object.entries(versions).map(([k, text]) => [k === from ? to : k, text]),
        ),
      ),
    );
  };

  const onKey =
    (confirm: () => void, cancel: () => void) =>
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Enter") confirm();
      if (e.key === "Escape") cancel();
    };

  return (
    <>
      <div className="flex items-center gap-1 mb-2">
        <input
          type="text"
          value={headingDraft ?? label}
          placeholder="Add a heading for annotators"
          aria-label={`Heading for the ${field}`}
          disabled={disabled}
          onChange={(e) => setDraft("heading", e.target.value)}
          onBlur={() => {
            if (headingDraft !== undefined && !headingDirty) dropDraft("heading");
          }}
          onKeyDown={onKey(confirmHeading, () => dropDraft("heading"))}
          className={`${NAME_INPUT_CLASS} flex-1 min-w-0 text-sm font-medium text-foreground`}
        />
        {headingDirty && (
          <ConfirmCancel
            what="heading"
            onConfirm={confirmHeading}
            onCancel={() => dropDraft("heading")}
          />
        )}
      </div>

      {children}

      {Object.keys(versions).length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {Object.entries(versions).map(([name, text], i) => {
            const key = `version:${name}`;
            const draft = drafts[key];
            const dirty = draft !== undefined && draft.trim() !== name;
            const taken = dirty && nameTaken(name, draft.trim());
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={draft ?? name}
                    aria-label="Version name"
                    disabled={disabled}
                    onChange={(e) => setDraft(key, e.target.value)}
                    onBlur={() => {
                      if (draft !== undefined && !dirty) dropDraft(key);
                    }}
                    onKeyDown={onKey(
                      () => confirmName(name),
                      () => dropDraft(key),
                    )}
                    className={`${NAME_INPUT_CLASS} flex-1 min-w-0 text-xs text-muted-foreground`}
                  />
                  {dirty && (
                    <ConfirmCancel
                      what="version name"
                      onConfirm={() => confirmName(name)}
                      onCancel={() => dropDraft(key)}
                      canConfirm={!taken}
                    />
                  )}
                  <Tooltip content="Remove version" position="top">
                    <button
                      type="button"
                      aria-label="Remove version"
                      disabled={disabled}
                      onClick={() => setToRemove(name)}
                      className="w-7 h-7 shrink-0 rounded-md flex items-center justify-center cursor-pointer text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CloseIcon className="w-4 h-4" />
                    </button>
                  </Tooltip>
                </div>
                {taken && (
                  <p className="text-xs text-red-500 px-4">
                    Another version already has this name
                  </p>
                )}
                <textarea
                  value={text}
                  aria-label="Version text"
                  rows={3}
                  disabled={disabled}
                  placeholder="Enter this version"
                  onChange={(e) =>
                    onChange(withVersions({ ...versions, [name]: e.target.value }))
                  }
                  className={`w-full px-4 py-3 rounded-lg text-base text-foreground placeholder:text-muted-foreground border border-dashed bg-muted/30 focus:outline-none focus:ring-2 resize-y disabled:opacity-50 ${
                    text.trim()
                      ? "border-border focus:ring-accent"
                      : "border-red-500 focus:ring-red-500"
                  }`}
                />
                {!text.trim() && (
                  <p className="text-xs text-red-500">Version cannot be empty</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toRemove !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setToRemove(null)}
          />
          <div className="relative bg-background rounded-xl shadow-2xl border border-border p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {`Remove "${toRemove}" from the ${field}?`}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Annotators will no longer see it
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setToRemove(null)}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-background text-foreground hover:bg-muted transition-colors cursor-pointer border border-border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(
                    withVersions(
                      Object.fromEntries(
                        Object.entries(versions).filter(([k]) => k !== toRemove),
                      ),
                    ),
                  );
                  dropDraft(`version:${toRemove}`);
                  setToRemove(null);
                }}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
