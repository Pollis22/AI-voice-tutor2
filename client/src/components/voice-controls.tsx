import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useVoice } from "@/hooks/use-voice";
import { Badge } from "@/components/ui/badge";

interface VoiceControlsProps {
  lessonId: string;
}

export function VoiceControls({ lessonId }: VoiceControlsProps) {
  const { 
    isActive, 
    isConnected, 
    startVoiceSession, 
    endVoiceSession, 
    muteAudio, 
    unmuteAudio, 
    isMuted,
    error 
  } = useVoice();

  const handleStartVoice = async () => {
    try {
      await startVoiceSession(lessonId);
    } catch (error) {
      console.error("Failed to start voice session:", error);
    }
  };

  const handleEndVoice = () => {
    endVoiceSession();
  };

  const handleToggleMute = () => {
    if (isMuted) {
      unmuteAudio();
    } else {
      muteAudio();
    }
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-6">
        <div className="text-center">
          {!isActive ? (
            <div className="space-y-4" data-testid="voice-inactive">
              <div className="w-20 h-20 bg-primary/10 rounded-full mx-auto flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-primary" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd"/>
                </svg>
              </div>
              
              <Button
                onClick={handleStartVoice}
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 rounded-xl font-semibold text-lg"
                data-testid="button-start-voice"
              >
                🎤 Start Voice Learning
              </Button>
              
              <p className="text-sm text-muted-foreground">
                Click to enable voice conversation with your AI tutor
              </p>
              
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4" data-testid="voice-active">
              <div className="w-20 h-20 bg-secondary/20 rounded-full mx-auto flex items-center justify-center mb-4 voice-pulse">
                <div className="w-16 h-16 bg-secondary/30 rounded-full flex items-center justify-center">
                  <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-secondary-foreground" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd"/>
                    </svg>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium text-foreground">Voice session active</h3>
                
                <div className="flex items-center justify-center space-x-2">
                  <Badge variant={isConnected ? "default" : "secondary"}>
                    {isConnected ? "Connected" : "Connecting..."}
                  </Badge>
                  {isMuted && <Badge variant="outline">Muted</Badge>}
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Your AI tutor is {isConnected ? "listening and ready to help" : "connecting..."}
                </p>
              </div>
              
              <div className="flex justify-center space-x-3">
                <Button
                  variant="outline"
                  onClick={handleToggleMute}
                  disabled={!isConnected}
                  data-testid="button-toggle-mute"
                >
                  {isMuted ? "Unmute" : "Mute"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleEndVoice}
                  data-testid="button-end-voice"
                >
                  End Voice
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
