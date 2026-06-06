"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { NotFoundState } from "@/components/ui";
import type { PageErrorCode } from "@/hooks";

type NotFoundPageProps = {
  /** Nav id of the section to keep highlighted in the sidebar. */
  activeItem: string;
  errorCode: PageErrorCode;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  /** Optional header (e.g. a back button) rendered in the top bar. */
  customHeader?: React.ReactNode;
};

/**
 * Full-page 403/404 shell: the standard AppLayout chrome wrapped around
 * NotFoundState. Use it as the early return when a page's primary resource
 * fails to load, so the sidebar/header stay intact instead of replacing the
 * whole screen with a bare NotFoundState.
 */
export function NotFoundPage({
  activeItem,
  errorCode,
  sidebarOpen,
  onSidebarToggle,
  customHeader,
}: NotFoundPageProps) {
  const router = useRouter();

  return (
    <AppLayout
      activeItem={activeItem}
      onItemChange={(id) => router.push(`/${id}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={onSidebarToggle}
      customHeader={customHeader}
    >
      <NotFoundState errorCode={errorCode} />
    </AppLayout>
  );
}
