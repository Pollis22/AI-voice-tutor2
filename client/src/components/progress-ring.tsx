import { cn } from "@/lib/utils";

interface ProgressRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  "data-testid"?: string;
}

export function ProgressRing({ 
  percentage, 
  size = 48, 
  strokeWidth = 6, 
  className,
  "data-testid": testId 
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }} data-testid={testId}>
      <svg className="progress-ring w-full h-full" viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="progress-ring-circle stroke-current text-muted"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={cn("progress-ring-circle stroke-current transition-all duration-300", className)}
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-xs font-medium", className)}>
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
}
