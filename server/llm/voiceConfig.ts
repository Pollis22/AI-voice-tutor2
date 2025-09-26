// Azure TTS Voice Configuration and Energy Level Mapping

export type EnergyLevel = 'calm' | 'neutral' | 'upbeat';

export interface VoiceStyle {
  style: string;
  styleDegree: number;
  rate: string;
  pitch: string;
}

export interface VoiceConfig {
  voiceName: string;
  fallbackVoice: string;
  defaultStyle: VoiceStyle;
  energyMapping: Record<EnergyLevel, VoiceStyle>;
}

// Energy level to voice style mapping
export const VOICE_CONFIG: VoiceConfig = {
  voiceName: process.env.AZURE_VOICE_NAME || 'en-US-AriaNeural',
  fallbackVoice: 'en-US-JennyNeural', // Also young and friendly
  defaultStyle: {
    style: 'cheerful',
    styleDegree: 1.2,
    rate: '1.06', // +6% rate as specified
    pitch: '+1st' // +1 semitone pitch
  },
  energyMapping: {
    calm: {
      style: 'gentle',
      styleDegree: 0.8,
      rate: '0.94', // Slower for calm
      pitch: '+0Hz'
    },
    neutral: {
      style: 'friendly',
      styleDegree: 1.0,
      rate: '1.0',
      pitch: '+0Hz'
    },
    upbeat: {
      style: 'cheerful',
      styleDegree: 1.2,
      rate: '1.06', // +6% rate
      pitch: '+1st' // +1 semitone
    }
  }
};

// Generate SSML with expressive voice styling
export function generateSSML(text: string, energyLevel: EnergyLevel = 'neutral'): string {
  const config = VOICE_CONFIG;
  const style = config.energyMapping[energyLevel];
  
  return `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" 
       xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
  <voice name="${config.voiceName}">
    <mstts:express-as style="${style.style}" styledegree="${style.styleDegree}">
      <prosody rate="${style.rate}" pitch="${style.pitch}">
        ${text}
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`.trim();
}

// Extract available energy levels for UI
export const ENERGY_LEVELS: EnergyLevel[] = ['calm', 'neutral', 'upbeat'];

// Get current energy level from environment or default
export function getCurrentEnergyLevel(): EnergyLevel {
  const envLevel = process.env.ENERGY_LEVEL as EnergyLevel;
  return ENERGY_LEVELS.includes(envLevel) ? envLevel : 'upbeat';
}