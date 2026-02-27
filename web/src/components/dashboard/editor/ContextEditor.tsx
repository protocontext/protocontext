'use client';

import { useEffect, useMemo } from 'react';

import { AIChatPlugin } from '@platejs/ai/react';
import { CopilotPlugin } from '@platejs/ai/react';
import { deserializeMd, serializeMd } from '@platejs/markdown';
import { createSlateEditor } from 'platejs';
import { Plate, usePlateEditor } from 'platejs/react';

import { BaseEditorKit } from '@/components/editor/editor-base-kit';
import { EditorKit } from '@/components/editor/editor-kit';
import { aiChatPlugin } from '@/components/editor/plugins/ai-kit';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { prepareForEditor, serializeToContextTxt } from '@/lib/context-txt';

interface ContextEditorProps {
  /** Raw context.txt content (markdown with ## section: headings) */
  value: string;
  /** Called with the updated context.txt string on every change */
  onChange: (val: string) => void;
  /** Disables editing (e.g. while uploading) */
  disabled?: boolean;
}

/**
 * Rich-text editor wrapper for context.txt content.
 * Displays the content using Plate.js with full AI support (⌘+J).
 * Reads the AI API key + model from localStorage (proto_ai_key / proto_ai_model)
 * that are configured in SubmitPanel's Settings section.
 */
export function ContextEditor({ value, onChange, disabled }: ContextEditorProps) {
  // Convert raw context.txt → Slate nodes on mount only.
  // "## section: X" is stripped to "## X" for display.
  const initialNodes = useMemo(() => {
    const md = prepareForEditor(value ?? '');
    if (!md.trim()) return undefined;
    // Use a lightweight Slate editor (with MarkdownKit) to parse markdown.
    const tempEditor = createSlateEditor({ plugins: BaseEditorKit });
    return deserializeMd(tempEditor, md);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally only on mount — we own the source of truth via onChange

  const editor = usePlateEditor({
    plugins: EditorKit,
    value: initialNodes,
  });

  // Inject the AI key + model from localStorage into the editor's chat plugin.
  // This mirrors how settings-dialog.tsx injects the key, but reads from the
  // same localStorage keys used by the rest of the SubmitPanel UI.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const apiKey = localStorage.getItem('proto_ai_key') ?? '';
    const model =
      localStorage.getItem('proto_ai_model') ?? 'openai/gpt-4o-mini';

    if (!apiKey) return;

    const chatOptions = editor.getOptions(aiChatPlugin).chatOptions ?? {};
    editor.setOption(aiChatPlugin, 'chatOptions', {
      ...chatOptions,
      body: {
        ...chatOptions.body,
        apiKey,
        model,
      },
    });

    // Also inject into Copilot (inline ghost-text suggestions)
    try {
      editor.setOption(CopilotPlugin, 'completeOptions', {
        body: { apiKey, model },
      });
    } catch {
      // CopilotPlugin may not be registered in all kit variants — ignore
    }
  }, [editor]);

  return (
    <div className="rounded-lg border border-input overflow-hidden min-h-[12rem]">
      <Plate
        editor={editor}
        readOnly={disabled}
        onChange={() => {
          // Serialize the current editor children back to context.txt markdown.
          const md = serializeMd(editor);
          onChange(serializeToContextTxt(md));
        }}
      >
        <EditorContainer>
          <Editor readOnly={disabled} />
        </EditorContainer>
      </Plate>
    </div>
  );
}
