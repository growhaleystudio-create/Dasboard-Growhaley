/**
 * content-tags.ts — Formats content tags for prompt generation
 */

function cleanPromptTag(tag: string): string {
  return tag
    .replace(/[|/#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ')
    .slice(0, 24)
    .toUpperCase();
}

/**
 * Builds the content tags section for the LLM prompt.
 */
export function buildContentTagsSection(tags: string[] | undefined): string {
  const cleaned = (tags ?? []).map(cleanPromptTag).filter(Boolean).slice(0, 10);
  if (cleaned.length === 0) {
    return '\n[CONTENT TAGS]\nTidak ada tag config dari user. Pilih sendiri 1 tag pendek per slide sesuai isi slide.';
  }
  return `\n[CONTENT TAGS — WAJIB]
User mengisi tags config: ${JSON.stringify(cleaned)}.
Aturan:
- Gunakan tag dari daftar itu untuk nested_groups.top_meta tag.
- TEPAT 1 tag per slide.
- Jika tag lebih sedikit dari slide, rotate/reuse sesuai urutan slide.
- Jangan mengarang tag baru kecuali daftar kosong.
- Tag tetap 1-3 kata, uppercase.`;
}
