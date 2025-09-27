import { tutorCore } from './tutorCore';

export async function processTutorResponse(
  rawResponse: string,
  sessionId: string,
  studentMessage: string,
  lessonPlan: any,
  expectedAnswer?: string
): Promise<string> {
  // Step 1: Process student's answer and add acknowledgment
  const acknowledgment = tutorCore.processStudentAnswer(
    sessionId,
    studentMessage,
    expectedAnswer || null,
    lessonPlan
  );

  // Step 2: Combine acknowledgment with response
  let response = acknowledgment ? `${acknowledgment} ${rawResponse}` : rawResponse;

  // Step 3: Make inclusive
  response = tutorCore.makeInclusive(response);

  // Step 4: Ensure subject consistency - CRITICAL to prevent mixing subjects
  const subject = lessonPlan?.subject || 'math';
  response = tutorCore.ensureSubjectConsistency(response, subject);

  // Step 5: Prevent repetition
  response = tutorCore.preventRepetition(sessionId, response);

  // Step 6: Enforce format (2 sentences, ends with ?)
  response = tutorCore.enforceFormat(response);

  // Step 7: Final subject check - ensure we stay on topic
  const topic = lessonPlan?.topic || 'learning';
  
  // If the response drifted to another subject, bring it back
  if (subject === 'math' && (response.toLowerCase().includes('word') || response.toLowerCase().includes('sentence'))) {
    response = `Let's focus on numbers. What comes after 3?`;
  } else if (subject === 'english' && (response.toLowerCase().includes('number') || response.toLowerCase().includes('count'))) {
    response = `Let's focus on words. Can you name an action word?`;
  } else if (subject === 'spanish' && (response.toLowerCase().includes('math') || response.toLowerCase().includes('english'))) {
    response = `Vamos a practicar español. ¿Cómo se dice 'hello'?`;
  }

  return response;
}

export { tutorCore };