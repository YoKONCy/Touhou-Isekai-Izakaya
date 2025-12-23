<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useGameStore } from '@/stores/game';
import { audioManager } from '@/services/audio';
import { useToastStore } from '@/stores/toast';
import { X, Save, Volume2, VolumeX, Music, FileText, Palette, CheckCircle, Image as ImageIcon, RefreshCw, AlertCircle, Check } from 'lucide-vue-next';
import LLMConfigPanel from './LLMConfigPanel.vue';
import { fetchModels, type ModelInfo } from '@/services/llm';
import { 
    drawingService,
    DEFAULT_DRAWING_PROMPT_SYSTEM, 
    DEFAULT_NOVELAI_V3_PROMPT_SYSTEM,
    DEFAULT_NOVELAI_V4_PROMPT_SYSTEM
  } from '@/services/drawing';
import { generateMap } from '@/services/management/MapGenerator';

const props = defineProps<{
  isOpen: boolean;
  initialTab?: 'global' | 'chat' | 'logic' | 'memory' | 'misc' | 'audio' | 'summary' | 'interface' | 'drawing' | 'debug';
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-summary', turnCount: number): void;
}>();

const settingsStore = useSettingsStore();
const gameStore = useGameStore();
const toastStore = useToastStore();
const activeTab = ref<'global' | 'chat' | 'logic' | 'memory' | 'misc' | 'audio' | 'summary' | 'interface' | 'drawing' | 'debug'>('global');
const summaryTurnCount = ref(20);

// Drawing Models State
const drawingModels = ref<ModelInfo[]>([]);
const isLoadingDrawingModels = ref(false);
const drawingFetchError = ref('');
  const drawingFetchSuccess = ref(false);
  const isTestingNovelAI = ref(false);
  const novelAITestStatus = ref<'idle' | 'success' | 'error'>('idle');
  const novelAITestError = ref('');

  const testNovelAI = async () => {
    isTestingNovelAI.value = true;
    novelAITestStatus.value = 'idle';
    novelAITestError.value = '';
    
    try {
      await drawingService.testNovelAIConnection(settingsStore.drawingConfig);
      novelAITestStatus.value = 'success';
    } catch (error: any) {
      novelAITestStatus.value = 'error';
      novelAITestError.value = error.message || '连接测试失败';
    } finally {
      isTestingNovelAI.value = false;
    }
  };

// Map Generation State
const mapGenerationPrompt = ref('Cozy Izakaya with a large kitchen');
const isGeneratingMap = ref(false);

// const isInitializingTTS = ref(false);

watch(() => props.isOpen, (newVal) => {
  if (newVal && props.initialTab) {
    activeTab.value = props.initialTab;
  } else if (newVal) {
    activeTab.value = 'global';
  }
});

watch(() => settingsStore.drawingConfig.providerType, (newVal) => {
  if (newVal === 'novelai') {
    if (!settingsStore.drawingConfig.apiBaseUrl || settingsStore.drawingConfig.apiBaseUrl.includes('openai.com')) {
      settingsStore.drawingConfig.apiBaseUrl = 'https://api.novelai.net/ai/generate-image';
    }
    if (!settingsStore.drawingConfig.model) {
      settingsStore.drawingConfig.model = 'nai-diffusion-4-full';
    }
  } else if (newVal === 'openai') {
    if (!settingsStore.drawingConfig.apiBaseUrl || settingsStore.drawingConfig.apiBaseUrl.includes('novelai.net')) {
      settingsStore.drawingConfig.apiBaseUrl = 'https://api.openai.com/v1';
    }
  }
});

watch(() => settingsStore.drawingConfig.steps, (newVal) => {
  if (newVal < 1) settingsStore.drawingConfig.steps = 1;
  if (newVal > 50) settingsStore.drawingConfig.steps = 50;
});

watch(() => settingsStore.drawingConfig.scale, (newVal) => {
  if (newVal < 0) settingsStore.drawingConfig.scale = 0;
  if (newVal > 31) settingsStore.drawingConfig.scale = 31;
});

// Audio Watchers
watch(() => settingsStore.audioVolume, (newVal) => {
  audioManager.setVolume(newVal);
});

watch(() => settingsStore.enableAudio, (newVal) => {
  audioManager.setMute(!newVal);
});

watch(() => settingsStore.bgmVolume, (newVal) => {
  audioManager.setBgmVolume(newVal);
});

watch(() => settingsStore.sfxVolume, (newVal) => {
  audioManager.setSfxVolume(newVal);
});

const tabs = [
  { id: 'global', label: '全局服务商' },
  { id: 'interface', label: '界面外观' },
  { id: 'chat', label: '对话 (LLM #1)' },
  { id: 'logic', label: '逻辑 (LLM #2)' },
  { id: 'memory', label: '记忆 (LLM #3)' },
  { id: 'misc', label: '杂项 (LLM #4)' },
  { id: 'summary', label: '故事大总结' },
  { id: 'audio', label: '音效与交互' },
  { id: 'drawing', label: 'AI 插画' },
  { id: 'debug', label: '调试 (Debug)' },
] as const;

function triggerManagementMiniGame() {
  gameStore.updateState({
    system: {
      ...gameStore.state.system,
      management: {
        isActive: true,
        isTriggered: true,
        context: "调试模式触发",
        specialGuests: [],
        difficulty: "easy",
        stats: {
          totalRevenue: 0,
          customersServed: 0,
          reputationGained: 0,
          startTime: Date.now()
        }
      }
    }
  });
  toastStore.addToast({ message: "居酒屋经营小游戏已触发", type: "success" });
  emit('close');
}

async function handleGenerateMap() {
  if (!mapGenerationPrompt.value.trim()) return;
  
  isGeneratingMap.value = true;
  try {
    const newMap = await generateMap("Debug Theme", mapGenerationPrompt.value, undefined, true);
    
    // Update Game Store
    // Use direct assignment to avoid lodash.merge array merging issues
    gameStore.state.system.customMap = newMap;
    
    toastStore.addToast({ message: "新瓦片地图生成成功！", type: "success" });
    emit('close'); // Close modal to see the map
  } catch (error) {
    console.error("Map generation failed:", error);
    toastStore.addToast({ message: "地图生成失败，请查看控制台", type: "error" });
  } finally {
    isGeneratingMap.value = false;
  }
}

function handleTabChange(id: any) {
  activeTab.value = id;
  audioManager.playSoftClick();
}

async function loadDrawingModels() {
  const { apiBaseUrl, apiKey } = settingsStore.drawingConfig;
  if (!apiBaseUrl || !apiKey) {
    drawingModels.value = [];
    drawingFetchError.value = '';
    drawingFetchSuccess.value = false;
    return;
  }

  isLoadingDrawingModels.value = true;
  drawingFetchError.value = '';
  drawingFetchSuccess.value = false;

  try {
    const modelList = await fetchModels(apiBaseUrl, apiKey);
    drawingModels.value = modelList;
    drawingFetchError.value = '';
    drawingFetchSuccess.value = true;
  } catch (error: any) {
    console.error('Failed to load drawing models:', error);
    drawingModels.value = [];
    drawingFetchError.value = error.message || 'Failed to fetch models';
    drawingFetchSuccess.value = false;
  } finally {
    isLoadingDrawingModels.value = false;
  }
}

function refreshDrawingModels() {
  loadDrawingModels();
}

// Watch for changes in drawing config to auto-load models
watch(
  () => [settingsStore.drawingConfig.apiBaseUrl, settingsStore.drawingConfig.apiKey],
  ([newUrl, newKey]) => {
    if (newUrl && newKey) {
      // Debounce slightly or just load? LLMConfigPanel loads immediately on watcher but debounces save.
      // We'll just load.
      loadDrawingModels();
    }
  }
);

function handleStartSummary() {
  audioManager.playClick();
  emit('open-summary', summaryTurnCount.value);
  emit('close');
}

const isCustomNovelAIModel = computed(() => {
  const model = settingsStore.drawingConfig.model;
  const standardModels = [
    'nai-diffusion-4.5-full', 
    'nai-diffusion-4.5-curated', 
    'nai-diffusion-4-full', 
    'nai-diffusion-4-curated', 
    'nai-diffusion-3', 
    'nai-diffusion-furry-3'
  ];
  return model === 'custom' || !standardModels.includes(model);
});

async function handleSave() {
  audioManager.playClick();
  await settingsStore.saveSettings();
  emit('close');
}

function handleClose() {
  audioManager.playSoftClick();
  emit('close');
}

function handleVolumeChangeTest() {
  if (settingsStore.enableAudio) {
    audioManager.playSoftClick();
  }
}
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-izakaya-wood/30 backdrop-blur-sm p-4 animate-fade-in">
    <div class="bg-izakaya-paper w-full max-w-2xl rounded-xl shadow-paper flex flex-col max-h-[90vh] border border-izakaya-wood/10 relative overflow-hidden">
      <!-- Texture -->
      <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-rice-paper"></div>
      
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-izakaya-wood/10 bg-white/40 relative z-10">
        <h2 class="text-lg font-bold font-display text-izakaya-wood flex items-center gap-2">
          <span class="text-touhou-red text-xl">⚙️</span>
          设置
        </h2>
        <button @click="handleClose" class="p-1 hover:bg-touhou-red/10 rounded-full text-izakaya-wood/50 hover:text-touhou-red transition-colors relative z-50">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-hidden flex flex-col md:flex-row relative z-10">
        
        <!-- Sidebar Tabs -->
        <div class="w-full md:w-48 bg-izakaya-wood/5 p-2 space-y-1 border-b md:border-b-0 md:border-r border-izakaya-wood/10 overflow-x-auto md:overflow-visible flex md:block">
          <button 
            v-for="tab in tabs" 
            :key="tab.id"
            @click="handleTabChange(tab.id)"
            class="px-3 py-2 rounded-md text-sm font-medium w-full text-left whitespace-nowrap transition-all duration-200 font-display"
            :class="activeTab === tab.id 
              ? 'bg-white text-touhou-red shadow-sm translate-x-1' 
              : 'text-izakaya-wood/70 hover:bg-white/50 hover:text-izakaya-wood'"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Panel Content -->
        <div class="flex-1 p-6 overflow-y-auto custom-scrollbar">
          
          <!-- Global Settings -->
          <div v-show="activeTab === 'global'" class="space-y-6 animate-fade-in">
            <div>
              <h3 class="text-base font-bold font-display text-izakaya-wood mb-4 flex items-center gap-2">
                <span class="w-1 h-4 bg-touhou-red rounded-full"></span>
                全局服务商配置
              </h3>
              <p class="text-sm text-izakaya-wood/60 mb-4 font-serif">
                在这里配置默认的 API 服务商。各个 LLM 模块可以选择继承此配置，也可以覆盖使用独立的配置。
              </p>
              
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-bold text-izakaya-wood mb-1 font-display">默认 Base URL</label>
                  <input 
                    v-model="settingsStore.globalProvider.baseUrl" 
                    type="text" 
                    class="w-full bg-white/50 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-sm text-izakaya-wood placeholder:text-izakaya-wood/30"
                  >
                </div>
                <div>
                  <label class="block text-sm font-bold text-izakaya-wood mb-1 font-display">默认 API Key</label>
                  <input 
                    v-model="settingsStore.globalProvider.apiKey" 
                    type="password" 
                    class="w-full bg-white/50 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-sm text-izakaya-wood placeholder:text-izakaya-wood/30"
                  >
                </div>
              </div>
            </div>
          </div>

          <!-- Interface Settings -->
          <div v-show="activeTab === 'interface'" class="space-y-6 animate-fade-in">
             <!-- Theme Selection -->
             <div class="space-y-4">
                <div class="flex items-center gap-2 text-izakaya-wood border-b border-izakaya-wood/10 pb-2">
                  <Palette class="w-5 h-5 text-touhou-red" />
                  <h3 class="font-bold font-display text-lg">界面主题</h3>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <!-- Light Theme -->
                   <button 
                      @click="settingsStore.theme = 'light'"
                      class="relative p-4 rounded-lg border-2 transition-all text-left flex flex-col gap-2 overflow-hidden group"
                      :class="settingsStore.theme === 'light' ? 'border-touhou-red bg-white shadow-md' : 'border-izakaya-wood/10 bg-white/50 hover:border-touhou-red/30'"
                   >
                      <div class="w-full h-16 bg-[#FDFBF7] border border-izakaya-wood/10 rounded mb-2 flex items-center justify-center relative overflow-hidden">
                          <div class="absolute inset-0 opacity-20 bg-texture-rice-paper"></div>
                          <span class="text-[#212121] font-display z-10">浅色</span>
                      </div>
                      <div class="font-bold text-sm text-izakaya-wood">浅色主题 (Normal)</div>
                      <div class="text-xs text-izakaya-wood/60">标准的居酒屋米色调，清晰明亮。</div>
                      
                      <div v-if="settingsStore.theme === 'light'" class="absolute top-2 right-2 text-touhou-red">
                         <CheckCircle class="w-4 h-4" />
                      </div>
                   </button>

                   <!-- Dark Theme -->
                   <button 
                      @click="settingsStore.theme = 'dark'"
                      class="relative p-4 rounded-lg border-2 transition-all text-left flex flex-col gap-2 overflow-hidden group"
                      :class="settingsStore.theme === 'dark' ? 'border-touhou-red bg-izakaya-wood/5 shadow-md' : 'border-izakaya-wood/10 bg-izakaya-wood/5 hover:border-touhou-red/30'"
                   >
                      <div class="w-full h-16 bg-[#121212] border border-gray-700 rounded mb-2 flex items-center justify-center">
                          <span class="text-[#E0E0E0] font-display">深色</span>
                      </div>
                      <div class="font-bold text-sm text-izakaya-wood">深色主题 (Dark)</div>
                      <div class="text-xs text-izakaya-wood/60">适合夜间使用的深色调，高对比度。</div>
                      
                      <div v-if="settingsStore.theme === 'dark'" class="absolute top-2 right-2 text-touhou-red">
                         <CheckCircle class="w-4 h-4" />
                      </div>
                   </button>
                   
                   <!-- Eye Protection Theme -->
                   <button 
                      @click="settingsStore.theme = 'eye-protection'"
                      class="relative p-4 rounded-lg border-2 transition-all text-left flex flex-col gap-2 overflow-hidden group"
                      :class="settingsStore.theme === 'eye-protection' ? 'border-touhou-red bg-[#F0EAD6]/50 shadow-md' : 'border-izakaya-wood/10 bg-[#F0EAD6]/30 hover:border-touhou-red/30'"
                   >
                      <div class="w-full h-16 bg-[#E3DCC3] border border-[#5e4b35]/20 rounded mb-2 flex items-center justify-center">
                          <span class="text-[#3b2e2a] font-display">护眼</span>
                      </div>
                      <div class="font-bold text-sm text-izakaya-wood">护眼主题 (Eye Care)</div>
                      <div class="text-xs text-izakaya-wood/60">低对比度的暖色调，减少视觉疲劳。</div>
                      
                      <div v-if="settingsStore.theme === 'eye-protection'" class="absolute top-2 right-2 text-touhou-red">
                         <CheckCircle class="w-4 h-4" />
                      </div>
                   </button>
                </div>
             </div>
          </div>

          <!-- Individual LLM Configs -->
          <div v-show="activeTab === 'chat'">
            <LLMConfigPanel config-key="chat" label="对话模型配置" />
            <div class="mt-4 text-sm text-izakaya-wood/70 bg-blue-50/50 border border-blue-100 p-3 rounded text-justify font-serif">
              <span class="font-bold text-blue-600 font-display">LLM #1 职责：</span> 
              负责扮演角色与玩家进行自然语言对话。建议选择具有强大人设扮演能力和长窗口的模型（如 Gemini2.5-Pro, Claude4.5-Sonnet）。
            </div>
          </div>

          <div v-show="activeTab === 'logic'">
            <LLMConfigPanel config-key="logic" label="逻辑模型配置" />
            <div class="mt-4 text-sm text-izakaya-wood/70 bg-purple-50/50 border border-purple-100 p-3 rounded text-justify font-serif">
              <span class="font-bold text-purple-600 font-display">LLM #2 职责：</span> 
              负责处理游戏规则、变量计算和状态更新。建议选择指令遵循能力强且响应速度快的模型（如 Gemini2.5-Flash）。
            </div>
          </div>

          <div v-show="activeTab === 'memory'">
            <LLMConfigPanel config-key="memory" label="记忆模型配置" />
            
            <!-- Memory Refinement Setting -->
            <div class="mt-4 p-4 border border-izakaya-wood/10 rounded-lg bg-white/30">
              <div class="flex items-center justify-between mb-2">
                <h4 class="font-bold text-izakaya-wood font-display">记忆检索精筛</h4>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" v-model="settingsStore.enableMemoryRefinement" class="sr-only peer">
                  <div class="w-11 h-6 bg-izakaya-wood/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-touhou-red"></div>
                </label>
              </div>
              <p class="text-xs text-izakaya-wood/60 font-serif">
                开启后，使用 LLM 对粗筛后的记忆进行二次精选，结果更准确但消耗更多 Token。
                <br>关闭后，将直接使用关键词匹配度最高的 50 条记忆（节省 Token）。
              </p>
            </div>

            <div class="mt-4 text-sm text-izakaya-wood/70 bg-green-50/50 border border-green-100 p-3 rounded text-justify font-serif">
              <span class="font-bold text-green-600 font-display">LLM #3 职责：</span> 
              负责在后台对长对话进行摘要和记忆提取。可以使用成本较低的模型（如 GLM4.5-Flash）。
            </div>
          </div>

          <div v-show="activeTab === 'misc'">
            <LLMConfigPanel config-key="misc" label="杂项模型配置" />
            <div class="mt-4 text-sm text-izakaya-wood/70 bg-orange-50/50 border border-orange-100 p-3 rounded text-justify font-serif">
              <span class="font-bold text-orange-600 font-display">LLM #4 职责：</span> 
              负责处理杂项任务，当前主要用于战斗系统中。
            </div>
          </div>

          <!-- Drawing Settings -->
          <div v-show="activeTab === 'drawing'" class="space-y-6 animate-fade-in">
             <!-- Feature Switch -->
            <div class="flex items-center justify-between p-4 border border-izakaya-wood/10 rounded-lg bg-white/30">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-touhou-red/10 rounded-lg text-touhou-red">
                   <ImageIcon class="w-6 h-6" />
                </div>
                <div>
                  <h4 class="font-bold text-izakaya-wood font-display">启用 AI 插画绘制</h4>
                  <p class="text-xs text-izakaya-wood/60 font-serif">根据剧情自动生成插画（需消耗 Tokens 和 API 调用）</p>
                </div>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" v-model="settingsStore.drawingConfig.enabled" class="sr-only peer">
                <div class="w-11 h-6 bg-izakaya-wood/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-touhou-red"></div>
              </label>
            </div>

             <!-- Prompt LLM Config -->
             <div class="border-t border-izakaya-wood/10 pt-4">
                 <h4 class="font-bold text-izakaya-wood font-display mb-2">步骤1：提示词生成模型 (LLM #5)</h4>
                 <LLMConfigPanel config-key="drawing" label="提示词生成模型配置" />
                 
                 <!-- System Prompt Config -->
                 <div class="mt-4 space-y-1">
                   <label class="block text-sm font-bold text-izakaya-wood font-display">
                     提示词生成指令 (System Prompt)
                     <span class="text-xs font-normal text-izakaya-wood/50 ml-2">用于指导 LLM 如何编写绘图 Prompt</span>
                   </label>
                   
                   <!-- Nanobanana System Prompt -->
                   <textarea 
                      v-if="settingsStore.drawingConfig.providerType === 'openai'"
                      v-model="settingsStore.drawingConfig.systemPromptOpenAI" 
                      rows="6"
                      class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-xs text-izakaya-wood placeholder:text-izakaya-wood/30 resize-y"
                      :placeholder="DEFAULT_DRAWING_PROMPT_SYSTEM"
                    ></textarea>

                   <!-- NovelAI System Prompt (V4/V4.5) -->
                   <textarea 
                      v-if="settingsStore.drawingConfig.providerType === 'novelai' && settingsStore.drawingConfig.model?.includes('nai-diffusion-4')"
                      v-model="settingsStore.drawingConfig.systemPromptNovelAIV4" 
                      rows="6"
                      class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-xs text-izakaya-wood placeholder:text-izakaya-wood/30 resize-y"
                      :placeholder="DEFAULT_NOVELAI_V4_PROMPT_SYSTEM"
                    ></textarea>

                   <!-- NovelAI System Prompt (V3/Legacy) -->
                   <textarea 
                      v-else-if="settingsStore.drawingConfig.providerType === 'novelai'"
                      v-model="settingsStore.drawingConfig.systemPromptNovelAIV3" 
                      rows="6"
                      class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-xs text-izakaya-wood placeholder:text-izakaya-wood/30 resize-y"
                      :placeholder="DEFAULT_NOVELAI_V3_PROMPT_SYSTEM"
                    ></textarea>

                   <p class="text-xs text-izakaya-wood/50 font-serif">
                     提示：Nanobanana 的提示词使用中文自然语言；NovelAI V4/V4.5 的提示词使用英文自然语言；NovelAI V3 的提示词使用英文 Tags；若不会编写提示词，使用默认配置即可。
                   </p>
                 </div>

                   <!-- Extra Prompts Config (NovelAI Only) -->
                   <div v-if="settingsStore.drawingConfig.providerType === 'novelai'" class="mt-4 grid grid-cols-2 gap-4">
                     <div class="space-y-1">
                       <label class="block text-sm font-bold text-izakaya-wood font-display">
                         补充正面提示词
                         <span class="text-xs font-normal text-izakaya-wood/50 ml-2">追加在生成内容后</span>
                       </label>
                       <textarea 
                         v-model="settingsStore.drawingConfig.extraPositivePrompt" 
                         rows="3"
                         class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-xs text-izakaya-wood placeholder:text-izakaya-wood/30 resize-y"
                         placeholder="例如: high quality, masterpiece"
                       ></textarea>
                     </div>
                     <div class="space-y-1">
                       <label class="block text-sm font-bold text-izakaya-wood font-display">
                         补充负面提示词
                         <span class="text-xs font-normal text-izakaya-wood/50 ml-2">追加在生成内容后</span>
                       </label>
                       <textarea 
                         v-model="settingsStore.drawingConfig.extraNegativePrompt" 
                         rows="3"
                         class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-xs text-izakaya-wood placeholder:text-izakaya-wood/30 resize-y"
                         placeholder="例如: lowres, bad anatomy"
                       ></textarea>
                     </div>
                   </div>

                 <div class="mt-2 text-sm text-izakaya-wood/70 bg-pink-50/50 border border-pink-100 p-3 rounded text-justify font-serif">
                  <span class="font-bold text-pink-600 font-display">LLM #5 职责：</span> 
                  负责根据剧情编写高质量的绘画提示词。建议选择指令遵循能力强的模型。
                </div>
             </div>

             <!-- Image API Config -->
             <div class="border-t border-izakaya-wood/10 pt-4">
                <h4 class="font-bold text-izakaya-wood font-display mb-4">步骤2：绘图 API 配置</h4>
                
                <div class="grid grid-cols-1 gap-4">
                  <!-- Provider Type Selection -->
                  <div class="space-y-1">
                    <label class="block text-sm font-bold text-izakaya-wood font-display">API 类型</label>
                    <div class="flex gap-4">
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" v-model="settingsStore.drawingConfig.providerType" value="openai" class="accent-touhou-red">
                        <span class="text-sm font-medium text-izakaya-wood">Nanobanana 格式</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" v-model="settingsStore.drawingConfig.providerType" value="novelai" class="accent-touhou-red">
                        <span class="text-sm font-medium text-izakaya-wood">NovelAI 官方格式</span>
                      </label>
                    </div>
                  </div>

                  <div class="space-y-1">
                    <label class="block text-sm font-bold text-izakaya-wood font-display">API Base URL</label>
                    <input 
                      type="text" 
                      v-model="settingsStore.drawingConfig.apiBaseUrl" 
                      :placeholder="settingsStore.drawingConfig.providerType === 'novelai' ? 'e.g. https://api.novelai.net/ai/generate-image' : 'e.g. https://api.openai.com/v1'"
                      class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-sm text-izakaya-wood placeholder:text-izakaya-wood/30"
                    >
                  </div>
                  
                  <div class="space-y-1">
                    <label class="block text-sm font-bold text-izakaya-wood font-display">API Key</label>
                    <input 
                      type="password" 
                      v-model="settingsStore.drawingConfig.apiKey" 
                      placeholder="sk-..."
                      class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-sm text-izakaya-wood placeholder:text-izakaya-wood/30"
                    >
                  </div>

                  <!-- Nanobanana Specific: Model Fetcher -->
                  <div v-if="settingsStore.drawingConfig.providerType === 'openai'" class="space-y-1">
                    <label class="block text-sm font-bold text-izakaya-wood font-display">模型名称 (Model)</label>
                    <div class="flex gap-2">
                      <select 
                        v-model="settingsStore.drawingConfig.model" 
                        class="flex-1 min-w-0 px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-sm text-izakaya-wood"
                      >
                        <option value="">请选择模型</option>
                        <option v-for="model in drawingModels" :key="model.id" :value="model.id">
                          {{ model.id }}
                        </option>
                      </select>
                      <button 
                        @click="refreshDrawingModels"
                        :disabled="isLoadingDrawingModels || !settingsStore.drawingConfig.apiBaseUrl || !settingsStore.drawingConfig.apiKey"
                        class="shrink-0 px-3 py-2 text-sm bg-marisa-gold hover:bg-marisa-gold-light disabled:bg-izakaya-wood/20 disabled:text-izakaya-wood/40 text-izakaya-wood font-bold rounded-md transition-all shadow-sm flex items-center gap-1 border border-marisa-gold/20"
                        title="获取模型列表"
                      >
                        <RefreshCw v-if="!isLoadingDrawingModels" class="w-4 h-4" />
                        <div v-else class="w-4 h-4 animate-spin rounded-full border-2 border-izakaya-wood border-t-transparent"></div>
                      </button>
                    </div>
                    <!-- Status Messages -->
                    <div v-if="drawingFetchError" class="mt-1 text-xs text-touhou-red flex items-center gap-1 font-medium">
                      <AlertCircle class="w-3 h-3" />
                      {{ drawingFetchError }}
                    </div>
                    <div v-else-if="drawingFetchSuccess && drawingModels.length > 0" class="mt-1 text-xs text-green-600 flex items-center gap-1 font-medium">
                      <Check class="w-3 h-3" />
                      成功获取 {{ drawingModels.length }} 个模型
                    </div>
                    <div v-else-if="isLoadingDrawingModels" class="mt-1 text-xs text-marisa-gold-dim font-medium">
                      正在获取模型列表...
                    </div>
                  </div>

                  <!-- NovelAI Specific Fields -->
                  <div v-else class="space-y-4 pt-2 border-t border-izakaya-wood/10">
                    <div class="space-y-1">
                        <label class="block text-sm font-bold text-izakaya-wood font-display flex justify-between items-center">
                          <span>模型名称 (Model)</span>
                          <button 
                            type="button"
                            @click.stop.prevent="testNovelAI"
                            :disabled="isTestingNovelAI"
                            class="text-[10px] px-2 py-0.5 bg-touhou-red/10 hover:bg-touhou-red/20 text-touhou-red border border-touhou-red/20 rounded transition-all flex items-center gap-1"
                          >
                            <div v-if="isTestingNovelAI" class="w-2 h-2 animate-spin rounded-full border border-touhou-red border-t-transparent"></div>
                            {{ isTestingNovelAI ? '测试中...' : '测试模型连接' }}
                          </button>
                        </label>
                        <div class="flex flex-col sm:flex-row gap-2">
                          <select 
                            v-model="settingsStore.drawingConfig.model" 
                            class="flex-1 min-w-0 px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-sm text-izakaya-wood"
                          >
                            <option value="nai-diffusion-4.5-full">NovelAI Diffusion V4.5 Full</option>
                            <option value="nai-diffusion-4.5-curated">NovelAI Diffusion V4.5 Curated</option>
                            <option value="nai-diffusion-4-full">NovelAI Diffusion V4 Full</option>
                            <option value="nai-diffusion-4-curated">NovelAI Diffusion V4 Curated</option>
                            <option value="nai-diffusion-3">NovelAI Diffusion V3</option>
                            <option value="nai-diffusion-furry-3">NovelAI Diffusion Furry V3</option>
                            <option value="custom">-- 手动输入模型 ID --</option>
                          </select>
                          <input 
                            v-if="isCustomNovelAIModel"
                            type="text"
                            v-model="settingsStore.drawingConfig.model"
                            placeholder="输入模型 ID"
                            class="flex-1 min-w-0 px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-sm text-izakaya-wood"
                          >
                        </div>
                        
                        <!-- Test Results -->
                        <div v-if="novelAITestStatus === 'success'" class="text-[10px] text-green-600 flex items-center gap-1 mt-1 font-bold">
                          <Check class="w-3 h-3" /> 连接成功！该模型 ID 可用。
                        </div>
                        <div v-else-if="novelAITestStatus === 'error'" class="text-[10px] text-touhou-red flex items-center gap-1 mt-1 font-bold">
                          <AlertCircle class="w-3 h-3" /> {{ novelAITestError }}
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1">
                            <label class="block text-sm font-bold text-izakaya-wood font-display">宽度 (Width)</label>
                            <select v-model.number="settingsStore.drawingConfig.width" class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md font-mono text-sm text-izakaya-wood">
                              <option :value="832">832 (竖屏)</option>
                              <option :value="1216">1216 (横屏)</option>
                              <option :value="1024">1024 (正方形)</option>
                              <option :value="512">512 (小竖屏)</option>
                              <option :value="768">768 (小横屏)</option>
                              <option :value="640">640 (小正方形)</option>
                            </select>
                        </div>
                        <div class="space-y-1">
                            <label class="block text-sm font-bold text-izakaya-wood font-display">高度 (Height)</label>
                            <select v-model.number="settingsStore.drawingConfig.height" class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md font-mono text-sm text-izakaya-wood">
                              <option :value="1216">1216 (竖屏)</option>
                              <option :value="832">832 (横屏)</option>
                              <option :value="1024">1024 (正方形)</option>
                              <option :value="768">768 (小竖屏)</option>
                              <option :value="512">512 (小横屏)</option>
                              <option :value="640">640 (小正方形)</option>
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1">
                            <label class="block text-sm font-bold text-izakaya-wood font-display">采样步数 (Steps)</label>
                            <input 
                              type="number" 
                              min="1" 
                              max="50" 
                              v-model.number="settingsStore.drawingConfig.steps" 
                              class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md font-mono text-sm text-izakaya-wood focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all"
                            >
                            <p class="text-[10px] text-izakaya-wood/40 font-serif">范围: 1 - 50</p>
                        </div>
                        <div class="space-y-1">
                            <label class="block text-sm font-bold text-izakaya-wood font-display">提示词相关性 (Scale)</label>
                            <input 
                              type="number" 
                              min="0" 
                              max="31" 
                              step="0.1" 
                              v-model.number="settingsStore.drawingConfig.scale" 
                              class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md font-mono text-sm text-izakaya-wood focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all"
                            >
                            <p class="text-[10px] text-izakaya-wood/40 font-serif">范围: 0 - 31.0</p>
                        </div>
                    </div>

                    <div class="space-y-1">
                        <label class="block text-sm font-bold text-izakaya-wood font-display">采样器 (Sampler)</label>
                        <select v-model="settingsStore.drawingConfig.sampler" class="w-full px-3 py-2 bg-white/60 border border-izakaya-wood/20 rounded-md font-mono text-sm text-izakaya-wood">
                            <option value="k_euler_ancestral">k_euler_ancestral (推荐)</option>
                            <option value="k_euler">k_euler</option>
                            <option value="k_dpmpp_2m">k_dpmpp_2m</option>
                            <option value="k_dpmpp_sde">k_dpmpp_sde</option>
                            <option value="k_dpmpp_2s_ancestral">k_dpmpp_2s_ancestral</option>
                            <option value="k_dpmpp_3m_sde">k_dpmpp_3m_sde</option>
                            <option value="k_dpm_2">k_dpm_2</option>
                            <option value="k_dpm_2_ancestral">k_dpm_2_ancestral</option>
                            <option value="k_uni_pc">k_uni_pc</option>
                            <option value="k_uni_pc_bh2">k_uni_pc_bh2</option>
                            <option value="ddim">ddim</option>
                        </select>
                    </div>
                  </div>
                </div>
             </div>
          </div>

          <!-- Summary Settings -->
          <div v-show="activeTab === 'summary'" class="space-y-6 animate-fade-in">
            <div class="bg-white/40 p-4 rounded-lg border border-izakaya-wood/10">
              <h3 class="font-display font-bold text-lg mb-2 flex items-center gap-2 text-izakaya-wood">
                <FileText class="w-5 h-5 text-touhou-red" />
                总结配置
              </h3>
              <p class="text-sm text-izakaya-wood/70 mb-4 font-serif">
                大总结功能将调用 LLM #1（对话模型）对近期剧情进行全方位的回顾与总结。
              </p>
              
              <div class="space-y-2">
                <label class="block text-sm font-bold text-izakaya-wood font-display">包含最近对话轮数</label>
                <div class="flex items-center gap-4">
                  <input 
                    type="range" 
                    v-model.number="summaryTurnCount" 
                    min="5" 
                    max="100" 
                    step="5"
                    class="flex-1 h-2 bg-izakaya-wood/10 rounded-lg appearance-none cursor-pointer accent-touhou-red"
                  >
                  <span class="w-12 text-center font-bold font-display bg-white/50 px-2 py-1 rounded text-izakaya-wood">{{ summaryTurnCount }}</span>
                </div>
                <p class="text-xs text-izakaya-wood/50 font-serif">
                  从当前回合倒推，读取最近 {{ summaryTurnCount }} 轮对话内容作为总结依据。
                </p>
              </div>
            </div>

            <div class="flex justify-center mt-8">
              <button 
                @click="handleStartSummary"
                class="px-8 py-3 bg-izakaya-wood hover:bg-izakaya-wood/90 text-white rounded-full font-display text-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2"
              >
                <FileText class="w-5 h-5" />
                开始生成总结
              </button>
            </div>
          </div>

          <!-- Audio Settings -->
          <div v-show="activeTab === 'audio'" class="space-y-6 animate-fade-in">
            <div>
              <h3 class="text-base font-bold font-display text-izakaya-wood mb-4 flex items-center gap-2">
                <Music class="w-5 h-5 text-touhou-red" />
                音效与交互配置
              </h3>
              
              <div class="space-y-6">
                <!-- Master Switch -->
                <div class="flex items-center justify-between p-4 border border-izakaya-wood/10 rounded-lg bg-white/30">
                  <div>
                    <div class="font-bold text-izakaya-wood font-display">启用音效</div>
                    <div class="text-xs text-izakaya-wood/60 font-serif">开启或关闭所有界面交互音效</div>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" v-model="settingsStore.enableAudio" class="sr-only peer">
                    <div class="w-11 h-6 bg-izakaya-wood/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-touhou-red"></div>
                  </label>
                </div>

                <!-- Volume Slider -->
                <div class="space-y-2" :class="{ 'opacity-50 pointer-events-none': !settingsStore.enableAudio }">
                   <div class="flex justify-between items-center">
                      <label class="text-sm font-bold text-izakaya-wood font-display">主音量</label>
                      <span class="text-xs font-mono text-izakaya-wood/70">{{ Math.round(settingsStore.audioVolume * 100) }}%</span>
                   </div>
                   <div class="flex items-center gap-3">
                      <VolumeX class="w-4 h-4 text-izakaya-wood/40" />
                      <input 
                        v-model.number="settingsStore.audioVolume" 
                        @change="handleVolumeChangeTest"
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05"
                        class="w-full h-2 bg-izakaya-wood/10 rounded-lg appearance-none cursor-pointer accent-touhou-red"
                      >
                      <Volume2 class="w-4 h-4 text-izakaya-wood/40" />
                   </div>
                </div>

                <!-- BGM Volume Slider -->
                <div class="space-y-2" :class="{ 'opacity-50 pointer-events-none': !settingsStore.enableAudio }">
                   <div class="flex justify-between items-center">
                      <label class="text-sm font-bold text-izakaya-wood font-display">背景音乐音量</label>
                      <span class="text-xs font-mono text-izakaya-wood/70">{{ Math.round(settingsStore.bgmVolume * 100) }}%</span>
                   </div>
                   <div class="flex items-center gap-3">
                      <Music class="w-4 h-4 text-izakaya-wood/40" />
                      <input 
                        v-model.number="settingsStore.bgmVolume" 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05"
                        class="w-full h-2 bg-izakaya-wood/10 rounded-lg appearance-none cursor-pointer accent-touhou-red"
                      >
                      <Music class="w-4 h-4 text-izakaya-wood/40" />
                   </div>
                </div>
                
                <!-- SFX Volume Slider -->
                <div class="space-y-2" :class="{ 'opacity-50 pointer-events-none': !settingsStore.enableAudio }">
                   <div class="flex justify-between items-center">
                      <label class="text-sm font-bold text-izakaya-wood font-display">音效音量</label>
                      <span class="text-xs font-mono text-izakaya-wood/70">{{ Math.round(settingsStore.sfxVolume * 100) }}%</span>
                   </div>
                   <div class="flex items-center gap-3">
                      <VolumeX class="w-4 h-4 text-izakaya-wood/40" />
                      <input 
                        v-model.number="settingsStore.sfxVolume" 
                        @change="handleVolumeChangeTest"
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05"
                        class="w-full h-2 bg-izakaya-wood/10 rounded-lg appearance-none cursor-pointer accent-touhou-red"
                      >
                      <Volume2 class="w-4 h-4 text-izakaya-wood/40" />
                   </div>
                </div>

                <div class="text-sm text-izakaya-wood/70 bg-amber-50/50 border border-amber-100 p-3 rounded text-justify font-serif">
                   <span class="font-bold text-amber-600 font-display">提示：</span> 
                   现在的音效是使用 Web Audio API 实时生成的程序化音效，无需下载音频文件。包括书写声、点击声和环境氛围音。
                </div>
              </div>
            </div>
          </div>

          <!-- Debug Settings -->
          <div v-show="activeTab === 'debug'" class="space-y-6 animate-fade-in">
            <div class="bg-white/40 p-4 rounded-lg border border-izakaya-wood/10">
              <h3 class="font-display font-bold text-lg mb-2 text-izakaya-wood">调试工具</h3>
              <div class="space-y-4">
                <div class="p-3 border border-izakaya-wood/10 rounded-lg bg-white/30">
                  <div class="font-bold text-sm text-izakaya-wood font-display mb-2">居酒屋经营模式</div>
                  <button @click="triggerManagementMiniGame" class="btn-touhou w-full justify-center">
                    触发居酒屋经营小游戏 (Debug)
                  </button>
                  <p class="mt-2 text-xs text-izakaya-wood/60 font-serif">
                    强制触发经营小游戏模式。这将初始化经营状态并覆盖当前场景。
                  </p>
                </div>

                <div class="p-3 border border-izakaya-wood/10 rounded-lg bg-white/30">
                   <div class="font-bold text-sm text-izakaya-wood font-display mb-2">生成新瓦片地图</div>
                   <div class="mb-2">
                     <label class="block text-xs font-bold text-izakaya-wood mb-1">地图描述 / 提示词</label>
                     <textarea 
                       v-model="mapGenerationPrompt" 
                       rows="2"
                       class="w-full bg-white/50 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-xs text-izakaya-wood placeholder:text-izakaya-wood/30"
                       placeholder="e.g. A small cozy izakaya with 4 tables..."
                     ></textarea>
                   </div>
                   <button 
                     @click="handleGenerateMap" 
                     class="btn-touhou w-full justify-center"
                     :disabled="isGeneratingMap"
                   >
                     <RefreshCw v-if="isGeneratingMap" class="w-4 h-4 mr-2 animate-spin" />
                     {{ isGeneratingMap ? '正在生成...' : '生成新瓦片地图 (Debug)' }}
                   </button>
                   <p class="mt-2 text-xs text-izakaya-wood/60 font-serif">
                     根据提示词重新生成瓦片地图，并直接应用到当前游戏中。
                   </p>
                 </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-izakaya-wood/10 flex justify-end gap-2 bg-izakaya-wood/5 rounded-b-xl relative z-10">
        <button @click="handleClose" class="px-4 py-2 text-sm text-izakaya-wood/60 hover:text-izakaya-wood transition-colors font-display font-medium">
          取消
        </button>
        <button @click="handleSave" class="btn-touhou text-sm">
          <Save class="w-4 h-4" />
          保存配置
        </button>
      </div>

    </div>
  </div>
</template>
