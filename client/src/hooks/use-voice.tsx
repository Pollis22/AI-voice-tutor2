import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  
  const { toast } = useToast();
  const realtimeConnectionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

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
        // Mock implementation for testing
        setIsConnected(true);
        return {
          connect: () => Promise.resolve(),
          disconnect: () => Promise.resolve(),
          send: (data: any) => console.log('Mock send:', data),
          mute: () => setIsMuted(true),
          unmute: () => setIsMuted(false),
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
      
      // Initialize audio context (requires user gesture)
      await initializeAudioContext();
      
      // Get microphone access
      await getUserMedia();
      
      // Setup realtime connection
      const connection = await setupRealtimeConnection(token, config);
      realtimeConnectionRef.current = connection;
      
      // Connect to the service
      await connection.connect();
      
      setIsActive(true);
      
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
    try {
      const voiceMinutesUsed = Math.ceil((Date.now() - (sessionId ? 0 : Date.now())) / 60000); // Mock calculation
      
      if (sessionId) {
        await endSessionMutation.mutateAsync({
          sessionId,
          voiceMinutesUsed,
          transcript: "Voice session transcript placeholder", // Would be actual transcript
        });
      }
      
      cleanup();
      
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
  }, [sessionId, endSessionMutation, toast]);

  const cleanup = useCallback(() => {
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
