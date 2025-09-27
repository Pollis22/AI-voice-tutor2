// TutorMind Core - Handles all tutoring logic with strict rules
export class TutorCore {
  private sessionHistory = new Map<string, {
    lastQuestion: string;
    lastResponse: string;
    questionCount: Map<string, number>;
    subject: string;
    lastStudentAnswer: string;
  }>();

  getSystemPrompt(lessonPlan: any): string {
    const subject = lessonPlan?.subject || 'general';
    const topic = lessonPlan?.topic || 'learning';
    const step = lessonPlan?.currentStep || 'introduction';

    return `You are TutorMind, an AI tutor. CRITICAL RULES:

LESSON: Teaching ${topic} in ${subject} at step: ${step}

HARD RULES:
1. Stay ONLY on ${subject}. Never mention other subjects.
2. Maximum 2 sentences. Always end with a question.
3. ALWAYS acknowledge the student's answer first before continuing.
4. Never repeat the exact same question - rephrase with hints instead.
5. Use inclusive language: "let's count" not "show me fingers"

RESPONSE PATTERNS:
- Correct answer → "Excellent! [confirm]. [Next question]?"
- Wrong answer → "Not quite - it's [answer] because [reason]. Try this: [easier question]?"
- Confusion → "That's okay! Hint: [hint]. Can you try again?"
- Off-topic → "Interesting! But back to ${topic}: [question]?"

Current step content: ${JSON.stringify(lessonPlan?.content || {})}`;
  }

  processStudentAnswer(
    sessionId: string,
    studentAnswer: string,
    expectedAnswer: string | null,
    lessonPlan: any
  ): string {
    const session = this.sessionHistory.get(sessionId) || {
      lastQuestion: '',
      lastResponse: '',
      questionCount: new Map(),
      subject: lessonPlan?.subject || 'math',
      lastStudentAnswer: ''
    };

    // Store the student's answer for context
    session.lastStudentAnswer = studentAnswer;
    
    let prefix = '';

    // Always acknowledge the student's input
    if (studentAnswer.toLowerCase().includes('ready') || 
        studentAnswer.toLowerCase().includes('yes') ||
        studentAnswer.toLowerCase().includes('begin')) {
      prefix = this.getRandomPhrase([
        "Great! Let's begin.",
        "Perfect! Here we go.",
        "Wonderful! Let's start.",
        "Excellent! Let's dive in."
      ]);
    } else if (expectedAnswer) {
      // Check if answer is correct
      const isCorrect = this.checkAnswer(studentAnswer, expectedAnswer);
      
      if (isCorrect) {
        prefix = this.getRandomPhrase([
          `Perfect! "${studentAnswer}" is correct.`,
          `Excellent work! Yes, it's "${studentAnswer}".`,
          `That's right! "${studentAnswer}" is the answer.`,
          `Great job! "${studentAnswer}" is exactly right.`,
          `Exactly! "${studentAnswer}" is perfect.`
        ]);
      } else {
        prefix = `Good try! The answer is "${expectedAnswer}".`;
      }
    } else if (studentAnswer.length < 50) {
      // For general responses without expected answer
      if (lessonPlan?.subject === 'english') {
        // Acknowledge English-specific answers
        prefix = this.getRandomPhrase([
          `Great word choice - "${studentAnswer}"!`,
          `"${studentAnswer}" - excellent example!`,
          `Good thinking with "${studentAnswer}"!`,
          `Nice! "${studentAnswer}" works well.`
        ]);
      } else if (lessonPlan?.subject === 'math') {
        prefix = this.getRandomPhrase([
          `I see you said "${studentAnswer}".`,
          `Good thinking! You answered "${studentAnswer}".`,
          `Okay, "${studentAnswer}".`
        ]);
      } else {
        prefix = this.getRandomPhrase([
          "I see!",
          "Got it!",
          "Understood!",
          "Alright!"
        ]);
      }
    }

    this.sessionHistory.set(sessionId, session);
    return prefix;
  }

  preventRepetition(sessionId: string, response: string): string {
    const session = this.sessionHistory.get(sessionId);
    if (!session) return response;

    // Check if this exact response was just used
    if (session.lastResponse === response) {
      const alternatives = {
        math: [
          "Let's try a different approach. What's one more than 2?",
          "Think about it this way: 2 plus 1 equals?",
          "Here's a hint: count 1, 2, and then?",
          "Let me ask differently: After 2 comes which number?",
          "Try this: If you have 2 and get 1 more, how many?"
        ],
        english: [
          "Let me rephrase. Can you find a noun in this sentence?",
          "Another way to ask: which word is a person, place, or thing?",
          "Think about this: what's the action word here?",
          "Let's try again: Can you name a describing word?",
          "Different question: What word shows movement?"
        ],
        spanish: [
          "Intentemos de otra manera. ¿Cómo se dice 'hello'?",
          "Pregunta diferente: ¿Puedes contar hasta tres?",
          "Vamos a practicar: ¿Qué significa 'gracias'?",
          "Otra forma: ¿Cómo dices 'good morning'?",
          "Piensa: ¿Cuál es el color 'red' en español?"
        ],
        default: [
          "Let's approach this differently. What do you think?",
          "Here's another way to look at it. Can you try?",
          "Think step by step. What comes next?",
          "Let me ask another way. What's your thought?",
          "Different angle: How would you solve this?"
        ]
      };

      const pool = alternatives[session.subject] || alternatives.default;
      response = pool[Math.floor(Math.random() * pool.length)];
    }

    // Track question frequency
    const questionKey = this.extractQuestion(response);
    const count = session.questionCount.get(questionKey) || 0;
    
    if (count >= 2) {
      // This question has been asked too many times
      response = this.getRephrasedQuestion(session.subject, questionKey);
      session.questionCount.clear(); // Reset counter
    } else {
      session.questionCount.set(questionKey, count + 1);
    }

    session.lastResponse = response;
    return response;
  }

  private checkAnswer(student: string, expected: string): boolean {
    const s1 = this.normalize(student);
    const s2 = this.normalize(expected);
    
    if (s1 === s2) return true;
    
    // Check numeric equivalence
    const num1 = this.parseNumber(s1);
    const num2 = this.parseNumber(s2);
    
    if (num1 !== null && num2 !== null) {
      return Math.abs(num1 - num2) < 0.01;
    }
    
    // MCQ check
    if (s2.length === 1 && /^[a-d]$/.test(s2)) {
      return s1 === s2 || 
             s1 === `option ${s2}` || 
             s1 === (s2.charCodeAt(0) - 96).toString();
    }
    
    // For word-based answers, check if the student's answer contains the expected word
    if (s1.includes(s2) || s2.includes(s1)) {
      return true;
    }
    
    return false;
  }

  private normalize(text: string): string {
    const numberWords: Record<string, string> = {
      'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
      'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
      'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
      'fourteen': '14', 'fifteen': '15', 'twenty': '20'
    };

    let normalized = text.toLowerCase().trim();
    
    Object.entries(numberWords).forEach(([word, digit]) => {
      normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), digit);
    });
    
    return normalized.replace(/[^a-z0-9\s]/g, '').trim();
  }

  private parseNumber(text: string): number | null {
    const num = parseFloat(text);
    return isNaN(num) ? null : num;
  }

  private extractQuestion(text: string): string {
    const match = text.match(/([^.!?]*\?)/);
    return match ? match[1].trim() : text;
  }

  private getRephrasedQuestion(subject: string, original: string): string {
    const rephrases: Record<string, string[]> = {
      "what comes after 2?": [
        "What number is one more than 2?",
        "If you have 2 and add 1, you get?",
        "Count: 1, 2, then?"
      ],
      "what's 2 plus 2?": [
        "If you have 2 apples and get 2 more, how many total?",
        "Add 2 and 2 together. What do you get?",
        "Two groups of 2 makes?"
      ],
      "what's your favorite word that describes an action?": [
        "Can you name an action word you like?",
        "Tell me a word that shows movement or doing?",
        "What's a verb you enjoy using?"
      ]
    };

    const key = original.toLowerCase();
    const options = rephrases[key];
    
    if (options) {
      return options[Math.floor(Math.random() * options.length)];
    }
    
    // Generic rephrase
    return `Let's think about this differently. ${original}`;
  }

  private getRandomPhrase(phrases: string[]): string {
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  enforceFormat(text: string): string {
    // Ensure max 2 sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let result = sentences.slice(0, 2).join(' ').trim();
    
    // Ensure ends with question
    if (!result.endsWith('?')) {
      if (result.endsWith('.') || result.endsWith('!')) {
        result = result.slice(0, -1) + '?';
      } else {
        result += ' Ready to continue?';
      }
    }
    
    return result;
  }

  makeInclusive(text: string): string {
    const replacements: [RegExp, string][] = [
      [/\byour hand(s)?\b/gi, 'a hand'],
      [/\byour finger(s)?\b/gi, 'fingers'],
      [/\bshow me\b/gi, 'let\'s count'],
      [/\bcan you see\b/gi, 'notice'],
      [/\bstand up\b/gi, 'imagine standing'],
      [/\bjump\b/gi, 'count'],
      [/\bclap your hands\b/gi, 'count the beats'],
      [/\bpoint to\b/gi, 'think about'],
      [/\btouch\b/gi, 'imagine'],
      [/\bhow many fingers\b/gi, 'what number']
    ];

    let result = text;
    replacements.forEach(([pattern, replacement]) => {
      result = result.replace(pattern, replacement);
    });
    
    return result;
  }

  ensureSubjectConsistency(text: string, subject: string): string {
    // Remove cross-subject references based on current subject
    if (subject === 'math') {
      // Remove English/Spanish references from math lessons
      text = text.replace(/\b(english|words|sentences|grammar|spelling|verbs?|nouns?|spanish|hola|gracias)\b/gi, 'numbers');
    } else if (subject === 'english') {
      // Remove Math/Spanish references from English lessons
      text = text.replace(/\b(math|counting|addition|subtract|multiply|numbers?|spanish|hola|gracias)\b/gi, 'words');
    } else if (subject === 'spanish') {
      // Remove Math/English references from Spanish lessons
      text = text.replace(/\b(math|counting|addition|english|grammar|verbs?|nouns?)\b/gi, 'Spanish');
    }
    
    return text;
  }
}

export const tutorCore = new TutorCore();