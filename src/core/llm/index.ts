import { OpenAILLMClient } from './openaiClient';
import { loadPMXConfig } from '../config';

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMClient {
  chat(messages: LLMMessage[]): Promise<string>;
}

export function createDefaultLLMClient(): LLMClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in the environment.");
  }
  
  const config = loadPMXConfig();

  return new OpenAILLMClient({
    apiKey,
    model: config.model,
  });
}
