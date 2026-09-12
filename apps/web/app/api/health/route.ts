import { NextResponse } from "next/server";

import { checkDatabase, isDatabaseConfigured } from "@/lib/database";
import { assertActorCookieConfiguration } from "@/lib/identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    assertActorCookieConfiguration();
    if (!isDatabaseConfigured()) {
      return NextResponse.json({
        status: "ok",
        mode: "demo",
        database: "not_configured",
      });
    }

    await checkDatabase();
    return NextResponse.json({ status: "ok", mode: "database", database: "connected" });
  } catch (error) {
    console.error("Application health check failed", error);
    return NextResponse.json(
      { status: "error" },
      { status: 503 },
    );
  }
}
