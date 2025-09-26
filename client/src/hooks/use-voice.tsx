import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getTestSpeechService, getTestSpeechRecognition } from "@/utils/test-speech";

interface VoiceConfig {
  testMode?: boolean;
  mockAudio?: boolean;
  mockMicrophone?: boolean;
  apiKey?: string;
  model?: string;
  voice?: string;
  instructions?: string;
}

interface ConversationMessage {
  type: 'user' | 'tutor';
  content: string;
  timestamp: number;
  usedFallback?: boolean;
  banner?: string;
}

export function useVoice() {
  const [isActive, setIsActive] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [activeBanner, setActiveBanner] = useState<string | null>(null);
  
  const { toast } = useToast();
  const realtimeConnectionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const conversationTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Get voice token mutation
  const getTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/voice/live-token");
      return await response.json();
    },
  });

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      const response = await apiRequest("POST", "/api/sessions/start", {
        lessonId,
        sessionType: "voice",
      });
      return await response.json();
    },
    onSuccess: (session) => {
      setSessionId(session.id);
    },
  });

  // End session mutation
  const endSessionMutation = useMutation({
    mutationFn: async (data: { sessionId: string; voiceMinutesUsed: number; transcript?: string }) => {
      const response = await apiRequest("PUT", `/api/sessions/${data.sessionId}/end`, {
        voiceMinutesUsed: data.voiceMinutesUsed,
        transcript: data.transcript,
      });
      return await response.json();
    },
  });

  const initializeAudioContext = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      return audioContextRef.current;
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      throw new Error('Audio context initialization failed');
    }
  }, []);

  const getUserMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        }
      });
      
      mediaStreamRef.current = stream;
      return stream;
    } catch (error) {
      console.error('Failed to get user media:', error);
      throw new Error('Microphone access denied or not available');
    }
  }, []);

  const setupRealtimeConnection = useCallback(async (token: string, config: VoiceConfig, lessonId: string) => {
    try {
      if (config.testMode) {
        // Test mode with browser text-to-speech and speech recognition
        const speechService = getTestSpeechService();
        const speechRecognition = getTestSpeechRecognition();
        
        // Track recently used responses to prevent repetition
        const recentResponses: string[] = [];
        
        setIsConnected(true);
        
        // Simulated AI responses based on user input patterns
        const generateAIResponse = async (userInput: string, speechDuration?: number, speechConfidence?: number): Promise<string> => {
          try {
            const response = await apiRequest("POST", "/api/voice/generate-response", {
              message: userInput,
              lessonId: lessonId || 'general',
              sessionId: sessionId,
              speechDuration,
              speechConfidence,
              // Energy level will be determined by server from session or defaults
            });
            
            const data = await response.json();
            
            // Handle banner for API issues
            if (data.banner && data.usedFallback) {
              setActiveBanner(data.banner);
              // Clear banner after 5 seconds
              setTimeout(() => setActiveBanner(null), 5000);
            } else if (activeBanner && !data.usedFallback) {
              // Clear banner if API is working again
              setActiveBanner(null);
            }
            
            return data.content || "I'm here to help you learn! What would you like to explore?";
          } catch (error) {
            console.error('[Voice] Error generating AI response:', error);
            // Fallback to lesson-specific responses if API fails
            const subject = lessonId ? lessonId.split('-')[0] : 'general';
            const fallbackMap: Record<string, string[]> = {
              math: [
                "Let's explore numbers together! Can you count to 5 with me?",
                "Great thinking about math! What number comes after 3?",
                "Good question! How many toys do you have in front of you?",
                "Let's practice! If you have 2 apples and get 1 more, how many do you have?"
              ],
              english: [
                "Let's explore words! Can you tell me a word that names a person?",
                "Good thinking about language! What's your favorite action word?",
                "Let's build sentences! Can you make a sentence with 'dog'?",
                "Great effort! Can you think of a describing word for 'apple'?"
              ],
              spanish: [
                "¡Hola! Can you say 'hello' in Spanish?",
                "Good try! How do you say 'thank you' in Spanish?",
                "Let's practice! Can you count 'uno, dos, tres' with me?",
                "¡Muy bien! What color is 'rojo' in English?"
              ],
              general: [
                "Let's learn together! What would you like to explore?",
                "Good question! Can you tell me more about what you're thinking?",
                "I'm here to help! What part interests you most?",
                "Great effort! Let's work through this step by step."
              ]
            };
            
            const responses = fallbackMap[subject] || fallbackMap.general;
            
            // Pick a response not recently used
            let selectedResponse = '';
            for (const response of responses) {
              if (!recentResponses.includes(response)) {
                selectedResponse = response;
                break;
              }
            }
            
            // If all were used, clear history and pick randomly
            if (!selectedResponse) {
              recentResponses.length = 0;
              selectedResponse = responses[Math.floor(Math.random() * responses.length)];
            }
            
            // Track this response (keep only last 3)
            recentResponses.push(selectedResponse);
            if (recentResponses.length > 3) recentResponses.shift();
            
            return selectedResponse;
          }
        };
        
        // Track if AI is currently speaking to prevent feedback loop
        let isAISpeaking = false;
        
        // Handle user speech input with validation
        const handleUserSpeech = async (transcript: string, duration?: number, confidence?: number) => {
          // Ignore input if AI is speaking (prevents feedback loop)
          if (isAISpeaking) {
            console.log('[Voice] Ignoring input while AI is speaking');
            return;
          }
          
          // Validate transcript is not empty
          const trimmedTranscript = transcript?.trim() || '';
          if (!trimmedTranscript || trimmedTranscript.length < 2) {
            console.log('[Voice] Ignoring empty or too short input:', transcript);
            
            // Update debug HUD with rejection reason
            if ((window as any).updateAsrDebugHud) {
              (window as any).updateAsrDebugHud({
                duration,
                confidence,
                passed: false,
                profile: 'browser-asr',
                vadSilence: false,
                endOfSpeech: true,
                reason: 'Input too short or empty'
              });
            }
            return;
          }
          
          console.log('[Voice] User said:', transcript);
          
          // Add user message to conversation history
          setConversationHistory(prev => [...prev, {
            type: 'user',
            content: transcript,
            timestamp: Date.now()
          }]);
          
          // Update ASR debug HUD with speech recognition data
          if ((window as any).updateAsrDebugHud) {
            (window as any).updateAsrDebugHud({
              duration,
              confidence,
              passed: true, // Made it through initial validation
              profile: 'browser-asr',
              vadSilence: false,
              endOfSpeech: true,
              reason: 'Speech recognition successful'
            });
          }

          // Generate AI response with speech metrics
          const aiResponse = await generateAIResponse(transcript, duration, confidence);
          console.log('[Voice] AI response:', aiResponse);
          
          // Stop listening before AI speaks to prevent feedback
          if (speechRecognition) {
            console.log('[Voice] Pausing speech recognition while AI speaks');
            speechRecognition.stop();
          }
          
          // Mark AI as speaking
          isAISpeaking = true;
          
          // Speak the AI response after a short delay
          setTimeout(async () => {
            try {
              // Add AI message to conversation history before speaking
              setConversationHistory(prev => [...prev, {
                type: 'tutor',
                content: aiResponse,
                timestamp: Date.now()
              }]);
              
              await speechService.speak(aiResponse);
              console.log('[Voice] AI finished speaking');
            } catch (error) {
              console.error('[Voice] Speech error:', error);
            } finally {
              // AI done speaking, resume listening after a delay
              isAISpeaking = false;
              
              if (speechRecognition) {
                setTimeout(() => {
                  console.log('[Voice] Resuming speech recognition');
                  speechRecognition.start();
                }, 1000); // Wait 1 second before listening again
              }
            }
          }, 500);
        };
        
        // Set up speech recognition callbacks
        const subject = lessonId ? lessonId.split('-')[0] : 'general';
        
        if (speechRecognition) {
          speechRecognition.onResult(handleUserSpeech);
          speechRecognition.onError((error) => {
            console.error('[Voice] Speech recognition error:', error);
            // Fallback to text if speech recognition fails  
            const fallbackMessage = subject === 'math' 
              ? "I'm having trouble hearing you. Let me continue with the lesson. Can you show me 2 fingers?"
              : subject === 'spanish'
              ? "I'm having trouble hearing you. Let me continue with the lesson. Let's practice saying 'hola'!"
              : subject === 'english'
              ? "I'm having trouble hearing you. Let me continue with the lesson. Can you tell me a word that names something?"
              : "I'm having trouble hearing you. Let's continue learning together. What would you like to explore?";
            speechService.speak(fallbackMessage);
          });
        }
        
        // Start conversation with greeting
        const startConversation = async () => {
          console.log('Starting interactive AI tutor...');
          
          // Mark AI as speaking during greeting
          isAISpeaking = true;
          
          // Generate lesson-specific greeting
          const subject = lessonId ? lessonId.split('-')[0] : 'general';
          const greetings: Record<string, string> = {
            math: "Hello! Welcome to your math lesson. Today we'll explore numbers and counting. Are you ready to begin?",
            english: "Hello! Welcome to your English lesson. Today we'll explore words and sentences. Are you ready to begin?",
            spanish: "¡Hola! Welcome to your Spanish lesson. Today we'll learn Spanish words. Are you ready to begin?",
            general: "Hello! Welcome to your AI Tutor. I'm here to help you learn. What would you like to explore today?"
          };
          
          const greeting = greetings[subject] || greetings.general;
          
          // Add greeting to conversation history
          setConversationHistory(prev => [...prev, {
            type: 'tutor',
            content: greeting,
            timestamp: Date.now()
          }]);
          
          try {
            await speechService.speak(greeting);
            console.log('[Voice] Greeting finished');
          } catch (error) {
            console.error('[Voice] Greeting error:', error);
          } finally {
            isAISpeaking = false;
          }
          
          // Start listening for user speech after greeting completes
          if (speechRecognition) {
            setTimeout(() => {
              console.log('[Voice] Starting speech recognition...');
              speechRecognition.start();
            }, 1500); // Wait 1.5 seconds after greeting before listening
          }
        };
        
        // Start conversation after a brief delay
        const initialTimeoutId = setTimeout(startConversation, 1000);
        conversationTimeoutsRef.current.push(initialTimeoutId);
        
        return {
          connect: () => {
            console.log('Test mode: Interactive AI tutor with speech recognition started');
            return Promise.resolve();
          },
          disconnect: () => {
            speechService.stop();
            if (speechRecognition) {
              speechRecognition.stop();
            }
            setIsConnected(false);
            return Promise.resolve();
          },
          send: (data: any) => {
            console.log('User interaction:', data);
            // Could handle text input here if needed
          },
          mute: () => {
            speechService.pause();
            if (speechRecognition) {
              speechRecognition.stop();
            }
            setIsMuted(true);
          },
          unmute: () => {
            speechService.resume();
            if (speechRecognition) {
              speechRecognition.start();
            }
            setIsMuted(false);
          },
        };
      }

      // Real OpenAI Realtime API implementation would go here
      // For now, we'll simulate the connection
      const mockConnection = {
        connect: async () => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          setIsConnected(true);
        },
        disconnect: () => {
          setIsConnected(false);
        },
        send: (data: any) => {
          console.log('Sending to OpenAI Realtime:', data);
        },
        mute: () => setIsMuted(true),
        unmute: () => setIsMuted(false),
      };

      return mockConnection;
    } catch (error) {
      console.error('Failed to setup realtime connection:', error);
      throw new Error('Voice connection setup failed');
    }
  }, []);

  const startVoiceSession = useCallback(async (lessonId: string) => {
    try {
      setError(null);
      
      // Start the learning session first
      const session = await startSessionMutation.mutateAsync(lessonId);
      
      // Get voice token and config
      const { token, config } = await getTokenMutation.mutateAsync();
      
      console.log('Voice config received:', config);
      
      // For test mode, setup with browser's speech APIs
      if (config.testMode) {
        console.log('Test mode detected: Starting interactive tutor with speech recognition');
        
        // Request microphone permission for speech recognition
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // We got permission, but we'll use the Web Speech API instead of the stream
          stream.getTracks().forEach(track => track.stop());
          console.log('[Voice] Microphone permission granted');
        } catch (error) {
          console.warn('[Voice] Microphone permission denied, continuing with TTS only:', error);
          toast({
            title: "Microphone Access",
            description: "Please allow microphone access for voice interaction. The tutor will continue with text-to-speech only.",
            variant: "default",
          });
        }
        
        // Setup realtime connection for test mode
        const connection = await setupRealtimeConnection(token, config, lessonId);
        realtimeConnectionRef.current = connection;
        
        await connection.connect();
        setIsActive(true);
        setSessionStartTime(Date.now()); // Track when session started
        
        toast({
          title: "Voice session started",
          description: "Speak clearly into your microphone to interact with your AI tutor!",
        });
        return;
      }
      
      // For real mode, setup audio and microphone
      console.log('Real mode: Setting up audio and microphone');
      await initializeAudioContext();
      await getUserMedia();
      
      // Setup realtime connection for real mode
      const connection = await setupRealtimeConnection(token, config, lessonId);
      realtimeConnectionRef.current = connection;
      
      // Connect to the service
      await connection.connect();
      
      setIsActive(true);
      setSessionStartTime(Date.now()); // Track when session started (real mode)
      
      toast({
        title: "Voice session started",
        description: "You can now speak with your AI tutor!",
      });
      
    } catch (error: any) {
      console.error('Failed to start voice session:', error);
      setError(error.message || 'Failed to start voice session');
      
      toast({
        title: "Voice session failed",
        description: error.message || 'Could not start voice session. Please try again.',
        variant: "destructive",
      });
      
      // Cleanup on error
      cleanup();
    }
  }, [getTokenMutation, startSessionMutation, initializeAudioContext, getUserMedia, setupRealtimeConnection, toast]);

  const endVoiceSession = useCallback(async () => {
    // Always cleanup first to ensure UI state is clean
    cleanup();
    
    // Calculate actual elapsed time in minutes
    const sessionDuration = sessionStartTime ? Date.now() - sessionStartTime : 0;
    const voiceMinutesUsed = Math.ceil(sessionDuration / 60000);
    
    // Try to save session data, but don't let failures affect the UI
    if (sessionId) {
      try {
        await endSessionMutation.mutateAsync({
          sessionId,
          voiceMinutesUsed,
          transcript: "Voice session transcript placeholder", // Would be actual transcript
        });
        
        toast({
          title: "Voice session ended",
          description: `Session saved. Used ${voiceMinutesUsed} minutes.`,
        });
      } catch (error: any) {
        // Silently handle API errors - user doesn't need to see them
        console.warn('Session save failed, but voice session ended cleanly:', error);
        
        toast({
          title: "Voice session ended",
          description: "Session stopped successfully.",
        });
      }
    } else {
      toast({
        title: "Voice session ended",
        description: "Session stopped successfully.",
      });
    }
  }, [sessionId, endSessionMutation, toast, sessionStartTime]);

  const cleanup = useCallback(() => {
    // Clear all conversation timeouts to prevent callbacks after session ends
    conversationTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
    conversationTimeoutsRef.current = [];
    
    // Disconnect realtime connection
    if (realtimeConnectionRef.current) {
      realtimeConnectionRef.current.disconnect();
      realtimeConnectionRef.current = null;
    }
    
    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsActive(false);
    setIsConnected(false);
    setIsMuted(false);
    setError(null);
    setSessionId(null);
    setSessionStartTime(null);
    setConversationHistory([]); // Clear conversation history on session end
  }, []);

  const muteAudio = useCallback(() => {
    if (realtimeConnectionRef.current && isConnected) {
      realtimeConnectionRef.current.mute();
    }
  }, [isConnected]);

  const unmuteAudio = useCallback(() => {
    if (realtimeConnectionRef.current && isConnected) {
      realtimeConnectionRef.current.unmute();
    }
  }, [isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    isActive,
    isConnected,
    isMuted,
    error,
    sessionId,
    conversationHistory,
    activeBanner,
    startVoiceSession,
    endVoiceSession: endVoiceSession,
    muteAudio,
    unmuteAudio,
  };
}
