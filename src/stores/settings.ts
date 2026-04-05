import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { dbService } from '@/services/DatabaseService';
import _ from 'lodash';
import {
  DEFAULT_DRAWING_PROMPT_SYSTEM,
  DEFAULT_NOVELAI_V3_PROMPT_SYSTEM,
  DEFAULT_NOVELAI_V4_PROMPT_SYSTEM
} from '@/services/drawing';

export interface GlobalProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}

export interface LLMConfig {
  id: string;
  name: string;
  enabled: boolean;
  useGlobal: boolean; // 是否继承全局 API 配置
  globalProviderId?: string; // 指定使用的全局服务商 ID，如果不指定则使用默认（第一个）
  provider: {
    baseUrl: string;
    apiKey: string;
  };
  model: string;
  maxContextTokens?: number; // 可选的上下文窗口限制 (Tokens 数)

  // 进阶设置 (Advanced Settings)
  stream?: boolean; // 默认为 true
  timeout?: number; // 默认 300000ms (5分钟)
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;

  // Chat (LLM #1) specific
  historyTurns?: number; // 上下文包含的回合数
  minWordCount?: number;
  maxWordCount?: number;
}

export interface DrawingConfig {
  enabled: boolean;
  providerType: 'novelai' | 'openai' | 'openai-image';
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  width: number;
  height: number;
  steps: number;
  scale: number;
  sampler: string;
  negativePrompt: string;
  systemPrompt: string;
  systemPromptOpenAI: string;
  systemPromptNovelAIV3: string;
  systemPromptNovelAIV4: string;
  extraPositivePrompt: string;
  extraNegativePrompt: string;
  useReferenceImages: boolean;
}

const DEFAULT_LLM_CONFIGS: Record<string, LLMConfig> = {
  chat: {
    id: 'chat',
    name: '对话模型 (LLM #1)',
    enabled: true,
    useGlobal: true,
    provider: { baseUrl: '', apiKey: '' },
    model: '',
    maxContextTokens: 128000,
    stream: true,
    timeout: 300000,
    temperature: 0.7,
    historyTurns: 10,
    minWordCount: 800,
    maxWordCount: 1200
  },
  logic: {
    id: 'logic',
    name: '逻辑模型 (LLM #2)',
    enabled: true,
    useGlobal: true,
    provider: { baseUrl: '', apiKey: '' },
    model: '',
    stream: false, // 逻辑模型通常在非流式模式下处理 JSON 解析更稳定
    timeout: 300000,
    temperature: 0.1
  },
  memory: {
    id: 'memory',
    name: '记忆模型 (LLM #3)',
    enabled: true,
    useGlobal: true,
    provider: { baseUrl: '', apiKey: '' },
    model: '',
    stream: false,
    timeout: 300000,
    temperature: 0.1
  },
  misc: {
    id: 'misc',
    name: '杂项模型 (LLM #4)',
    enabled: true,
    useGlobal: true,
    provider: { baseUrl: '', apiKey: '' },
    model: '',
    stream: false,
    timeout: 300000, // 为战斗叙述场景提升超时阈值至 5 分钟 (300000ms)
    temperature: 0.3
  },
  drawing: {
    id: 'drawing',
    name: '绘图提示词模型 (LLM #5)',
    enabled: true,
    useGlobal: true,
    provider: { baseUrl: '', apiKey: '' },
    model: '',
    stream: false,
    timeout: 60000,
    temperature: 0.7
  }
};

export const useSettingsStore = defineStore('settings', () => {
  // 全局 API 供应方配置列表
  const globalProviders = ref<GlobalProvider[]>([
    {
      id: 'default',
      name: '默认服务商',
      baseUrl: '',
      apiKey: ''
    }
  ]);

  // 全局 API 供应方配置（缺省） - 保留以兼容旧接口
  const globalProvider = computed({
    get: () => {
      const first = globalProviders.value[0];
      return first ? { baseUrl: first.baseUrl, apiKey: first.apiKey } : { baseUrl: '', apiKey: '' };
    },
    set: (val: { baseUrl: string; apiKey: string }) => {
      if (globalProviders.value.length > 0) {
        const first = globalProviders.value[0];
        if (first) {
          first.baseUrl = val.baseUrl;
          first.apiKey = val.apiKey;
        }
      } else {
        globalProviders.value.push({
          id: 'default',
          name: '默认服务商',
          baseUrl: val.baseUrl,
          apiKey: val.apiKey
        });
      }
    }
  });

  const llmConfigs = ref<Record<string, LLMConfig>>(_.cloneDeep(DEFAULT_LLM_CONFIGS));
  const enableMemoryRefinement = ref(false); // 默认执行禁用状态
  const enableManagementSystem = ref(false); // 居酒屋经营系统开关
  const useDefaultTilemap = ref(false); // 调试：强制使用静态瓦片地图，而非 LLM 动态生成的地图数据
  const showNsfwStats = ref(false); // 神秘小开关：是否显示敏感属性 (NSFW fields Display Switch)

  const theme = ref<'light' | 'dark' | 'eye-protection'>('light');
  const currentSaveSlotId = ref<number | undefined>(undefined);

  // 音频设置 (Audio Settings)
  const audioVolume = ref(0.25); // 主音量 (Master volume)
  const enableAudio = ref(true);
  const bgmVolume = ref(1.0);
  const sfxVolume = ref(1.0);

  // 绘图设置 (Drawing Settings - 图像生成 API)
  const drawingConfig = ref<DrawingConfig>({
    enabled: false,
    providerType: 'novelai',
    apiBaseUrl: 'https://nai-proxy.2752026184.workers.dev/ai/generate-image',
    apiKey: '',
    model: 'nai-diffusion-4-full',
    // NovelAI 专属配置 (NAI Specifics)
    width: 832,
    height: 1216,
    steps: 28,
    scale: 5.0,
    sampler: 'k_euler_ancestral',
    negativePrompt:
      'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',

    // 遗留字段：保留用于迁移或作为降级兜底方案
    systemPrompt: DEFAULT_DRAWING_PROMPT_SYSTEM,

    // 独立分块的系统 Prompt 指令集
    systemPromptOpenAI: DEFAULT_DRAWING_PROMPT_SYSTEM,
    systemPromptNovelAIV3: DEFAULT_NOVELAI_V3_PROMPT_SYSTEM,
    systemPromptNovelAIV4: DEFAULT_NOVELAI_V4_PROMPT_SYSTEM,

    // 附加 Prompt 后缀修正集
    extraPositivePrompt: '',
    extraNegativePrompt: '',
    useReferenceImages: true
  });

  async function loadSettings() {
    const settings = await dbService.getSettings();
    if (settings) {
      if (settings.globalProviders && Array.isArray(settings.globalProviders)) {
        globalProviders.value = settings.globalProviders;
      } else if (settings.globalProvider) {
        // 兼容旧存档
        globalProviders.value = [
          {
            id: 'default',
            name: '默认服务商',
            baseUrl: settings.globalProvider.baseUrl || '',
            apiKey: settings.globalProvider.apiKey || ''
          }
        ];
      }

      if (settings.llmConfigs) {
        // 元数据同步 (Metadata Sync)：将持久化配置与默认模板执行合并，确保新字段 (如 maxContextTokens) 合法存在
        const savedConfigs = settings.llmConfigs;
        for (const key in DEFAULT_LLM_CONFIGS) {
          if (savedConfigs[key]) {
            // 属性补齐逻辑：确保在已存在的旧存档中自动注入 maxContextTokens 默认字段
            const defaultConfig = DEFAULT_LLM_CONFIGS[key];
            if (
              defaultConfig &&
              savedConfigs[key].maxContextTokens === undefined &&
              defaultConfig.maxContextTokens !== undefined
            ) {
              savedConfigs[key].maxContextTokens = defaultConfig.maxContextTokens;
            }
          } else {
            // 版本平滑演进：若由于系统升级新增了模型槽位 (如 LLM #4)，则同步从默认模版加载初值
            savedConfigs[key] = _.cloneDeep(DEFAULT_LLM_CONFIGS[key]);
          }
        }
        llmConfigs.value = savedConfigs;
      }
      if (settings.enableMemoryRefinement !== undefined) {
        enableMemoryRefinement.value = settings.enableMemoryRefinement;
      }
      // Force disabled: enableManagementSystem.value = settings.enableManagementSystem;
      enableManagementSystem.value = false;

      if (settings.useDefaultTilemap !== undefined) {
        useDefaultTilemap.value = settings.useDefaultTilemap;
      }
      if (settings.showNsfwStats !== undefined) {
        showNsfwStats.value = settings.showNsfwStats;
      }
      if (settings.audioVolume !== undefined) audioVolume.value = settings.audioVolume;
      if (settings.enableAudio !== undefined) enableAudio.value = settings.enableAudio;
      if (settings.bgmVolume !== undefined) bgmVolume.value = settings.bgmVolume;
      if (settings.sfxVolume !== undefined) sfxVolume.value = settings.sfxVolume;

      if (settings.drawingConfig) {
        const mergedConfig = { ...drawingConfig.value, ...settings.drawingConfig };

        // 迁移策略 (Migration)：执行模型 ID 规范化清洗 (Model ID cleanup)
        const modelMap: Record<string, string> = {
          'NovelAI Diffusion V4.5 Full': 'nai-diffusion-4-5-full',
          'NovelAI Diffusion V4.5 Curated': 'nai-diffusion-4-5-curated',
          'NovelAI Diffusion V4 Full': 'nai-diffusion-4-full',
          'NovelAI Diffusion V4 Curated': 'nai-diffusion-4-curated',
          'NovelAI Diffusion V3': 'nai-diffusion-3',
          'NovelAI Diffusion Furry V3': 'nai-diffusion-furry-3',
          'nai-diffusion-4.5-full': 'nai-diffusion-4-5-full',
          'nai-diffusion-4.5-curated': 'nai-diffusion-4-5-curated'
        };

        const mappedModel = mergedConfig.model ? modelMap[mergedConfig.model] : undefined;
        if (mappedModel) {
          mergedConfig.model = mappedModel;
        }

        // 迁移策略：若用户仍在使用官方遗留 URL，则自动对接到最新的 CF 代理服务网关
        const isOfficialUrl =
          mergedConfig.apiBaseUrl === 'https://api.novelai.net/ai/generate-image' ||
          mergedConfig.apiBaseUrl === 'https://image.novelai.net/ai/generate-image';

        if (mergedConfig.providerType === 'novelai' && isOfficialUrl) {
          mergedConfig.apiBaseUrl = 'https://nai-proxy.2752026184.workers.dev/ai/generate-image';
        }
        drawingConfig.value = mergedConfig;
      }

      if (settings.theme) theme.value = settings.theme;
      currentSaveSlotId.value = settings.currentSaveSlotId;
    }
  }

  async function saveSettings() {
    // 执行内存深拷贝，规避 Vue Proxy 代理对象在 IndexedDB 存储时的序列化异常
    const settingsToSave = {
      id: 1,
      globalProviders: JSON.parse(JSON.stringify(globalProviders.value)),
      globalProvider: JSON.parse(JSON.stringify(globalProvider.value)), // 保留以兼容旧接口
      llmConfigs: JSON.parse(JSON.stringify(llmConfigs.value)),
      enableMemoryRefinement: enableMemoryRefinement.value,
      enableManagementSystem: enableManagementSystem.value,
      useDefaultTilemap: useDefaultTilemap.value,
      theme: theme.value,
      currentSaveSlotId: currentSaveSlotId.value,
      audioVolume: audioVolume.value,
      enableAudio: enableAudio.value,
      bgmVolume: bgmVolume.value,
      sfxVolume: sfxVolume.value,
      showNsfwStats: showNsfwStats.value,
      drawingConfig: JSON.parse(JSON.stringify(drawingConfig.value))
    };

    await dbService.saveSettings(settingsToSave);
  }

  // --- Export/Import Logic ---
  const CUSTOM_ORIGINS_KEY = 'izakaya_custom_origins';

  async function exportGlobalConfig() {
    // 1. 准备全局配置元数据分片
    const dbData = await dbService.exportGlobalData();

    const config: any = {
      version: 2, // Upgraded version to include game data
      timestamp: Date.now(),
      globalProviders: globalProviders.value,
      globalProvider: globalProvider.value,
      llmConfigs: llmConfigs.value,
      audio: {
        audioVolume: audioVolume.value,
        enableAudio: enableAudio.value,
        bgmVolume: bgmVolume.value,
        sfxVolume: sfxVolume.value
      },
      customOrigins: [] as any[],
      gameData: dbData
    };

    // 从 localStorage 引导加载自定义源配置
    try {
      const savedOrigins = localStorage.getItem(CUSTOM_ORIGINS_KEY);
      if (savedOrigins) {
        config.customOrigins = JSON.parse(savedOrigins);
      }
    } catch (e) {
      console.error('[设置中心] 导出自定义起源配置失败喵:', e);
    }

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `izakaya-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importGlobalConfig(jsonStr: string) {
    try {
      const config = JSON.parse(jsonStr);

      // 合规性校验 (Sanity Check)：在执行前确保文件包含有效的版本标识或核心数据分片
      if (
        !config.version ||
        (!config.globalProvider && !config.globalProviders && !config.gameData)
      ) {
        throw new Error('无效的备份文件：缺少版本号或必要数据');
      }

      // 1. 引导导入全局配置分片
      if (config.globalProviders && Array.isArray(config.globalProviders)) {
        globalProviders.value = config.globalProviders;
      } else if (config.globalProvider) {
        globalProviders.value = [
          {
            id: 'default',
            name: '默认服务商',
            baseUrl: config.globalProvider.baseUrl || '',
            apiKey: config.globalProvider.apiKey || ''
          }
        ];
      }

      if (config.llmConfigs) {
        const mergedConfigs = _.cloneDeep(DEFAULT_LLM_CONFIGS);
        for (const key in config.llmConfigs) {
          if (mergedConfigs[key]) {
            mergedConfigs[key] = { ...mergedConfigs[key], ...config.llmConfigs[key] };
          }
        }
        llmConfigs.value = mergedConfigs;
      }

      if (config.audio) {
        if (config.audio.audioVolume !== undefined) audioVolume.value = config.audio.audioVolume;
        if (config.audio.enableAudio !== undefined) enableAudio.value = config.audio.enableAudio;
        if (config.audio.bgmVolume !== undefined) bgmVolume.value = config.audio.bgmVolume;
        if (config.audio.sfxVolume !== undefined) sfxVolume.value = config.audio.sfxVolume;
      }

      if (config.customOrigins && Array.isArray(config.customOrigins)) {
        localStorage.setItem(CUSTOM_ORIGINS_KEY, JSON.stringify(config.customOrigins));
      }

      // 2. 引导导入游戏业务数据 (若存在存档分片)
      if (config.gameData) {
        await dbService.importGlobalData(config.gameData);
        console.log('[设置中心] 游戏数据导入成功喵！(数据版本:', config.version, ')');
      }

      await saveSettings();
      return true;
    } catch (e) {
      console.error('[设置中心] 导入配置或数据失败喵:', e);
      return false;
    }
  }

  // 辅助函数：获取特定 LLM 模块的生效配置 (Helper to get effective config)
  function getEffectiveConfig(type: 'chat' | 'logic' | 'memory' | 'misc' | 'drawing') {
    const config = llmConfigs.value[type];
    const defaultConfig = DEFAULT_LLM_CONFIGS[type];

    // 与默认值合并以确保所有字段存在 (Merge with defaults)
    const mergedConfig = { ...defaultConfig, ...config };

    if (mergedConfig.useGlobal) {
      let activeProvider = globalProviders.value.find(
        (p: GlobalProvider) => p.id === mergedConfig.globalProviderId
      );
      if (!activeProvider) {
        activeProvider =
          globalProviders.value[0] || ({ baseUrl: '', apiKey: '' } as GlobalProvider);
      }

      return {
        baseUrl: activeProvider.baseUrl,
        apiKey: activeProvider.apiKey,
        model: mergedConfig.model,
        maxContextTokens: mergedConfig.maxContextTokens,
        // 包含所有带默认值的进阶设置 (Include advanced settings)
        stream: mergedConfig.stream,
        timeout: mergedConfig.timeout,
        temperature: mergedConfig.temperature,
        top_p: mergedConfig.top_p,
        frequency_penalty: mergedConfig.frequency_penalty,
        presence_penalty: mergedConfig.presence_penalty,
        // Chat-specific
        ...(type === 'chat' && {
          historyTurns: mergedConfig.historyTurns,
          minWordCount: mergedConfig.minWordCount,
          maxWordCount: mergedConfig.maxWordCount
        })
      };
    }
    return {
      baseUrl: mergedConfig.provider?.baseUrl || '',
      apiKey: mergedConfig.provider?.apiKey || '',
      model: mergedConfig.model,
      maxContextTokens: mergedConfig.maxContextTokens,
      // 包含所有带默认值的进阶设置 (Include advanced settings)
      stream: mergedConfig.stream,
      timeout: mergedConfig.timeout,
      temperature: mergedConfig.temperature,
      top_p: mergedConfig.top_p,
      frequency_penalty: mergedConfig.frequency_penalty,
      presence_penalty: mergedConfig.presence_penalty,
      // Chat-specific
      ...(type === 'chat' && {
        historyTurns: mergedConfig.historyTurns,
        minWordCount: mergedConfig.minWordCount,
        maxWordCount: mergedConfig.maxWordCount
      })
    };
  }

  function updateLLMConfig(
    type: 'chat' | 'logic' | 'memory' | 'misc' | 'drawing',
    newConfig: Partial<LLMConfig>
  ) {
    const currentConfig = llmConfigs.value[type] || DEFAULT_LLM_CONFIGS[type];
    if (!currentConfig) return; // 有默认值保证，理论上不会发生 (Safety fallback)

    // 显式断言为 LLMConfig 类型以确保类型安全，同时保留 ID 等核心标识字段喵
    llmConfigs.value[type] = {
      ...currentConfig,
      ...newConfig,
      id: currentConfig.id // 确保 ID 指针始终有效不为空喵 (Identity Guard)
    } as LLMConfig;
    saveSettings();
  }

  return {
    globalProviders,
    globalProvider,
    llmConfigs,
    enableMemoryRefinement,
    enableManagementSystem,
    useDefaultTilemap,
    theme,
    currentSaveSlotId,
    audioVolume,
    enableAudio,
    bgmVolume,
    sfxVolume,
    showNsfwStats,
    drawingConfig,
    loadSettings,
    saveSettings,
    exportGlobalConfig,
    importGlobalConfig,
    getEffectiveConfig,
    updateLLMConfig
  };
});
