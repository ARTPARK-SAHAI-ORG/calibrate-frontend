"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { ErrorState, LoadingState } from "@/components/ui";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import { reportError } from "@/lib/reportError";
import {
  addSuperadmin,
  fetchSuperadmins,
  removeSuperadmin,
  type Superadmin,
} from "@/lib/analyticsApi";

const displayName = (s: Superadmin) =>
  `${s.first_name} ${s.last_name}`.trim() || s.email;

export function SuperadminsSection({ accessToken }: { accessToken: string }) {
  const [superadmins, setSuperadmins] = useState<Superadmin[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [toRemove, setToRemove] = useState<Superadmin | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const load = useCallback(
    () =>
      fetchSuperadmins(accessToken)
        .then((list) => {
          setSuperadmins(list);
          setLoadError(null);
        })
        .catch((err) => {
          reportError("Failed to load superadmins", err);
          setLoadError("The superadmins could not be loaded");
        }),
    [accessToken],
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    const typed = email.trim();
    if (!typed || isAdding) return;
    setIsAdding(true);
    try {
      await addSuperadmin(accessToken, typed);
    } catch (err) {
      setAddError(parseBackendErrorMessage(err, "Could not add this superadmin"));
      setIsAdding(false);
      return;
    }
    await load();
    setEmail("");
    setIsAdding(false);
  };

  const handleRemove = async () => {
    if (!toRemove) return;
    setIsRemoving(true);
    try {
      await removeSuperadmin(accessToken, toRemove.uuid);
    } catch (err) {
      setIsRemoving(false);
      load();
      toast.error(parseBackendErrorMessage(err, "Failed to remove superadmin"));
      return;
    }
    await load();
    setIsRemoving(false);
    setToRemove(null);
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Superadmins</h2>

      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setAddError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="teammate@example.com"
            disabled={isAdding}
            aria-label="Email address"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            data-form-type="other"
            className={`w-full h-10 px-3 rounded-md border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 disabled:opacity-50 ${
              addError
                ? "border-red-500/60 focus:ring-red-500/20"
                : "border-border focus:ring-foreground/10"
            }`}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!email.trim() || isAdding}
            className="shrink-0 h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAdding ? "Adding superadmin..." : "Add superadmin"}
          </button>
        </div>
        {addError && <p className="text-sm text-red-500">{addError}</p>}
      </div>

      {loadError && !superadmins ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {!superadmins ? (
            <LoadingState />
          ) : (
            <ul className="divide-y divide-border">
              {superadmins.map((s) => {
                const name = displayName(s);
                return (
                  <li key={s.uuid} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-full bg-purple-600 text-white text-sm font-medium flex items-center justify-center flex-shrink-0">
                      {(name.trim()[0] || "?").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.email}
                      </p>
                    </div>
                    {s.can_remove && (
                      <button
                        type="button"
                        onClick={() => setToRemove(s)}
                        className="h-9 px-3 rounded-md text-xs font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer"
                      >
                        Remove superadmin
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <DeleteConfirmationDialog
        isOpen={!!toRemove}
        onClose={() => {
          if (!isRemoving) setToRemove(null);
        }}
        onConfirm={handleRemove}
        title="Remove superadmin"
        message={
          toRemove && (
            <>
              Remove{" "}
              <span className="font-medium text-foreground">
                {displayName(toRemove)}
              </span>{" "}
              as a superadmin? They will lose superadmin access immediately.
            </>
          )
        }
        confirmText="Remove"
        isDeleting={isRemoving}
      />
    </section>
  );
}
