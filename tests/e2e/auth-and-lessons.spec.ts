import { test, expect } from '@playwright/test';

test.describe('AI Tutor E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
  });

  test('complete learning flow: login -> lessons -> voice interaction -> resume', async ({ page }) => {
    // Step 1: Navigate to auth page and login with test credentials
    const authButton = page.getByTestId('button-auth');
    if (await authButton.isVisible()) {
      await authButton.click();
    } else {
      // Already on auth page or need to navigate
      await page.goto('/auth');
    }

    // Fill in login form with test credentials from ENV
    const emailInput = page.getByTestId('input-email');
    const passwordInput = page.getByTestId('input-password');
    const loginButton = page.getByTestId('button-login');

    await emailInput.fill(process.env.TEST_USER_EMAIL || 'test@example.com');
    await passwordInput.fill(process.env.TEST_USER_PASSWORD || 'TestPass123!');
    await loginButton.click();

    // Wait for successful login redirect
    await page.waitForURL('/');
    await expect(page.getByTestId('text-welcome')).toBeVisible({ timeout: 10000 });

    // Step 2: Navigate to lessons page
    const lessonsLink = page.getByTestId('link-lessons');
    await lessonsLink.click();
    await page.waitForURL('/lessons');

    // Verify lessons page loaded
    await expect(page.getByTestId('text-lessons-title')).toBeVisible();
    
    // Step 3: Open a lesson (select first available lesson)
    const firstLesson = page.getByTestId('card-lesson').first();
    await expect(firstLesson).toBeVisible();
    await firstLesson.click();

    // Wait for lesson page to load
    await page.waitForURL(/\/lesson\/.+/);
    await expect(page.getByTestId('text-lesson-title')).toBeVisible();

    // Step 4: Start voice session (mocked in test mode)
    const startVoiceButton = page.getByTestId('button-start-voice');
    await expect(startVoiceButton).toBeVisible();
    await startVoiceButton.click();

    // Verify voice controls appear and are in test mode
    await expect(page.getByTestId('voice-controls')).toBeVisible();
    
    // In test mode, verify that the voice service is using browser TTS
    const voiceStatus = page.getByTestId('text-voice-status');
    await expect(voiceStatus).toContainText('test mode');

    // Step 5: Interact with the lesson (simulate some learning activity)
    const chatInput = page.getByTestId('input-chat');
    if (await chatInput.isVisible()) {
      await chatInput.fill('What is 2 + 2?');
      const sendButton = page.getByTestId('button-send-message');
      await sendButton.click();
      
      // Wait for AI response
      await expect(page.getByTestId('text-ai-response')).toBeVisible({ timeout: 15000 });
    }

    // Step 6: End the session and save transcript
    const endSessionButton = page.getByTestId('button-end-session');
    await endSessionButton.click();

    // Verify session ended successfully
    await expect(page.getByTestId('text-session-complete')).toBeVisible();

    // Step 7: Navigate back to home and check for resume card
    await page.goto('/');
    
    // Verify that a resume card appears for the recent lesson
    const resumeCard = page.getByTestId('card-resume');
    await expect(resumeCard).toBeVisible({ timeout: 5000 });
    
    // Verify resume card contains lesson information
    await expect(resumeCard.getByTestId('text-lesson-name')).toBeVisible();
    await expect(resumeCard.getByTestId('button-continue-lesson')).toBeVisible();
  });

  test('health check endpoint responds correctly', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.env).toBe('test');
    expect(data.voiceTestMode).toBe(true);
  });

  test('authentication flow works in test mode', async ({ page }) => {
    // Navigate to auth page
    await page.goto('/auth');
    
    // In AUTH_TEST_MODE, verify that test credentials work
    const emailInput = page.getByTestId('input-email');
    const passwordInput = page.getByTestId('input-password');
    const loginButton = page.getByTestId('button-login');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('TestPass123!');
    await loginButton.click();

    // Should redirect to home page after successful login
    await page.waitForURL('/');
    await expect(page.getByTestId('text-welcome')).toBeVisible();
  });

  test('lessons page loads and displays available subjects', async ({ page }) => {
    // First login (simplified for this test)
    await page.goto('/auth');
    await page.getByTestId('input-email').fill('test@example.com');
    await page.getByTestId('input-password').fill('TestPass123!');
    await page.getByTestId('button-login').click();
    await page.waitForURL('/');

    // Navigate to lessons
    await page.goto('/lessons');
    
    // Verify all three subjects are available
    await expect(page.getByTestId('subject-math')).toBeVisible();
    await expect(page.getByTestId('subject-english')).toBeVisible();
    await expect(page.getByTestId('subject-spanish')).toBeVisible();
  });

  test('voice service initializes in test mode', async ({ page }) => {
    // Login first
    await page.goto('/auth');
    await page.getByTestId('input-email').fill('test@example.com');
    await page.getByTestId('input-password').fill('TestPass123!');
    await page.getByTestId('button-login').click();
    await page.waitForURL('/');

    // Navigate to a lesson that supports voice
    await page.goto('/lessons');
    await page.getByTestId('card-lesson').first().click();
    
    // Start voice session
    const startVoiceButton = page.getByTestId('button-start-voice');
    await startVoiceButton.click();
    
    // Verify voice service is in test mode (no real audio processing)
    const voiceControls = page.getByTestId('voice-controls');
    await expect(voiceControls).toBeVisible();
    
    // In test mode, microphone permissions should be automatically granted
    const micStatus = page.getByTestId('status-microphone');
    await expect(micStatus).toContainText('ready');
  });
});