import { describe, it, expect } from '@jest/globals';
import { answerChecker } from '../server/services/answerChecker';

describe('AnswerChecker', () => {
  describe('checkAnswer for math', () => {
    it('should correctly identify correct numeric answers', () => {
      const testCases = [
        { expected: '4', user: '4' },
        { expected: '4', user: 'four' },
        { expected: '2.5', user: '2.5' },
        { expected: '3', user: '3' }
      ];

      testCases.forEach(({ expected, user }) => {
        const result = answerChecker.checkAnswer(expected, user, 'math');
        expect(result.ok).toBe(true);
        expect(result.msg).toContain('correct');
      });
    });

    it('should correctly identify incorrect numeric answers', () => {
      const result = answerChecker.checkAnswer('4', '5', 'math');
      
      expect(result.ok).toBe(false);
      expect(result.msg).toContain('Not quite');
    });

    it('should handle word numbers', () => {
      const testCases = [
        { expected: '3', user: 'three' },
        { expected: '5', user: 'five' },
        { expected: '0', user: 'zero' },
        { expected: '10', user: 'ten' }
      ];

      testCases.forEach(({ expected, user }) => {
        const result = answerChecker.checkAnswer(expected, user, 'math');
        expect(result.ok).toBe(true);
      });
    });

    it('should handle mathematical expressions', () => {
      const result = answerChecker.checkAnswer('4', '2 + 2', 'math');
      expect(result.ok).toBe(true);
    });
  });

  describe('checkAnswer for MCQ', () => {
    it('should handle option letters', () => {
      const result = answerChecker.checkAnswer('b', 'b', 'mcq');
      expect(result.ok).toBe(true);
      expect(result.msg).toContain('right answer');
    });

    it('should handle option numbers', () => {
      const result = answerChecker.checkAnswer('b', '2', 'mcq');
      expect(result.ok).toBe(true);
    });

    it('should handle option text', () => {
      const result = answerChecker.checkAnswer('b', 'option b', 'mcq');
      expect(result.ok).toBe(true);
    });

    it('should reject incorrect answers', () => {
      const result = answerChecker.checkAnswer('b', 'c', 'mcq');
      expect(result.ok).toBe(false);
      expect(result.msg).toContain('Actually, the correct answer is');
    });
  });

  describe('checkAnswer for short text', () => {
    it('should handle exact matches', () => {
      const result = answerChecker.checkAnswer('cat', 'cat', 'short');
      expect(result.ok).toBe(true);
      expect(result.msg).toContain('Exactly right');
    });

    it('should handle fuzzy matches with small edit distance', () => {
      const result = answerChecker.checkAnswer('cat', 'cats', 'short');
      expect(result.ok).toBe(true);
    });

    it('should handle substring matches', () => {
      const result = answerChecker.checkAnswer('cat', 'the cat runs', 'short');
      expect(result.ok).toBe(true);
      expect(result.msg).toContain('right');
    });

    it('should reject very different answers', () => {
      const result = answerChecker.checkAnswer('cat', 'elephant', 'short');
      expect(result.ok).toBe(false);
      expect(result.msg).toContain('Close try');
    });
  });

  describe('auto type detection', () => {
    it('should detect MCQ patterns', () => {
      const result = answerChecker.checkAnswer('a', 'a', 'auto');
      expect(result.ok).toBe(true);
    });

    it('should detect math patterns', () => {
      const result = answerChecker.checkAnswer('4', '4', 'auto');
      expect(result.ok).toBe(true);
    });

    it('should default to short text', () => {
      const result = answerChecker.checkAnswer('hello', 'hello', 'auto');
      expect(result.ok).toBe(true);
    });
  });

  describe('normalize function', () => {
    it('should convert word numbers to digits', () => {
      const normalized = answerChecker.normalize('three plus two');
      expect(normalized).toBe('3 + 2');
    });

    it('should clean special characters', () => {
      const normalized = answerChecker.normalize('hello! world?');
      expect(normalized).toBe('hello world');
    });

    it('should handle case conversion', () => {
      const normalized = answerChecker.normalize('HELLO World');
      expect(normalized).toBe('hello world');
    });
  });

  describe('safeEval function', () => {
    it('should evaluate simple math expressions', () => {
      const testCases = [
        { expr: '2 + 3', expected: 5 },
        { expr: '5 - 2', expected: 3 },
        { expr: '4 * 3', expected: 12 },
        { expr: '8 / 2', expected: 4 }
      ];

      testCases.forEach(({ expr, expected }) => {
        const result = answerChecker.safeEval(expr);
        expect(result).toBe(expected);
      });
    });

    it('should handle division by zero', () => {
      const result = answerChecker.safeEval('5 / 0');
      expect(result).toBeNull();
    });

    it('should reject complex expressions', () => {
      const result = answerChecker.safeEval('Math.pow(2, 3)');
      expect(result).toBeNull();
    });
  });

  describe('Levenshtein distance', () => {
    it('should calculate edit distance correctly', () => {
      const testCases = [
        { a: 'cat', b: 'cat', expected: 0 },
        { a: 'cat', b: 'bat', expected: 1 },
        { a: 'hello', b: 'helo', expected: 1 },
        { a: 'kitten', b: 'sitting', expected: 3 }
      ];

      testCases.forEach(({ a, b, expected }) => {
        const result = answerChecker.lev(a, b);
        expect(result).toBe(expected);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings', () => {
      const result = answerChecker.checkAnswer('cat', '', 'short');
      expect(result.ok).toBe(false);
    });

    it('should handle malformed MCQ expected answers', () => {
      const result = answerChecker.checkAnswer('xyz', 'a', 'mcq');
      expect(result.ok).toBe(false);
      expect(result.msg).toContain("couldn't read");
    });

    it('should handle special characters in math', () => {
      const result = answerChecker.checkAnswer('4', '2+2', 'math');
      expect(result.ok).toBe(true);
    });
  });
});