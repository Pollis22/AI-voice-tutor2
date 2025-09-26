import crypto from 'crypto';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import OpenAI from 'openai';

class VoiceService {
  private testMode: boolean;
  private openai: OpenAI | null = null;

  constructor() {
    // Check for OpenAI API and Azure Speech credentials
    const hasOpenAI = !!process.env.OPENAI_API_KEY?.trim();
    const hasAzure = !!process.env.AZURE_SPEECH_KEY?.trim() && !!process.env.AZURE_SPEECH_REGION?.trim();
    
    // Use test mode unless explicitly disabled and all services are available
    this.testMode = process.env.VOICE_TEST_MODE !== '0' || !hasOpenAI || !hasAzure;
    
    console.log(`Voice service init: OpenAI=${hasOpenAI}, Azure=${hasAzure}, TestMode=${this.testMode}`);
    
    if (!this.testMode && hasOpenAI) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    
    if (this.testMode) {
      console.log('Voice service running in TEST MODE - using browser TTS and simplified conversation logic');
    } else {
      console.log('Voice service running in PRODUCTION MODE - using OpenAI + Azure TTS');
    }
  }

  async generateLiveToken(userId: string): Promise<string> {
    if (this.testMode) {
      // Return mock token for testing
      return `mock_token_${userId}_${Date.now()}`;
    }

    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    // Generate secure ephemeral token without exposing API key
    // Token is server-side only and will be validated on backend
    const payload = {
      userId,
      timestamp: Date.now(),
      service: 'openai_realtime',
      // Never include actual API key in payload sent to client
      sessionId: crypto.randomUUID(),
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
      url: 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
      model: 'gpt-4o-realtime-preview',
      voice: 'alloy',
      instructions: `You are a friendly, patient AI tutor. Use a Socratic teaching method - guide students to discover answers rather than giving direct answers immediately. Be encouraging and adapt your teaching style to the student's pace. Keep responses conversational and age-appropriate.`,
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      temperature: 0.7,
      max_response_output_tokens: 2048,
    };
  }

  async generateNarration(text: string, style: string = 'cheerful'): Promise<string> {
    if (this.testMode) {
      // Return mock audio URL for testing
      return `data:audio/wav;base64,mock_audio_${Date.now()}`;
    }

    // Validate environment variables are non-empty
    if (!process.env.AZURE_SPEECH_KEY?.trim() || !process.env.AZURE_SPEECH_REGION?.trim()) {
      throw new Error('Azure Speech services not configured - AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be set');
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
    
    // Escape XML special characters in text content
    const escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    // Build SSML with correct mstts namespace and tags
    if (style === 'professional') {
      return `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
          <voice name="${voice}">
            <prosody rate="medium" pitch="medium">
              ${escapedText}
            </prosody>
          </voice>
        </speak>
      `.trim();
    } else {
      return `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
          <voice name="${voice}">
            <mstts:express-as style="${style}">
              <prosody rate="medium" pitch="medium">
                ${escapedText}
              </prosody>
            </mstts:express-as>
          </voice>
        </speak>
      `.trim();
    }
  }

  private async synthesizeSpeech(ssml: string, config: any): Promise<string> {
    try {
      // Configure Azure Speech SDK
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        config.subscriptionKey,
        config.region
      );
      
      // Set output format
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
      
      // Create synthesizer
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
      
      return new Promise<string>((resolve, reject) => {
        synthesizer.speakSsmlAsync(
          ssml,
          (result) => {
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
              // Convert audio buffer to base64 data URL
              const audioBase64 = Buffer.from(result.audioData).toString('base64');
              const dataUrl = `data:audio/mp3;base64,${audioBase64}`;
              resolve(dataUrl);
            } else {
              reject(new Error(`Speech synthesis failed: ${result.errorDetails}`));
            }
            synthesizer.close();
          },
          (error) => {
            synthesizer.close();
            reject(error);
          }
        );
      });
    } catch (error) {
      console.error('Azure TTS error:', error);
      throw new Error('Failed to synthesize speech with Azure TTS');
    }
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
