import { GoogleGenAI, Type } from "@google/genai";
import { InterviewQuestion, Feedback, Difficulty } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateQuestion(
  domain: string, 
  language: string, 
  difficulty: Difficulty,
  history: string[]
): Promise<InterviewQuestion> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are an expert interviewer for the ${domain} domain. 
    The candidate's level is ${difficulty}.
    Generate a single interview question in English and its translation in ${language}.
    Avoid these previous questions: ${history.join(", ")}.
    Return the response in JSON format.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          english: { type: Type.STRING },
          translated: { type: Type.STRING },
        },
        required: ["english", "translated"],
      },
    },
  });

  return JSON.parse(response.text);
}

export async function analyzeAnswer(
  question: string,
  answer: string,
  language: string,
  difficulty: Difficulty
): Promise<Feedback> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following interview response for a ${difficulty} level candidate.
    Question: ${question}
    User Answer: ${answer}
    
    Provide feedback on grammar, fluency, and a confidence score (0-100).
    Suggest an improved version of their answer.
    Provide a professional model answer in English and its translation in ${language}.
    Also, generate a relevant follow-up question based on their answer.
    
    Return the response in JSON format.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          grammar: { type: Type.STRING },
          fluency: { type: Type.STRING },
          confidenceScore: { type: Type.NUMBER },
          improvedAnswer: { type: Type.STRING },
          translatedImprovedAnswer: { type: Type.STRING },
          modelAnswer: { type: Type.STRING },
          translatedModelAnswer: { type: Type.STRING },
          followUpQuestion: {
            type: Type.OBJECT,
            properties: {
              english: { type: Type.STRING },
              translated: { type: Type.STRING },
            },
            required: ["english", "translated"],
          }
        },
        required: ["grammar", "fluency", "confidenceScore", "improvedAnswer", "translatedImprovedAnswer", "modelAnswer", "translatedModelAnswer", "followUpQuestion"],
      },
    },
  });

  return JSON.parse(response.text);
}

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Translate the following text to ${targetLanguage}: "${text}". Return only the translated text.`,
  });
  return response.text || text;
}
