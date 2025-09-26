import { test, expect } from '@playwright/test';

test.describe('Lesson Grounding and Input Gating', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('/dashboard');
  });

  test('redirects off-topic questions to current lesson', async ({ page }) => {
    // Navigate to Math lesson
    await page.goto('/lessons');
    await page.click('[data-testid="card-lesson-math-1"]');
    await page.waitForURL('/lesson/math-1');
    
    // Start voice session
    await page.click('[data-testid="button-start-voice"]');
    await page.waitForSelector('[data-testid="text-status-connected"]');
    
    // Ask off-topic question (grammar in math lesson)
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/voice/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What is a noun?',
          lessonId: 'math-1',
          sessionId: 'test-session-1'
        }),
        credentials: 'include'
      });
      return res.json();
    });
    
    // Check that response redirects to math topic
    expect(response.content).toContain("We're currently on math");
    expect(response.content.toLowerCase()).toMatch(/math|number/);
  });

  test('prevents fabricated user messages without input', async ({ page }) => {
    await page.goto('/lesson/math-1');
    await page.click('[data-testid="button-start-voice"]');
    await page.waitForSelector('[data-testid="text-status-connected"]');
    
    // Try to send empty message
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/voice/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '',
          lessonId: 'math-1',
          sessionId: 'test-session-2'
        }),
        credentials: 'include'
      });
      return { status: res.status, data: await res.json() };
    });
    
    // Should reject empty input
    expect(response.status).toBe(400);
    expect(response.data.error).toContain('No valid user input');
    
    // Verify no "You" messages appear in conversation history
    const history = await page.$$eval('[data-testid^="message-"]', elements => 
      elements.map(el => el.textContent)
    );
    expect(history).not.toContain(expect.stringMatching(/^You:/));
  });

  test('enforces concise responses with questions', async ({ page }) => {
    await page.goto('/lesson/math-1');
    await page.click('[data-testid="button-start-voice"]');
    await page.waitForSelector('[data-testid="text-status-connected"]');
    
    // Send a math question
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/voice/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What is 2 plus 2?',
          lessonId: 'math-1',
          sessionId: 'test-session-3',
          speechDuration: 1500,
          speechConfidence: 0.9
        }),
        credentials: 'include'
      });
      return res.json();
    });
    
    // Verify response is concise (≤2 sentences) and ends with question
    const sentences = response.content.split(/[.!?]+/).filter(s => s.trim());
    expect(sentences.length).toBeLessThanOrEqual(3); // 2 sentences + question
    expect(response.content.trim()).toMatch(/\?$/);
  });

  test('gates speech input below thresholds', async ({ page }) => {
    await page.goto('/lesson/math-1');
    
    // Try with speech too short
    const shortResponse = await page.evaluate(async () => {
      const res = await fetch('/api/voice/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Hi',
          lessonId: 'math-1',
          sessionId: 'test-session-4',
          speechDuration: 200, // Below 300ms threshold
          speechConfidence: 0.9
        }),
        credentials: 'include'
      });
      return { status: res.status, data: await res.json() };
    });
    
    expect(shortResponse.status).toBe(400);
    expect(shortResponse.data.error).toContain('too brief');
    
    // Try with low confidence
    const lowConfResponse = await page.evaluate(async () => {
      const res = await fetch('/api/voice/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What about addition',
          lessonId: 'math-1',
          sessionId: 'test-session-5',
          speechDuration: 1000,
          speechConfidence: 0.3 // Below 0.5 threshold
        }),
        credentials: 'include'
      });
      return { status: res.status, data: await res.json() };
    });
    
    expect(lowConfResponse.status).toBe(400);
    expect(lowConfResponse.data.error).toContain('Could not understand');
  });
});