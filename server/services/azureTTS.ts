import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { generateSSML, splitForStreaming, type EnergyStyle } from '../utils/ssmlGenerator';

export class AzureTTSService {
  private speechConfig: sdk.SpeechConfig;
  private audioConfig: sdk.AudioConfig;
  private synthesizer: sdk.SpeechSynthesizer | null = null;
  private currentEnergyLevel: EnergyStyle = 'neutral';

  constructor() {
    // Initialize Azure Speech SDK
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      throw new Error('Azure Speech credentials not found. Please set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
    }

    this.speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    this.speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
    
    // Set default voice to younger, friendlier American accent
    this.speechConfig.speechSynthesisVoiceName = process.env.AZURE_VOICE_NAME || 'en-US-AriaNeural';
    
    // Configure audio output for server environment (buffer mode for headless servers)
    this.audioConfig = sdk.AudioConfig.fromDefaultSpeakerOutput(); // Will be overridden in synthesis for buffer mode
    this.currentEnergyLevel = (process.env.ENERGY_LEVEL as EnergyStyle) || 'upbeat';
  }

  // Set energy level for current session
  setEnergyLevel(level: EnergyStyle): void {
    this.currentEnergyLevel = level;
    console.log(`[Azure TTS] Energy level set to: ${level}`);
  }

  // Synthesize speech with SSML styling
  async synthesizeSpeech(text: string, energyLevel?: EnergyStyle): Promise<ArrayBuffer> {
    const level = energyLevel || this.currentEnergyLevel;
    const ssml = generateSSML(text, level);
    
    console.log(`[Azure TTS] Synthesizing with energy: ${level}`);
    console.log(`[Azure TTS] SSML:`, ssml);

    return new Promise((resolve, reject) => {
      // Use no audio config for buffer-based synthesis on server
      this.synthesizer = new sdk.SpeechSynthesizer(this.speechConfig, undefined);
      
      this.synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            console.log(`[Azure TTS] Synthesis completed. Audio length: ${result.audioData.byteLength} bytes`);
            resolve(result.audioData);
          } else {
            console.error(`[Azure TTS] Synthesis failed:`, result.errorDetails);
            reject(new Error(result.errorDetails));
          }
          this.synthesizer?.close();
          this.synthesizer = null;
        },
        (error) => {
          console.error(`[Azure TTS] Synthesis error:`, error);
          reject(error);
          this.synthesizer?.close();
          this.synthesizer = null;
        }
      );
    });
  }

  // Stream synthesis for faster response with barge-in support
  async streamSpeech(textChunks: string[], energyLevel?: EnergyStyle, abortSignal?: AbortSignal): Promise<AsyncGenerator<ArrayBuffer>> {
    const level = energyLevel || this.currentEnergyLevel;
    
    return (async function* (this: AzureTTSService) {
      for (const chunk of textChunks) {
        // Check for barge-in (user interrupted)
        if (abortSignal?.aborted) {
          console.log('[Azure TTS] Stream aborted (barge-in detected)');
          break;
        }
        
        try {
          const audioData = await this.synthesizeSpeech(chunk, level);
          yield audioData;
        } catch (error) {
          console.error(`[Azure TTS] Chunk synthesis failed:`, error);
          // Continue with next chunk
        }
      }
    }).call(this);
  }

  // Stop current synthesis (for barge-in)
  stopSynthesis(): void {
    if (this.synthesizer) {
      console.log('[Azure TTS] Stopping current synthesis for barge-in');
      this.synthesizer.close();
      this.synthesizer = null;
    }
  }

  // Test synthesis to verify configuration
  async testSynthesis(): Promise<boolean> {
    try {
      const testText = "Hello! This is a test of the Azure Text-to-Speech service.";
      await this.synthesizeSpeech(testText);
      return true;
    } catch (error) {
      console.error('[Azure TTS] Test synthesis failed:', error);
      return false;
    }
  }

  // Cleanup resources
  dispose(): void {
    if (this.synthesizer) {
      this.synthesizer.close();
      this.synthesizer = null;
    }
  }
}

// Singleton instance
let azureTTSInstance: AzureTTSService | null = null;

export function getAzureTTSService(): AzureTTSService {
  if (!azureTTSInstance) {
    azureTTSInstance = new AzureTTSService();
  }
  return azureTTSInstance;
}