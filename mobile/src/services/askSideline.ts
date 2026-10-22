/**
 * Ask Sideline (general): football questions from anywhere in the app (rules, players, teams, league
 * leaders, this week's scores so far). Backed by the backend's assistant agent; keys stay server-side.
 */
import { apiRequest } from './http';
import type { WeekAuth } from './week';

export interface AssistantAnswer {
  answer: string;
  evidence: { tool: string; fact: string }[];
  confidence: 'high' | 'medium' | 'low';
  answerable: boolean;
  follow_ups: string[];
}

export interface AssistResult {
  request_id: string;
  status: 'ok' | 'cached';
  answer: AssistantAnswer;
  model: string;
  usage: {
    requests: number;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number | null;
  };
  latency_ms: number;
  grounding_issues: string[];
  /** e.g. "Season through Week 4 · Week 5 as of 4:00 PM ET". */
  as_of: string;
}

/** `week` (optional) lets answers about "now" use the same scoreboard the Scores tab shows. */
export const askSideline = (question: string, previousQuestions: string[], week: WeekAuth | null) =>
  apiRequest<AssistResult>(
    'POST',
    '/api/v1/assistant/ask',
    { question, previous_questions: previousQuestions, week_session_id: week?.sessionId ?? null },
    { timeoutMs: 45000, headers: week ? { 'X-Session-Token': week.token } : undefined },
  );
