import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getTestSpeechService, getTestSpeechRecognition, testLessonMessages } from "@/utils/test-speech";

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
}

export function useVoice() {
  const [isActive, setIsActive] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  
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

  const setupRealtimeConnection = useCallback(async (token: string, config: VoiceConfig) => {
    try {
      if (config.testMode) {
        // Test mode with browser text-to-speech and speech recognition
        const speechService = getTestSpeechService();
        const speechRecognition = getTestSpeechRecognition();
        
        setIsConnected(true);
        
        // Simulated AI responses based on user input patterns
        const generateAIResponse = (userInput: string): string => {
          const input = userInput.toLowerCase();
          
          // Check for various input patterns and respond accordingly
          if (input.includes('hello') || input.includes('hi')) {
            return "Hello! It's great to have you here. What subject would you like to learn about today?";
          } else if (input.includes('noun')) {
            return "Excellent! A noun is a word that names a person, place, thing, or idea. For example, 'teacher', 'school', 'book', and 'happiness' are all nouns. Can you give me an example of a noun from your surroundings?";
          } else if (input.includes('verb')) {
            return "Great question! A verb is a word that shows action or state of being. Words like 'run', 'think', 'is', and 'become' are verbs. What's your favorite action verb?";
          } else if (input.includes('adjective')) {
            return "Good thinking! An adjective is a word that describes a noun. Words like 'blue', 'happy', 'tall', and 'interesting' are adjectives. Can you describe something around you using an adjective?";
          } else if (input.includes('yes') || input.includes('ready')) {
            return "Wonderful! Let's begin. Today we'll explore parts of speech. Do you know what a noun is?";
          } else if (input.includes('no') || input.includes('not sure')) {
            return "That's perfectly fine! Learning is all about discovering new things. Let me explain. Can you tell me what you'd like to know?";
          } else if (input.includes('book') || input.includes('computer') || input.includes('desk') || input.includes('phone')) {
            return `Yes! '${userInput}' is a great example of a noun! It's a thing we can see and touch. Can you think of a noun that names a feeling or idea?`;
          } else if (input.includes('love') || input.includes('happiness') || input.includes('anger') || input.includes('joy')) {
            return `Perfect! '${userInput}' is an abstract noun - it names a feeling or concept we can't physically touch. You're really getting this!`;
          } else if (input.includes('thank') || input.includes('bye') || input.includes('goodbye')) {
            return "You're very welcome! Great job today. Remember to practice identifying parts of speech in your daily reading. See you next time!";
          } else {
            // Default responses for continuing conversation
            const responses = [
              "That's an interesting point! Can you tell me more about your thinking?",
              "Good observation! Let's explore that further. What else do you notice?",
              "I like how you're thinking about this. Can you give me an example?",
              "You're on the right track! What makes you say that?",
              "Excellent effort! Let's think about this together. What do you know so far?"
            ];
            return responses[Math.floor(Math.random() * responses.length)];
          }
        };
        
        // Track if AI is currently speaking to prevent feedback loop
        let isAISpeaking = false;
        
        // Handle user speech input
        const handleUserSpeech = async (transcript: string) => {
          // Ignore input if AI is speaking (prevents feedback loop)
          if (isAISpeaking) {
            console.log('[Voice] Ignoring input while AI is speaking');
            return;
          }
          
          console.log('[Voice] User said:', transcript);
          
          // Add user message to conversation history
          setConversationHistory(prev => [...prev, {
            type: 'user',
            content: transcript,
            timestamp: Date.now()
          }]);
          
          // Generate AI response
          const aiResponse = generateAIResponse(transcript);
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
        if (speechRecognition) {
          speechRecognition.onResult(handleUserSpeech);
          speechRecognition.onError((error) => {
            console.error('[Voice] Speech recognition error:', error);
            // Fallback to text if speech recognition fails
            speechService.speak("I'm having trouble hearing you. Let me continue with the lesson. A noun is a word that names a person, place, thing, or idea.");
          });
        }
        
        // Start conversation with greeting
        const startConversation = async () => {
          console.log('Starting interactive AI tutor...');
          
          // Mark AI as speaking during greeting
          isAISpeaking = true;
          
          // Add greeting to conversation history
          setConversationHistory(prev => [...prev, {
            type: 'tutor',
            content: testLessonMessages.greeting,
            timestamp: Date.now()
          }]);
          
          try {
            await speechService.speak(testLessonMessages.greeting);
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
        const connection = await setupRealtimeConnection(token, config);
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
      const connection = await setupRealtimeConnection(token, config);
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
    startVoiceSession,
    endVoiceSession: endVoiceSession,
    muteAudio,
    unmuteAudio,
  };
}
