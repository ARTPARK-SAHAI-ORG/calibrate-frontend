"use client";

// This is a CLIENT-SIDE component that shows what the browser sees
// NEXT_PUBLIC_* vars are embedded at BUILD time, not runtime

export default function DebugClientPage() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  
  return (
    <div style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1>Client-Side Environment Debug</h1>
      <p>This shows what the browser&apos;s JavaScript sees (embedded at build time):</p>
      <pre style={{ background: "#1a1a1a", color: "#fff", padding: "1rem", borderRadius: "8px" }}>
        {JSON.stringify({
          NEXT_PUBLIC_BACKEND_URL: backendUrl || "NOT SET / EMPTY",
          typeof_backendUrl: typeof backendUrl,
          isEmpty: backendUrl === "",
          isUndefined: backendUrl === undefined,
        }, null, 2)}
      </pre>
      <p style={{ marginTop: "1rem", color: "#888" }}>
        If this shows &quot;NOT SET&quot; but /api/debug-env shows the correct URL,<br/>
        you need to redeploy WITHOUT build cache to rebuild the client JS.
      </p>
    </div>
  );
}
