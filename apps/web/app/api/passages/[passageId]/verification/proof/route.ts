import { getVerificationDownload } from "@/lib/verification";
import { reserveDownloadBytes } from "@/lib/download-budget";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ passageId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { passageId } = await context.params;
    const data = await getVerificationDownload(passageId, "proof");
    if (!data) return Response.json({ error: "Verified passage not found." }, { status: 404 });
    const limited = reserveDownloadBytes(data.length);
    if (limited) return limited;
    return new Response(new Uint8Array(data), { headers: {
      "Content-Length": String(data.length),
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${passageId}-proof.json"`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return Response.json({ error: "Proof is unavailable right now." }, { status: 503 });
  }
}
