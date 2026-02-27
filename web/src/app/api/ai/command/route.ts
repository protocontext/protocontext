import type {
  ChatMessage,
  ToolName,
} from '@/components/editor/use-chat';
import type { NextRequest } from 'next/server';

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import {
  type LanguageModel,
  type UIMessageStreamWriter,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  Output,
  streamText,
  tool,
} from 'ai';
// Output.array and Output.choice are ai@4 APIs; we use Output.object for ai@5
import { NextResponse } from 'next/server';
import { type SlateEditor, createSlateEditor, nanoid } from 'platejs';
// Use zod/v3 for compatibility with @ai-sdk FlexibleSchema types
import { z } from 'zod/v3';

import { BaseEditorKit } from '@/components/editor/editor-base-kit';
import { markdownJoinerTransform } from '@/lib/markdown-joiner-transform';

import {
  buildEditTableMultiCellPrompt,
  getChooseToolPrompt,
  getCommentPrompt,
  getEditPrompt,
  getGeneratePrompt,
} from './prompt';

/** Resolve an AI LanguageModel from a model string like "openai/gpt-4o-mini" */
function resolveModel(modelString: string, apiKey: string): LanguageModel {
  const [provider, ...rest] = modelString.split('/');
  const modelId = rest.join('/');

  if (provider === 'gemini' || provider === 'google') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createGoogleGenerativeAI({ apiKey })(modelId || 'gemini-2.0-flash') as any;
  }

  if (provider === 'openrouter') {
    return createOpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })(modelId || 'openai/gpt-4o-mini') as any;
  }

  // Default: OpenAI-compatible
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createOpenAI({ apiKey })(modelId || 'gpt-4o-mini') as any;
}

export async function POST(req: NextRequest) {
  const { apiKey: key, ctx, messages: messagesRaw, model } = await req.json();

  const { children, selection, toolName: toolNameParam } = ctx;

  const editor = createSlateEditor({
    plugins: BaseEditorKit,
    selection,
    value: children,
  });

  const apiKey = key || process.env.AI_API_KEY || '';

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing AI API key. Configure it in Settings.' },
      { status: 401 }
    );
  }

  const modelString = model || 'openai/gpt-4o-mini';
  const smartModel = model?.includes('gemini')
    ? model
    : model || 'google/gemini-2.0-flash';

  const isSelecting = editor.api.isExpanded();

  try {
    const stream = createUIMessageStream<ChatMessage>({
      execute: async ({ writer }) => {
        let toolName = toolNameParam;

        if (!toolName) {
          const prompt = getChooseToolPrompt({
            isSelecting,
            messages: messagesRaw,
          });

          const enumOptions = isSelecting
            ? ['generate', 'edit', 'comment']
            : ['generate', 'comment'];

          const choiceResult = await generateText({
            model: resolveModel(smartModel, apiKey),
            prompt: `${prompt}\n\nRespond with exactly one word from this list: ${enumOptions.join(', ')}. Output only the word, nothing else.`,
          });
          const responseText = choiceResult.text.trim().toLowerCase().split(/\s/)[0];
          const AIToolName = (enumOptions.find((opt) => responseText === opt) ??
            enumOptions[0]) as ToolName;

          writer.write({
            data: AIToolName as ToolName,
            type: 'data-toolName',
          });

          toolName = AIToolName;
        }

        const stream = streamText({
          experimental_transform: markdownJoinerTransform(),
          model: resolveModel(modelString, apiKey),
          // Not used
          prompt: '',
          tools: {
            comment: getCommentTool(editor, {
              messagesRaw,
              model: resolveModel(smartModel, apiKey),
              writer,
            }),
            table: getTableTool(editor, {
              messagesRaw,
              model: resolveModel(smartModel, apiKey),
              writer,
            }),
          },
          prepareStep: async (step) => {
            if (toolName === 'comment') {
              return {
                ...step,
                toolChoice: { toolName: 'comment', type: 'tool' },
              };
            }

            if (toolName === 'edit') {
              const [editPrompt, editType] = getEditPrompt(editor, {
                isSelecting,
                messages: messagesRaw,
              });

              // Table editing uses the table tool
              if (editType === 'table') {
                return {
                  ...step,
                  toolChoice: { toolName: 'table', type: 'tool' },
                };
              }

              return {
                ...step,
                activeTools: [],
                model:
                  editType === 'selection'
                    ? resolveModel(smartModel, apiKey)
                    : resolveModel(modelString, apiKey),
                messages: [
                  {
                    content: editPrompt,
                    role: 'user',
                  },
                ],
              };
            }

            if (toolName === 'generate') {
              const generatePrompt = getGeneratePrompt(editor, {
                isSelecting,
                messages: messagesRaw,
              });

              return {
                ...step,
                activeTools: [],
                messages: [
                  {
                    content: generatePrompt,
                    role: 'user',
                  },
                ],
                model: resolveModel(modelString, apiKey),
              };
            }
          },
        });

        writer.merge(stream.toUIMessageStream({ sendFinish: false }));
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch {
    return NextResponse.json(
      { error: 'Failed to process AI request' },
      { status: 500 }
    );
  }
}

const getCommentTool = (
  editor: SlateEditor,
  {
    messagesRaw,
    model,
    writer,
  }: {
    messagesRaw: ChatMessage[];
    model: LanguageModel;
    writer: UIMessageStreamWriter<ChatMessage>;
  }
) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (tool as any)({
    description: 'Comment on the content',
    inputSchema: z.object({}),
    execute: async () => {
      const commentSchema = z.object({
        blockId: z
          .string()
          .describe(
            'The id of the starting block. If the comment spans multiple blocks, use the id of the first block.'
          ),
        comment: z
          .string()
          .describe('A brief comment or explanation for this fragment.'),
        content: z
          .string()
          .describe(
            String.raw`The original document fragment to be commented on.It can be the entire block, a small part within a block, or span multiple blocks. If spanning multiple blocks, separate them with two \n\n.`
          ),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamResult = (streamText as any)({
        model,
        experimental_output: Output.object({ schema: z.array(commentSchema) }),
        prompt: getCommentPrompt(editor, {
          messages: messagesRaw,
        }),
      });

      let lastLength = 0;

      for await (const partialArray of streamResult.experimental_partialOutputStream) {
        for (let i = lastLength; i < partialArray.length; i++) {
          const comment = partialArray[i];
          const commentDataId = nanoid();

          writer.write({
            id: commentDataId,
            data: {
              comment,
              status: 'streaming',
            },
            type: 'data-comment',
          });
        }

        lastLength = partialArray.length;
      }

      writer.write({
        id: nanoid(),
        data: {
          comment: null,
          status: 'finished',
        },
        type: 'data-comment',
      });
    },
  });

const getTableTool = (
  editor: SlateEditor,
  {
    messagesRaw,
    model,
    writer,
  }: {
    messagesRaw: ChatMessage[];
    model: LanguageModel;
    writer: UIMessageStreamWriter<ChatMessage>;
  }
) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (tool as any)({
    description: 'Edit table cells',
    inputSchema: z.object({}),
    execute: async () => {
      const cellUpdateSchema = z.object({
        content: z
          .string()
          .describe(
            String.raw`The new content for the cell. Can contain multiple paragraphs separated by \n\n.`
          ),
        id: z.string().describe('The id of the table cell to update.'),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamResult = (streamText as any)({
        model,
        experimental_output: Output.object({ schema: z.array(cellUpdateSchema) }),
        prompt: buildEditTableMultiCellPrompt(editor, messagesRaw),
      });

      let lastLength = 0;

      for await (const partialArray of streamResult.experimental_partialOutputStream) {
        for (let i = lastLength; i < partialArray.length; i++) {
          const cellUpdate = partialArray[i];

          writer.write({
            id: nanoid(),
            data: {
              cellUpdate,
              status: 'streaming',
            },
            type: 'data-table',
          });
        }

        lastLength = partialArray.length;
      }

      writer.write({
        id: nanoid(),
        data: {
          cellUpdate: null,
          status: 'finished',
        },
        type: 'data-table',
      });
    },
  });
