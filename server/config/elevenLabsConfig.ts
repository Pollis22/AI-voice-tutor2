/**
 * ElevenLabs Conversational AI Configuration
 * Centralizes all environment variable reads for ConvAI setup
 */

export interface ElevenLabsConfig {
  agentId: string | undefined;
  apiKey: string | undefined;
  openaiApiKey: string | undefined;
  useConvAI: boolean;
}

export function getElevenLabsConfig(): ElevenLabsConfig {
  return {
    agentId: process.env.ELEVENLABS_AGENT_ID,
    apiKey: process.env.ELEVENLABS_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    useConvAI: process.env.USE_CONVAI !== 'false', // Default to true
  };
}

export function isConvAIConfigured(): boolean {
  const config = getElevenLabsConfig();
  return !!(config.agentId && config.useConvAI);
}

export function shouldDisableOldVoiceStack(): boolean {
  const config = getElevenLabsConfig();
  return config.useConvAI;
}