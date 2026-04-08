import { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const backendRes = await fetch(`${BACKEND_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Forward the streaming response
  return new Response(backendRes.body, {
    status: backendRes.status,
    headers: {
      "Content-Type": backendRes.headers.get("Content-Type") || "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
