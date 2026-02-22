export type Difficulty = 'Beginner' | 'Intermediate' | 'Expert';

export interface InterviewSession {
  id: string;
  domain: string;
  language: string;
  difficulty: Difficulty;
  createdAt: string;
}

export interface Feedback {
  grammar: string;
  fluency: string;
  confidenceScore: number;
  improvedAnswer: string;
  translatedImprovedAnswer: string;
  modelAnswer: string;
  translatedModelAnswer: string;
  followUpQuestion?: InterviewQuestion;
}

export interface InterviewQuestion {
  english: string;
  translated: string;
}

export const LANGUAGES = [
  { code: 'hi', name: 'Hindi' },
  { code: 'mr', name: 'Marathi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'bn', name: 'Bengali' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
];

export const DOMAINS = [
  'Technical (Software Engineering)',
  'HR & Behavioral',
  'Management & Leadership',
  'Sales & Marketing',
  'Customer Support',
  'Finance & Accounting',
];

export const DIFFICULTIES: Difficulty[] = ['Beginner', 'Intermediate', 'Expert'];
