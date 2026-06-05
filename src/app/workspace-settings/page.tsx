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
import { CreateTokenDialog } from "@/components/CreateTokenDialog";
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
  { id: "tokens", label: "Tokens" },
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
      setRenameError(parseBackendErrorMessage(err, "Failed to rename workspace"));
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
      <div className="max-w-4xl mx-auto py-6 md:py-8">
        {orgsLoading && !activeOrg ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !activeOrg ? (
          <p className="text-sm text-muted-foreground">
            No active workspace selected.
          </p>
        ) : (
          <div className="flex flex-col md:flex-row gap-6 md:gap-10">
            <nav className="md:w-56 md:shrink-0">
              <div className="flex md:flex-col border border-border rounded-lg overflow-hidden">
                {SETTINGS_TABS.map((tab, i) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 md:flex-none text-left px-4 py-3 text-sm font-medium border-l-2 transition-colors cursor-pointer ${
                        i > 0 ? "md:border-t md:border-t-border" : ""
                      } ${
                        isActive
                          ? "border-l-foreground bg-muted/40 text-foreground"
                          : "border-l-transparent text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </nav>

            <div className="flex-1 min-w-0">
              {activeTab === "admin" ? (
                <div className="space-y-8">
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
                <TokensSection orgUuid={activeOrg.uuid} />
              )}
            </div>
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

function TokensSection({ orgUuid }: { orgUuid: string }) {
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
      toast.error(parseBackendErrorMessage(err, "Failed to revoke token"));
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            Tokens
          </h2>
          <p className="text-sm text-muted-foreground">
            Authenticate Calibrate from CI, like GitHub Actions
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="shrink-0 h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer"
        >
          Create token
        </button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        {isLoading && apiKeys.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
        ) : loadError ? (
          <p className="px-4 py-6 text-[13px] text-red-500">{loadError}</p>
        ) : apiKeys.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No tokens yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {apiKeys.map((key) => (
              <li
                key={key.uuid}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {key.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {key.prefix}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDate(key.created_at)}
                    {key.last_used_at
                      ? ` · Last used ${formatDate(key.last_used_at)}`
                      : " · Never used"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setKeyToRevoke(key)}
                  title="Revoke this token"
                  className="h-9 px-3 rounded-md text-xs font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateTokenDialog
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
        title="Revoke token"
        message={
          keyToRevoke
            ? `Revoke "${keyToRevoke.name}"? Any CI or scripts using it will stop working immediately. This cannot be undone.`
            : ""
        }
        confirmText="Revoke"
        isDeleting={isRevoking}
      />
    </section>
  );
}
