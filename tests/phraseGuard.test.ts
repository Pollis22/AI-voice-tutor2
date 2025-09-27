import { BANNED_PATTERNS, hardBlockIfBanned, sanitizeInclusive, enforceTwoSentenceQuestion, antiRepeat } from '../server/services/phraseGuard';

describe('P0 Hotfix: Phrase Guard Tests', () => {
  test('hardBlockIfBanned should catch and replace all banned phrases', () => {
    BANNED_PATTERNS.forEach(banned => {
      const testText = `Let's try this. ${banned.replace(/\.\*/g, ' three')} to continue.`;
      const result = hardBlockIfBanned(testText);
      expect(result).toMatch(/Let's (count together|practice|work)/);
      expect(result).not.toContain('fingers');
    });
  });

  test('hardBlockIfBanned should NOT trigger on safe phrases', () => {
    const safeText = "What number comes after 2?";
    const result = hardBlockIfBanned(safeText);
    expect(result).toBe(safeText);
  });

  test('sanitizeInclusive should replace ableist phrases with inclusive alternatives', () => {
    expect(sanitizeInclusive('how many fingers do you have')).toBe('how many fingers are typically on a hand');
    expect(sanitizeInclusive('raise your hand')).toBe('what would you say');
    expect(sanitizeInclusive('stand up')).toBe('imagine you stand');
  });

  test('enforceTwoSentenceQuestion should limit to 2 sentences and add question', () => {
    const long = "This is one. This is two. This is three. This is four.";
    const result = enforceTwoSentenceQuestion(long);
    expect(result.split('.').length).toBeLessThanOrEqual(3); // 2 sentences + question
    expect(result).toMatch(/\?$/);
  });

  test('antiRepeat should catch exact duplicates', () => {
    const store = new Map<string, string[]>();
    const text = "What is 2 plus 2?";
    
    // First call should pass through
    expect(antiRepeat('test-session', text, store)).toBe(text);
    
    // Second call should be blocked
    const repeated = antiRepeat('test-session', text, store);
    expect(repeated).not.toBe(text);
    expect(repeated).toContain("Here's another way to think about it");
  });

  test('CRITICAL: System must never output banned snippets', () => {
    const testInputs = [
      'show me three fingers',
      'how many fingers do you have',
      'raise your hand up high',
      'touch your nose'
    ];

    testInputs.forEach(input => {
      // First apply hard block
      let result = hardBlockIfBanned(input);
      
      // Then sanitize 
      result = sanitizeInclusive(result);
      
      // Check no banned phrases remain
      BANNED_PATTERNS.forEach(banned => {
        const pattern = new RegExp(banned, 'i');
        expect(pattern.test(result)).toBe(false);
      });
      
      // Must end with question
      result = enforceTwoSentenceQuestion(result);
      expect(result).toMatch(/\?$/);
    });
  });
});