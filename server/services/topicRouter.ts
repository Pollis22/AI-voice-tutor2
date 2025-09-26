// Topic classification service

export type TopicCategory = 'math' | 'grammar' | 'reading' | 'general';

export interface TopicClassification {
  topic: TopicCategory;
  confidence: number;
  keywords: string[];
}

export class TopicRouter {
  
  // Math keywords and patterns
  private mathKeywords = [
    'add', 'subtract', 'multiply', 'divide', 'equation', 'solve', 'number', 'fraction',
    'algebra', 'geometry', 'calculus', 'math', 'calculate', 'formula', 'variable',
    'plus', 'minus', 'times', 'divided', 'percent', 'decimal', 'integer', 'ratio'
  ];

  // Grammar keywords and patterns
  private grammarKeywords = [
    'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction',
    'grammar', 'sentence', 'subject', 'predicate', 'tense', 'plural', 'singular',
    'punctuation', 'comma', 'period', 'question mark', 'apostrophe', 'capitalization'
  ];

  // Reading keywords and patterns
  private readingKeywords = [
    'read', 'story', 'book', 'chapter', 'character', 'plot', 'theme', 'setting',
    'comprehension', 'paragraph', 'main idea', 'details', 'inference', 'summary',
    'author', 'title', 'vocabulary', 'meaning', 'context', 'literature'
  ];

  classifyTopic(text: string): TopicClassification {
    const normalizedText = text.toLowerCase();
    const words = normalizedText.split(/\s+/);

    // Count matches for each category
    const mathMatches = this.countMatches(words, this.mathKeywords);
    const grammarMatches = this.countMatches(words, this.grammarKeywords);
    const readingMatches = this.countMatches(words, this.readingKeywords);

    // Determine best match
    const maxMatches = Math.max(mathMatches, grammarMatches, readingMatches);
    
    if (maxMatches === 0) {
      return {
        topic: 'general',
        confidence: 0.3,
        keywords: []
      };
    }

    let topic: TopicCategory;
    let matchedKeywords: string[];

    if (mathMatches === maxMatches) {
      topic = 'math';
      matchedKeywords = this.getMatchedKeywords(words, this.mathKeywords);
    } else if (grammarMatches === maxMatches) {
      topic = 'grammar';
      matchedKeywords = this.getMatchedKeywords(words, this.grammarKeywords);
    } else {
      topic = 'reading';
      matchedKeywords = this.getMatchedKeywords(words, this.readingKeywords);
    }

    // Calculate confidence based on match density
    const confidence = Math.min(0.95, (maxMatches / words.length) * 2 + 0.3);

    console.log(`[Topic Router] Classified "${text.substring(0, 50)}..." as ${topic} (confidence: ${confidence.toFixed(2)})`);

    return {
      topic,
      confidence,
      keywords: matchedKeywords
    };
  }

  private countMatches(words: string[], keywords: string[]): number {
    return words.filter(word => keywords.includes(word)).length;
  }

  private getMatchedKeywords(words: string[], keywords: string[]): string[] {
    return words.filter(word => keywords.includes(word));
  }

  // Get topic-specific prompts
  getTopicPrompt(topic: TopicCategory): string {
    switch (topic) {
      case 'math':
        return "Focus on mathematical concepts. Show one step then check understanding. Use concrete examples before moving to abstract concepts.";
      case 'grammar':
        return "Focus on grammar and language rules. Give an example then ask the student to try. Emphasize patterns and structures.";
      case 'reading':
        return "Focus on reading comprehension. Build understanding through questions. Connect concepts to the student's experience.";
      case 'general':
        return "Adapt to the student's expressed interest. Follow their lead while maintaining educational structure.";
      default:
        return "Provide general educational support.";
    }
  }
}

// Singleton instance
export const topicRouter = new TopicRouter();