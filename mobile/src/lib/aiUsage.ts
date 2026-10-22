export interface AiUsageData {
  requests: number;
  input_tokens: number;
  cached_input_tokens?: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
}

/** "3,579 in (1,597 cached) · 94 out · 2 calls · $0.00026", or a cache hit (no model call). */
export function formatUsage(usage: AiUsageData, status?: string): string {
  if (status === 'cached' || usage.requests === 0) return 'Cached answer · no model call · $0';
  const n = (v: number) => v.toLocaleString('en-US');
  const cached = usage.cached_input_tokens ? ` (${n(usage.cached_input_tokens)} cached)` : '';
  const cost =
    usage.estimated_cost_usd == null ? 'cost n/a' : `$${usage.estimated_cost_usd.toFixed(5)}`;
  return `${n(usage.input_tokens)} in${cached} · ${n(usage.output_tokens)} out · ${usage.requests} call${
    usage.requests === 1 ? '' : 's'
  } · ${cost}`;
}
