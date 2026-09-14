import type { Metadata } from "next";
import { LegalContact, LegalPage } from "@/components/legal-page";
import { SourceLicenseNotice } from "@/components/source-license-notice";
import { SOURCE_LICENSE_PATH, SOURCE_LICENSE_TEXT } from "@/lib/source-license";

export const metadata: Metadata = {
  title: "Source licensing",
  description: "Edition-specific rights review, source notices, and the Project Gutenberg license.",
};

export default function SourceLicensePage() {
  return (
    <LegalPage title="Source licensing">
      <section>
        <h2>Literary works and exact editions</h2>
        <p>We use a conservatively screened library of historical editions. The September 2026 review checks the particular translation, introductions, editors, and preserved source material, rather than relying solely on the original author’s age. Editions with unresolved provenance or more recent substantive contributions are withheld pending further evidence.</p>
        <p>Our current screening standard requires an identified historical edition published no later than 1930, and identified relevant historical contributors who died no later than 1925, together with an applicable public-domain basis or permission for supplemental digital material. This is an editorial risk threshold, not a statement of every country’s law or a guarantee of worldwide clearance. Copyright terms, moral rights, cultural-heritage rules, and other restrictions vary by territory.</p>
        <p>We do not claim exclusive rights in public-domain literary text. For a rights concern about a specific edition, contribution, or territory, contact <LegalContact /> and identify the relevant work and passage.</p>
      </section>
      <section>
        <h2>Project Gutenberg sources</h2>
        <p>The current library uses Project Gutenberg source files. We retain original files and their embedded notices, provide free access, and make the full source license available below and with proof downloads. Source attribution does not imply endorsement or affiliation.</p>
        <SourceLicenseNotice />
        <p><a href={SOURCE_LICENSE_PATH}>Read or save the full license as text</a>{" · "}<a href="https://www.gutenberg.org/policy/license.html">Project Gutenberg’s current license</a>{" · "}<a href="https://www.gutenberg.org/policy/permission.html">Reuse guidance</a></p>
      </section>
      <section>
        <h2>Software and original metadata</h2>
        <p>The application’s published source code uses the MIT License. Project-authored original corpus metadata is dedicated under <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a> where legally possible. These grants do not change the status of underlying literary works, third-party contributions, trademarks, or source-provider material.</p>
      </section>
      <section>
        <h2>Full Project Gutenberg license</h2>
        <pre className="legal-license-text">{SOURCE_LICENSE_TEXT}</pre>
      </section>
    </LegalPage>
  );
}
