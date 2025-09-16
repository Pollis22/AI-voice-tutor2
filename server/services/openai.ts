import OpenAI from "openai";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key" 
});

interface TutorContext {
  userId: string;
  lessonId?: string;
  sessionId?: string;
}

class OpenAIService {
  async generateTutorResponse(message: string, context: TutorContext): Promise<string> {
    try {
      const systemPrompt = this.buildSystemPrompt(context);

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Using gpt-4o-mini as specified in requirements
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      return response.choices[0].message.content || "I'm sorry, I didn't understand that. Could you please rephrase your question?";
    } catch (error) {
      console.error("Error generating tutor response:", error);
      throw new Error("Failed to generate response from AI tutor");
    }
  }

  async generateLessonContent(topic: string, difficulty: 'beginner' | 'intermediate' | 'advanced'): Promise<any> {
    try {
      const prompt = `Create a comprehensive lesson plan for "${topic}" at ${difficulty} level. Include learning objectives, key concepts, examples, and quiz questions. Format the response as JSON.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an expert educational content creator. Generate structured lesson content in JSON format." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      return JSON.parse(response.choices[0].message.content || "{}");
    } catch (error) {
      console.error("Error generating lesson content:", error);
      throw new Error("Failed to generate lesson content");
    }
  }

  async provideSocraticGuidance(studentQuestion: string, lessonTopic: string): Promise<string> {
    try {
      const prompt = `The student is learning about "${lessonTopic}" and asked: "${studentQuestion}". Provide Socratic guidance by asking leading questions that help them discover the answer themselves. Don't give the direct answer.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: "You are a Socratic tutor. Guide students to discover answers through thoughtful questions rather than direct instruction. Be encouraging and patient."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 300,
      });

      return response.choices[0].message.content || "What do you think might be the first step to solve this?";
    } catch (error) {
      console.error("Error providing Socratic guidance:", error);
      throw new Error("Failed to provide guidance");
    }
  }

  async generateQuizFeedback(question: string, userAnswer: string, correctAnswer: string): Promise<string> {
    try {
      const prompt = `Question: "${question}"\nUser's answer: "${userAnswer}"\nCorrect answer: "${correctAnswer}"\n\nProvide encouraging feedback that explains why the correct answer is right and helps the student understand their mistake if they got it wrong.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: "You are a supportive tutor providing quiz feedback. Be encouraging and educational, focusing on learning rather than just correctness."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.6,
        max_tokens: 200,
      });

      return response.choices[0].message.content || "Great effort! Let's review this concept together.";
    } catch (error) {
      console.error("Error generating quiz feedback:", error);
      throw new Error("Failed to generate feedback");
    }
  }

  private buildSystemPrompt(context: TutorContext): string {
    return `You are a friendly, patient AI tutor specializing in Math, English, and Spanish for students of all ages. Your teaching philosophy emphasizes:

1. Socratic Method: Guide students to discover answers through questions rather than giving direct answers immediately
2. Encouragement: Always be positive and supportive, celebrating progress and effort
3. Adaptation: Adjust your language and complexity based on the student's responses
4. Bilingual Support: For Spanish lessons, incorporate both English and Spanish as appropriate
5. Multiple Learning Styles: Use visual descriptions, analogies, and step-by-step breakdowns

Current context:
- User ID: ${context.userId}
- Lesson: ${context.lessonId || 'General conversation'}
- Session: ${context.sessionId || 'New session'}

Key guidelines:
- Ask leading questions before providing answers
- Use encouraging language ("Great thinking!", "You're on the right track!")
- Break complex concepts into smaller steps
- Provide hints rather than solutions when students are stuck
- Celebrate mistakes as learning opportunities
- Keep responses concise but comprehensive (under 150 words typically)

Remember: You're not just teaching facts, you're building confidence and curiosity!`;
  }
}

export const openaiService = new OpenAIService();
