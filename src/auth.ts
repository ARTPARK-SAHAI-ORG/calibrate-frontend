import { reportError } from "@/lib/reportError";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account", // Always show account selection, no auto-login
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, account }) {
      // On initial sign in, sync user with backend and persist tokens
      if (account) {
        token.googleAccessToken = account.access_token;
        token.idToken = account.id_token;

        // Call backend to create/retrieve user and get JWT
        try {
          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
          if (backendUrl && account.id_token) {
            const response = await fetch(`${backendUrl}/auth/google`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                accept: "application/json",
              },
              body: JSON.stringify({ id_token: account.id_token }),
            });

            if (response.ok) {
              const data = await response.json();
              // Store backend JWT access_token and user data
              token.backendAccessToken = data.access_token;
              token.backendUser = data.user;
            }
          }
        } catch (error) {
          reportError("Failed to sync user with backend:", error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Send properties to the client
      // @ts-expect-error - extending session type
      session.googleAccessToken = token.googleAccessToken;
      // @ts-expect-error - extending session type
      session.idToken = token.idToken;
      // @ts-expect-error - extending session type
      session.backendAccessToken = token.backendAccessToken;
      // @ts-expect-error - extending session type
      session.backendUser = token.backendUser;
      return session;
    },
  },
});
