// SSML generator for Azure TTS with energy levels
export type EnergyStyle = 'calm' | 'neutral' | 'upbeat';

interface SSMLConfig {
  voice: string;
  style?: string;
  styleDegree?: number;
  prosodyRate?: string;
  prosodyPitch?: string;
  prosodyVolume?: string;
}

export function generateSSML(text: string, energyLevel: EnergyStyle = 'neutral'): string {
  const voice = process.env.AZURE_VOICE_NAME || 'en-US-EmmaMultilingualNeural';
  
  // Energy level configurations
  const energyConfigs: Record<EnergyStyle, SSMLConfig> = {
    calm: {
      voice,
      style: 'gentle',
      styleDegree: 1.5,
      prosodyRate: '-6%',
      prosodyPitch: '-2st',
      prosodyVolume: 'soft'
    },
    neutral: {
      voice,
      style: 'friendly',
      styleDegree: 1.0,
      prosodyRate: '0%',
      prosodyPitch: '0st',
      prosodyVolume: 'medium'
    },
    upbeat: {
      voice,
      style: 'cheerful',
      styleDegree: 1.2,
      prosodyRate: '+6%',
      prosodyPitch: '+1st',
      prosodyVolume: 'medium'
    }
  };
  
  const config = energyConfigs[energyLevel];
  
  // Build SSML with express-as and prosody
  return `
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" 
           xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
      <voice name="${config.voice}">
        <mstts:express-as style="${config.style}" styledegree="${config.styleDegree}">
          <prosody rate="${config.prosodyRate}" pitch="${config.prosodyPitch}" volume="${config.prosodyVolume}">
            ${escapeSSML(text)}
          </prosody>
        </mstts:express-as>
      </voice>
    </speak>
  `.trim();
}

// Helper to escape special XML characters in text
function escapeSSML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Split text into sentences for streaming
export function splitForStreaming(text: string): string[] {
  // Split by sentence-ending punctuation
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  // Filter empty strings and ensure each chunk is meaningful
  return sentences
    .filter(s => s.trim().length > 0)
    .map(s => s.trim());
}