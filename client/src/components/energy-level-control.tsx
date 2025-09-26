import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type EnergyLevel = 'calm' | 'neutral' | 'upbeat';

interface EnergyLevelControlProps {
  currentLevel?: EnergyLevel;
  onEnergyChange?: (level: EnergyLevel) => void;
  disabled?: boolean;
}

const ENERGY_DESCRIPTIONS = {
  calm: {
    label: "Calm",
    description: "Gentle, slower pace with soothing tone",
    style: "calm",
    icon: "🧘"
  },
  neutral: {
    label: "Neutral", 
    description: "Balanced, conversational tone",
    style: "friendly",
    icon: "😊"
  },
  upbeat: {
    label: "Upbeat",
    description: "Energetic, cheerful with faster pace",
    style: "cheerful", 
    icon: "🎉"
  }
};

export function EnergyLevelControl({ 
  currentLevel = 'neutral', 
  onEnergyChange,
  disabled = false 
}: EnergyLevelControlProps) {
  const [selectedLevel, setSelectedLevel] = useState<EnergyLevel>(currentLevel);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const handleLevelChange = async (level: EnergyLevel) => {
    if (disabled) return;
    
    setIsUpdating(true);
    try {
      const response = await apiRequest("POST", "/api/voice/set-energy", {
        energyLevel: level
      });

      if (response.ok) {
        setSelectedLevel(level);
        onEnergyChange?.(level);
        
        const config = ENERGY_DESCRIPTIONS[level];
        toast({
          title: "Voice Energy Updated",
          description: `Switched to ${config.label} mode: ${config.description}`,
        });
      } else {
        throw new Error('Failed to update energy level');
      }
    } catch (error) {
      console.error('[Energy Control] Failed to update energy level:', error);
      toast({
        title: "Update Failed",
        description: "Could not update voice energy level. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const currentConfig = ENERGY_DESCRIPTIONS[selectedLevel];

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <span>Voice Energy</span>
          <Badge variant="outline" className="text-xs">
            {currentConfig.icon} {currentConfig.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          {currentConfig.description}
        </div>
        
        <Select
          value={selectedLevel}
          onValueChange={(value: EnergyLevel) => handleLevelChange(value)}
          disabled={disabled || isUpdating}
        >
          <SelectTrigger data-testid="energy-level-selector">
            <SelectValue placeholder="Select energy level" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ENERGY_DESCRIPTIONS).map(([level, config]) => (
              <SelectItem 
                key={level} 
                value={level}
                data-testid={`energy-option-${level}`}
              >
                <div className="flex items-center gap-2">
                  <span>{config.icon}</span>
                  <div>
                    <div className="font-medium">{config.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {config.description}
                    </div>
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isUpdating && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <div className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full"></div>
            Updating voice settings...
          </div>
        )}
      </CardContent>
    </Card>
  );
}