import { describe, expect, it } from '@jest/globals';

import { formatUsage } from '@/lib/aiUsage';

describe('AI usage line', () => {
  it('shows input (cached), output, calls and cost', () => {
    expect(
      formatUsage({
        requests: 2,
        input_tokens: 3579,
        cached_input_tokens: 1597,
        output_tokens: 94,
        estimated_cost_usd: 0.000261,
      }),
    ).toBe('3,579 in (1,597 cached) · 94 out · 2 calls · $0.00026');
    expect(
      formatUsage({ requests: 1, input_tokens: 10, output_tokens: 5, estimated_cost_usd: null }),
    ).toBe('10 in · 5 out · 1 call · cost n/a');
  });

  it('marks cache hits as free', () => {
    expect(
      formatUsage(
        { requests: 0, input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
        'cached',
      ),
    ).toBe('Cached answer · no model call · $0');
  });
});
