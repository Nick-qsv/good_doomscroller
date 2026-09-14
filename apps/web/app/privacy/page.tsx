import type { Metadata } from "next";
import { CookiePreferences } from "@/components/cookie-consent";
import { LegalContact, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy & cookies",
  description: "How 25D94 LLC handles information on Good Doomscroller and how to manage optional analytics.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy & cookies">
      <section aria-labelledby="cookie-choice">
        <h2 id="cookie-choice">Your cookie choice</h2>
        <p>Optional analytics are off unless you accept. Declining does not prevent reading, filtering, or reacting. You may withdraw consent here at any time.</p>
        <CookiePreferences enabled={process.env.ANALYTICS_ENABLED !== "false"} />
      </section>
      <section>
        <h2>1. Scope and responsibility</h2>
        <p>This notice describes the information practices of 25D94 LLC (the “Company,” “we,” “us,” or “our”) for Good Doomscroller (the “Service”). Where applicable law uses that term, the Company is the controller of the personal data described here. The public reading service requires no account, real name, email address, or payment details.</p>
      </section>
      <section>
        <h2>2. Essential functions and browser storage</h2>
        <p>An essential first-party cookie, <code>good_doomscroll_actor</code>, contains a random, signed browser identifier with a maximum lifetime of one year. Our server associates that identifier with reactions, passage-delivery history, pagination records, and activity timestamps so we can remember reactions and serve unseen passages. These records are pseudonymous, rather than necessarily anonymous: they distinguish a browser without requiring your real-world identity.</p>
        <p>Reading font, text size, and analytics choice are stored locally in your browser. Analytics session state is stored in session storage after acceptance. Removing cookies or local storage resets local preferences and may cause passages to repeat. It does not itself delete server records, and may leave us unable to associate those records with your browser.</p>
      </section>
      <section>
        <h2>3. Optional analytics</h2>
        <p>Following consent, first-party usage events record visits, passage views, foreground reading time, reactions, AI-context and verification use, downloads, and reported failures. Events contain timestamps, relevant passage identifiers, a temporary session identifier, coarse device/browser categories, and, for page views, an external referring hostname. Sessions rotate after 30 minutes of inactivity and are separate from the essential feed/reaction identifier.</p>
        <p>The analytics event store does not retain raw IP addresses, full user-agent strings, referring URL paths, URL query strings, email addresses, or text entered by visitors. Pseudonymous events can still constitute personal data under applicable law.</p>
        <p>We do not use advertising trackers, sell personal data, or share it for cross-context behavioral advertising. Global Privacy Control and Do Not Track disable optional analytics. Withdrawing consent clears queued events and analytics session state in that browser; it does not automatically erase previously received events.</p>
      </section>
      <section>
        <h2>4. Requests, correspondence, and infrastructure</h2>
        <p>Serving and securing the site necessarily involves processing network requests, including IP addresses, request URLs, user-agent information, timestamps, and error or security information. Hosting, delivery, and logging systems may process or retain this information separately from optional analytics. Request information also supports abuse prevention and rate limits.</p>
        <p>If you contact us, we receive your address, message, and attachments and use them to respond, investigate, and maintain appropriate business or legal records. Please do not send passwords, payment-card details, or unnecessary sensitive information.</p>
      </section>
      <section>
        <h2>5. Purposes and disclosures</h2>
        <p>We process information to provide requested features, operate and secure the Service, respond to correspondence, meet legal obligations, and, with consent, understand usage. Where a legal basis is required, we rely on consent for optional analytics, applicable legitimate interests in operation and security, and compliance with legal obligations as appropriate.</p>
        <p>Service providers process information as necessary to supply hosting, database, storage, security, and communications services, including Amazon Web Services for application infrastructure. We may disclose information as reasonably necessary to comply with law or valid legal process, protect rights or safety, investigate abuse, or carry out a business transfer subject to applicable law and this notice. We do not publish individual reading histories or analytics records.</p>
        <p>AI interpretations are prepared in the editorial workflow. Opening one displays stored text; it does not send your reading history to an AI chatbot. Source sites and blockchain explorers operate independently under their own privacy terms. Public verification records concern literary passages and editorial decisions, not visitor activity.</p>
      </section>
      <section>
        <h2>6. Retention and security</h2>
        <p>Raw optional analytics have a 90-day retention target. Expired events are eligible for deletion through maintenance; deletion may lag because of maintenance timing or backlogs. Essential identifiers, reactions, and feed history do not currently have an automatic age-based deletion schedule. Server-side retention is not limited to the cookie’s one-year lifetime. Contact us to request deletion of records we can reasonably identify.</p>
        <p>Correspondence, infrastructure logs, backups, and records needed for security, disputes, or legal obligations follow separate operational retention periods. We use safeguards appropriate to the Service, but no transmission or storage system can be warranted completely secure.</p>
      </section>
      <section>
        <h2>7. Your rights and international visitors</h2>
        <p>Depending on your location and applicable law, you may have rights to access, correct, delete, or obtain a copy of personal data, object to or restrict processing, withdraw consent, or complain to a supervisory authority. Send requests to <LegalContact />. We may request proportionate information to verify your request and locate records. Because we do not require accounts or real names, a name or email may not identify a browser’s records. Rights are subject to applicable exceptions; exercising them will not result in unlawful discrimination.</p>
        <p>The Company operates in New York, United States, and application infrastructure is hosted in the United States. Access from another country may involve processing in the United States. This notice does not waive protections that applicable law makes nonwaivable.</p>
      </section>
      <section>
        <h2>8. Children and changes</h2>
        <p>The Service is intended for a general audience and is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided such information, contact <LegalContact /> so we can investigate and take appropriate action.</p>
        <p>We may revise this notice as practices change and will update the date above. Where required, we will provide additional notice or obtain renewed consent before materially different processing begins.</p>
      </section>
    </LegalPage>
  );
}
