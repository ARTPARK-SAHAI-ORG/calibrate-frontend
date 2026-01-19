"use client";

import React from "react";
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
};

export function NotFoundState({ className = "" }: NotFoundStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-20 ${className}`}
    >
      <h1 className="text-8xl font-bold text-muted-foreground">404</h1>
      <p className="text-lg text-muted-foreground mt-2">Not found</p>
    </div>
  );
}

type EmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20 ${className}`}
    >
      <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-base text-muted-foreground mb-4">{description}</p>
      {action && (
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
    description: string;
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
