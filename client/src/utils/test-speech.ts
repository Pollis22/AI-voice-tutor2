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
    
    // Enhanced logging for debugging
    console.log('[TTS] Speaking:', text);
    console.log('[TTS] Available voices:', this.voices.length);
    console.log('[TTS] Speech synthesis available:', 'speechSynthesis' in window);
    
    // Visual feedback - show what the AI tutor is saying
    this.showVisualFeedback(text);

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set voice (prefer English voices)
    const preferredVoice = this.voices.find(v => 
      v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Samantha'))
    ) || this.voices.find(v => v.lang.startsWith('en')) || this.voices[0];
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
      console.log('[TTS] Using voice:', preferredVoice.name);
    } else {
      console.log('[TTS] No preferred voice found, using default');
    }

    // Set speech parameters - slower rate for better clarity
    utterance.rate = options?.rate || 0.9;
    utterance.pitch = options?.pitch || 1.0;
    utterance.volume = options?.volume || 1.0;
    
    // Enhanced event handling for debugging
    utterance.onstart = () => {
      console.log('[TTS] Speech started');
    };
    
    utterance.onend = () => {
      console.log('[TTS] Speech ended');
      this.hideVisualFeedback();
    };
    
    utterance.onerror = (event) => {
      console.error('[TTS] Speech error:', event);
      // Keep visual feedback visible longer on error
      setTimeout(() => this.hideVisualFeedback(), 10000);
    };

    this.currentUtterance = utterance;
    this.synthesis.speak(utterance);

    return new Promise<void>((resolve, reject) => {
      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(event.error);
    });
  }
  
  private showVisualFeedback(text: string) {
    // Remove any existing feedback
    const existing = document.getElementById('tts-visual-feedback');
    if (existing) {
      existing.remove();
    }
    
    // Create visual feedback element
    const message = document.createElement('div');
    message.id = 'tts-visual-feedback';
    message.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 8px; height: 8px; background: white; border-radius: 50%; animation: pulse 1s infinite;"></div>
        <strong>AI Tutor:</strong> ${text}
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      </style>
    `;
    message.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 20px; border-radius: 12px; max-width: 500px; z-index: 9999; box-shadow: 0 4px 15px rgba(0,0,0,0.2); animation: slideIn 0.3s ease-out; font-size: 14px; line-height: 1.5;';
    document.body.appendChild(message);
  }
  
  private hideVisualFeedback() {
    const element = document.getElementById('tts-visual-feedback');
    if (element) {
      element.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => element.remove(), 300);
    }
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