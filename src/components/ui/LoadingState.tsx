"use client";

import React from "react";
import { useRouter } from "next/navigation";
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
  errorCode?: 401 | 403 | 404;
};

const errorContent: Record<number, { title: string; message: string }> = {
  401: {
    title: "Access Denied",
    message: "You don't have permission to access this page.",
  },
  403: {
    title: "Access Denied",
    message: "You don't have permission to access this page.",
  },
  404: {
    title: "Not Found",
    message: "The page you're looking for doesn't exist or may have been moved.",
  },
};

export function NotFoundState({
  className = "",
  errorCode = 404,
}: NotFoundStateProps) {
  const router = useRouter();
  const { title, message } = errorContent[errorCode] || errorContent[404];

  return (
    <div
      className={`flex flex-col items-center justify-center py-20 text-center px-4 ${className}`}
    >
      <h1 className="text-7xl md:text-8xl font-bold text-muted-foreground">
        {errorCode}
      </h1>
      <h2 className="text-xl md:text-2xl font-semibold text-foreground mt-4">
        {title}
      </h2>
      <p className="text-base text-muted-foreground mt-2 max-w-md">{message}</p>
      <button
        onClick={() => router.push("/agents")}
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
      <h3 className="text-lg font-semibold text-foreground mb-1 text-center">
        {title}
      </h3>
      <p className="text-base text-muted-foreground mb-4 text-center">
        {description}
      </p>
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
