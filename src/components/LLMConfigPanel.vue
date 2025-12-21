<template>
  <div class="relative overflow-hidden space-y-4 border border-izakaya-wood/10 p-4 rounded-lg bg-white/40 backdrop-blur-sm shadow-sm transition-all hover:shadow-md hover:border-izakaya-wood/20 group/panel">
    <!-- Texture Overlay -->
    <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-rice-paper z-0"></div>

    <div class="relative z-10 flex items-center justify-between">
      <h3 class="font-bold font-display text-izakaya-wood flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full bg-touhou-red opacity-60"></span>
        {{ label }}
      </h3>
      <label class="flex items-center gap-2 text-sm cursor-pointer select-none group/toggle">
        <div class="relative flex items-center">
          <input type="checkbox" v-model="config.useGlobal" class="peer sr-only">
          <div class="w-9 h-5 bg-izakaya-wood/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-touhou-red/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-touhou-red"></div>
        </div>
        <span class="text-izakaya-wood/70 group-hover/toggle:text-izakaya-wood transition-colors font-medium text-xs">使用全局配置</span>
      </label>
    </div>

    <!-- Independent Provider Settings -->
    <div v-if="!config.useGlobal" class="relative z-10 space-y-3 animate-fade-in">
      <div>
        <label class="block text-xs font-bold text-izakaya-wood/60 mb-1 font-display">API Base URL</label>
        <input 
          v-model="config.provider.baseUrl" 
          @input="debouncedSave"
          type="text" 
          class="w-full text-sm bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-izakaya-wood placeholder:text-izakaya-wood/30"
          placeholder="https://api.openai.com/v1"
        >
      </div>
      <div>
        <label class="block text-xs font-bold text-izakaya-wood/60 mb-1 font-display">API Key</label>
        <input 
          v-model="config.provider.apiKey" 
          @input="debouncedSave"
          type="password" 
          class="w-full text-sm bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-izakaya-wood placeholder:text-izakaya-wood/30"
          placeholder="sk-..."
        >
      </div>
      <div>
        <label class="block text-xs font-bold text-izakaya-wood/60 mb-1 font-display">模型</label>
        <div class="flex gap-2">
          <select 
            v-model="config.model" 
            @change="debouncedSave"
            class="flex-1 min-w-0 text-sm bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-izakaya-wood"
          >
            <option value="">请选择模型</option>
            <option v-for="model in models" :key="model.id" :value="model.id">
              {{ model.id }}
            </option>
          </select>
          <button 
            @click="refreshModels"
            :disabled="isLoadingModels || !effectiveBaseUrl || !effectiveApiKey"
            class="shrink-0 px-3 py-2 text-sm bg-marisa-gold hover:bg-marisa-gold-light disabled:bg-izakaya-wood/20 disabled:text-izakaya-wood/40 text-izakaya-wood font-bold rounded-md transition-all shadow-sm flex items-center gap-1 border border-marisa-gold/20"
            title="获取模型列表"
          >
            <RefreshCw v-if="!isLoadingModels" class="w-4 h-4" />
            <div v-else class="w-4 h-4 animate-spin rounded-full border-2 border-izakaya-wood border-t-transparent"></div>
          </button>
        </div>
        <!-- Status Messages -->
        <div v-if="fetchError" class="mt-1 text-xs text-touhou-red flex items-center gap-1 font-medium">
          <AlertCircle class="w-3 h-3" />
          {{ fetchError }}
        </div>
        <div v-else-if="fetchSuccess && models.length > 0" class="mt-1 text-xs text-green-600 flex items-center gap-1 font-medium">
          <Check class="w-3 h-3" />
          成功获取 {{ models.length }} 个模型
        </div>
        <div v-else-if="isLoadingModels" class="mt-1 text-xs text-marisa-gold-dim font-medium">
          正在获取模型列表...
        </div>
      </div>
    </div>

    <!-- Global Provider Settings -->
    <div v-else class="relative z-10 space-y-3">
      <div>
        <label class="block text-xs font-bold text-izakaya-wood/60 mb-1 font-display">模型</label>
        <div class="flex gap-2">
          <select 
            v-model="config.model" 
            class="flex-1 min-w-0 text-sm bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-izakaya-wood"
          >
            <option value="">请选择模型</option>
            <option v-for="model in models" :key="model.id" :value="model.id">
              {{ model.id }}
            </option>
          </select>
          <button 
            @click="refreshModels"
            :disabled="isLoadingModels || !effectiveBaseUrl || !effectiveApiKey"
            class="shrink-0 px-3 py-2 text-sm bg-marisa-gold hover:bg-marisa-gold-light disabled:bg-izakaya-wood/20 disabled:text-izakaya-wood/40 text-izakaya-wood font-bold rounded-md transition-all shadow-sm flex items-center gap-1 border border-marisa-gold/20"
            title="获取模型列表"
          >
            <RefreshCw v-if="!isLoadingModels" class="w-4 h-4" />
            <div v-else class="w-4 h-4 animate-spin rounded-full border-2 border-izakaya-wood border-t-transparent"></div>
          </button>
        </div>
        <!-- Status Messages -->
        <div v-if="fetchError" class="mt-1 text-xs text-touhou-red flex items-center gap-1 font-medium">
          <AlertCircle class="w-3 h-3" />
          {{ fetchError }}
        </div>
        <div v-else-if="fetchSuccess && models.length > 0" class="mt-1 text-xs text-green-600 flex items-center gap-1 font-medium">
          <Check class="w-3 h-3" />
          成功获取 {{ models.length }} 个模型
        </div>
        <div v-else-if="isLoadingModels" class="mt-1 text-xs text-marisa-gold-dim font-medium">
          正在获取模型列表...
        </div>
      </div>
    </div>

    <!-- Max Context Tokens (Only for Chat) -->
    <div v-if="configKey === 'chat'" class="pt-2 border-t border-izakaya-wood/10">
       <label class="block text-xs font-bold text-izakaya-wood/60 mb-1 font-display">上下文最大 Token 数</label>
       <div class="flex items-center gap-2">
         <input 
            v-model.number="config.maxContextTokens" 
            type="number" 
            class="w-32 text-sm bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-izakaya-wood placeholder:text-izakaya-wood/30"
            placeholder="128000"
         >
         <span class="text-xs text-izakaya-wood/40 font-serif">设置发送给模型的最大上下文长度 (Est.)</span>
       </div>
    </div>

    <!-- Word Count Settings (Only for Chat) -->
    <div v-if="configKey === 'chat'" class="pt-2 border-t border-izakaya-wood/10">
       <label class="block text-xs font-bold text-izakaya-wood/60 mb-1 font-display">回复字数控制</label>
       <div class="flex items-center gap-2">
        <input 
           v-model.number="config.minWordCount" 
           @input="debouncedSave"
           type="number" 
           class="w-24 text-sm bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-izakaya-wood placeholder:text-izakaya-wood/30"
           placeholder="800"
        >
        <span class="text-xs text-izakaya-wood/60">-</span>
        <input 
           v-model.number="config.maxWordCount" 
           @input="debouncedSave"
           type="number" 
           class="w-24 text-sm bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-izakaya-wood placeholder:text-izakaya-wood/30"
           placeholder="1200"
        >
        <span class="text-xs text-izakaya-wood/40 font-serif">字 (不含COT)</span>
      </div>
    </div>

    <!-- Advanced Settings Toggle -->
    <div class="pt-2 border-t border-izakaya-wood/10">
      <button @click="showAdvanced = !showAdvanced" class="flex items-center gap-1 text-xs font-bold text-izakaya-wood/50 hover:text-touhou-red transition-colors font-display group/advanced">
        <ChevronRight v-if="!showAdvanced" class="w-3 h-3 group-hover/advanced:translate-x-0.5 transition-transform" />
        <ChevronDown v-else class="w-3 h-3" />
        高级设置
      </button>
    </div>

    <div v-if="showAdvanced" class="space-y-4 pt-2 pl-2 border-l-2 border-izakaya-wood/10 ml-1">
       <!-- Stream & Timeout -->
       <div class="grid grid-cols-2 gap-4">
          <!-- Stream -->
          <div class="flex items-center justify-between">
             <label class="text-xs font-medium text-izakaya-wood/70 font-display">流式传输 (Stream)</label>
             <input type="checkbox" v-model="config.stream" @change="debouncedSave" class="rounded text-touhou-red focus:ring-touhou-red border-izakaya-wood/30">
          </div>
          <!-- Timeout -->
          <div>
             <label class="block text-xs font-medium text-izakaya-wood/70 mb-1 font-display">超时 (秒)</label>
             <input 
               type="number" 
               v-model.number="timeoutSeconds" 
               class="w-full text-sm bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-izakaya-wood"
             >
          </div>
       </div>

       <!-- Parameters -->
       <div class="grid grid-cols-2 gap-4">
          <!-- Temperature -->
          <div>
             <label class="block text-xs font-medium text-izakaya-wood/70 mb-1 font-display">Temperature</label>
             <input 
               type="number" 
               step="0.1" 
               v-model.number="config.temperature" 
               @input="debouncedSave"
               class="w-full text-sm bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-izakaya-wood"
               placeholder="0.7"
             >
          </div>
          <!-- Top P -->
           <div>
             <label class="block text-xs font-medium text-izakaya-wood/70 mb-1 font-display">Top P</label>
             <input 
               type="number" 
               step="0.1" 
               v-model.number="config.top_p" 
               @input="debouncedSave"
               class="w-full text-sm bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-izakaya-wood"
               placeholder="1.0"
             >
          </div>
          <!-- Freq Penalty -->
           <div>
             <label class="block text-xs font-medium text-izakaya-wood/70 mb-1 font-display">Frequency Penalty</label>
             <input 
               type="number" 
               step="0.1" 
               v-model.number="config.frequency_penalty" 
               @input="debouncedSave"
               class="w-full text-sm bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-izakaya-wood"
               placeholder="0.0"
             >
          </div>
          <!-- Presence Penalty -->
           <div>
             <label class="block text-xs font-medium text-izakaya-wood/70 mb-1 font-display">Presence Penalty</label>
             <input 
               type="number" 
               step="0.1" 
               v-model.number="config.presence_penalty" 
               @input="debouncedSave"
               class="w-full text-sm bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-izakaya-wood"
               placeholder="0.0"
             >
          </div>
       </div>

       <!-- Chat Specific: History Turns -->
       <div v-if="configKey === 'chat'" class="pt-2 border-t border-izakaya-wood/10 mt-2">
           <label class="block text-xs font-medium text-izakaya-wood/70 mb-1 font-display">记忆轮次 (History Turns)</label>
           <div class="flex items-center gap-2">
             <input 
               type="number" 
               v-model.number="config.historyTurns" 
               class="w-24 text-sm bg-white/60 border border-izakaya-wood/20 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:border-touhou-red/50 focus:ring-1 focus:ring-touhou-red/20 transition-all font-mono text-izakaya-wood"
               placeholder="10"
             >
             <span class="text-xs text-izakaya-wood/40 font-serif">读取最近 N 轮对话作为上下文</span>
           </div>
       </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { RefreshCw, Check, AlertCircle, ChevronRight, ChevronDown } from 'lucide-vue-next';
import { useSettingsStore } from '@/stores/settings';
import { fetchModels, type ModelInfo } from '@/services/llm';

const props = defineProps<{
  configKey: 'chat' | 'logic' | 'memory' | 'misc' | 'drawing';
  label: string;
}>();

const settingsStore = useSettingsStore();
const config = computed(() => settingsStore.llmConfigs[props.configKey]!);
const globalProvider = computed(() => settingsStore.globalProvider);

const models = ref<ModelInfo[]>([]);
const isLoadingModels = ref(false);
const fetchError = ref('');
const fetchSuccess = ref(false);
const showAdvanced = ref(false);

const timeoutSeconds = computed({
  get: () => (config.value.timeout || 300000) / 1000,
  set: (val) => {
    const newTimeout = val * 1000;
    if (config.value.timeout !== newTimeout) {
      config.value.timeout = newTimeout;
      debouncedSave();
    }
  }
});

const effectiveBaseUrl = computed(() => {
  if (config.value.useGlobal) {
    return globalProvider.value.baseUrl;
  }
  return config.value.provider?.baseUrl || '';
});

const effectiveApiKey = computed(() => {
  if (config.value.useGlobal) {
    return globalProvider.value.apiKey;
  }
  return config.value.provider?.apiKey || '';
});

// Debounced save function
let saveTimeout: NodeJS.Timeout | null = null;
function debouncedSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    settingsStore.updateLLMConfig(props.configKey as 'chat' | 'logic' | 'memory' | 'misc' | 'drawing', config.value);
  }, 500);
}

// Fetch models when config changes
watch([effectiveBaseUrl, effectiveApiKey], async ([baseUrl, apiKey]) => {
  if (baseUrl && apiKey) {
    await loadModels();
  }
}, { immediate: true });

async function loadModels() {
  if (!effectiveBaseUrl.value || !effectiveApiKey.value) {
    models.value = [];
    fetchError.value = '';
    fetchSuccess.value = false;
    return;
  }

  isLoadingModels.value = true;
  fetchError.value = '';
  fetchSuccess.value = false;

  try {
    const modelList = await fetchModels(effectiveBaseUrl.value, effectiveApiKey.value);
    models.value = modelList;
    fetchError.value = '';
    fetchSuccess.value = true;
  } catch (error: any) {
    console.error('Failed to load models:', error);
    models.value = [];
    fetchError.value = error.message || 'Failed to fetch models';
    fetchSuccess.value = false;
  } finally {
    isLoadingModels.value = false;
  }
}

function refreshModels() {
  loadModels();
}
</script>