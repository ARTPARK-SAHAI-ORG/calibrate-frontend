"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  useAccessToken,
  useActiveOrgUuid,
  useOrganizations,
} from "@/hooks";
import { CreateWorkspaceDialog } from "@/components/CreateWorkspaceDialog";
import type { Organization } from "@/lib/orgs";

type WorkspaceSwitcherProps = {
  collapsed: boolean;
};

function workspaceInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "W";
}

function WorkspaceAvatar({
  org,
  size = "md",
}: {
  org: Organization | null;
  size?: "sm" | "md";
}) {
  const sizeClasses =
    size === "sm" ? "w-6 h-6 text-xs" : "w-7 h-7 text-xs";
  const colorClass = org?.is_personal
    ? "bg-muted text-foreground border border-border"
    : "bg-purple-600 text-white";
  return (
    <span
      className={`${sizeClasses} ${colorClass} rounded-md flex items-center justify-center font-semibold flex-shrink-0`}
      aria-hidden
    >
      {org ? workspaceInitial(org.name) : "·"}
    </span>
  );
}

export function WorkspaceSwitcher({ collapsed }: WorkspaceSwitcherProps) {
  const accessToken = useAccessToken();
  const { organizations, isLoading, refetch, createOrganization } =
    useOrganizations(accessToken);
  const [activeUuid, setActiveUuid] = useActiveOrgUuid();

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const activeOrg =
    organizations.find((o) => o.uuid === activeUuid) ??
    organizations.find((o) => o.is_personal) ??
    organizations[0] ??
    null;

  const navigateAfterSwitch = () => {
    // Stay on workspace settings if that's where the user is — switching
    // workspaces from there should just reload settings for the new one.
    // Everywhere else, land on /agents (a known-good page for any workspace).
    if (window.location.pathname === "/workspace-settings") {
      window.location.reload();
    } else {
      window.location.assign("/agents");
    }
  };

  const handleSelect = (uuid: string) => {
    if (uuid !== activeUuid) {
      setActiveUuid(uuid);
      setOpen(false);
      navigateAfterSwitch();
      return;
    }
    setOpen(false);
  };

  const handleCreate = async (name: string) => {
    const created = await createOrganization(name);
    if (created) {
      setActiveUuid(created.uuid);
      await refetch();
      navigateAfterSwitch();
    }
  };

  // Collapsed mode: render a small button-only avatar with a tooltip.
  if (collapsed) {
    return (
      <>
        <div className="px-2 pt-3 pb-2 flex justify-center" ref={containerRef}>
          <div className="relative group/tip">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Workspace switcher"
              className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
            >
              <WorkspaceAvatar org={activeOrg} />
            </button>
            {!open && (
              <div className="fixed ml-[3.5rem] -mt-9 px-2 py-1.5 rounded-md text-xs font-medium bg-popover text-popover-foreground border border-border shadow-md whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-[9999]">
                {activeOrg?.name ?? "Workspace"}
              </div>
            )}

            {open && (
              <div className="absolute left-12 top-0 z-50">
                <DropdownPanel
                  organizations={organizations}
                  isLoading={isLoading}
                  activeUuid={activeUuid}
                  activeOrg={activeOrg}
                  onSelect={handleSelect}
                  onCreateClick={() => {
                    setOpen(false);
                    setCreateOpen(true);
                  }}
                  onSettingsClick={() => setOpen(false)}
                />
              </div>
            )}
          </div>
        </div>
        <CreateWorkspaceDialog
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
        />
      </>
    );
  }

  // Expanded mode: full-width switcher button.
  return (
    <>
      <div className="px-3 pt-3 pb-2 relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-md border border-border bg-background hover:bg-accent/40 transition-colors cursor-pointer text-left"
        >
          <WorkspaceAvatar org={activeOrg} />
          <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
            {activeOrg?.name ?? (isLoading ? "Loading…" : "Workspace")}
          </span>
          <svg
            className="w-4 h-4 text-muted-foreground flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 9l4-4 4 4m0 6l-4 4-4-4"
            />
          </svg>
        </button>

        {open && (
          <div className="absolute left-3 top-full z-50 mt-1">
            <DropdownPanel
              organizations={organizations}
              isLoading={isLoading}
              activeUuid={activeUuid}
              activeOrg={activeOrg}
              onSelect={handleSelect}
              onCreateClick={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
              onSettingsClick={() => setOpen(false)}
            />
          </div>
        )}
      </div>
      <CreateWorkspaceDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </>
  );
}

type DropdownPanelProps = {
  organizations: Organization[];
  isLoading: boolean;
  activeUuid: string | null;
  activeOrg: Organization | null;
  onSelect: (uuid: string) => void;
  onCreateClick: () => void;
  onSettingsClick: () => void;
};

function DropdownPanel({
  organizations,
  isLoading,
  activeUuid,
  activeOrg,
  onSelect,
  onCreateClick,
  onSettingsClick,
}: DropdownPanelProps) {
  return (
    <div
      role="menu"
      className="w-max min-w-[240px] max-w-sm bg-background border border-border rounded-xl shadow-lg overflow-hidden"
    >
      <div className="p-2 max-h-64 overflow-y-auto">
        <p className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Workspaces
        </p>
        {isLoading && organizations.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">Loading…</p>
        ) : organizations.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">
            No workspaces yet.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {organizations.map((org) => {
              const isActive = org.uuid === activeUuid;
              return (
                <li key={org.uuid}>
                  <button
                    type="button"
                    onClick={() => onSelect(org.uuid)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <WorkspaceAvatar org={org} size="sm" />
                    <span className="flex-1 whitespace-nowrap text-left">
                      {org.name}
                    </span>
                    {isActive && (
                      <svg
                        className="w-4 h-4 text-foreground flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-border p-2 space-y-0.5">
        {activeOrg && (
          <Link
            href="/workspace-settings"
            onClick={onSettingsClick}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
          >
            <svg
              className="w-4 h-4 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.166-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.764-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Workspace settings
          </Link>
        )}
        <button
          type="button"
          onClick={onCreateClick}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
        >
          <svg
            className="w-4 h-4 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create workspace
        </button>
      </div>
    </div>
  );
}
