// Simple text-to-speech for test mode using browser's Speech Synthesis API
export class TestSpeechService {
  private synthesis: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    this.synthesis = window.speechSynthesis;
    this.loadVoices();
    
    // Reload voices when they become available
    if (this.synthesis.onvoiceschanged !== undefined) {
      this.synthesis.onvoiceschanged = () => this.loadVoices();
    }
  }

  private loadVoices() {
    this.voices = this.synthesis.getVoices();
  }

  speak(text: string, options?: {
    voice?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
  }) {
    // Cancel any ongoing speech
    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set voice (prefer English voices)
    const preferredVoice = this.voices.find(v => 
      v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Samantha'))
    ) || this.voices.find(v => v.lang.startsWith('en')) || this.voices[0];
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    // Set speech parameters
    utterance.rate = options?.rate || 1.0;
    utterance.pitch = options?.pitch || 1.0;
    utterance.volume = options?.volume || 1.0;

    this.currentUtterance = utterance;
    this.synthesis.speak(utterance);

    return new Promise<void>((resolve, reject) => {
      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(event.error);
    });
  }

  stop() {
    this.synthesis.cancel();
    this.currentUtterance = null;
  }

  pause() {
    this.synthesis.pause();
  }

  resume() {
    this.synthesis.resume();
  }

  isSpeaking() {
    return this.synthesis.speaking;
  }
}

// Singleton instance
let testSpeechInstance: TestSpeechService | null = null;

export function getTestSpeechService() {
  if (!testSpeechInstance) {
    testSpeechInstance = new TestSpeechService();
  }
  return testSpeechInstance;
}

// Test messages for demo mode
export const testLessonMessages = {
  greeting: "Hello! Welcome to your AI Tutor. I'm here to help you learn. Today we'll explore parts of speech in English. Are you ready to begin?",
  
  lesson: "Let's start with nouns. A noun is a word that names a person, place, thing, or idea. Can you think of some examples of nouns around you right now?",
  
  encouragement: "Great job! You're doing wonderfully. Keep up the excellent work!",
  
  question: "Now, let me ask you a question. What type of word is 'happiness'? Is it a noun, verb, or adjective?",
  
  feedback: "That's correct! 'Happiness' is indeed a noun because it names an idea or feeling. You're really getting the hang of this!",
  
  ending: "Excellent work today! You've made great progress in understanding parts of speech. Remember to practice identifying nouns in your daily reading. See you next time!"
};