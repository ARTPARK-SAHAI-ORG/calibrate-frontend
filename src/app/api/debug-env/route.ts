// src/app/api/debug-env/route.ts
export async function GET() {
  return Response.json({
    backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "NOT SET",
    nodeEnv: process.env.NODE_ENV,
  });
}
