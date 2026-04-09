import { defineAgent, defineSoul } from '@dspo/tauri-agent';

import soulMarkdown from '../SOUL.MD?raw';

export const DEMO_CONFIG_ID = 'cosmic-demo';
export const COSMIC_TOOL_ID = 'cosmic.resolve_zodiac_sign';

export const quickPrompts = [
  '请读取 1998-02-14 的今日宇宙天气，并给我一张简洁卡片。',
  '我生日是 2001-11-05，今天更适合推进创作还是整理事务？',
  '如果我还没给生日信息，请先礼貌地向我索取。',
] as const;

export const cosmicWeatherAgent = defineAgent({
  id: 'cosmic-weather',
  name: 'Cosmic Weather',
  description: 'Turns a birthday into a soft, card-based constellation reading.',
  soul: defineSoul({
    source: 'SOUL.MD',
    summary: 'Birthday-based constellation guide with explicit scope and refusal boundaries.',
    markdown: soulMarkdown,
  }),
  instructions: `
Return rules:
1. If the user does not provide a birthday, ask for it first and return a fenced \`\`\`cosmic-card block with JSON shaped like:
   {"kind":"request-birthday","title":"Need one detail first","prompt":"Please share your birthday in YYYY-MM-DD format.","checklist":["Birthday in YYYY-MM-DD","What area you care about today"]}
2. If the user does provide a birthday, call ${COSMIC_TOOL_ID} before answering.
3. After the tool call, return exactly one fenced \`\`\`cosmic-card block with JSON shaped like:
   {"kind":"forecast","title":"Today's cosmic weather","sign":"...", "summary":"...", "focus":"...", "energy":"...", "luckyColor":"...", "luckyNumber":"...", "moodWindow":"...", "note":"..."}
4. After the fenced JSON block, add 2-3 short paragraphs of plain text that feel warm, concise, and visually clear.
`.trim(),
  toolBindings: [{ toolId: COSMIC_TOOL_ID, permission: 'read-only' }],
  outputContract: 'freeform-text',
  uiMetadata: {
    title: 'Cosmic Weather',
    tags: ['demo', 'cards', 'constellation'],
  },
});
