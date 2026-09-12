import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { QuoteVerification } from "@/components/quote-verification";
import { getPassageVerification } from "@/lib/verification";

export const metadata: Metadata = {
  title: "Verify quote",
  description: "Inspect the source edition, surrounding text, and recorded verification of a book passage.",
};

export const dynamic = "force-dynamic";

export default async function VerifyQuotePage({ params }: { params: Promise<{ passageId: string }> }) {
  const { passageId } = await params;
  const verification = await getPassageVerification(passageId);
  if (!verification) notFound();
  return <QuoteVerification verification={verification} />;
}
