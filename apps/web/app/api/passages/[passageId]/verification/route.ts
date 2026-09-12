import { NextResponse } from "next/server";
import { getPassageVerification } from "@/lib/verification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ passageId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const result = await getPassageVerification((await context.params).passageId);
    return NextResponse.json(result ?? { error: "Passage not found." }, {
      status: result ? 200 : 404, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Verification is unavailable right now." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
