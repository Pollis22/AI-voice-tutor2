import { describe, test, expect } from '@jest/globals';
import { guardrails } from '../server/services/guardrails';
import { answerChecker } from '../server/services/answerChecker';
import { getTutorMindPrompt } from '../server/prompts/tutorMind';

describe('Tutor empathy & corrections', () => {
  test('Ableist prompt is rephrased', () => {
    const bad = 'Count how many fingers do you have on your hand?';
    const s = guardrails.sanitizeTutorQuestion(bad).toLowerCase();
    expect(s).not.toContain('your hand');
    expect(s).not.toContain('you have');
    expect(s.includes('typically') || s.includes('a hand') || s.includes('imagine')).toBe(true);
  });

  test('Wrong math answer triggers gentle correction', () => {
    const r = answerChecker.checkAnswer('4', '5', 'math');
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/4/);
    expect(r.msg.toLowerCase()).toMatch(/not quite|actually|correct/);
  });

  test('Repeat guard changes wording', () => {
    const session = 's1';
    const a = guardrails.avoidRepeat(session, 'What is 2 plus 2?');
    const b = guardrails.avoidRepeat(session, 'What is 2 plus 2?');
    expect(a).toBe('What is 2 plus 2?');
    expect(b).not.toBe('What is 2 plus 2?');
  });

  test('MCQ accepts multiple formats', () => {
    const ok = ['b','B','option b','answer b','2'].map(v =>
      answerChecker.checkAnswer('b', v, 'mcq').ok
    );
    expect(ok.every(Boolean)).toBe(true);
  });

  test('Number words count as correct', () => {
    expect(answerChecker.checkAnswer('4','four','math').ok).toBe(true);
    expect(answerChecker.checkAnswer('13','thirteen','math').ok).toBe(true);
  });

  test('Format enforcer ends with question and ≤2 sentences', () => {
    const out = guardrails.enforceFormat('Great work. The answer is 4.');
    expect(out.trim().endsWith('?')).toBe(true);
    const n = (out.match(/[.!?]+/g) || []).length;
    expect(n).toBeLessThanOrEqual(2);
  });

  test('System prompt contains inclusive + topic guard cues', () => {
    const p = getTutorMindPrompt({ subject: 'math', topic: 'addition', level: 'beginner' }).toLowerCase();
    expect(p).toContain('inclusive');
    expect(p).toContain('off-topic');
    expect(p).toContain('end with a question');
  });
});