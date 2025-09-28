# AI Tutor - Web Application

## Project Type
**Web Application** - Full-stack Express.js/React application for deployment via Autoscale

## Overview

This is a production-ready conversational AI tutoring web platform that enables students to learn Math, English, and Spanish through interactive voice conversations, personalized quizzes, and adaptive learning paths. The platform features a **fully functional multi-agent ElevenLabs ConvAI system** with five age-specific AI tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult), each optimized for their target age group with appropriate complexity, vocabulary, and teaching approaches.

## Recent Updates (September 28, 2025)

✅ **Multi-Agent ConvAI Integration Complete**
- Configured 5 age-specific ElevenLabs ConvAI agents 
- Resolved CSP conflicts for ElevenLabs US endpoints and worker scripts
- Fixed audio processing worker module loading
- ConvAI widget fully functional with voice conversations
- System ready for deployment with production URLs

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
**Phase 1 Complete: Multi-Agent ElevenLabs ConvAI System**
- **Five Age-Specific Agents**: Dedicated AI tutors for K-2, Grades 3-5, 6-8, 9-12, and College/Adult learners
- **Progressive Complexity**: Different GPT models (Nano/Mini/Full) and reasoning levels per age group
- **Dynamic Agent Switching**: Real-time switching between agents based on student level and subject selection
- **Subject Starters**: Contextual conversation initialization for Math, English, Spanish, and General topics
- **Session Continuity**: LocalStorage-based progress tracking with session summaries and resume capability
- **Age-Appropriate Greetings**: Customized welcome messages for each age group displayed in UI
- **Metadata Integration**: Student name and grade information passed to ConvAI for personalized interactions

**Legacy Voice Stack (Disabled when USE_CONVAI=true):**
- **Live Conversations**: OpenAI Realtime API with WebRTC (superseded by ConvAI)
- **Advanced TTS**: Azure Neural Text-to-Speech with SSML controls (fallback option)
- **Test Mode**: Mock voice functionality via `VOICE_TEST_MODE=1`

### AI & Learning Engine
- **Primary AI Model**: OpenAI GPT-4o with fallback to GPT-4o-mini for enhanced conversation quality
- **Enhanced System Prompt**: TutorMind system with comprehensive Socratic teaching methodology
- **Conversation Parameters**: Optimized temperature (0.75), top_p (0.92), and presence_penalty (0.3) for natural responses
- **Teaching Method**: Advanced Socratic approach with phrase variety, encouragement banks, and adaptive questioning
- **Content Management**: JSON-based lesson structure stored in `/content/lessons/` directory
- **Adaptive Learning**: AI adapts responses based on user progress, energy levels, and learning patterns
- **Voice-Optimized Responses**: Conversation flow designed for natural speech patterns and turn-taking

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