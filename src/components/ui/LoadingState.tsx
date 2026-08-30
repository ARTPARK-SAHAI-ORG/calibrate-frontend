"use client";

import React from "react";
import { useRouter } from "@/lib/nav";
import { HOME_PATH } from "@/lib/routes";
import { SpinnerIcon } from "@/components/icons";

type LoadingStateProps = {
  className?: string;
};

export function LoadingState({ className = "" }: LoadingStateProps) {
  return (
    <div className={`flex items-center justify-center gap-3 py-8 ${className}`}>
      <SpinnerIcon className="w-5 h-5 animate-spin" />
    </div>
  );
}

type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  message,
  onRetry,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20 ${className}`}
    >
      <p className="text-base text-red-500 mb-2">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Retry
        </button>
      )}
    </div>
  );
}

type NotFoundStateProps = {
  className?: string;
  /**
   * `"switching"` means the page hit a 403 or 404 and we are still working out
   * whether it belongs to another of the user's workspaces. Show the spinner,
   * not the dead-end screen, so a link that is about to switch workspaces
   * never flashes a dead end first.
   */
  errorCode?: 401 | 403 | 404 | "switching";
  /**
   * What "Go to home" does. The default opens the agents page in the workspace
   * on screen, which is right everywhere except when the screen is showing
   * because that workspace is not the user's, and going back to it would show
   * the same screen again.
   */
  onGoHome?: () => void;
};

/**
 * The backend answers anything the reader is not allowed to open with a 403, so
 * a 404 now means the page really is not there.
 */
const errorContent: Record<number, { title: string; message?: string }> = {
  401: {
    title: "You do not have access to this page",
    message: "Please request the admin to share access with you.",
  },
  403: {
    title: "You do not have access to this page",
    message: "Please request the admin to share access with you.",
  },
  404: {
    title: "This page is not available",
  },
};

export function NotFoundState({
  className = "",
  errorCode = 404,
  onGoHome,
}: NotFoundStateProps) {
  const router = useRouter();

  if (errorCode === "switching") {
    return <LoadingState className={className} />;
  }

  const { title, message } = errorContent[errorCode] || errorContent[404];

  return (
    <div
      className={`flex flex-col items-center justify-center py-20 text-center px-4 ${className}`}
    >
      <h1 className="text-xl md:text-2xl font-semibold text-foreground">
        {title}
      </h1>
      {message && (
        <p className="text-base text-muted-foreground mt-2 max-w-md md:max-w-none">
          {message}
        </p>
      )}
      <button
        onClick={onGoHome ?? (() => router.push(HOME_PATH))}
        className="mt-6 h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
      >
        Go to home
      </button>
    </div>
  );
}

type EmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  /**
   * Buttons to show instead of `action`, for a screen whose own button is
   * already styled (a create flow, a pair of buttons).
   */
  actions?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  actions,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20 ${className}`}
    >
      <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1 text-center">
        {title}
      </h3>
      <p className="text-base text-muted-foreground mb-4 text-center">
        {description}
      </p>
      {actions}
      {!actions && action && (
        <button
          onClick={action.onClick}
          className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// Combined component that handles all three states
type ResourceStateProps = {
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  onRetry?: () => void;
  emptyState: {
    icon: React.ReactNode;
    title: string;
    description: React.ReactNode;
    action?: {
      label: string;
      onClick: () => void;
    };
  };
  children: React.ReactNode;
};

export function ResourceState({
  isLoading,
  error,
  isEmpty,
  onRetry,
  emptyState,
  children,
}: ResourceStateProps) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  if (isEmpty) {
    return (
      <EmptyState
        icon={emptyState.icon}
        title={emptyState.title}
        description={emptyState.description}
        action={emptyState.action}
      />
    );
  }

  return <>{children}</>;
}
