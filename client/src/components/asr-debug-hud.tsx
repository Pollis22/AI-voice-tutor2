import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface AsrDebugData {
  duration?: number;
  confidence?: number;
  passed?: boolean;
  profile?: string;
  vadSilence?: boolean;
  endOfSpeech?: boolean;
  reason?: string;
  timestamp?: number;
}

interface AsrDebugHudProps {
  isActive?: boolean;
}

export function AsrDebugHud({ isActive = false }: AsrDebugHudProps) {
  const [debugData, setDebugData] = useState<AsrDebugData>({});
  const [isVisible, setIsVisible] = useState(false);

  // Check if debug mode is enabled
  useEffect(() => {
    const debugEnabled = import.meta.env.VITE_DEBUG_TUTOR === '1' || 
                        import.meta.env.DEBUG_TUTOR === '1';
    setIsVisible(debugEnabled);
  }, []);

  // Function to update debug data (will be called by voice system)
  const updateDebugData = (data: AsrDebugData) => {
    setDebugData(prev => ({
      ...prev,
      ...data,
      timestamp: Date.now()
    }));
  };

  // Expose update function globally for voice system to use
  useEffect(() => {
    if (isVisible) {
      (window as any).updateAsrDebugHud = updateDebugData;
    }
    
    return () => {
      delete (window as any).updateAsrDebugHud;
    };
  }, [isVisible]);

  // Don't render if debug mode is disabled or not active
  if (!isVisible || !isActive) {
    return null;
  }

  const getStatusColor = (passed?: boolean, reason?: string) => {
    if (passed === true) return 'bg-green-500';
    if (passed === false) return 'bg-red-500';
    if (reason?.includes('silence')) return 'bg-yellow-500';
    return 'bg-gray-500';
  };

  const getStatusText = (passed?: boolean, reason?: string) => {
    if (passed === true) return 'PASS';
    if (passed === false) return 'GATE';
    if (reason?.includes('silence')) return 'WAIT';
    return 'IDLE';
  };

  return (
    <Card 
      className="fixed top-4 right-4 z-[100] bg-black/80 text-white border-gray-600 min-w-[280px] shadow-xl"
      data-testid="asr-debug-hud"
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-300">ASR DEBUG</span>
          <Badge 
            className={`text-xs px-2 py-0.5 ${getStatusColor(debugData.passed, debugData.reason)} text-white`}
            data-testid="asr-status-badge"
          >
            {getStatusText(debugData.passed, debugData.reason)}
          </Badge>
        </div>
        
        <div className="space-y-1 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-gray-400">Duration:</span>
            <span data-testid="asr-duration">
              {debugData.duration ? `${debugData.duration}ms` : '--'}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-400">Confidence:</span>
            <span data-testid="asr-confidence">
              {debugData.confidence ? debugData.confidence.toFixed(2) : '--'}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-400">Profile:</span>
            <span data-testid="asr-profile">
              {debugData.profile || 'balanced'}
            </span>
          </div>
          
          {debugData.vadSilence !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-400">VAD:</span>
              <span data-testid="asr-vad-status">
                {debugData.vadSilence ? 'SILENT' : 'SPEECH'}
              </span>
            </div>
          )}
          
          {debugData.endOfSpeech !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-400">EOS:</span>
              <span data-testid="asr-eos-status">
                {debugData.endOfSpeech ? 'YES' : 'NO'}
              </span>
            </div>
          )}
          
          {debugData.reason && (
            <div className="mt-1 pt-1 border-t border-gray-600">
              <span className="text-gray-400">Reason:</span>
              <div className="text-xs text-gray-300 mt-0.5" data-testid="asr-reason">
                {debugData.reason}
              </div>
            </div>
          )}
          
          {debugData.timestamp && (
            <div className="mt-1 pt-1 border-t border-gray-600 text-center text-gray-500">
              {new Date(debugData.timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Export the update function type for TypeScript
export type AsrDebugUpdateFunction = (data: AsrDebugData) => void;

// Global window interface extension for TypeScript
declare global {
  interface Window {
    updateAsrDebugHud?: AsrDebugUpdateFunction;
  }
}