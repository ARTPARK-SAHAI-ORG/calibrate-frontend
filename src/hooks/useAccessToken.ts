"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

/**
 * Hook to get the access token from either NextAuth session (Google OAuth)
 * or localStorage (email/password login).
 * 
 * @returns The access token string or null if not authenticated
 */
export function useAccessToken(): string | null {
  const { data: session, status } = useSession();
  const [localToken, setLocalToken] = useState<string | null>(null);

  // Get token from NextAuth session (Google OAuth)
  const sessionToken = (session as any)?.backendAccessToken as string | undefined;

  // Get token from localStorage (email/password login)
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    setLocalToken(token);
  }, []);

  if (status === "loading") return null;

  return sessionToken || localToken;
}

/**
 * Hook to check if the user is authenticated via either method.
 * Also provides loading state.
 * 
 * @returns { isAuthenticated, isLoading, accessToken }
 */
export function useAuth() {
  const { data: session, status } = useSession();
  const [localToken, setLocalToken] = useState<string | null>(null);
  const [isLocalChecked, setIsLocalChecked] = useState(false);

  // Get token from NextAuth session (Google OAuth)
  const sessionToken = (session as any)?.backendAccessToken as string | undefined;

  // Get token from localStorage (email/password login)
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    setLocalToken(token);
    setIsLocalChecked(true);
  }, []);

  const accessToken = sessionToken || localToken;
  const isLoading = status === "loading" || !isLocalChecked;
  const isAuthenticated = !!accessToken;

  return { isAuthenticated, isLoading, accessToken };
}

