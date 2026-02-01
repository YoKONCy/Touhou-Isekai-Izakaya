import { defineStore } from 'pinia';
import { ref } from 'vue';
import { dbService } from '@/services/DatabaseService';
import _ from 'lodash';
import { 
    DEFAULT_DRAWING_PROMPT_SYSTEM, 
    DEFAULT_NOVELAI_V3_PROMPT_SYSTEM, 
    DEFAULT_NOVELAI_V4_PROMPT_SYSTEM 
} from '@/services/drawing';

export interface LLMConfig {
  id: string;
  name: string;
  enabled: boolean;
  useGlobal: boolean; // Inherit global settings
  provider: {
    baseUrl: string;
    apiKey: string;
  };
  model: string;
  maxContextTokens?: number; // Optional context window limit
  
  // Advanced Settings
  stream?: boolean; // Default true
  timeout?: number; // Default 300000ms (5min)
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;

  // Chat (LLM #1) specific
  historyTurns?: number; // Number of turns to include in context
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
    stream: false, // Logic usually works better non-streaming for JSON parsing (though we parse chunk by chunk, full response is safer)
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
    timeout: 300000, // Increased to 5min for long combat narrations
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
  // Global Provider Settings (Default)
  const globalProvider = ref({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: ''
  });

  const llmConfigs = ref<Record<string, LLMConfig>>(_.cloneDeep(DEFAULT_LLM_CONFIGS));
  const enableMemoryRefinement = ref(false); // Default to disabled
  const enableManagementSystem = ref(false); // Toggle for Izakaya Management System
  const useDefaultTilemap = ref(false); // Debug: Use hardcoded map instead of LLM generated one
  
  const theme = ref<'light' | 'dark' | 'eye-protection'>('light');
  const currentSaveSlotId = ref<number | undefined>(undefined);

  // Audio Settings
  const audioVolume = ref(0.25); // Master volume
  const enableAudio = ref(true);
  const bgmVolume = ref(1.0);
  const sfxVolume = ref(1.0);

  // Drawing Settings (Image Generation API)
  const drawingConfig = ref<DrawingConfig>({
    enabled: false,
    providerType: 'novelai',
    apiBaseUrl: 'https://nai-proxy.2752026184.workers.dev/ai/generate-image',
    apiKey: '',
    model: 'nai-diffusion-4-full',
    // NovelAI Specifics
    width: 832,
    height: 1216,
    steps: 28,
    scale: 5.0,
    sampler: 'k_euler_ancestral',
    negativePrompt: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
    
    // Legacy field, kept for migration or fallback
    systemPrompt: DEFAULT_DRAWING_PROMPT_SYSTEM,
    
    // Separated System Prompts
    systemPromptOpenAI: DEFAULT_DRAWING_PROMPT_SYSTEM,
    systemPromptNovelAIV3: DEFAULT_NOVELAI_V3_PROMPT_SYSTEM,
    systemPromptNovelAIV4: DEFAULT_NOVELAI_V4_PROMPT_SYSTEM,

    // Extra Prompts
    extraPositivePrompt: '',
    extraNegativePrompt: '',
    useReferenceImages: true
  });

  async function loadSettings() {
    const settings = await dbService.getSettings();
    if (settings) {
      if (settings.globalProvider) globalProvider.value = settings.globalProvider;
      if (settings.llmConfigs) {
         // Merge saved configs with default to ensure new fields (like maxContextTokens) exist
         const savedConfigs = settings.llmConfigs;
         for (const key in DEFAULT_LLM_CONFIGS) {
           if (savedConfigs[key]) {
             // Ensure maxContextTokens exists if not present in saved data
             const defaultConfig = DEFAULT_LLM_CONFIGS[key];
             if (defaultConfig && savedConfigs[key].maxContextTokens === undefined && defaultConfig.maxContextTokens !== undefined) {
               savedConfigs[key].maxContextTokens = defaultConfig.maxContextTokens;
             }
           } else {
             // If a new config key was added (e.g. misc), add it from defaults
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
      if (settings.audioVolume !== undefined) audioVolume.value = settings.audioVolume;
      if (settings.enableAudio !== undefined) enableAudio.value = settings.enableAudio;
      if (settings.bgmVolume !== undefined) bgmVolume.value = settings.bgmVolume;
      if (settings.sfxVolume !== undefined) sfxVolume.value = settings.sfxVolume;
      if (settings.drawingConfig) {
        const mergedConfig = { ...drawingConfig.value, ...settings.drawingConfig };
        
        // Migration: Model ID cleanup
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

        // Migration: If the user was using the old official URL, update it to the new CF proxy URL
        const isOfficialUrl = mergedConfig.apiBaseUrl === 'https://api.novelai.net/ai/generate-image' || 
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
    // Deep clone to avoid proxy issues when saving to IndexedDB
    const settingsToSave = {
      id: 1,
      globalProvider: JSON.parse(JSON.stringify(globalProvider.value)),
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
      drawingConfig: JSON.parse(JSON.stringify(drawingConfig.value))
    };
    
    await dbService.saveSettings(settingsToSave);
  }

  // --- Export/Import Logic ---
  const CUSTOM_ORIGINS_KEY = 'izakaya_custom_origins';

  async function exportGlobalConfig() {
    // 1. Prepare global settings data
    const dbData = await dbService.exportGlobalData();
    
    const config: any = {
      version: 2, // Upgraded version to include game data
      timestamp: Date.now(),
      globalProvider: globalProvider.value,
      llmConfigs: llmConfigs.value,
      audio: {
        audioVolume: audioVolume.value,
        enableAudio: enableAudio.value,
        bgmVolume: bgmVolume.value,
        sfxVolume: sfxVolume.value,
      },
      customOrigins: [] as any[],
      gameData: dbData
    };

    // Load custom origins from localStorage
    try {
      const savedOrigins = localStorage.getItem(CUSTOM_ORIGINS_KEY);
      if (savedOrigins) {
        config.customOrigins = JSON.parse(savedOrigins);
      }
    } catch (e) {
      console.error('Failed to export custom origins:', e);
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
      
      // Validation: Ensure it's a valid backup file before doing anything
      if (!config.version || (!config.globalProvider && !config.gameData)) {
        throw new Error("无效的备份文件：缺少版本号或必要数据");
      }

      // 1. Import Global Settings
      if (config.globalProvider) globalProvider.value = config.globalProvider;
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

      // 2. Import Game Data (if exists)
      if (config.gameData) {
        await dbService.importGlobalData(config.gameData);
        console.log('Game data imported successfully (Version:', config.version, ')');
      }

      await saveSettings();
      return true;
    } catch (e) {
      console.error('Failed to import config/data:', e);
      return false;
    }
  }

  // Helper to get effective config for a specific LLM
  function getEffectiveConfig(type: 'chat' | 'logic' | 'memory' | 'misc' | 'drawing') {
    const config = llmConfigs.value[type];
    const defaultConfig = DEFAULT_LLM_CONFIGS[type];
    
    // Merge with defaults to ensure all fields exist
    const mergedConfig = { ...defaultConfig, ...config };
    
    if (mergedConfig.useGlobal) {
      return {
        baseUrl: globalProvider.value.baseUrl,
        apiKey: globalProvider.value.apiKey,
        model: mergedConfig.model,
        maxContextTokens: mergedConfig.maxContextTokens,
        // Include all advanced settings with defaults
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
      // Include all advanced settings with defaults
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

  function updateLLMConfig(type: 'chat' | 'logic' | 'memory' | 'misc' | 'drawing', newConfig: Partial<LLMConfig>) {
    const currentConfig = llmConfigs.value[type] || DEFAULT_LLM_CONFIGS[type];
    if (!currentConfig) return; // Should not happen given defaults

    // Explicitly cast to LLMConfig to ensure type safety, preserving ID and other required fields
    llmConfigs.value[type] = { 
      ...currentConfig, 
      ...newConfig,
      id: currentConfig.id // Ensure ID is never undefined
    } as LLMConfig;
    saveSettings();
  }

  return {
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
      drawingConfig,
      loadSettings,
      saveSettings,
      exportGlobalConfig,
      importGlobalConfig,
      getEffectiveConfig,
      updateLLMConfig
    };
});
