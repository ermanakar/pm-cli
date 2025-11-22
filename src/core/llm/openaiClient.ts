import OpenAI from 'openai';
import { LLMClient, LLMMessage, LLMResponse } from './index';

export class OpenAILLMClient implements LLMClient {
  private client: OpenAI;
  private model: string;

  constructor(options: { apiKey: string; model?: string }) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model || 'gpt-4o-mini';
  }

  async chat(messages: LLMMessage[], tools?: any[]): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as any,
      tools: tools,
      tool_choice: tools ? 'auto' : undefined,
    });

    const choice = response.choices[0].message;
    return {
      content: choice.content,
      tool_calls: choice.tool_calls,
    };
  }
}
