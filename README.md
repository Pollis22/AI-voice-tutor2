# AI Tutor - Conversational Learning Platform

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
