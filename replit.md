# AI Tutor - Web Application

## Project Type
**Web Application** - Full-stack Express.js/React application for deployment via Autoscale

## Overview

This is a production-ready conversational AI tutoring web platform that enables students to learn Math, English, and Spanish through interactive voice conversations, personalized quizzes, and adaptive learning paths. The platform uses advanced AI technologies to provide a Socratic teaching method, adapting to each student's pace and learning style while tracking progress and providing immediate feedback.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack Architecture
The application follows a modern full-stack architecture using:
- **Frontend**: React 18+ with Next.js 14+ App Router, TypeScript, and Vite for development
- **Backend**: Node.js with Express API routes
- **Database**: PostgreSQL with Drizzle ORM (configured but can be extended to work with other databases)
- **Styling**: Tailwind CSS with Shadcn/ui component library for consistent UI

### Authentication & Authorization
- Simple username/password authentication using Passport.js local strategy
- Session-based authentication with PostgreSQL session storage
- Role-based access control with admin privileges
- Password hashing using Node.js scrypt for security

### Voice Technology Integration
The platform implements a hybrid voice architecture:
- **Live Conversations**: OpenAI Realtime API with WebRTC for real-time speech-to-speech interactions
- **Narration**: Azure Neural Text-to-Speech with emotional style support (cheerful, empathetic, professional)
- **Voice Router**: Server-side endpoints for token generation and audio narration
- **Test Mode**: Mock voice functionality for testing environments via `VOICE_TEST_MODE=1`

### AI & Learning Engine
- **Primary AI Model**: OpenAI GPT-4o-mini for tutoring responses and content generation
- **Teaching Method**: Socratic approach - guides students to discover answers rather than providing direct solutions
- **Content Management**: JSON-based lesson structure stored in `/content/lessons/` directory
- **Adaptive Learning**: AI adapts responses based on user progress and learning patterns

### Database Schema & Data Management
Core entities include:
- **Users**: Authentication, subscription info, learning preferences, voice usage tracking
- **Subjects**: Math, English, Spanish with structured lesson hierarchies
- **Lessons**: JSON-based content with concepts, examples, and quiz questions
- **User Progress**: Tracks completion status, scores, and time spent per lesson
- **Learning Sessions**: Records of voice/text sessions with transcripts
- **Quiz Attempts**: Detailed quiz performance and scoring data

### Payment & Subscription System
- **Stripe Integration**: Handles subscription management and payments
- **Pricing Tiers**: Single subject ($99.99/month) and all subjects ($199/month)
- **Usage Limits**: Weekly voice minute caps with automatic fallback to text mode
- **Customer Portal**: Stripe-powered subscription management for users

### State Management & Caching
- **TanStack Query**: Handles API state management, caching, and background updates
- **Optimistic Updates**: Immediate UI feedback with server synchronization
- **Session Management**: PostgreSQL-based session storage for authentication state

### Testing Strategy
- **Test Mode Support**: `VOICE_TEST_MODE=1` mocks audio/microphone functionality
- **Playwright Integration**: End-to-end browser testing with media flags documented
- **App Testing Framework**: Custom testing setup for voice features and user flows

## External Dependencies

### AI & Voice Services
- **OpenAI API**: GPT-4o-mini for tutoring responses and Realtime API for voice conversations
- **Azure Speech Services**: Neural Text-to-Speech for narration with emotional styles
- **Voice Processing**: WebRTC for real-time audio communication

### Payment Processing
- **Stripe**: Complete payment infrastructure including subscriptions, customer portal, and webhooks
- **Stripe Elements**: Frontend payment components with React integration

### Database & Infrastructure
- **PostgreSQL**: Primary database (configured with Neon serverless)
- **Drizzle ORM**: Type-safe database operations with migration support
- **Session Storage**: PostgreSQL-based session management

### Development & Deployment
- **Replit Compatible**: One-click deployment with environment variable configuration
- **Vercel/Railway Ready**: Exportable to GitHub with standard deployment patterns
- **Environment Management**: Comprehensive environment variable setup for all services

### Frontend Libraries
- **Radix UI**: Accessible component primitives for consistent UI/UX
- **Tailwind CSS**: Utility-first styling with custom design system
- **React Hook Form**: Form management with Zod validation
- **Lucide React**: Icon library for consistent visual elements