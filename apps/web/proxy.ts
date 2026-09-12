import { NextResponse, type NextRequest } from "next/server";

import { PublicRateLimiter, publicRequestGroup, rateLimitClientKey } from "@/lib/public-rate-limit";

// One limiter in the proxy process, used by both API and verification page
// requests. The pilot runs one application instance. Scale-out needs shared
// rate-limit storage; do not rely on sharing this module with route handlers.
const limiter = new PublicRateLimiter();

export function proxy(request: NextRequest) {
  const clientKey = rateLimitClientKey(request.headers, process.env.TRUST_CADDY_CLIENT_IP === "true");
  const result = limiter.check(clientKey, publicRequestGroup(request.nextUrl.pathname, request.method));
  if (result.allowed) return NextResponse.next();

  const headers = { "Cache-Control": "no-store", "Retry-After": String(result.retryAfterSeconds) };
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment and try again." }, { status: 429, headers });
  }
  return new NextResponse("Please wait a moment before opening another source record, then refresh this page.", {
    status: 429,
    headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/api/:path*", "/passages/:passageId/verification"],
};
