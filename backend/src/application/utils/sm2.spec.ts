import {
  calculateSm2,
  computeErrorPosition,
  computeQualityRating,
} from './sm2';

describe('calculateSm2', () => {
  it('resets on quality < 3 (lapse)', () => {
    const result = calculateSm2(3, 2.5, 15, 2);

    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(0);
    expect(result.easinessFactor).toBe(2.3);
  });

  it('never drops easiness factor below 1.3', () => {
    const result = calculateSm2(0, 1.3, 0, 0);

    expect(result.easinessFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('first successful review gives interval of 1 day', () => {
    const result = calculateSm2(0, 2.5, 0, 4);

    expect(result.repetitions).toBe(1);
    expect(result.interval).toBe(1);
  });

  it('second successful review gives interval of 6 days', () => {
    const result = calculateSm2(1, 2.5, 1, 4);

    expect(result.repetitions).toBe(2);
    expect(result.interval).toBe(6);
  });

  it('third successful review multiplies previous interval by EF', () => {
    const result = calculateSm2(2, 2.5, 6, 4);

    expect(result.repetitions).toBe(3);
    expect(result.interval).toBe(15); // round(6 * 2.5) = 15
  });

  it('perfect quality (5) increases easiness factor', () => {
    const result = calculateSm2(0, 2.5, 0, 5);

    expect(result.easinessFactor).toBe(2.6);
  });

  it('quality 3 decreases easiness factor', () => {
    const result = calculateSm2(0, 2.5, 0, 3);

    expect(result.easinessFactor).toBe(2.36);
  });

  it('interval is at least 1 day for successful reviews', () => {
    const result = calculateSm2(0, 1.3, 0, 3);

    expect(result.interval).toBeGreaterThanOrEqual(1);
  });
});

describe('computeErrorPosition', () => {
  it('returns beginning for error in first third', () => {
    expect(computeErrorPosition('xeautiful', 'beautiful')).toBe('beginning');
  });

  it('returns middle for error in middle third', () => {
    expect(computeErrorPosition('beaxtiful', 'beautiful')).toBe('middle');
  });

  it('returns end for error in last third', () => {
    expect(computeErrorPosition('beautifxl', 'beautiful')).toBe('end');
  });

  it('returns end when user answer is shorter', () => {
    // 'beauti' vs 'beautiful': divergence at index 6, len=9, 2*9/3=6 → 'end'
    expect(computeErrorPosition('beauti', 'beautiful')).toBe('end');
  });

  it('returns beginning for empty correct answer', () => {
    expect(computeErrorPosition('test', '')).toBe('beginning');
  });

  it('returns end for identical strings with length mismatch', () => {
    expect(computeErrorPosition('beautiful', 'beautifull')).toBe('end');
  });
});

describe('computeQualityRating', () => {
  it('returns 1 for incorrect answers', () => {
    expect(computeQualityRating(false, 'spelling')).toBe(1);
    expect(computeQualityRating(false, 'multiple_choice')).toBe(1);
  });

  it('returns 4 for correct multiple choice', () => {
    expect(computeQualityRating(true, 'multiple_choice')).toBe(4);
  });

  it('returns 4 for correct fill blank', () => {
    expect(computeQualityRating(true, 'fill_blank')).toBe(4);
  });

  it('returns 5 for correct spelling', () => {
    expect(computeQualityRating(true, 'spelling')).toBe(5);
  });

  it('returns 5 for correct context sentence', () => {
    expect(computeQualityRating(true, 'context_sentence')).toBe(5);
  });
});
