// Advanced answer normalization and validation utility

// Number words mapping for conversion
const NUMBER_WORDS = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
  'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
  'hundred': 100, 'thousand': 1000
};

const DIGIT_TO_WORDS = Object.fromEntries(
  Object.entries(NUMBER_WORDS).map(([word, num]) => [num.toString(), word])
);

// MCQ option patterns
const MCQ_PATTERNS = {
  // Match patterns like "a", "option a", "choice a", "answer a", "letter a"
  optionA: /^(?:option\s+|choice\s+|answer\s+|letter\s+)?a$/i,
  optionB: /^(?:option\s+|choice\s+|answer\s+|letter\s+)?b$/i,
  optionC: /^(?:option\s+|choice\s+|answer\s+|letter\s+)?c$/i,
  optionD: /^(?:option\s+|choice\s+|answer\s+|letter\s+)?d$/i,
  // Match numeric patterns like "1", "option 1", "choice 2"
  option1: /^(?:option\s+|choice\s+|answer\s+)?1$/i,
  option2: /^(?:option\s+|choice\s+|answer\s+)?2$/i,
  option3: /^(?:option\s+|choice\s+|answer\s+)?3$/i,
  option4: /^(?:option\s+|choice\s+|answer\s+)?4$/i
};

/**
 * Normalize answer text: lowercase, trim, strip punctuation, convert number words
 */
export function normalizeAnswer(text: string): string {
  if (!text) return '';
  
  // Step 1: Lowercase and trim
  let normalized = text.toLowerCase().trim();
  
  // Step 2: Strip excessive punctuation (keep basic punctuation for context)
  normalized = normalized
    .replace(/[!]{2,}/g, '!')           // Multiple exclamation marks
    .replace(/[?]{2,}/g, '?')           // Multiple question marks  
    .replace(/[.]{2,}/g, '.')           // Multiple periods
    .replace(/\s+/g, ' ')               // Multiple spaces
    .replace(/[^\w\s\-+*/=().]/g, ' ')  // Remove most punctuation except math symbols
    .trim();
  
  // Step 3: Convert number words to digits
  normalized = convertNumberWords(normalized);
  
  return normalized;
}

/**
 * Convert number words to digits and vice versa
 */
export function convertNumberWords(text: string): string {
  let result = text;
  
  // Convert word numbers to digits
  Object.entries(NUMBER_WORDS).forEach(([word, digit]) => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, digit.toString());
  });
  
  return result;
}

/**
 * Convert digits to number words
 */
export function convertDigitsToWords(text: string): string {
  let result = text;
  
  // Convert simple digits to words (0-20, common ones)
  Object.entries(DIGIT_TO_WORDS).forEach(([digit, word]) => {
    if (parseInt(digit) <= 20) { // Only convert simple numbers
      const regex = new RegExp(`\\b${digit}\\b`, 'g');
      result = result.replace(regex, word);
    }
  });
  
  return result;
}

/**
 * Parse and evaluate simple math expressions safely
 */
export function parseSimpleMathExpression(expression: string, tolerance = 1e-6): number | null {
  const normalized = normalizeAnswer(expression);
  
  // Remove spaces and handle basic patterns
  const cleaned = normalized.replace(/\s/g, '');
  
  // Only allow safe mathematical expressions
  const safePattern = /^[\d+\-*/().\s]+$/;
  if (!safePattern.test(cleaned)) {
    return null;
  }
  
  // Handle common patterns manually for safety
  const patterns = [
    // Addition patterns: "2+3", "2 plus 3", "2 add 3"
    /^(\d+)(?:\+|plus|add)(\d+)$/i,
    // Subtraction patterns: "5-2", "5 minus 2", "5 take away 2"  
    /^(\d+)(?:\-|minus|subtract|take\s+away)(\d+)$/i,
    // Multiplication patterns: "3*4", "3 times 4", "3 multiplied by 4"
    /^(\d+)(?:\*|x|times|multiplied\s+by)(\d+)$/i,
    // Division patterns: "8/2", "8 divided by 2"
    /^(\d+)(?:\/|divided\s+by)(\d+)$/i
  ];
  
  // Try pattern matching first
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const a = parseFloat(match[1]);
      const b = parseFloat(match[2]);
      
      if (pattern.source.includes('+') || pattern.source.includes('plus')) {
        return a + b;
      } else if (pattern.source.includes('-') || pattern.source.includes('minus')) {
        return a - b;
      } else if (pattern.source.includes('*') || pattern.source.includes('times')) {
        return a * b;
      } else if (pattern.source.includes('/') || pattern.source.includes('divided')) {
        return b !== 0 ? a / b : null;
      }
    }
  }
  
  // For very simple expressions, try safe evaluation
  try {
    // Only allow basic math operations
    if (!/^[\d+\-*/().\s]+$/.test(cleaned)) {
      return null;
    }
    
    // Replace any remaining unsafe characters
    const safeExpression = cleaned.replace(/[^0-9+\-*/().\s]/g, '');
    
    // Use Function constructor for safer evaluation (still limited)
    const result = new Function('return ' + safeExpression)();
    
    if (typeof result === 'number' && !isNaN(result)) {
      return result;
    }
  } catch (error) {
    console.warn('Math expression evaluation failed:', error);
  }
  
  return null;
}

/**
 * Check if two math answers are equal within tolerance
 */
export function mathAnswersEqual(answer1: string, answer2: string, tolerance = 1e-6): boolean {
  const num1 = parseSimpleMathExpression(answer1, tolerance);
  const num2 = parseSimpleMathExpression(answer2, tolerance);
  
  if (num1 === null || num2 === null) {
    // Fall back to string comparison if not numeric
    return normalizeAnswer(answer1) === normalizeAnswer(answer2);
  }
  
  return Math.abs(num1 - num2) <= tolerance;
}

/**
 * Handle Multiple Choice Question (MCQ) answer formats
 */
export function normalizeMcqAnswer(answer: string): string {
  const normalized = normalizeAnswer(answer);
  
  // Check for letter patterns
  for (const [option, pattern] of Object.entries(MCQ_PATTERNS)) {
    if (pattern.test(normalized)) {
      // Return standardized format
      if (option.includes('A') || option.includes('1')) return 'a';
      if (option.includes('B') || option.includes('2')) return 'b';
      if (option.includes('C') || option.includes('3')) return 'c';
      if (option.includes('D') || option.includes('4')) return 'd';
    }
  }
  
  return normalized;
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  // Initialize matrix
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  // Fill matrix
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Check if two short text answers are similar using fuzzy matching
 */
export function fuzzyTextMatch(answer1: string, answer2: string): boolean {
  const norm1 = normalizeAnswer(answer1);
  const norm2 = normalizeAnswer(answer2);
  
  // Exact match after normalization
  if (norm1 === norm2) return true;
  
  // Apply Levenshtein distance thresholds based on length
  const maxLength = Math.max(norm1.length, norm2.length);
  const distance = levenshteinDistance(norm1, norm2);
  
  let threshold: number;
  if (maxLength <= 5) {
    threshold = 1; // ≤1 for words ≤5 chars
  } else if (maxLength <= 10) {
    threshold = 2; // ≤2 for words ≤10 chars  
  } else {
    threshold = Math.floor(maxLength * 0.2); // 20% for longer words
  }
  
  return distance <= threshold;
}

/**
 * Comprehensive answer comparison that handles all formats
 */
export function compareAnswers(userAnswer: string, expectedAnswer: string, context?: {
  type?: 'math' | 'mcq' | 'text' | 'auto';
  tolerance?: number;
}): { isCorrect: boolean; normalizedUser: string; normalizedExpected: string; method: string } {
  const { type = 'auto', tolerance = 1e-6 } = context || {};
  
  const normalizedUser = normalizeAnswer(userAnswer);
  const normalizedExpected = normalizeAnswer(expectedAnswer);
  
  // Exact match after normalization
  if (normalizedUser === normalizedExpected) {
    return { 
      isCorrect: true, 
      normalizedUser, 
      normalizedExpected, 
      method: 'exact' 
    };
  }
  
  // Handle different answer types
  if (type === 'math' || (type === 'auto' && /^[\d+\-*/().\s]+$/.test(normalizedExpected))) {
    const isCorrect = mathAnswersEqual(normalizedUser, normalizedExpected, tolerance);
    return { isCorrect, normalizedUser, normalizedExpected, method: 'math' };
  }
  
  if (type === 'mcq' || (type === 'auto' && /^[a-d]$/i.test(normalizedExpected))) {
    const userMcq = normalizeMcqAnswer(normalizedUser);
    const expectedMcq = normalizeMcqAnswer(normalizedExpected);
    const isCorrect = userMcq === expectedMcq;
    return { isCorrect, normalizedUser: userMcq, normalizedExpected: expectedMcq, method: 'mcq' };
  }
  
  // Default to fuzzy text matching
  const isCorrect = fuzzyTextMatch(normalizedUser, normalizedExpected);
  return { isCorrect, normalizedUser, normalizedExpected, method: 'fuzzy' };
}