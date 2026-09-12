import type { AiContext } from "@/lib/types";

export function AiPassageContext({ context }: { context?: AiContext }) {
  if (!context) return null;

  return (
    <div className="ai-context" role="note" aria-label="AI context">
      <p className="ai-context-label">AI context</p>
      <p className="ai-context-text">{context.text}</p>
      <p className="ai-context-disclosure">
        AI-generated interpretation; may be inaccurate.
        <span> Not part of the original quotation.</span>
      </p>
    </div>
  );
}
