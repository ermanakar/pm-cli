import OpenAI from 'openai';
import { LLMClient, LLMMessage } from './index';

export class OpenAILLMClient implements LLMClient {
  private client: OpenAI;
  private model: string;

  constructor(options: { apiKey: string; model?: string }) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model || 'gpt-4o-mini';
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
    });
    return response.choices[0].message?.content || '';
  }
}
