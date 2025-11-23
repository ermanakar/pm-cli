import { OpenAILLMClient } from './openaiClient';
import { loadPMXConfig } from '../config';

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface LLMClient {
  chat(messages: LLMMessage[], tools?: any[]): Promise<LLMResponse>;
  chatStream?(messages: LLMMessage[], tools?: any[], onChunk?: (chunk: string) => void): Promise<LLMResponse>;
}

export interface LLMResponse {
  content: string | null;
  tool_calls?: any[];
}

export function createDefaultLLMClient(): LLMClient {
  const config = loadPMXConfig();
  const apiKey = process.env.OPENAI_API_KEY || config.openaiApiKey;
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in the environment or global config.");
  }

  return new OpenAILLMClient({
    apiKey,
    model: config.model,
  });
}
