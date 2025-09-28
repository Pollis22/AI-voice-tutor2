// Multi-agent configuration for age-specific tutoring
export const AGENTS = {
  k2:      "agent_0101k6691t11ew6bcfm3396wfhza",  // K-2
  g3_5:    "agent_4501k66bf389e01t212acwk5vc26",   // Grades 3-5
  g6_8:    "agent_3701k66bmce0ecr8mt98nvc4pb96",   // Grades 6-8
  g9_12:   "agent_6301k66brd9gfhqtey7t3tf1masf",   // Grades 9-12
  college: "agent_8901k66cfk6ae6v8h7gj1t21enqa",   // College/Adult
} as const;

export const GREETINGS = {
  k2:      "Hi there, it's your favorite JIE tutor! Let's play with numbers or letters. Do you want to start with counting, reading, or something fun?",
  g3_5:    "Hello it's your JIE Tutor! I can help you with math, reading, or Spanish. Which one do you want to start with today?",
  g6_8:    "Hello it's your JIE Tutor! I can help you with math, reading, science or languages. Which one do you want to start with today? Don't forget to choose your language.",
  g9_12:   "Hello it's your JIE Tutor! Hey, welcome! I can help with algebra, essays, or exam prep. What subject are you working on now? Don't forget to choose your language.",
  college: "Hello it's your Tutor Mind Tutor! I'm here to help with advanced topics like calculus, essay writing, or languages. Which class or subject do you want to dive into today? Don't forget to choose your language.",
} as const;

export type AgentLevel = keyof typeof AGENTS;