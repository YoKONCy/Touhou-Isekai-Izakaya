import OpenAI from 'openai';
import { useSettingsStore } from '@/stores/settings';
import { useGameStore } from '@/stores/game';
import { multiplayerService } from './MultiplayerService';
import { estimateTokens } from '@/utils/token';

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
  stream?: boolean;
  onStream?: (token: string) => void;
  signal?: AbortSignal;
}

export async function generateCompletion(options: CompletionOptions): Promise<string> {
  const settingsStore = useSettingsStore();

  // 1. Determine model type and fallback if necessary
  let modelType = options.modelType || 'memory';
  let config = settingsStore.getEffectiveConfig(modelType);

  // Fallback chain: If the requested utility model is not configured, try 'logic', then 'chat'
  const isUtilityModel = ['memory', 'misc', 'drawing'].includes(modelType);

  if (!config.apiKey && isUtilityModel) {
    console.warn(
      `[LLM] Model type '${modelType}' not configured (missing API Key). Falling back to 'logic'.`
    );
    modelType = 'logic';
    config = settingsStore.getEffectiveConfig(modelType);
  }

  if (!config.apiKey && modelType === 'logic') {
    console.warn(
      `[LLM] Model type 'logic' not configured (missing API Key). Falling back to 'chat'.`
    );
    modelType = 'chat';
    config = settingsStore.getEffectiveConfig(modelType);
  }

  // 2. Final check for API Key and Base URL
  if (!config.apiKey || !config.baseUrl) {
    const modelNumbers: Record<string, number> = {
      chat: 1,
      logic: 2,
      memory: 3,
      misc: 4,
      drawing: 5
    };
    const num = modelNumbers[modelType] || '?';
    const errorMsg = `模型 '${modelType}' (LLM #${num}) 未配置 ${!config.apiKey ? 'API Key' : 'API 地址'}，且无有效备选模型。请在设置中检查配置。`;
    console.error(`[LLM] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // 3. Multiplayer Energy Pre-check (Host Only)
  const gameStore = useGameStore();
  const mpService = multiplayerService;
  const isMpHost = gameStore.multiplayer.isMultiplayer && gameStore.multiplayer.isHost;
  let useMpEnergy = false;

  // Use a final config object that can be overridden by multiplayer relay
  const finalConfig = { ...config };

  if (isMpHost) {
    const currentEnergy = gameStore.multiplayer.totalEnergy || 0;
    const isSharing = gameStore.multiplayer.isSharingEnergy;

    if (isSharing && currentEnergy > 0) {
      useMpEnergy = true;

      // Override config to use Multiplayer Relay API Pool
      // The relay API is located at the same host as the WS server but under /api/v1
      const relayBaseUrl = mpService.OFFICIAL_SERVER_URL.replace('wss://', 'https://')
        .replace('ws://', 'http://')
        .replace('/ws', '/api/v1');

      finalConfig.baseUrl = relayBaseUrl;
      // Key format expected by relay: room:<roomId>:<identityKey>
      finalConfig.apiKey = `room:${gameStore.multiplayer.roomId}:${mpService.identityKey}`;

      console.log(`[LLM] 使用联机能源池 API (剩余能源: ${currentEnergy})`);
    } else if (isSharing && currentEnergy <= 0) {
      console.log(`[LLM] API 能源已耗尽 (${currentEnergy})，自动回退到房主本地 API 余额。`);
    } else {
      console.log(`[LLM] 房主未开启共享能源，使用房主本地 API。`);
    }
  }

  // Check if we should force JSON response format
  const isJsonResponseRequired = options.jsonMode && !finalConfig.stream;

  const openai = new OpenAI({
    baseURL: finalConfig.baseUrl,
    apiKey: finalConfig.apiKey,
    dangerouslyAllowBrowser: true,
    // timeout is handled by the client
    timeout: Math.round(finalConfig.timeout || 300000)
  });

  try {
    const response = await openai.chat.completions.create(
      {
        model: finalConfig.model || 'gpt-3.5-turbo',
        messages: [{ role: 'system', content: options.systemPrompt }, ...options.messages],
        // FIX: Disable native JSON mode if stream is enabled (implies Thinking model),
        // as Thinking models often don't support response_format: json_object.
        // We will handle JSON extraction manually below.
        response_format: isJsonResponseRequired ? { type: 'json_object' } : undefined,
        temperature: options.temperature ?? finalConfig.temperature ?? 0.3,
        top_p: finalConfig.top_p,
        frequency_penalty: finalConfig.frequency_penalty,
        presence_penalty: finalConfig.presence_penalty,
        max_tokens: options.max_tokens,
        stream: options.stream ?? finalConfig.stream ?? false
      } as any,
      { signal: options.signal }
    );

    let content = '';
    const shouldStream = options.stream ?? finalConfig.stream;

    // Multiplayer Support: Broadcaster
    if (shouldStream) {
      for await (const chunk of response as any) {
        if (options.signal?.aborted) throw new Error('Operation aborted by user');
        const token = chunk.choices[0]?.delta?.content || '';
        content += token;

        if (options.onStream) {
          options.onStream(token);
        }

        // Broadcast token to guests
        if (isMpHost && token) {
          mpService.sendLLMToken(token);
        }
      }
    } else {
      content = (response as any).choices[0]?.message?.content || '';
      // Broadcast full content if not streaming (optional but good for consistency)
      if (isMpHost && content) {
        mpService.sendLLMToken(content);
      }
    }

    // Strip CoT tags (both <think> and <thinking>)
    const finalContent = content
      .replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(think|thinking)>[\s\S]*/gi, '') // Also strip unclosed tags
      .trim();

    // Multiplayer Energy Deduction (Host Only)
    if (useMpEnergy) {
      // Calculate approximate tokens (Prompt + Completion)
      const promptText =
        (options.systemPrompt || '') + (options.messages || []).map((m) => m.content).join('');
      const totalTokens = estimateTokens(promptText + content);

      // Calculation Rule: 1 Energy Unit ≈ 100 Tokens
      // Example: 4000 tokens request = 40 Energy
      const energyCost = Math.ceil(totalTokens / 100);

      if (energyCost > 0) {
        console.log(
          `[LLM] Multiplayer Energy Deduction: ${energyCost} points (approx. ${totalTokens} tokens)`
        );
        mpService.updateEnergy(-energyCost);
      }
    }

    return finalContent;
  } catch (error: any) {
    console.error('LLM Completion Failed:', error);

    // If JSON mode was required, return a structured JSON error instead of raw text
    if (isJsonResponseRequired) {
      const errorResponse = {
        error: true,
        message: error.message,
        thinking: `LLM Request Failed: ${error.message}`,
        actions: [],
        quick_replies: [],
        summary: `[请求失败: ${error.message}]`
      };
      return JSON.stringify(errorResponse);
    }

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
      dangerouslyAllowBrowser: true // Allowed since this is a client-side app
    });

    const list = await openai.models.list();
    return list.data.map((m) => ({
      id: m.id,
      owned_by: m.owned_by || ''
    }));
  } catch (error: any) {
    console.error('Failed to fetch models:', error);
    throw new Error(error.message || 'Failed to fetch models');
  }
}
