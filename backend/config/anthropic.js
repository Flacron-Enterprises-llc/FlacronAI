const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

// Primary AI provider (client directive 2026-07-18). Model is configurable so the
// client can trade quality vs cost without a code change; defaults to Opus 4.8.
// NOTE: Opus 4.8 / Sonnet 5 reject `temperature`/`top_p`/`top_k` and `budget_tokens`
// (400) — do not pass sampling params or a thinking budget on those models.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

let client;
const getClient = () => {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY not set — Claude unavailable (will fall back to watsonx)');
    return null;
  }
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
};

// Collapse a Messages API response into plain text; throw on refusal / empty.
const textOf = (resp) => {
  if (resp.stop_reason === 'refusal') {
    const cat = resp.stop_details && resp.stop_details.category;
    throw new Error(`Claude declined the request${cat ? ` (${cat})` : ''}`);
  }
  const text = (resp.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) throw new Error('Claude returned empty content');
  return text;
};

// Text generation. `maxTokens` <= ~16000 stays under the SDK's non-streaming timeout.
const generateText = async (prompt, { maxTokens = 4096, system } = {}) => {
  const c = getClient();
  if (!c) throw new Error('Anthropic not configured (ANTHROPIC_API_KEY missing)');
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }],
  });
  return textOf(resp);
};

// Vision. `imageBlocks` are prebuilt Anthropic image content blocks
// ({ type: 'image', source: { type: 'base64', media_type, data } }).
const analyzeImages = async (promptText, imageBlocks, { maxTokens = 2000 } = {}) => {
  const c = getClient();
  if (!c) throw new Error('Anthropic not configured (ANTHROPIC_API_KEY missing)');
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: [{ type: 'text', text: promptText }, ...imageBlocks] }],
  });
  return textOf(resp);
};

const checkHealth = async () => {
  const c = getClient();
  if (!c) return false;
  try {
    await c.models.retrieve(MODEL);
    return true;
  } catch {
    return false;
  }
};

module.exports = { getClient, generateText, analyzeImages, checkHealth, MODEL };
