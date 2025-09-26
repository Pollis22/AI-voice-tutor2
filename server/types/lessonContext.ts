// Lesson Context for grounding AI responses
export interface LessonContext {
  lessonId: string;
  subject: string;
  title: string;
  objectives: string[];
  keyTerms: string[];
  stepsOutline: string[];
  difficulty?: string;
}

// Subject-specific prompts for focused teaching
export const SUBJECT_PROMPTS = {
  math: "Show one step at a time, then ask a check question. Keep units and symbols clear.",
  grammar: "Give definition → example → ask the learner to try one.",
  reading: "Summarize → ask comprehension check.",
  english: "Give definition → example → ask the learner to try one.",
  spanish: "Present vocabulary → use in context → ask learner to practice.",
  general: "Explain concept → provide example → check understanding."
};

// ASR (Automatic Speech Recognition) thresholds
export const ASR_CONFIG = {
  minDurationMs: parseInt(process.env.ASR_MIN_MS || "300"),
  minConfidence: parseFloat(process.env.ASR_MIN_CONFIDENCE || "0.5")
};