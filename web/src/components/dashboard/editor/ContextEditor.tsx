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
  /** AI API key — passed directly so we don't rely on localStorage */
  apiKey?: string;
  /** AI model string e.g. "gemini/gemini-2.0-flash" */
  model?: string;
}

/**
 * Rich-text editor wrapper for context.txt content.
 * Displays the content using Plate.js with full AI support (⌘+J).
 * Receives apiKey + model as props (from the EditorPanel AI settings).
 */
export function ContextEditor({ value, onChange, disabled, apiKey = '', model = 'openai/gpt-4o-mini' }: ContextEditorProps) {
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

  // Inject the AI key + model into the editor's chat plugin whenever they change.
  useEffect(() => {
    if (!apiKey) return;
    const chatOptions = editor.getOptions(aiChatPlugin).chatOptions ?? {};
    editor.setOption(aiChatPlugin, 'chatOptions', {
      ...chatOptions,
      body: { ...chatOptions.body, apiKey, model },
    });
    try {
      editor.setOption(CopilotPlugin, 'completeOptions', {
        body: { apiKey, model },
      });
    } catch {
      // CopilotPlugin may not be in all kit variants — ignore
    }
  }, [editor, apiKey, model]);

  return (
    <div className="rounded-lg border border-input overflow-hidden h-[480px] flex flex-col">
      <Plate
        editor={editor}
        readOnly={disabled}
        onChange={() => {
          const md = serializeMd(editor);
          onChange(serializeToContextTxt(md));
        }}
      >
        <EditorContainer className="flex-1 overflow-y-auto h-full">
          <Editor readOnly={disabled} className="min-h-full pb-16" />
        </EditorContainer>
      </Plate>
    </div>
  );
}
