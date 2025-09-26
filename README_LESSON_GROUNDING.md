# Lesson Grounding and Input Gating Implementation

## Overview
This document explains how the AI tutor stays grounded to the current lesson and prevents fabricated user messages.

## Key Features

### 1. Lesson Grounding
- **LessonContext Loading**: When a lesson is selected, the server loads the lesson context (subject, objectives, key terms) from JSON files
- **Topic Guard**: If a student asks something outside the current lesson's subject, the tutor redirects them back to the lesson topic
- **Subject-Specific Prompts**: Different teaching approaches for math, grammar, reading, etc.

### 2. Turn Gating
- **Input Validation**: Server validates that actual user input exists before calling the LLM
- **ASR Thresholds**: Configurable minimum duration (ASR_MIN_MS) and confidence (ASR_MIN_CONFIDENCE) for speech input
- **No Fabricated Messages**: System never invents "You" messages or assumes what the user said

### 3. Concise Responses
- **2-Sentence Limit**: Tutor responses are limited to maximum 2 sentences per turn
- **Question Ending**: Every response ends with a question to encourage engagement
- **Tool-Enforced Structure**: Uses OpenAI function calling to enforce structured responses

## Environment Variables

```bash
# Voice Testing Mode
VOICE_TEST_MODE=1  # Use browser TTS/STT for testing

# ASR Thresholds
ASR_MIN_MS=300     # Minimum speech duration in milliseconds
ASR_MIN_CONFIDENCE=0.5  # Minimum confidence score (0-1)

# Debug Logging
DEBUG_TUTOR=1      # Enable detailed logging of lesson context and input validation

# Energy Level
ENERGY_LEVEL=upbeat  # Voice energy: calm|neutral|upbeat
```

## How It Works

1. **Lesson Loading**: When user navigates to `/lesson/[id]`, the `lessonService` loads the lesson JSON
2. **Context Hydration**: Every LLM call includes the current lesson context in the system prompt
3. **Turn Gating**: Before calling the LLM:
   - Check message is not empty (>2 chars)
   - Check speech duration meets threshold (if provided)
   - Check confidence score meets threshold (if provided)
4. **Response Generation**: LLM is forced to use `tutor_plan` tool which structures responses
5. **Session Management**: Context is cleared when switching lessons to prevent cross-contamination

## Testing

Run Playwright tests to verify lesson grounding and input gating:

```bash
npx playwright test tests/lesson-grounding.spec.ts
```

Tests verify:
- Off-topic questions are redirected to current lesson
- Empty inputs are rejected (no fabricated messages)
- Responses are concise and end with questions
- Speech below thresholds is gated