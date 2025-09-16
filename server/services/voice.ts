import crypto from 'crypto';

class VoiceService {
  private testMode: boolean;

  constructor() {
    this.testMode = process.env.VOICE_TEST_MODE === '1';
  }

  async generateLiveToken(userId: string): Promise<string> {
    if (this.testMode) {
      // Return mock token for testing
      return `mock_token_${userId}_${Date.now()}`;
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    // Generate ephemeral token for OpenAI Realtime API
    // In a real implementation, this would interact with OpenAI's realtime API
    // For now, we'll create a signed token with user context
    const payload = {
      userId,
      timestamp: Date.now(),
      service: 'openai_realtime',
    };

    const token = crypto
      .createHmac('sha256', process.env.SESSION_SECRET!)
      .update(JSON.stringify(payload))
      .digest('hex');

    return `${Buffer.from(JSON.stringify(payload)).toString('base64')}.${token}`;
  }

  getRealtimeConfig() {
    if (this.testMode) {
      return {
        testMode: true,
        mockAudio: true,
        mockMicrophone: true,
      };
    }

    return {
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o-realtime-preview',
      voice: 'alloy',
      instructions: `You are a friendly, patient AI tutor. Use a Socratic teaching method - guide students to discover answers rather than giving direct answers immediately. Be encouraging and adapt your teaching style to the student's pace.`,
    };
  }

  async generateNarration(text: string, style: string = 'cheerful'): Promise<string> {
    if (this.testMode) {
      // Return mock audio URL for testing
      return `data:audio/wav;base64,mock_audio_${Date.now()}`;
    }

    if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) {
      throw new Error('Azure Speech services not configured');
    }

    try {
      // Azure Neural TTS implementation
      const speechConfig = {
        subscriptionKey: process.env.AZURE_SPEECH_KEY,
        region: process.env.AZURE_SPEECH_REGION,
      };

      const ssml = this.buildSSML(text, style);
      
      // In a real implementation, this would call Azure Speech Services
      // For now, we'll return a placeholder URL
      const audioUrl = await this.synthesizeSpeech(ssml, speechConfig);
      
      return audioUrl;
    } catch (error) {
      console.error('Error generating narration:', error);
      throw new Error('Failed to generate speech narration');
    }
  }

  private buildSSML(text: string, style: string): string {
    const voiceMap = {
      cheerful: 'en-US-JennyNeural',
      empathetic: 'en-US-AriaNeural',
      professional: 'en-US-GuyNeural',
    };

    const voice = voiceMap[style as keyof typeof voiceMap] || voiceMap.cheerful;
    const styleAttribute = style === 'professional' ? '' : `style="${style}"`;

    return `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
        <voice name="${voice}">
          <prosody rate="medium" pitch="medium">
            <express-as ${styleAttribute}>
              ${text}
            </express-as>
          </prosody>
        </voice>
      </speak>
    `.trim();
  }

  private async synthesizeSpeech(ssml: string, config: any): Promise<string> {
    // Mock implementation - in production this would call Azure Speech Services
    // and return a real audio URL or stream
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Return a mock URL that would point to generated audio
    return `https://speech-service.azure.com/audio/${crypto.randomBytes(16).toString('hex')}.wav`;
  }

  validateVoiceToken(token: string): { valid: boolean; userId?: string } {
    try {
      if (this.testMode && token.startsWith('mock_token_')) {
        const userId = token.split('_')[2];
        return { valid: true, userId };
      }

      const [payloadBase64, signature] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
      
      const expectedSignature = crypto
        .createHmac('sha256', process.env.SESSION_SECRET!)
        .update(JSON.stringify(payload))
        .digest('hex');

      if (signature !== expectedSignature) {
        return { valid: false };
      }

      // Check if token is not expired (24 hours)
      const isExpired = Date.now() - payload.timestamp > 24 * 60 * 60 * 1000;
      if (isExpired) {
        return { valid: false };
      }

      return { valid: true, userId: payload.userId };
    } catch (error) {
      return { valid: false };
    }
  }
}

export const voiceService = new VoiceService();
