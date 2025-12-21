import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db } from '@/db';
import _ from 'lodash';

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
    timeout: 60000,
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
  const enableMemoryRefinement = ref(true); // Default to enabled
  
  const theme = ref<'light' | 'dark' | 'eye-protection'>('light');
  const currentSaveSlotId = ref<number | undefined>(undefined);

  // Audio Settings
  const audioVolume = ref(0.25); // Master volume
  const enableAudio = ref(true);
  const bgmVolume = ref(1.0);
  const sfxVolume = ref(1.0);

  // Drawing Settings (Image Generation API)
  const drawingConfig = ref({
    enabled: false,
    apiBaseUrl: '',
    apiKey: '',
    model: 'gemini-2.5-flash-image-landscape',
    systemPrompt: `你是一个《东方Project》RPG游戏的“插画导演”。
你的任务是根据提供的剧情文本，编写一段用于 AI 绘图的提示词。

# 编写规则
1. **使用中文自然语言**：直接描述画面，无需使用标签或代码。
2. **着重刻画人物与场景**：
   - 大家在什么地方？环境光影如何？
   - 每个人物穿的是什么？（需符合东方Project原作设定或当前剧情描述）
   - 每个人物都在干什么？表情和动作是怎样的？
3. **选取最具代表性的一幕**：如果剧情包含多段，只选取最精彩、最温馨或最关键的瞬间。
4. **风格要求**：治愈系日系现代插画，带有浓厚的生活感与空气感。线条流畅柔和，色彩饱满但不刺眼。
5. **无需输出任何解释**：只输出提示词文本本身。

# 参考范例
画面核心，是捕捉一幅褪去所有“解决异变”身份后，属于三个女孩最平凡、最温暖的瞬间。场景设定在博丽神社那略显陈旧的木质廊台（縁側）上。时值夏末初秋的傍晚，天空被落日染成一片温柔的橘红色。她们席地而坐，中间放着一个矮矮的矮桌，上面摆着几碟简单的家常菜。魔理沙正眉飞色舞地讲着什么，手舞足蹈；灵梦单手托腮，嘴角带着一抹淡淡的、发自内心的微笑看着她；早苗则侧耳倾听，眼神里充满了对这种生活的好奇与喜悦。光线利用侧逆光为她们的轮廓镶上一圈金边。

# 输出格式
直接输出提示词段落，不要包含Markdown代码块或其他前缀后缀。`
  });

  async function loadSettings() {
    const settings = await db.settings.get(1);
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
      if (settings.audioVolume !== undefined) audioVolume.value = settings.audioVolume;
      if (settings.enableAudio !== undefined) enableAudio.value = settings.enableAudio;
      if (settings.bgmVolume !== undefined) bgmVolume.value = settings.bgmVolume;
      if (settings.sfxVolume !== undefined) sfxVolume.value = settings.sfxVolume;
      if (settings.drawingConfig) {
        drawingConfig.value = { ...drawingConfig.value, ...settings.drawingConfig };
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
      theme: theme.value,
      currentSaveSlotId: currentSaveSlotId.value,
      audioVolume: audioVolume.value,
      enableAudio: enableAudio.value,
      bgmVolume: bgmVolume.value,
      sfxVolume: sfxVolume.value,
      drawingConfig: JSON.parse(JSON.stringify(drawingConfig.value))
    };
    
    await db.settings.put(settingsToSave);
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
      theme,
      currentSaveSlotId,
      audioVolume,
      enableAudio,
      bgmVolume,
      sfxVolume,
      drawingConfig,
      loadSettings,
      saveSettings,
      getEffectiveConfig,
      updateLLMConfig
    };
});
