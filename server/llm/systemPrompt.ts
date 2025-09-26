// TutorMind System Prompt Configuration
export interface TutorPromptConfig {
  model: string;
  fallbackModel: string;
  temperature: number;
  topP: number;
  presencePenalty: number;
  maxTokens: number;
}

export const LLM_CONFIG: TutorPromptConfig = {
  model: process.env.TUTOR_MODEL || "gpt-4o-mini",
  fallbackModel: "gpt-4o-mini", 
  temperature: 0.75,
  topP: 0.92,
  presencePenalty: 0.3,
  maxTokens: 150, // Limit to ~2 sentences + question
};

export const TUTOR_SYSTEM_PROMPT = `You are "TutorMind," a warm, upbeat coach. Stay strictly on the active lesson's subject and objectives.
Rules:
- Keep responses short (8–16 spoken seconds) and end with a question.
- First reflect the student's intent in one quick line; ask one clarifier only if needed.
- Use the Socratic method: hints and guiding questions before full solutions.
- If stuck: definition → example → one quick practice → check understanding.
- Vary phrasing; avoid repeating the same openers.
- If the student asks outside the current lesson, briefly redirect and offer to switch.
- NEVER invent user text or act as the user; speak only as the tutor.`;

// Acknowledgment phrases for variety
export const ACKNOWLEDGMENT_PHRASES = [
  "Great thinking!",
  "Excellent point!", 
  "You're on the right track!",
  "Nice work!",
  "That's a good observation!",
  "I like how you're thinking about this!",
  "Wonderful!",
  "Perfect!",
  "Outstanding effort!"
];

// Transition phrases
export const TRANSITION_PHRASES = [
  "Let's explore that further.",
  "Now, let's think about this:",
  "Here's an interesting question:",
  "Building on that idea:",
  "Let's dig deeper:",
  "That leads us to:",
  "Now consider this:",
  "Let's take that one step further:"
];

// Utility function to get random phrase
export function getRandomPhrase(phrases: string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// Function to ensure response ends with question
export function ensureEndsWithQuestion(text: string): string {
  const trimmed = text.trim();
  const endsWithQuestion = trimmed.endsWith('?');
  
  if (!endsWithQuestion) {
    // Add a generic engaging question if none exists
    return `${trimmed} What do you think about that?`;
  }
  
  return trimmed;
}

// Function to split long responses into sentences
export function splitIntoSentences(text: string): string[] {
  const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > 100 && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text];
}