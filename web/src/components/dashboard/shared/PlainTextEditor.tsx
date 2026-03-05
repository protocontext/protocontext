"use client";

import { useEditor, EditorContent, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Convert a plain-text string into Tiptap-compatible HTML paragraphs. */
function textToHtml(text: string): string {
    if (!text) return "<p></p>";
    return text
        .split("\n")
        .map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
        .join("");
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PlainTextEditorProps {
    value: string;
    onChange: (text: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    /** CSS height, e.g. "480px", "150px", "auto". Default "200px". */
    height?: string;
    /** Monospace font (default true). */
    mono?: boolean;
    /** Auto-focus on mount. */
    autoFocus?: boolean;
    /** Fire on Cmd+Enter / Ctrl+Enter. */
    onSubmit?: () => void;
    /** Disable spellcheck (default true). */
    spellCheck?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlainTextEditor({
    value,
    onChange,
    placeholder,
    disabled = false,
    className,
    height = "200px",
    mono = true,
    autoFocus = false,
    onSubmit,
    spellCheck = false,
}: PlainTextEditorProps) {
    const isInternalChange = useRef(false);

    // Optional Cmd+Enter extension -------------------------------------------
    const SubmitExtension = useCallback(
        () =>
            Extension.create({
                name: "submitShortcut",
                addKeyboardShortcuts() {
                    return {
                        "Mod-Enter": () => {
                            onSubmit?.();
                            return true;
                        },
                    };
                },
            }),
        [onSubmit],
    );

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // Disable rich-text features — plain text only
                bold: false,
                italic: false,
                strike: false,
                code: false,
                codeBlock: false,
                heading: false,
                blockquote: false,
                bulletList: false,
                orderedList: false,
                listItem: false,
                horizontalRule: false,
            }),
            Placeholder.configure({ placeholder: placeholder ?? "" }),
            ...(onSubmit ? [SubmitExtension()] : []),
        ],
        content: textToHtml(value),
        immediatelyRender: false,
        editable: !disabled,
        autofocus: autoFocus,
        editorProps: {
            attributes: {
                spellcheck: spellCheck ? "true" : "false",
                class: cn(
                    "outline-none min-h-[1.5em] w-full",
                    mono && "font-mono",
                ),
            },
        },
        onUpdate: ({ editor: ed }) => {
            isInternalChange.current = true;
            onChange(ed.getText({ blockSeparator: "\n" }));
        },
    });

    // Sync external value → editor (e.g. loading content from API)
    useEffect(() => {
        if (!editor) return;
        if (isInternalChange.current) {
            isInternalChange.current = false;
            return;
        }
        const currentText = editor.getText({ blockSeparator: "\n" });
        if (currentText !== value) {
            editor.commands.setContent(textToHtml(value));
        }
    }, [value, editor]);

    // Sync disabled prop
    useEffect(() => {
        if (editor) editor.setEditable(!disabled);
    }, [disabled, editor]);

    return (
        <div
            className={cn(
                "rounded-md border border-input bg-background text-sm overflow-y-auto",
                "[&_.tiptap]:px-3 [&_.tiptap]:py-2 [&_.tiptap]:leading-relaxed",
                "[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0",
                disabled && "cursor-not-allowed opacity-50",
                className,
            )}
            style={{ height, maxHeight: height === "auto" ? undefined : height }}
        >
            <EditorContent editor={editor} />
        </div>
    );
}

/**
 * Expose the underlying Tiptap editor instance so parent components
 * (e.g. EditorPanel search) can call methods like getText(), commands, etc.
 */
PlainTextEditor.displayName = "PlainTextEditor";

export type { Editor } from "@tiptap/react";
export { useEditor } from "@tiptap/react";
