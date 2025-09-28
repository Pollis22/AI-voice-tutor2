// Multi-agent configuration for age-specific tutoring
// Using single agent ID for all age groups - can be expanded to individual agents later
const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || "your-agent-id-here";

export const AGENTS = {
  k2:      AGENT_ID,
  g3_5:    AGENT_ID,
  g6_8:    AGENT_ID,
  g9_12:   AGENT_ID,
  college: AGENT_ID,
} as const;

export const GREETINGS = {
  k2:      "Hi there, it's your favorite JIE tutor! Let's play with numbers or letters. Do you want to start with counting, reading, or something fun?",
  g3_5:    "Hello it's your JIE Tutor! I can help you with math, reading, or Spanish. Which one do you want to start with today?",
  g6_8:    "Hello it's your JIE Tutor! I can help you with math, reading, science or languages. Which one do you want to start with today? Don't forget to choose your language.",
  g9_12:   "Hello it's your JIE Tutor! Hey, welcome! I can help with algebra, essays, or exam prep. What subject are you working on now? Don't forget to choose your language.",
  college: "Hello it's your Tutor Mind Tutor! I'm here to help with advanced topics like calculus, essay writing, or languages. Which class or subject do you want to dive into today? Don't forget to choose your language.",
} as const;

export type AgentLevel = keyof typeof AGENTS;