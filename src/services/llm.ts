import OpenAI from 'openai';
import { useSettingsStore } from '@/stores/settings';

export interface ModelInfo {
  id: string;
  owned_by: string;
}

export interface CompletionOptions {
  systemPrompt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  jsonMode?: boolean;
  modelType?: 'chat' | 'logic' | 'memory' | 'misc' | 'drawing';
  temperature?: number;
  max_tokens?: number;
}

export async function generateCompletion(options: CompletionOptions): Promise<string> {
  const settingsStore = useSettingsStore();
  const config = settingsStore.getEffectiveConfig(options.modelType || 'memory'); // Default to memory for utility tasks

  if (!config.apiKey) {
    throw new Error(`API Key not configured for ${options.modelType || 'memory'} model`);
  }

  const openai = new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
    // timeout is handled by the client
    timeout: Math.round(config.timeout || 300000)
  });

  try {
    const response = await openai.chat.completions.create({
      model: config.model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: options.systemPrompt },
        ...options.messages
      ],
      // FIX: Disable native JSON mode if stream is enabled (implies Thinking model), 
      // as Thinking models often don't support response_format: json_object.
      // We will handle JSON extraction manually below.
      response_format: (options.jsonMode && !config.stream) ? { type: 'json_object' } : undefined,
      temperature: options.temperature ?? config.temperature ?? 0.3,
      top_p: config.top_p,
      frequency_penalty: config.frequency_penalty,
      presence_penalty: config.presence_penalty,
      max_tokens: options.max_tokens,
      stream: config.stream ?? false,
    } as any);

    let content = '';
    if (config.stream) {
      for await (const chunk of (response as any)) {
        content += chunk.choices[0]?.delta?.content || '';
      }
    } else {
      content = (response as any).choices[0]?.message?.content || '';
    }
    
    // Strip CoT tags
    return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  } catch (error: any) {
    console.error('LLM Completion Failed:', error);
    throw error;
  }
}

export async function fetchModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  // Normalize Base URL (remove trailing slash, ensure /v1 if needed, though OpenAI client handles it usually)
  // For OpenAI compatible APIs, we usually point to https://api.example.com/v1
  
  let cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  // Fix common mistake: user pasting full chat completions endpoint
  if (cleanBaseUrl.endsWith('/chat/completions')) {
    cleanBaseUrl = cleanBaseUrl.replace(/\/chat\/completions$/, '');
  }

  if (!apiKey) {
    throw new Error('API Key is missing');
  }

  try {
    const openai = new OpenAI({
      baseURL: cleanBaseUrl,
      apiKey: apiKey,
      dangerouslyAllowBrowser: true, // Allowed since this is a client-side app
    });

    const list = await openai.models.list();
    return list.data.map(m => ({
      id: m.id,
      owned_by: m.owned_by || ''
    }));
  } catch (error: any) {
    console.error('Failed to fetch models:', error);
    throw new Error(error.message || 'Failed to fetch models');
  }
}
