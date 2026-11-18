// What each API call costs us, in US dollars, from the usage the API reports back.
// Prices per 1M tokens, from developers.openai.com/api/docs/pricing (checked 2026-11-18).
const IMAGE_PRICES = {
  'gpt-image-1.5': { textIn: 5, imageIn: 8, imageOut: 32 },
  'gpt-image-1-mini': { textIn: 2, imageIn: 2.5, imageOut: 8 },
  'gpt-image-2': { textIn: 5, imageIn: 8, imageOut: 30 },
};
const CHAT_PRICES = {
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-5-mini': { in: 0.25, out: 2 },
};

export function imageCost(model, usage) {
  const p = IMAGE_PRICES[model];
  if (!p || !usage) return 0;
  const textIn = usage.input_tokens_details?.text_tokens ?? 0;
  const imageIn = usage.input_tokens_details?.image_tokens ?? 0;
  return (textIn * p.textIn + imageIn * p.imageIn + (usage.output_tokens ?? 0) * p.imageOut) / 1e6;
}

export function chatCost(model, usage) {
  const p = CHAT_PRICES[model];
  if (!p || !usage) return 0;
  return ((usage.prompt_tokens ?? 0) * p.in + (usage.completion_tokens ?? 0) * p.out) / 1e6;
}
