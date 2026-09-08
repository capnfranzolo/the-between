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
  publishable: true,
  flagReason: null,
};

function clamp01(v: unknown): number {
  if (typeof v !== 'number' || isNaN(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

function clampEmotion(v: unknown): number {
  if (typeof v !== 'number' || isNaN(v)) return 3;
  return Math.max(0, Math.min(6, Math.round(v)));
}

// Safe default: never let an LLM hiccup (missing/malformed field) block a submission.
function parsePublishable(v: unknown): boolean {
  if (typeof v !== 'boolean') return true;
  return v;
}

function parseFlagReason(v: unknown, publishable: boolean): string | null {
  if (publishable) return null;
  return typeof v === 'string' && v.trim() ? v : 'flagged';
}

export async function extractDimensions(answer: string): Promise<DimensionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[dimensions] ANTHROPIC_API_KEY not set — returning defaults');
    return DEFAULTS;
  }

  try {
    // Identity-linked API keys must name the workspace the request acts in.
    // Absent the env var this is a no-op, so standard keys are unaffected.
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
    const client = new Anthropic({
      apiKey,
      ...(workspaceId
        ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } }
        : {}),
    });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      system: DIMENSION_PROMPT,
      messages: [{ role: 'user', content: answer }],
    });

    let text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    // The model occasionally wraps the JSON in a markdown code fence despite being
    // told not to — strip it rather than fail closed into defaults.
    const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fenceMatch) text = fenceMatch[1];
    const parsed = JSON.parse(text);

    const publishable = parsePublishable(parsed.publishable);

    const result: DimensionResult = {
      certainty:     clamp01(parsed.certainty),
      warmth:        clamp01(parsed.warmth),
      tension:       clamp01(parsed.tension),
      vulnerability: clamp01(parsed.vulnerability),
      scope:         clamp01(parsed.scope),
      rootedness:    clamp01(parsed.rootedness),
      emotionIndex:  clampEmotion(parsed.emotionIndex),
      reasoning:     typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      publishable,
      flagReason:    parseFlagReason(parsed.flagReason, publishable),
    };

    console.log('[dimensions] extracted:', result);
    return result;
  } catch (err) {
    console.error('[dimensions] extraction failed, using defaults:', err);
    return DEFAULTS;
  }
}
