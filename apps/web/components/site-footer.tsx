import Link from "next/link";
import { LegalContact } from "@/components/legal-page";

export function SiteFooter() {
  return (
    <footer className="site-legal-footer">
      <p>Good Doomscroller is operated by 25D94 LLC.</p>
      <p><Link href="/privacy">Privacy &amp; cookies</Link>{" · "}<Link href="/terms">Terms</Link>{" · "}<Link href="/source-license">Source licensing</Link>{" · "}<LegalContact /></p>
    </footer>
  );
}
