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

  async chatStream(messages: LLMMessage[], tools?: any[], onChunk?: (chunk: string) => void): Promise<LLMResponse> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as any,
      tools: tools,
      tool_choice: tools ? 'auto' : undefined,
      stream: true,
    });

    let fullContent = '';
    let toolCallsMap: Record<number, any> = {};

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      
      if (delta?.content) {
        fullContent += delta.content;
        if (onChunk) onChunk(delta.content);
      }

      if (delta?.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index;
          if (!toolCallsMap[index]) {
            toolCallsMap[index] = {
              id: toolCall.id,
              type: toolCall.type,
              function: { name: '', arguments: '' }
            };
          }
          
          if (toolCall.id) toolCallsMap[index].id = toolCall.id;
          if (toolCall.function?.name) toolCallsMap[index].function.name += toolCall.function.name;
          if (toolCall.function?.arguments) toolCallsMap[index].function.arguments += toolCall.function.arguments;
        }
      }
    }

    const tool_calls = Object.values(toolCallsMap).length > 0 ? Object.values(toolCallsMap) : undefined;

    return {
      content: fullContent || null,
      tool_calls: tool_calls,
    };
  }
}
