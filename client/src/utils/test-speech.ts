// Text-to-Speech and Speech-to-Text for test mode using browser's Web Speech API
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
    };
    
    utterance.onerror = (event) => {
      console.error('[TTS] Speech error:', event);
    };

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

// Speech Recognition Service for Speech-to-Text
export class TestSpeechRecognition {
  private recognition: any;
  private isListening: boolean = false;
  private onResultCallback: ((text: string) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;

  constructor() {
    // Check for browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.error('[STT] Speech recognition not supported in this browser');
      throw new Error('Speech recognition not supported');
    }

    this.recognition = new SpeechRecognition();
    this.setupRecognition();
  }

  private setupRecognition() {
    // Configure recognition
    this.recognition.continuous = true; // Keep listening until stopped
    this.recognition.interimResults = true; // Get results as user speaks
    this.recognition.maxAlternatives = 1;
    this.recognition.lang = 'en-US';

    // Handle results
    this.recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Show visual feedback for what user is saying
      if (interimTranscript) {
        this.showUserFeedback(interimTranscript, false);
      }
      
      if (finalTranscript && this.onResultCallback) {
        console.log('[STT] Final transcript:', finalTranscript);
        this.showUserFeedback(finalTranscript, true);
        this.onResultCallback(finalTranscript.trim());
      }
    };

    // Handle errors
    this.recognition.onerror = (event: any) => {
      console.error('[STT] Recognition error:', event.error);
      
      if (event.error === 'not-allowed') {
        const errorMsg = 'Microphone access denied. Please allow microphone access and try again.';
        this.showErrorFeedback(errorMsg);
        if (this.onErrorCallback) {
          this.onErrorCallback(errorMsg);
        }
      } else if (event.error === 'no-speech') {
        console.log('[STT] No speech detected, continuing to listen...');
      } else {
        const errorMsg = `Speech recognition error: ${event.error}`;
        this.showErrorFeedback(errorMsg);
        if (this.onErrorCallback) {
          this.onErrorCallback(errorMsg);
        }
      }
    };

    // Handle end of recognition
    this.recognition.onend = () => {
      console.log('[STT] Recognition ended');
      this.isListening = false;
      
      // Restart if we should still be listening
      if (this.isListening) {
        console.log('[STT] Restarting recognition...');
        this.start();
      }
    };

    // Log when recognition starts
    this.recognition.onstart = () => {
      console.log('[STT] Recognition started');
      this.isListening = true;
    };
  }

  start() {
    if (!this.isListening) {
      console.log('[STT] Starting speech recognition...');
      this.isListening = true;
      try {
        this.recognition.start();
      } catch (error) {
        console.error('[STT] Failed to start recognition:', error);
        this.isListening = false;
      }
    }
  }

  stop() {
    if (this.isListening) {
      console.log('[STT] Stopping speech recognition...');
      this.isListening = false;
      this.recognition.stop();
      this.hideUserFeedback();
    }
  }

  onResult(callback: (text: string) => void) {
    this.onResultCallback = callback;
  }

  onError(callback: (error: string) => void) {
    this.onErrorCallback = callback;
  }

  private showUserFeedback(text: string, isFinal: boolean) {
    // Remove any existing feedback
    const existing = document.getElementById('stt-user-feedback');
    if (existing) {
      existing.remove();
    }
    
    // Create visual feedback element
    const message = document.createElement('div');
    message.id = 'stt-user-feedback';
    const animationStyle = isFinal ? 'none' : 'pulse 1s infinite';
    const youText = isFinal ? 'You said' : 'You';
    message.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 8px; height: 8px; background: white; border-radius: 50%; animation: ${animationStyle};"></div>
        <strong>${youText}:</strong> ${text}
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      </style>
    `;
    const opacityStyle = isFinal ? '' : 'opacity: 0.9;';
    message.style.cssText = `position: fixed; bottom: 20px; left: 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 20px; border-radius: 12px; max-width: 500px; z-index: 9999; box-shadow: 0 4px 15px rgba(0,0,0,0.2); animation: slideIn 0.3s ease-out; font-size: 14px; line-height: 1.5; ${opacityStyle}`;
    document.body.appendChild(message);
    
    // Auto-remove final transcripts after a delay
    if (isFinal) {
      setTimeout(() => {
        const element = document.getElementById('stt-user-feedback');
        if (element) {
          element.style.animation = 'slideOut 0.3s ease-out';
          setTimeout(() => element.remove(), 300);
        }
      }, 3000);
    }
  }

  private hideUserFeedback() {
    const element = document.getElementById('stt-user-feedback');
    if (element) {
      element.remove();
    }
  }

  private showErrorFeedback(error: string) {
    const message = document.createElement('div');
    message.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <strong>⚠️ Error:</strong> ${error}
      </div>
    `;
    message.style.cssText = 'position: fixed; bottom: 20px; left: 20px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 15px 20px; border-radius: 12px; max-width: 500px; z-index: 9999; box-shadow: 0 4px 15px rgba(0,0,0,0.2); animation: slideIn 0.3s ease-out; font-size: 14px; line-height: 1.5;';
    document.body.appendChild(message);
    
    // Auto-remove after delay
    setTimeout(() => {
      message.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => message.remove(), 300);
    }, 5000);
  }
}

// Singleton instance for speech recognition
let testSpeechRecognitionInstance: TestSpeechRecognition | null = null;

export function getTestSpeechRecognition() {
  if (!testSpeechRecognitionInstance) {
    try {
      testSpeechRecognitionInstance = new TestSpeechRecognition();
    } catch (error) {
      console.error('[STT] Failed to create speech recognition instance:', error);
      return null;
    }
  }
  return testSpeechRecognitionInstance;
}