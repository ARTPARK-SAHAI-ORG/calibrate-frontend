"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAccessToken,
  useActiveOrgUuid,
  useOrganizations,
  useOrgMembers,
} from "@/hooks";
import { AppLayout } from "@/components/AppLayout";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { useSidebarState } from "@/lib/sidebar";
import type { OrganizationMember } from "@/lib/orgs";

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const accessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

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
  const [renameSuccess, setRenameSuccess] = useState(false);

  useEffect(() => {
    setNameInput(activeOrg?.name ?? "");
    setRenameError(null);
    setRenameSuccess(false);
  }, [activeOrg?.uuid, activeOrg?.name]);

  const isDirty = !!activeOrg && nameInput.trim() !== activeOrg.name;

  const handleRename = async () => {
    if (!activeOrg) return;
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === activeOrg.name) return;
    setIsRenaming(true);
    setRenameError(null);
    setRenameSuccess(false);
    try {
      await renameOrganization(activeOrg.uuid, trimmed);
      setRenameSuccess(true);
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Failed to rename workspace",
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
      <div className="max-w-3xl mx-auto py-6 md:py-8 space-y-8">
        {orgsLoading && !activeOrg ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !activeOrg ? (
          <p className="text-sm text-muted-foreground">
            No active workspace selected.
          </p>
        ) : (
          <>
            <section className="space-y-3">
              <label className="block text-sm font-medium text-foreground">
                Name
              </label>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    setRenameSuccess(false);
                    setRenameError(null);
                  }}
                  disabled={isRenaming}
                  className="flex-1 h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-50"
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
                <p className="text-sm text-red-600 dark:text-red-400">
                  {renameError}
                </p>
              )}
              {renameSuccess && !renameError && (
                <p className="text-sm text-muted-foreground">Saved.</p>
              )}
            </section>

            <MembersSection orgUuid={activeOrg.uuid} />
          </>
        )}
      </div>
    </AppLayout>
  );
}

function MembersSection({ orgUuid }: { orgUuid: string }) {
  const accessToken = useAccessToken();
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
      setAddError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async () => {
    if (!memberToRemove) return;
    setIsRemoving(true);
    const ok = await removeMember(memberToRemove.user_id);
    setIsRemoving(false);
    if (ok) {
      setMemberToRemove(null);
    } else {
      // Bring fresh data from server in case state is out of sync.
      refetch();
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
          className="flex-1 h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-50"
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
        <p className="text-sm text-red-600 dark:text-red-400">{addError}</p>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        {isLoading && members.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
        ) : loadError ? (
          <p className="px-4 py-6 text-sm text-red-600 dark:text-red-400">
            {loadError}
          </p>
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
                  <button
                    type="button"
                    onClick={() => setMemberToRemove(member)}
                    disabled={isOwner}
                    title={
                      isOwner
                        ? "The workspace owner cannot be removed."
                        : "Remove from workspace"
                    }
                    className="h-9 px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
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
        title="Remove member"
        message={
          memberToRemove
            ? `Remove ${
                `${memberToRemove.first_name} ${memberToRemove.last_name}`.trim() ||
                memberToRemove.email
              } from this workspace? They will lose access immediately.`
            : ""
        }
        confirmText="Remove"
        isDeleting={isRemoving}
      />
    </section>
  );
}
