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

  // 1. 第一步：判定模型类型并执行自动降级策略 (Fallback Strategy)
  let modelType = options.modelType || 'memory';
  let config = settingsStore.getEffectiveConfig(modelType);

  // 降级链路：若请求的辅助模型（记忆/绘图/润色）未配置 API Key，则依次尝试降级至“逻辑模型”与“对话模型”。
  const isUtilityModel = ['memory', 'misc', 'drawing'].includes(modelType);

  if (!config.apiKey && isUtilityModel) {
    console.warn(
      `[LLM] 模型类型 '${modelType}' 未配置 (缺失 API Key)。正在自动回退到 'logic' 逻辑模型。`
    );
    modelType = 'logic';
    config = settingsStore.getEffectiveConfig(modelType);
  }

  if (!config.apiKey && modelType === 'logic') {
    console.warn(
      `[LLM] 模型类型 'logic' 未配置 (缺失 API Key)。正在自动回退到 'chat' 对话模型。`
    );
    modelType = 'chat';
    config = settingsStore.getEffectiveConfig(modelType);
  }

  // 2. 第二步：终态校验 API Key 与 代理地址 的有效性。
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

  // 3. 第三步：联机能源平衡性预检（仅针对房主端）。
  const gameStore = useGameStore();
  const mpService = multiplayerService;
  const isMpHost = gameStore.multiplayer.isMultiplayer && gameStore.multiplayer.isHost;
  let useMpEnergy = false;

  // 构造最终配置对象：允许联机中继服务（Relay）对其进行动态重写。
  const finalConfig = { ...config };

  if (isMpHost) {
    const currentEnergy = gameStore.multiplayer.totalEnergy || 0;
    const isSharing = gameStore.multiplayer.isSharingEnergy;

    if (isSharing && currentEnergy > 0) {
      useMpEnergy = true;

      // 配置重置：接管至联机中继 API 资源池 (Multiplayer API Pool)
      // 中继 API 地址通常位于与 WebSocket 服务器同宿主机的 /api/v1 路径下。
      const relayBaseUrl = mpService.OFFICIAL_SERVER_URL.replace('wss://', 'https://')
        .replace('ws://', 'http://')
        .replace('/ws', '/api/v1');

      finalConfig.baseUrl = relayBaseUrl;
      // 联机中继校验 Key 格式：room:<房间ID>:<身份识别码> (Identity Binding)
      finalConfig.apiKey = `room:${gameStore.multiplayer.roomId}:${mpService.identityKey}`;

      console.log(`[LLM] 使用联机能源池 API (剩余能源: ${currentEnergy})`);
    } else if (isSharing && currentEnergy <= 0) {
      console.log(`[LLM] API 能源已耗尽 (${currentEnergy})，自动回退到房主本地 API 余额。`);
    } else {
      console.log(`[LLM] 房主未开启共享能源，使用房主本地 API。`);
    }
  }

  // 逻辑判定：是否需要强制开启 JSON 响应格式 (仅在使用非推理模型且非流式时生效)
  const isJsonResponseRequired = options.jsonMode && !finalConfig.stream;

  const openai = new OpenAI({
    baseURL: finalConfig.baseUrl,
    apiKey: finalConfig.apiKey,
    dangerouslyAllowBrowser: true,
    // 超时判定由 OpenAI 客户端层直接挂钩
    timeout: Math.round(finalConfig.timeout || 300000)
  });

  try {
    const response = await openai.chat.completions.create(
      {
        model: finalConfig.model || 'gpt-3.5-turbo',
        messages: [{ role: 'system', content: options.systemPrompt }, ...options.messages],
        // 修正：若启用了流式传输（隐含对推理模型的支持），则禁用原生 JSON 模式。
        // 因为许多推理模型（如 DeepSeek-R1 / OpenAI-o1）目前暂不支持标准的 response_format: json_object。
        // 我们后续将在下文通过手动正则匹配或清理的方式提取 JSON 载荷。
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

    // 联机架构支持：广播者同步序列 (Broadcaster Sync)
    if (shouldStream) {
      for await (const chunk of response as any) {
        if (options.signal?.aborted) throw new Error('Operation aborted by user');
        const token = chunk.choices[0]?.delta?.content || '';
        content += token;

        if (options.onStream) {
          options.onStream(token);
        }

        // 广播 Token 分片至所有客机端 (Real-time Token Sync)
        if (isMpHost && token) {
          mpService.sendLLMToken(token);
        }
      }
    } else {
      content = (response as any).choices[0]?.message?.content || '';
      // 非流式模式下广播完整内容（旨在提升时空一致性）
      if (isMpHost && content) {
        mpService.sendLLMToken(content);
      }
    }

    // 认知清理：剔除 CoT 思维链标签（兼容 <think> 与 <thinking>）
    const finalContent = content
      .replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(think|thinking)>[\s\S]*/gi, '') // 容错处理：剔除末尾可能未闭合的标签分片
      .trim();

    // 联机能源结算扣减 (Multiplayer Energy Deduction -仅限房主)
    if (useMpEnergy) {
      // 预估消耗的 Token 总量 (Prompt + Completion 综合估测)
      const promptText =
        (options.systemPrompt || '') + (options.messages || []).map((m) => m.content).join('');
      const totalTokens = estimateTokens(promptText + content);

      // 结算规则：1 单位联机能源 ≃ 100 个 Token
      // 示例：消耗 4000 个 Token 的请求将扣减 40 点能源余额
      const energyCost = Math.ceil(totalTokens / 100);

      if (energyCost > 0) {
        console.log(
          `[LLM] 联机能源结算扣减: ${energyCost} 点 (约消耗 ${totalTokens} 个 tokens)`
        );
        mpService.updateEnergy(-energyCost);
      }
    }

    return finalContent;
  } catch (error: any) {
    console.error('[LLM] 接口调用遭遇异常:', error);

    // 格式化降级：若处于 JSON 模式，则返回结构化的 JSON 错误载荷而非原始报错文本
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
  // 标准化 API 地址（移除末尾多余斜杠，确保协议头完整）。
  // 对于兼容 OpenAI 标准的接口，通常需要指向如 https://api.example.com/v1 的根路径。

  let cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  // 自动纠错：处理用户由于疏忽粘贴了完整 Chat Completions 终结点的情况。
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
      dangerouslyAllowBrowser: true // 安全放行：对于此类客户端单页应用，允许通过代理处理跨域 SEC 限制
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
