import { SOURCE_LICENSE_NOTICE, SOURCE_LICENSE_PATH } from "@/lib/source-license";

export function SourceLicenseNotice() {
  const [before, after] = SOURCE_LICENSE_NOTICE.split("Project Gutenberg™ License");
  return (
    <aside className="source-license-notice" aria-label="Project Gutenberg source license">
      <p>{before}<a href={SOURCE_LICENSE_PATH}>Project Gutenberg™ License</a>{after}</p>
    </aside>
  );
}
