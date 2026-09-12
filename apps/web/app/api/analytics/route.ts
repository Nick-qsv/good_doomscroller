import { NextResponse } from "next/server";

import { analyticsAudience, analyticsOriginAllowed, parseAnalyticsBatch, readAnalyticsBody } from "@/lib/analytics";
import { saveAnalyticsEvents } from "@/lib/analytics-store";
import { isDatabaseConfigured } from "@/lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
let nextWarningAt = 0;

export async function POST(request: Request) {
  if (!analyticsOriginAllowed(request)) return new NextResponse(null, { status: 403, headers });
  if (process.env.ANALYTICS_ENABLED === "false" || request.headers.get("dnt") === "1"
    || request.headers.get("sec-gpc") === "1" || analyticsAudience(request.headers.get("user-agent")).bot) {
    return new NextResponse(null, { status: 204, headers });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return new NextResponse(null, { status: 415, headers });
  }
  let events;
  try {
    events = parseAnalyticsBatch(await readAnalyticsBody(request), request.headers.get("user-agent"), new URL(request.url).hostname);
  } catch (error) {
    return new NextResponse(null, { status: error instanceof RangeError ? 413 : 400, headers });
  }
  if (!events) return new NextResponse(null, { status: 400, headers });
  try {
    if (!isDatabaseConfigured()) return new NextResponse(null, { status: 204, headers });
    await saveAnalyticsEvents(events);
    return new NextResponse(null, { status: 202, headers });
  } catch {
    // Never log a request payload, session ID, user agent, or database error.
    if (Date.now() >= nextWarningAt) {
      console.warn("Analytics event storage unavailable");
      nextWarningAt = Date.now() + 60_000;
    }
    return new NextResponse(null, { status: 503, headers });
  }
}
