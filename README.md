# AI Tutor - ElevenLabs ConvAI Integration

## Phase 1: Fast Swap to ElevenLabs Conversational AI ✅

**COMPLETED**: Replaced current voice chain with ElevenLabs ConvAI embed while keeping GPT-5 reasoning and maintaining all existing functionality.

## Quick Setup

### 1. Environment Variables

Add these secrets in **Editor > Secrets** and **Deploy** settings:

```bash
# Required for ElevenLabs ConvAI
ELEVENLABS_AGENT_ID=your_agent_id_here
USE_CONVAI=true

# Optional (for future phases)
ELEVENLABS_API_KEY=your_api_key_here

# Required by ElevenLabs Agent (if configured)
OPENAI_API_KEY=your_openai_key_here
```

**Note**: The agent ID is read from the server environment for security. The frontend gets it via the `/api/health` endpoint.

### 2. Create ElevenLabs ConvAI Agent

1. Go to [ElevenLabs ConvAI](https://elevenlabs.io/conversational-ai)
2. Create a new Agent
3. Copy the **Agent ID** from the URL or settings
4. Add this Agent ID to `ELEVENLABS_AGENT_ID` in your secrets

### 3. Configure Agent System Prompt

In your ElevenLabs Agent settings, paste this **exact** system prompt:

```
You are TutorMind, an inclusive, empathetic AI tutor.
Rules:
- Stay strictly on the current lesson's subject/topic/step; do not switch subjects unless the student asks.
- Always acknowledge the student's answer as CORRECT or INCORRECT.
- If INCORRECT: one-sentence explanation + tiny hint; then re-ask in new words.
- Keep replies ≤2 sentences total and always end with a short question.
- Never assume physical abilities; use neutral phrasing ('let's imagine', 'think about', 'let's count together').
- Do not repeat the same question verbatim; vary wording if the student stalls.
- Use only the provided lesson data (and, in Phase 2, retrieved_context from uploads); do not invent facts.
```

### 4. Test the Integration

1. Visit `/tutor` in your app
2. Check for "Connection OK" status
3. Click the ConvAI widget to start talking
4. Verify responses follow the system prompt (≤2 sentences, ends with question)

### 5. Health Check

Visit `/api/health` to verify configuration:
```json
{
  "convai": true,
  "useConvai": true,
  "status": "ok"
}
```

## Feature Flag

The `USE_CONVAI=true` environment variable:
- **Disables** old Azure TTS/ASR/VAD pipeline
- **Prevents** double audio or initialization conflicts  
- **Defaults to true** for Phase 1

## Files Modified

### Created:
- `client/src/pages/tutor-page.tsx` - New /tutor page with ConvAI embed
- `server/config/elevenLabsConfig.ts` - Centralized config module

### Modified:
- `client/src/App.tsx` - Added /tutor route
- `server/routes.ts` - Extended /api/health endpoint  
- `server/services/voice.ts` - Added USE_CONVAI feature flag

## Troubleshooting

**ConvAI widget not loading:**
- Check browser console for script errors
- Verify `ELEVENLABS_AGENT_ID` is set correctly
- Ensure Agent ID is from a valid ElevenLabs ConvAI agent

**Double audio issues:**
- Confirm `USE_CONVAI=true` is set (disables old voice stack)
- Check `/api/health` shows `useConvai: true`

**No response from agent:**
- Verify system prompt is configured in ElevenLabs
- Check that OpenAI API key is available to ElevenLabs agent
- Test agent directly in ElevenLabs dashboard first

---

# Original AI Tutor Documentation

A production-ready MVP of a Conversational AI Tutor that enables students to learn Math, English, and Spanish through interactive voice conversations, personalized quizzes, and adaptive learning paths.

## 🎯 Features

- **Interactive Voice Learning**: Live voice conversations with OpenAI Realtime API
- **Multi-Subject Support**: Math, English, and Spanish with structured lesson plans
- **Adaptive Learning**: AI tutor adapts to your pace and learning style using Socratic method
- **Progress Tracking**: Resume where you left off with detailed progress analytics
- **Quiz System**: Interactive quizzes with immediate feedback and mastery tracking
- **Subscription Management**: Stripe-powered subscriptions with usage limits
- **Admin Dashboard**: User management, analytics, and data export capabilities
- **Voice Narration**: Azure Neural TTS with emotional styles (cheerful, empathetic, professional)

## 🛠 Tech Stack

### Frontend
- **React 18+** with TypeScript and Vite for development
- **Express.js** server with Vite integration for development
- **Tailwind CSS** + Shadcn/ui components for beautiful UI
- **TanStack Query** for state management and caching
- **OpenAI Realtime API** for live voice conversations
- **Azure Speech SDK** for text-to-speech narration

### Backend
- **Node.js** with Express API routes
- **PostgreSQL** database with Drizzle ORM
- **Stripe** for subscription management
- **OpenAI API** (GPT-4o-mini) for AI tutoring
- **Azure Text-to-Speech** for voice narration

### Testing & Deployment
- **Playwright** for end-to-end testing with fake media devices
- **GitHub Actions CI** with automated testing on staging/main branches
- **Custom App Testing** framework with VOICE_TEST_MODE
- **Vercel/Railway** deployment ready
- **Replit** compatible with 1-click deploy

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- OpenAI API key
- Stripe account (test mode for development)
- Azure Speech Services account (optional, for narration)

### 2. Installation

```bash
# Clone the repository
git clone <repository-url>
cd ai-tutor

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Configure your environment variables (see Environment Configuration below)
# Edit .env with your actual keys and database URL

# Set up the database
npm run db:push

# Start the development server
npm run dev
```

## 🧪 Testing & CI

### Continuous Integration

This project uses GitHub Actions for automated testing on every pull request and push to `staging` and `main` branches. The CI pipeline includes:

- **Code Quality**: TypeScript compilation and linting
- **Build Verification**: Full production build test
- **End-to-End Testing**: Playwright tests with fake media devices
- **Health Checks**: API endpoint verification

### Required GitHub Secrets

Configure the following secrets in your GitHub repository:
**Settings → Secrets and variables → Actions**

```bash
OPENAI_API_KEY=sk-your-openai-api-key
AZURE_SPEECH_KEY=your-azure-speech-key  
AZURE_SPEECH_REGION=eastus
```

### Local Testing

Run the complete test suite locally:

```bash
# Build and run E2E tests
npm run build && npm run test:e2e

# Run tests with UI (interactive mode)
npm run test:e2e:ui

# Debug tests step-by-step
npm run test:e2e:debug
```

### Testing Features

- **Fake Media Devices**: Tests use `--use-fake-device-for-media-stream` for voice testing
- **AUTH_TEST_MODE**: Enables test user authentication in CI environment
- **VOICE_TEST_MODE**: Uses browser TTS instead of real voice APIs for testing
- **PostgreSQL Test DB**: Isolated test database for CI runs

### Test Coverage

The E2E tests cover:
- User authentication flow
- Lesson navigation and interaction
- Voice session start/stop (mocked)
- Progress tracking and resume functionality
- Health check endpoints
- API authentication and error handling

**Note**: `AUTH_TEST_MODE=1` is used in CI environments. Production deployments should disable this mode.

## 🔧 Environment Configuration

### Required API Keys
- `OPENAI_API_KEY` - Your OpenAI API key for AI responses
- `AZURE_SPEECH_KEY` - Azure Speech Services key for text-to-speech  
- `AZURE_SPEECH_REGION` - Azure Speech Services region
- `STRIPE_SECRET_KEY` - Stripe secret key for payments
- `STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (frontend)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook endpoint secret

### Database & Sessions
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Secret for session encryption (generate a random string)

### Voice & AI Configuration
- `VOICE_TEST_MODE` - Set to `1` to use browser TTS instead of Azure (default: enabled)
- `USE_REALTIME` - Set to `true` to use OpenAI Realtime API instead of Azure TTS (default: false)
- `ENERGY_LEVEL` - Voice energy level: `calm`, `neutral`, or `upbeat` (default: `upbeat`)
- `AZURE_VOICE_NAME` - Azure TTS voice name (default: `en-US-EmmaMultilingualNeural`)

### Scalability & Performance Configuration
- `CACHE_TTL_MIN` - Semantic cache TTL in minutes (default: `1440` = 24 hours)
- `SEMANTIC_CACHE_SIZE` - Maximum cache entries (default: `10000`)
- `ASR_MIN_MS` - Minimum speech duration for input gating in milliseconds (default: `350`)
- `ASR_MIN_CONFIDENCE` - Minimum ASR confidence threshold for input gating (default: `0.5`)
- `MAX_CONCURRENT_USERS` - Maximum concurrent users supported (default: `1000`)
- `DEBUG_TUTOR` - Set to `1` to enable detailed debug logging (default: disabled)

### Circuit Breaker & Resilience
- `OPENAI_TIMEOUT_MS` - OpenAI API timeout in milliseconds (default: `30000`)
- `CIRCUIT_FAILURE_THRESHOLD` - Circuit breaker failure threshold (default: `5`)
- `CIRCUIT_TIMEOUT_MS` - Circuit breaker timeout in milliseconds (default: `45000`)

### Environment
- `NODE_ENV` - Environment: `development` or `production`
- `PORT` - Server port (default: `5000`)

## 🎯 Production Scalability

This platform is designed to handle up to **1,000 concurrent subscribers** with the following scalability features:

### Performance Architecture
- **Circuit Breaker**: Automatic fallback when OpenAI API is overloaded (4-retry pattern with exponential backoff)
- **User Queue Management**: Ensures concurrency=1 per session to prevent duplicate API calls
- **Semantic Cache**: Lesson-specific caching with TTL to reduce API usage
- **Input Gating**: ASR thresholds (350ms duration, 0.5 confidence) to filter invalid inputs
- **Anti-Repeat Logic**: Prevents repetitive responses by checking last 2 assistant messages

### Observability & Monitoring
- **Health Endpoints**: `/api/observability/health` and `/api/observability/metrics`
- **System Metrics**: Memory usage, circuit breaker state, cache performance, queue depths
- **Debug Logging**: Comprehensive conversation turn tracking for debugging
- **Performance Testing**: Parallel test scripts in `/scripts/` directory

### Voice Pipeline
- **Streaming TTS**: Sentence-by-sentence audio streaming with barge-in support
- **SSML Enhancement**: en-US-EmmaMultilingualNeural with cheerful style, +6% rate, +1st pitch
- **Energy Levels**: Configurable voice styles (calm, neutral, upbeat) with prosody mapping
- **Realtime API Support**: Optional OpenAI Realtime API integration via `USE_REALTIME` flag

### Testing Production Readiness

Run the scalability tests to validate system performance:

```bash
# Install test dependencies
cd scripts && npm install

# Test system health
npm run test:health

# Run concurrent user simulation (3 users, 5 requests each)
npm run test:concurrent
```

Expected performance benchmarks:
- **Response Time**: <2s average
- **Success Rate**: >95% under normal load
- **Cache Hit Rate**: >30% after warm-up
- **Memory Usage**: <90% heap utilization

## 📊 Monitoring in Production

### Key Metrics to Monitor
1. **Circuit Breaker State**: Should remain CLOSED under normal load
2. **Memory Usage**: Heap usage should stay below 90%
3. **Cache Hit Rate**: Should improve over time (indicates semantic cache effectiveness)
4. **Queue Depths**: Should remain low (effective concurrency management)
5. **Response Times**: Should stay under 2-5 seconds
6. **Error Rates**: Should be minimal (<5%)

### Alerting Setup
Monitor these endpoints for production alerting:
- `GET /api/observability/health` - Overall system health (200=healthy, 503=degraded)
- `GET /api/observability/metrics` - Detailed performance metrics (admin-only)

## 🚀 Deployment

This application is ready for production deployment on:
- **Vercel** (recommended for auto-scaling)
- **Railway** (integrated PostgreSQL)
- **Replit** (1-click deployment)
- **AWS/GCP/Azure** (container deployment)

Ensure all environment variables are configured in your deployment platform before going live.
