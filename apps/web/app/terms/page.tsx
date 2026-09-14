import type { Metadata } from "next";
import Link from "next/link";
import { LegalContact, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms governing use of Good Doomscroller, operated by 25D94 LLC.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <section>
        <h2>1. The Service and these Terms</h2>
        <p>These Terms of Use (“Terms”) govern access to Good Doomscroller and its reading, reaction, and verification features (the “Service”), operated by 25D94 LLC (“Company,” “we,” “us,” or “our”). By using the Service after having an opportunity to review these Terms, you agree to them to the extent permitted by applicable law. If you do not agree, discontinue use. Nothing here limits any right or remedy that cannot lawfully be excluded or waived.</p>
        <p>The Service currently offers free access without accounts, subscriptions, or payment collection. Its library and features may change; we may correct, restrict, suspend, or remove material or functionality.</p>
      </section>
      <section>
        <h2>2. Literary material, software, and source rights</h2>
        <p>Literary quotations remain attributable to their respective authors and editions. We claim no exclusive copyright in public-domain works. Review concerns particular editions and source files; copyright duration, translations, annotations, moral rights, and other restrictions may differ by country. Publication here is not a warranty that every use is permitted in every jurisdiction.</p>
        <p>Project Gutenberg materials remain subject to applicable source notices and the <Link href="/source-license">source licensing information</Link>. Third-party names and marks belong to their respective owners. No affiliation, sponsorship, or endorsement by a source provider, author, estate, or blockchain network is implied.</p>
        <p>The application’s published source code is separately licensed under the MIT License, and project-authored corpus metadata is dedicated under CC0 where legally possible. Those licenses govern their respective materials and are not narrowed by these Terms. Neither grants rights in unrelated third-party content or trademarks, or permission to interfere with the hosted Service.</p>
      </section>
      <section>
        <h2>3. AI interpretation and verification limitations</h2>
        <p><strong>AI-generated interpretation; may be inaccurate.</strong> AI context is separate editorial material, not part of the original quotation, and may be incomplete, misleading, or mistaken. Content is supplied for general reading and discussion, not individualized medical, legal, financial, or other professional advice. No professional relationship is created.</p>
        <p>Verification checks correspondence with a preserved source and records editorial assertions. A matching source or blockchain timestamp does not establish historical authenticity, factual truth, legal clearance, suitability, completeness, or selection quality. Historical material may express offensive or outdated views; its presentation does not constitute the Company’s endorsement.</p>
      </section>
      <section>
        <h2>4. Acceptable use</h2>
        <p>You may access the Service for lawful purposes. You must not defeat access controls or rate limits, exploit vulnerabilities, introduce malicious code, disrupt availability, impersonate others, manipulate reactions through abusive automation, or violate others’ rights. Ordinary access and reuse permitted by an applicable open license are unaffected. We may limit or suspend abusive traffic to protect the Service.</p>
      </section>
      <section>
        <h2>5. Privacy and external services</h2>
        <p>Our <Link href="/privacy">Privacy &amp; cookies notice</Link> explains browser identifiers, essential history, optional analytics, and choices. External source sites, explorers, and other third-party services operate independently. Their content, availability, security, and terms are outside our control.</p>
      </section>
      <section>
        <h2>6. Disclaimer of warranties</h2>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE,” WITHOUT WARRANTIES OF ANY KIND, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. We do not warrant uninterrupted or error-free operation, preservation of preferences or reactions, or the accuracy, completeness, or suitability of content. Non-excludable statutory warranties remain unaffected.</p>
      </section>
      <section>
        <h2>7. Limitation of liability</h2>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE COMPANY WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR LOST PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR RELATING TO THE SERVICE. Subject to the exceptions below, the Company’s aggregate liability arising out of or relating to the Service shall not exceed US $100.</p>
        <p>These limitations do not exclude or limit liability for fraud, willful misconduct, gross negligence, or any liability or remedy that applicable law prohibits us from excluding or limiting. They apply only to the extent enforceable in your jurisdiction.</p>
      </section>
      <section>
        <h2>8. Copyright concerns and notices</h2>
        <p>Send copyright, privacy, accessibility, or other legal concerns to <LegalContact />. For a rights concern, identify the work and exact page or passage, explain the asserted rights and relevant territory, and provide sufficient contact information for a response. We may restrict material while investigating. This contact is not a representation that we have registered a statutory DMCA agent.</p>
      </section>
      <section>
        <h2>9. Governing law and general provisions</h2>
        <p>Except where mandatory law requires otherwise, these Terms are governed by New York law, without regard to conflict-of-laws rules, and disputes shall be brought in a court of competent jurisdiction in New York County, New York. Mandatory consumer protections and nonwaivable rights to bring proceedings elsewhere remain unaffected.</p>
        <p>An unenforceable provision applies only to the extent permitted; remaining provisions stay in effect. Failure to enforce a provision is not a waiver. We may update these Terms prospectively by posting a revised version and date, with additional notice where legally required. Changes do not retroactively remove accrued rights.</p>
      </section>
    </LegalPage>
  );
}
