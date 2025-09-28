# Deployment Guide - JIE Mastery Tutor

This guide covers deploying the JIE Mastery Tutor application to production on various platforms including Replit, Vercel, Netlify, and others.

## Replit Autoscale Deployment

### Recommended Settings

- **Machine Size**: Smallest available (1 vCPU, 1GB RAM)
- **Max Instances**: 1 (for MVP/testing, can scale up later)
- **Health Check**: `/api/health`
- **Auto-scale**: Enabled (scales to zero when idle)
- **Region**: Choose closest to your users

### Cost Optimization

1. **Enable Auto-scale**: Automatically scales down to zero when no traffic
2. **Use smallest machine**: Start with minimal resources and scale up if needed
3. **Set pause timer**: Configure idle timeout to pause instances quickly
4. **Monitor usage**: Use Replit's analytics to track resource usage

## Required Environment Variables

Set these in your Replit deployment environment:

### Core Application
```bash
NODE_ENV=production
PORT=5000  # Automatically set by Replit
```

### Database (if using external PostgreSQL)
```bash
DATABASE_URL=postgresql://username:password@host:5432/dbname
```

### Authentication & Security
```bash
SESSION_SECRET=your-super-secret-session-key-here
AUTH_ORIGIN=https://your-app-domain.replit.app
```

### Voice Services
```bash
# OpenAI for AI tutoring and voice
OPENAI_API_KEY=sk-your-openai-api-key

# ElevenLabs ConvAI (Required for voice conversations)
USE_CONVAI=true
ELEVENLABS_API_KEY=your-elevenlabs-api-key

# Azure Speech Services for narration (Optional fallback)
AZURE_SPEECH_KEY=your-azure-speech-key
AZURE_SPEECH_REGION=eastus
```

### Payment Processing (Stripe)
```bash
STRIPE_SECRET_KEY=sk_live_your-stripe-secret-key
STRIPE_SINGLE_PRICE_ID=price_single-subject-plan
STRIPE_ALL_PRICE_ID=price_all-subjects-plan
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
```

### Optional Settings
```bash
# Disable voice for testing/demo mode
VOICE_TEST_MODE=0  # Set to 1 to use browser TTS instead of real voice APIs

# Custom domains (if configured)
CUSTOM_DOMAIN=yourdomain.com
```

## Pre-Deployment Checklist

- [ ] All environment variables configured
- [ ] Database migrations completed (`npm run db:push`)
- [ ] Build process tested locally (`npm run build`)
- [ ] Health check endpoint accessible (`/api/health`)
- [ ] SSL certificate configured (handled by Replit)
- [ ] Stripe webhooks configured to point to deployment URL

## Health Check Configuration

The application includes a health check endpoint at `/api/health` that returns:

```json
{
  "status": "ok",
  "timestamp": "2025-09-24T21:48:00.000Z",
  "env": "production",
  "voiceTestMode": false
}
```

Configure your deployment to use this endpoint for health monitoring.

## Scaling Considerations

### When to Scale Up

- Response times > 2 seconds consistently
- Memory usage > 80%
- CPU usage > 70% for extended periods
- User complaints about performance

### Scaling Options

1. **Vertical Scaling**: Increase machine size (2 vCPU, 4GB RAM)
2. **Horizontal Scaling**: Increase max instances to 2-3
3. **Database Optimization**: Consider connection pooling, read replicas

## Monitoring and Maintenance

### Key Metrics to Monitor

- Response time (target: < 1 second)
- Error rate (target: < 1%)
- Voice service usage and costs
- Database performance
- Memory and CPU usage

### Log Monitoring

- Application logs via Replit console
- Error tracking and alerts
- Voice service usage logs
- User session analytics

## GitHub Deployment Options

### Vercel (Recommended for GitHub)
1. **Push to GitHub** (see instructions below)
2. **Connect to Vercel**: Import GitHub repository
3. **Set Environment Variables** in Vercel dashboard
4. **Deploy**: Automatic deployment on push to main branch

### Netlify
1. **Push to GitHub**
2. **Connect to Netlify**: Import GitHub repository  
3. **Build Settings**: 
   - Build command: `npm run build`
   - Publish directory: `dist`
4. **Set Environment Variables** in Netlify dashboard

### Railway
1. **Push to GitHub**
2. **Connect to Railway**: Import GitHub repository
3. **Set Environment Variables** in Railway dashboard
4. **Deploy**: Automatic deployment

## ElevenLabs Agent Configuration

Your app is pre-configured with these agent IDs:
- **K-2**: `agent_0101k6691t11ew6bcfm3396wfhza`
- **Grades 3-5**: `agent_4501k66bf389e01t212acwk5vc26`
- **Grades 6-8**: `agent_3701k66bmce0ecr8mt98nvc4pb96`
- **Grades 9-12**: `agent_6301k66brd9gfhqtey7t3tf1masf`
- **College/Adult**: `agent_8901k66cfk6ae6v8h7gj1t21enqa`

**After deployment**, add your production domain to ElevenLabs allowlist:
1. Go to ElevenLabs dashboard → Select each agent
2. Security tab → Add your production domain (e.g., `your-app.vercel.app`)

## Optional: Continuous Deployment

**Note**: Auto-deployment is intentionally disabled in this setup. For production, consider:

### Manual Deployment Process

1. Test changes in staging environment
2. Run CI tests locally: `npm run build && npm run test:e2e`
3. Deploy manually via Replit interface
4. Monitor health check and application logs
5. Rollback if issues detected

### Future CD Options

If you want to enable continuous deployment later:

1. **Staging to Vercel**: Auto-deploy `staging` branch
2. **Main to Production**: Manual approval for `main` branch
3. **Replit Deploy Action**: Custom GitHub Action for Replit deployment

## Troubleshooting

### Common Issues

1. **Health check failing**: Verify PORT environment variable
2. **Database connection errors**: Check DATABASE_URL and network access
3. **Voice service errors**: Verify API keys and quota limits
4. **Session issues**: Ensure SESSION_SECRET is set and persistent

### Debug Mode

Set `NODE_ENV=development` temporarily to enable detailed logging.

### Support

- Replit deployment documentation
- Application logs in Replit console
- GitHub Issues for application-specific problems