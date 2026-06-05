"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAccessToken,
  useActiveOrgUuid,
  useOrganizations,
  useOrgMembers,
  useWorkspaceApiKeys,
  seedOrgsCache,
} from "@/hooks";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { CreateApiKeyDialog } from "@/components/CreateApiKeyDialog";
import { SpinnerIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/LoadingState";
import { useSidebarState } from "@/lib/sidebar";
import { apiGet } from "@/lib/api";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import {
  clearActiveOrgUuid,
  notifyOrganizationsChanged,
  pickDefaultOrg,
  setActiveOrgUuid,
  type Organization,
  type OrganizationApiKey,
  type OrganizationMember,
} from "@/lib/orgs";

const SETTINGS_TABS = [
  { id: "admin", label: "Admin" },
  { id: "api-keys", label: "API keys" },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const accessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [activeTab, setActiveTab] = useState<SettingsTab>("admin");

  useEffect(() => {
    document.title = "Workspace settings | Calibrate";
  }, []);

  // Restore the selected tab from `?tab=` on load (and on back/forward), so a
  // reload or shared link keeps the user on the same tab. We read the URL
  // directly instead of `useSearchParams()` to avoid forcing a Suspense
  // boundary on this otherwise-static page. Init defaults to "admin" so the
  // first client render matches the prerendered HTML (no hydration mismatch);
  // this effect then syncs to the URL.
  useEffect(() => {
    const syncFromUrl = () => {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (SETTINGS_TABS.some((t) => t.id === tab)) {
        setActiveTab(tab as SettingsTab);
      }
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  const {
    organizations,
    isLoading: orgsLoading,
    renameOrganization,
  } = useOrganizations(accessToken);
  const [activeUuid] = useActiveOrgUuid();

  const activeOrg = useMemo(
    () => organizations.find((o) => o.uuid === activeUuid) ?? null,
    [organizations, activeUuid],
  );

  // --- Rename state ---
  const [nameInput, setNameInput] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // Sync the input with the currently active workspace. Keyed on uuid only —
  // we deliberately don't refresh from `activeOrg.name` so a successful
  // rename doesn't briefly snap the input back.
  useEffect(() => {
    setNameInput(activeOrg?.name ?? "");
    setRenameError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg?.uuid]);

  const isDirty = !!activeOrg && nameInput.trim() !== activeOrg.name;

  const handleRename = async () => {
    if (!activeOrg) return;
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === activeOrg.name) return;
    setIsRenaming(true);
    setRenameError(null);
    try {
      await renameOrganization(activeOrg.uuid, trimmed);
      toast.success("Workspace name updated");
    } catch (err) {
      setRenameError(
        parseBackendErrorMessage(err, "Failed to rename workspace"),
      );
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <AppLayout
      activeItem=""
      onItemChange={(id) => router.push(`/${id}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={
        <h1 className="text-base md:text-lg font-semibold text-foreground">
          Workspace settings
        </h1>
      }
    >
      <div className="py-6 md:py-8">
        {orgsLoading && !activeOrg ? (
          <div className="flex flex-col items-center justify-center gap-3 min-h-[60vh] text-muted-foreground">
            <SpinnerIcon className="w-6 h-6 animate-spin" />
            <p className="text-sm">Loading</p>
          </div>
        ) : !activeOrg ? (
          <p className="text-sm text-muted-foreground">
            No active workspace selected.
          </p>
        ) : (
          <div className="space-y-6 md:space-y-8">
            <div className="flex items-center gap-4 md:gap-6 border-b border-border overflow-x-auto">
              {SETTINGS_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabChange(tab.id)}
                    className={`pb-2 text-sm md:text-base font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? "text-foreground border-b-2 border-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab === "admin" ? (
              <div className="max-w-2xl space-y-8">
                <section className="space-y-3">
                  <label className="block text-sm font-medium text-foreground">
                    Name
                  </label>
                  <div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => {
                          setNameInput(e.target.value);
                          setRenameError(null);
                        }}
                        disabled={isRenaming}
                        className={`flex-1 h-10 px-3 rounded-md border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 disabled:opacity-50 ${
                          renameError
                            ? "border-red-500/60 focus:ring-red-500/20"
                            : "border-border focus:ring-foreground/10"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={handleRename}
                        disabled={!isDirty || isRenaming || !nameInput.trim()}
                        className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isRenaming ? "Saving..." : "Save"}
                      </button>
                    </div>
                    {renameError && (
                      <p className="mt-1 text-[13px] text-red-500">
                        {renameError}
                      </p>
                    )}
                  </div>
                </section>

                <MembersSection
                  orgUuid={activeOrg.uuid}
                  orgName={activeOrg.name}
                />
              </div>
            ) : (
              <ApiKeysSection orgUuid={activeOrg.uuid} />
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

/**
 * Resolve the current user's uuid from either NextAuth (Google sign-in,
 * exposed as `session.backendUser`) or localStorage (email/password login,
 * stored under "user").
 */
function useCurrentUserId(): string | null {
  const { data: session } = useSession();
  const [localUuid, setLocalUuid] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { uuid?: string };
      if (typeof parsed.uuid === "string") setLocalUuid(parsed.uuid);
    } catch {
      // ignore
    }
  }, []);

  const sessionUuid =
    (session as { backendUser?: { uuid?: string } } | null)?.backendUser
      ?.uuid ?? null;
  return sessionUuid || localUuid;
}

function MembersSection({
  orgUuid,
  orgName,
}: {
  orgUuid: string;
  orgName: string;
}) {
  const router = useRouter();
  const accessToken = useAccessToken();
  const currentUserId = useCurrentUserId();
  const {
    members,
    isLoading,
    error: loadError,
    refetch,
    addMember,
    removeMember,
  } = useOrgMembers(accessToken, orgUuid);

  const [inviteEmail, setInviteEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [memberToRemove, setMemberToRemove] =
    useState<OrganizationMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const isSelfRemoval =
    !!memberToRemove && memberToRemove.user_id === currentUserId;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email || isAdding) return;
    setIsAdding(true);
    setAddError(null);
    try {
      await addMember(email);
      setInviteEmail("");
    } catch (err) {
      setAddError(parseBackendErrorMessage(err, "Failed to add member"));
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async () => {
    if (!memberToRemove) return;
    const wasSelf = memberToRemove.user_id === currentUserId;
    setIsRemoving(true);
    try {
      await removeMember(memberToRemove.user_id);
    } catch (err) {
      setIsRemoving(false);
      // Bring fresh data from server in case state is out of sync.
      refetch();
      toast.error(
        parseBackendErrorMessage(
          err,
          wasSelf ? "Failed to leave workspace" : "Failed to remove member",
        ),
      );
      return;
    }
    setIsRemoving(false);
    setMemberToRemove(null);
    if (wasSelf) {
      // User just left the workspace they were viewing. Fetch a fresh
      // /organizations list, pick a new active workspace, seed the module
      // cache so the next mount on /agents doesn't briefly show the
      // just-left workspace, then navigate.
      if (accessToken) {
        try {
          const orgs = await apiGet<Organization[]>(
            "/organizations",
            accessToken,
          );
          seedOrgsCache(orgs, accessToken);
          const chosen = pickDefaultOrg(orgs);
          if (chosen) {
            setActiveOrgUuid(chosen.uuid);
          } else {
            clearActiveOrgUuid();
          }
        } catch {
          clearActiveOrgUuid();
        }
      } else {
        clearActiveOrgUuid();
      }
      notifyOrganizationsChanged();
      router.replace("/agents");
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base md:text-lg font-semibold text-foreground">
          Members
        </h2>
        <p className="text-sm text-muted-foreground">
          Invite team members by email
        </p>
      </div>

      <div>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => {
              setInviteEmail(e.target.value);
              setAddError(null);
            }}
            placeholder="teammate@example.com"
            disabled={isAdding}
            className={`flex-1 h-10 px-3 rounded-md border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 disabled:opacity-50 ${
              addError
                ? "border-red-500/60 focus:ring-red-500/20"
                : "border-border focus:ring-foreground/10"
            }`}
          />
          <button
            type="submit"
            disabled={!inviteEmail.trim() || isAdding}
            className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAdding ? "Adding..." : "Add member"}
          </button>
        </form>
        {addError && (
          <p className="mt-1 text-[13px] text-red-500">{addError}</p>
        )}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        {isLoading && members.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
        ) : loadError ? (
          <p className="px-4 py-6 text-[13px] text-red-500">{loadError}</p>
        ) : members.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No members yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((member) => {
              const displayName =
                `${member.first_name} ${member.last_name}`.trim() ||
                member.email;
              const isOwner = member.role === "owner";
              return (
                <li
                  key={member.user_id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="w-9 h-9 rounded-full bg-purple-600 text-white text-sm font-medium flex items-center justify-center flex-shrink-0">
                    {(displayName.trim()[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground truncate">
                        {displayName}
                      </p>
                      <span
                        className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          member.role === "owner"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                            : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/30"
                        }`}
                      >
                        {member.role}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {member.email}
                    </p>
                  </div>
                  {!isOwner &&
                    (() => {
                      const isSelf = member.user_id === currentUserId;
                      return (
                        <button
                          type="button"
                          onClick={() => setMemberToRemove(member)}
                          title={
                            isSelf
                              ? "Leave this workspace"
                              : "Remove from workspace"
                          }
                          className="h-9 px-3 rounded-md text-xs font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer"
                        >
                          {isSelf ? "Leave" : "Remove"}
                        </button>
                      );
                    })()}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DeleteConfirmationDialog
        isOpen={!!memberToRemove}
        onClose={() => {
          if (!isRemoving) setMemberToRemove(null);
        }}
        onConfirm={handleRemove}
        title={isSelfRemoval ? "Leave workspace" : "Remove member"}
        message={
          memberToRemove
            ? isSelfRemoval
              ? `Are you sure you want to leave ${orgName}? You will lose all access immediately.`
              : `Remove ${
                  `${memberToRemove.first_name} ${memberToRemove.last_name}`.trim() ||
                  memberToRemove.email
                } from this workspace? They will lose access immediately.`
            : ""
        }
        confirmText={isSelfRemoval ? "Leave" : "Remove"}
        isDeleting={isRemoving}
      />
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ApiKeysSection({ orgUuid }: { orgUuid: string }) {
  const accessToken = useAccessToken();
  const {
    apiKeys,
    isLoading,
    error: loadError,
    refetch,
    createApiKey,
    revokeApiKey,
  } = useWorkspaceApiKeys(accessToken, orgUuid);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState<OrganizationApiKey | null>(
    null,
  );
  const [isRevoking, setIsRevoking] = useState(false);

  const handleRevoke = async () => {
    if (!keyToRevoke) return;
    setIsRevoking(true);
    try {
      await revokeApiKey(keyToRevoke.uuid);
      setKeyToRevoke(null);
    } catch (err) {
      refetch();
      toast.error(parseBackendErrorMessage(err, "Failed to revoke API key"));
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            API keys
          </h2>
          <p className="text-sm text-muted-foreground">
            Authenticate Calibrate (e.g. for Github Actions)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="shrink-0 h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer"
        >
          Create key
        </button>
      </div>

      {isLoading && apiKeys.length === 0 ? (
        <div className="border border-border rounded-xl px-4 py-10 flex items-center justify-center">
          <SpinnerIcon className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <div className="border border-border rounded-xl px-4 py-6 bg-muted/20">
          <p className="text-[13px] text-red-500">{loadError}</p>
        </div>
      ) : apiKeys.length === 0 ? (
        <EmptyState
          icon={
            <svg
              className="w-7 h-7 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
              />
            </svg>
          }
          title="No API keys yet"
          description="Create an API key to authenticate Calibrate from CI, like GitHub Actions."
          action={{
            label: "Create key",
            onClick: () => setIsCreateOpen(true),
          }}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_1.5fr_160px_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30">
              <div className="text-sm font-medium text-muted-foreground">
                Name
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Value
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Last used
              </div>
              <div className="w-[76px]" />
            </div>
            {apiKeys.map((key) => (
              <div
                key={key.uuid}
                className="grid grid-cols-[1fr_1.5fr_160px_auto] gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors items-center"
              >
                <p className="text-sm font-medium text-foreground truncate">
                  {key.name}
                </p>
                <p className="text-sm text-muted-foreground font-mono truncate">
                  {key.masked_key}
                </p>
                <p className="text-sm text-muted-foreground">
                  {key.last_used_at ? formatDate(key.last_used_at) : "Never"}
                </p>
                <button
                  type="button"
                  onClick={() => setKeyToRevoke(key)}
                  title="Revoke this key"
                  className="justify-self-end h-9 px-3 rounded-md text-xs font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {apiKeys.map((key) => (
              <div
                key={key.uuid}
                className="border border-border rounded-lg overflow-hidden bg-background"
              >
                <div className="p-4">
                  <div className="text-sm font-medium text-foreground mb-1 truncate">
                    {key.name}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mb-1 truncate">
                    {key.masked_key}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {key.last_used_at
                      ? `Last used ${formatDate(key.last_used_at)}`
                      : "Never used"}
                  </div>
                </div>
                <div className="px-4 pb-3 pt-0">
                  <button
                    type="button"
                    onClick={() => setKeyToRevoke(key)}
                    className="w-full h-8 text-xs font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 rounded-md transition-colors cursor-pointer"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <CreateApiKeyDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={createApiKey}
      />

      <DeleteConfirmationDialog
        isOpen={!!keyToRevoke}
        onClose={() => {
          if (!isRevoking) setKeyToRevoke(null);
        }}
        onConfirm={handleRevoke}
        title="Revoke API key"
        message={
          keyToRevoke
            ? `If you revoke this key, it will stop working immediately. This cannot be undone. Are you sure?`
            : ""
        }
        confirmText="Revoke"
        isDeleting={isRevoking}
      />
    </section>
  );
}
