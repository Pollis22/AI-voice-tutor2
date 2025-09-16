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
- **Next.js 14+** (App Router) with React 18+ & TypeScript
- **Tailwind CSS** + Shadcn/ui components for beautiful UI
- **TanStack Query** for state management and caching
- **OpenAI Realtime API** for live voice conversations
- **Azure Speech SDK** for text-to-speech narration

### Backend
- **Node.js** with Express API routes
- **PostgreSQL** database with Prisma ORM
- **Stripe** for subscription management
- **OpenAI API** (GPT-4o-mini) for AI tutoring
- **Azure Text-to-Speech** for voice narration

### Testing & Deployment
- **Playwright** for end-to-end testing
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
