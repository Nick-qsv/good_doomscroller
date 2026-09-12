export function sourceSectionLabel(title: string): string {
  // The normalizer uses this fallback when a source has no recognized heading.
  // It can contain multiple printed chapters, so don't present it as Chapter 1.
  return title
    .replace(/^Chapter (\d+)$/, "Source section $1")
    .replace(/\[\d+\]/g, "")
    .trim();
}
