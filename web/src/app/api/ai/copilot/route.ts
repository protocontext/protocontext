import type { NextRequest } from 'next/server';

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { type LanguageModel, generateText } from 'ai';
import { NextResponse } from 'next/server';

function resolveModel(modelString: string, apiKey: string): LanguageModel {
  const modelInput = (modelString || '').trim();

  if (!modelInput.includes('/')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createGoogleGenerativeAI({ apiKey })(modelInput || 'gemini-2.5-flash') as any;
  }

  const [provider, ...rest] = modelInput.split('/');
  const modelId = rest.join('/');

  if (provider === 'gemini' || provider === 'google') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createGoogleGenerativeAI({ apiKey })(modelId || 'gemini-2.5-flash') as any;
  }
  if (provider === 'openrouter') {
    return createOpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })(modelId || 'google/gemini-2.5-flash') as any;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createOpenAI({ apiKey })(modelId || 'gpt-4o-mini') as any;
}

export async function POST(req: NextRequest) {
  const {
    apiKey: key,
    model = 'gemini/gemini-2.5-flash',
    prompt,
    system,
  } = await req.json();

  const apiKey = key || process.env.AI_API_KEY || '';

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing AI API key. Configure it in Settings.' },
      { status: 401 }
    );
  }

  try {
    const result = await generateText({
      abortSignal: req.signal,
      maxOutputTokens: 50,
      model: resolveModel(model, apiKey),
      prompt,
      system,
      temperature: 0.7,
    });

    return NextResponse.json({ text: result.text });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(null, { status: 408 });
    }

    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Failed to process AI request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
