'use client';

import { DocxPlugin } from '@platejs/docx';
import { JuicePlugin } from '@platejs/juice';

/**
 * Plugins needed when serializing editor content to DOCX for export.
 * Used by ExportToolbarButton to build a temporary editor that
 * can produce HTML suitable for conversion to Word format.
 */
export const DocxExportKit = [DocxPlugin, JuicePlugin];
