import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/lib/database";
import { getDemoLibrary } from "@/lib/demo-store";
import { getDatabaseLibrary } from "@/lib/library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const databaseLibrary = isDatabaseConfigured() ? await getDatabaseLibrary() : null;
    const library = databaseLibrary && databaseLibrary.total > 0 ? databaseLibrary : getDemoLibrary();
    return NextResponse.json(library, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("Unable to load the public library", error);
    return NextResponse.json({ error: "The library is unavailable right now. Please try again." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
