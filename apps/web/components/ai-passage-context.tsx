import { AnalyticsImpression } from "@/components/analytics";
import type { AiContext } from "@/lib/types";

export function AiPassageContext({ context, passageId }: { context?: AiContext; passageId?: string }) {
  if (!context) return null;

  return (
    <AnalyticsImpression passageId={passageId} className="ai-context" role="note" aria-label="AI context">
      <p className="ai-context-label">AI context</p>
      <p className="ai-context-text">{context.text}</p>
      <p className="ai-context-disclosure">
        AI-generated interpretation; may be inaccurate.
        <span> Not part of the original quotation.</span>
      </p>
    </AnalyticsImpression>
  );
}
