import { describe, it, expect } from 'vitest';
import { buildPhotoLimitAnswer } from '../utils/faqPhotoLimitAnswer';
import { FALLBACK_PLANS } from '../utils/publicPlanConfigStore';

describe('buildPhotoLimitAnswer', () => {
  it('renders the fallback mapping\'s exact numbers when plans is the fallback', () => {
    const answer = buildPhotoLimitAnswer(FALLBACK_PLANS);
    expect(answer).toContain('25 on Starter');
    expect(answer).toContain('100 on Professional');
    expect(answer).toContain('250 on Agency');
    expect(answer).toContain('unlimited on Enterprise');
  });

  it('reflects a live server-changed limit -- a config update propagates into the FAQ answer', () => {
    const changedPlans = { ...FALLBACK_PLANS, starter: { label: 'Starter', basePhotoLimit: 30, unlimited: false } };
    expect(buildPhotoLimitAnswer(changedPlans)).toContain('30 on Starter');
  });

  it('never throws and degrades gracefully on missing/partial plans data', () => {
    expect(() => buildPhotoLimitAnswer(null)).not.toThrow();
    expect(buildPhotoLimitAnswer(null)).toContain('plan-dependent');
    expect(() => buildPhotoLimitAnswer({})).not.toThrow();
  });
});
