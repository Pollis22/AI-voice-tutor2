import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useVoice } from "@/hooks/use-voice";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AsrDebugHud } from "@/components/asr-debug-hud";

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
    error,
    conversationHistory,
    activeBanner
  } = useVoice();

  const lastMessageRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [conversationHistory]);

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
    <>
      <AsrDebugHud isActive={isActive} />
      <Card className="shadow-sm">
        <CardContent className="pt-6">
        <div className="text-center">
          {!isActive ? (
            <div className="space-y-4" data-testid="voice-inactive">
              <div className="w-20 h-20 bg-primary/10 rounded-full mx-auto flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-primary" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 715 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd"/>
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
              {/* Status Header */}
              <div className="flex items-center justify-center space-x-4">
                <div className="w-12 h-12 bg-secondary/20 rounded-full flex items-center justify-center voice-pulse">
                  <svg className="w-6 h-6 text-secondary-foreground" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7 4a3 3 0 616 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 715 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd"/>
                  </svg>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Badge variant={isConnected ? "default" : "secondary"}>
                    {isConnected ? "Connected" : "Connecting..."}
                  </Badge>
                  {isMuted && <Badge variant="outline">Muted</Badge>}
                </div>
              </div>

              {/* Banner for API Issues */}
              {activeBanner && (
                <div className="w-full mb-4" data-testid="api-banner">
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                      </svg>
                      <span className="text-sm text-yellow-800 dark:text-yellow-200">{activeBanner}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Conversation Transcript */}
              <div className="w-full" data-testid="conversation-transcript">
                <h3 className="text-sm font-medium text-muted-foreground mb-3 text-center">Conversation</h3>
                
                <Card className="border-2">
                  <CardContent className="p-0">
                    <ScrollArea className="h-80 w-full p-4">
                      <div className="space-y-3">
                        {conversationHistory.length === 0 ? (
                          <div className="text-center text-muted-foreground text-sm py-8">
                            Conversation will appear here...
                          </div>
                        ) : (
                          conversationHistory.map((message, index) => (
                            <div
                              key={index}
                              ref={index === conversationHistory.length - 1 ? lastMessageRef : null}
                              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                              data-testid={`message-${message.type}-${index}`}
                            >
                              <div
                                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                  message.type === 'user'
                                    ? 'bg-primary text-primary-foreground ml-4'
                                    : 'bg-muted text-foreground mr-4'
                                }`}
                              >
                                <div className="flex items-center space-x-2 mb-1">
                                  <span className="font-medium text-xs">
                                    {message.type === 'user' ? 'You' : 'AI Tutor'}
                                  </span>
                                  <span className="text-xs opacity-70">
                                    {new Date(message.timestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                                <div className="leading-relaxed">
                                  {message.content}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                        
                        {/* Show current status */}
                        {isConnected && (
                          <div className="text-center text-xs text-muted-foreground py-2 border-t">
                            {isMuted ? "🔇 Microphone muted" : "🎤 Listening for your voice..."}
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
              
              {/* Control Buttons */}
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
    </>
  );
}