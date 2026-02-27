/**
 * Utilities for converting between context.txt format and Markdown
 * for use with the Plate.js rich-text editor.
 *
 * context.txt uses `## section: SectionName` headings.
 * Plate/Markdown uses plain `## SectionName` H2 headings.
 *
 * We strip the "section: " prefix when loading into the editor,
 * and restore it when serializing back to context.txt.
 */

/**
 * Prepare a raw context.txt string for the Plate editor.
 * Transforms "## section: X" → "## X" so the editor displays
 * clean H2 headings.
 */
export function prepareForEditor(raw: string): string {
  if (!raw) return '';
  return raw.replace(/^## section:\s*/gm, '## ');
}

/**
 * Serialize the editor's Markdown output back to context.txt format.
 * Transforms "## X" → "## section: X", skipping any H2 that already
 * starts with "section:".
 */
export function serializeToContextTxt(md: string): string {
  if (!md) return '';
  return md.replace(/^## (?!section:)(.+)/gm, '## section: $1');
}
