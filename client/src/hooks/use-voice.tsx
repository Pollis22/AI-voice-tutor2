import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getTestSpeechService, testLessonMessages } from "@/utils/test-speech";

interface VoiceConfig {
  testMode?: boolean;
  mockAudio?: boolean;
  mockMicrophone?: boolean;
  apiKey?: string;
  model?: string;
  voice?: string;
  instructions?: string;
}

export function useVoice() {
  const [isActive, setIsActive] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  
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
        // Test mode with browser text-to-speech (no microphone needed)
        const speechService = getTestSpeechService();
        setIsConnected(true);
        
        // Create a conversational sequence
        let conversationStep = 0;
        const conversationFlow = [
          testLessonMessages.greeting,
          testLessonMessages.lesson,
          testLessonMessages.question,
          testLessonMessages.encouragement,
          testLessonMessages.feedback,
          testLessonMessages.ending
        ];
        
        const runConversation = () => {
          if (conversationStep < conversationFlow.length) {
            const message = conversationFlow[conversationStep];
            console.log(`Speaking step ${conversationStep + 1}:`, message);
            speechService.speak(message);
            conversationStep++;
            
            // Continue conversation every 12 seconds - track timeout for cleanup
            if (conversationStep < conversationFlow.length) {
              const timeoutId = setTimeout(runConversation, 12000);
              conversationTimeoutsRef.current.push(timeoutId);
            }
          }
        };
        
        // Start conversation after a brief delay - track timeout for cleanup
        const initialTimeoutId = setTimeout(() => {
          console.log('Starting conversational AI tutor...');
          runConversation();
        }, 1000);
        conversationTimeoutsRef.current.push(initialTimeoutId);
        
        return {
          connect: () => {
            console.log('Test mode: Conversational AI tutor started');
            return Promise.resolve();
          },
          disconnect: () => {
            speechService.stop();
            setIsConnected(false);
            return Promise.resolve();
          },
          send: (data: any) => {
            console.log('User interaction:', data);
            // Continue with next conversation step on interaction
            setTimeout(runConversation, 2000);
          },
          mute: () => {
            speechService.pause();
            setIsMuted(true);
          },
          unmute: () => {
            speechService.resume();
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
      
      // For test mode, skip all microphone/audio setup - just start conversational tutor
      if (config.testMode) {
        console.log('Test mode detected: Starting conversational tutor without microphone');
        
        // Setup realtime connection for test mode
        const connection = await setupRealtimeConnection(token, config);
        realtimeConnectionRef.current = connection;
        
        await connection.connect();
        setIsActive(true);
        setSessionStartTime(Date.now()); // Track when session started
        
        toast({
          title: "Voice tutor started",
          description: "Your AI tutor is speaking! Listen for verbal instructions.",
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
    console.log('endVoiceSession called - starting cleanup...');
    try {
      // Calculate actual elapsed time in minutes
      const sessionDuration = sessionStartTime ? Date.now() - sessionStartTime : 0;
      const voiceMinutesUsed = Math.ceil(sessionDuration / 60000);
      
      console.log(`Voice session ended. Duration: ${sessionDuration}ms, Minutes: ${voiceMinutesUsed}`);
      
      if (sessionId) {
        console.log('Calling end session mutation...');
        await endSessionMutation.mutateAsync({
          sessionId,
          voiceMinutesUsed,
          transcript: "Voice session transcript placeholder", // Would be actual transcript
        });
        console.log('End session mutation completed');
      }
      
      console.log('Calling cleanup...');
      cleanup();
      console.log('Cleanup completed');
      
      toast({
        title: "Voice session ended",
        description: `Session saved. Used ${voiceMinutesUsed} minutes.`,
      });
      
    } catch (error: any) {
      console.error('Failed to end voice session:', error);
      cleanup(); // Still cleanup even if save fails
      
      toast({
        title: "Session ended",
        description: "Voice session stopped (save may have failed)",
        variant: "destructive",
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
    startVoiceSession,
    endVoiceSession: endVoiceSession,
    muteAudio,
    unmuteAudio,
  };
}
