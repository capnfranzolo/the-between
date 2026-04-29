import Anthropic from '@anthropic-ai/sdk';
import { DIMENSION_PROMPT, type DimensionResult } from './prompt';

const DEFAULTS: DimensionResult = {
  certainty: 0.5,
  warmth: 0.5,
  tension: 0.5,
  vulnerability: 0.5,
  scope: 0.5,
  rootedness: 0.5,
  emotionIndex: 3,
  reasoning: 'default',
};

function clamp01(v: unknown): number {
  if (typeof v !== 'number' || isNaN(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

function clampEmotion(v: unknown): number {
  if (typeof v !== 'number' || isNaN(v)) return 3;
  return Math.max(0, Math.min(6, Math.round(v)));
}

export async function extractDimensions(answer: string): Promise<DimensionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[dimensions] ANTHROPIC_API_KEY not set — returning defaults');
    return DEFAULTS;
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: DIMENSION_PROMPT,
      messages: [{ role: 'user', content: answer }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    const parsed = JSON.parse(text);

    const result: DimensionResult = {
      certainty:     clamp01(parsed.certainty),
      warmth:        clamp01(parsed.warmth),
      tension:       clamp01(parsed.tension),
      vulnerability: clamp01(parsed.vulnerability),
      scope:         clamp01(parsed.scope),
      rootedness:    clamp01(parsed.rootedness),
      emotionIndex:  clampEmotion(parsed.emotionIndex),
      reasoning:     typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };

    console.log('[dimensions] extracted:', result);
    return result;
  } catch (err) {
    console.error('[dimensions] extraction failed, using defaults:', err);
    return DEFAULTS;
  }
}
