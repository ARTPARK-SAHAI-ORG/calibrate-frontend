// src/app/api/debug-env/route.ts
// This runs server-side, so it shows runtime env vars
export async function GET() {
  return Response.json({
    backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "NOT SET",
    nodeEnv: process.env.NODE_ENV,
    // Note: NEXT_PUBLIC_* vars are embedded at BUILD time for client-side code
    // If this shows the value but client doesn't work, the build cache needs clearing
  });
}
