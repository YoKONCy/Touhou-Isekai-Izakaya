<script setup lang="ts">
import { ref, watch } from 'vue';
import { useChatStore } from '@/stores/chat';
import { useSaveStore } from '@/stores/save';
import { useGameStore } from '@/stores/game';
import { audioManager } from '@/services/audio';
import { dbService } from '@/services/DatabaseService';
import { generateCompletion } from '@/services/llm';
import { X, Loader2, Copy, RefreshCw, FileText, Check, Sparkles } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  turnCount?: number;
}>();

const emit = defineEmits(['close']);

const chatStore = useChatStore();
const saveStore = useSaveStore();
const gameStore = useGameStore();

const summary = ref('');
const loading = ref(false);
const error = ref('');
const currentTurnCount = ref(20);
const hasApplied = ref(false);

function handleApplyToPersona() {
  if (!summary.value) return;
  gameStore.state.player.storySummary = summary.value;
  hasApplied.value = true;
  audioManager.playLevelUp();
  setTimeout(() => {
    hasApplied.value = false;
    emit('close');
  }, 1000);
}

// 当属性 props 变更或弹窗开启时，同步更新 currentTurnCount 并触发生成 喵
watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      if (props.turnCount) {
        currentTurnCount.value = props.turnCount;
      }
      // 由于“配置 -> 开始”的流转逻辑，此处默认在开启时自动触发总结生成 喵
      generateSummary();
    }
  }
);

function formatMemoryContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    // 若内容为包含特定字段的对象，执行格式化处理 喵
    if (typeof parsed === 'object' && parsed !== null) {
      if (parsed.name && parsed.content) {
        return `[${parsed.name}] ${parsed.content}`;
      }
      // 针对其他 JSON 结构的后备处理逻辑 喵
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    }
    return content;
  } catch (e) {
    // 非 JSON 格式，按原样返回 喵
    return content;
  }
}

async function generateSummary() {
  if (!props.isOpen) return;

  loading.value = true;
  error.value = '';
  summary.value = '';

  try {
    // 步骤 A：精准提取近期对话记录作为上下文 喵 (Fetch History)
    const recentMessages = chatStore.messages.slice(-currentTurnCount.value);
    const dialogueText = recentMessages
      .map((m) => {
        const role = m.role === 'user' ? '玩家' : m.role === 'assistant' ? 'GM/NPC' : '系统';
        return `${role}: ${m.content}`;
      })
      .join('\n');

    // 步骤 B：从数据库检索核心存档记忆条目 喵 (Fetch Memories)
    if (!saveStore.currentSaveId) throw new Error('No active save');

    const memories = await dbService.getAllMemories(saveStore.currentSaveId);

    // 记忆通常按插入顺序排列，此处暂不执行额外排序 喵

    const summaries = memories
      .filter((m) => m.type === 'summary')
      .map((m) => formatMemoryContent(m.content))
      .join('\n');

    const intelligence = memories
      .filter((m) => m.type === 'intelligence')
      .map((m) => formatMemoryContent(m.content))
      .join('\n');

    const facilities = memories
      .filter((m) => m.type === 'facility')
      .map((m) => formatMemoryContent(m.content))
      .join('\n');

    const alliances = memories
      .filter((m) => m.type === 'alliance')
      .map((m) => formatMemoryContent(m.content))
      .join('\n');

    // 步骤 C：执行结构化 Prompt 指令构建 喵 (Prompt Engineering)
    const prompt = `
请根据以下信息生成一份详细的故事大总结：

【近期对话】
${dialogueText}

【记忆库 - 事件摘要】
${summaries || '暂无'}

【记忆库 - 情报与秘密】
${intelligence || '暂无'}

【设施信息】
${facilities || '暂无'}

【联盟信息】
${alliances || '暂无'}

请生成纯文本的总结，涵盖剧情进展、人物关系变化、关键事件及当前局势。
    `.trim();

    // 步骤 D：发起 LLM 总结服务请求调用 喵 (Service Dispatch)
    // 此处遵循架构约定，强制映射至 Chat 核心驱动 (LLM1) 喵
    const result = await generateCompletion({
      modelType: 'chat',
      systemPrompt: '你是一个负责对故事进行全面总结的助手。请客观、全面地总结当前的故事状态。喵 🐾',
      messages: [{ role: 'user', content: prompt }]
    });

    summary.value = result;
  } catch (e: any) {
    error.value = e.message || '生成总结失败';
    console.error(e);
  } finally {
    // 释放加载锁，生命周期结束 喵
    loading.value = false;
  }
}

function copyToClipboard() {
  navigator.clipboard.writeText(summary.value);
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in"
  >
    <div
      class="bg-izakaya-paper w-full max-w-3xl h-[85vh] flex flex-col rounded-lg shadow-xl border-2 border-izakaya-wood/30 relative overflow-hidden"
    >
      <!-- 顶部标题栏 (Header) 喵 -->
      <div
        class="flex items-center justify-between p-4 border-b border-izakaya-wood/10 bg-white/50 relative z-10"
      >
        <h2 class="font-display text-xl text-izakaya-wood font-bold flex items-center gap-2">
          <FileText class="w-5 h-5" /> 故事大总结
        </h2>
        <button
          @click="emit('close')"
          class="hover:bg-black/5 p-1 rounded transition-colors text-izakaya-wood"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 主体展示区域 (Content) 喵 -->
      <div class="flex-1 overflow-y-auto p-6 relative z-10 bg-white/30">
        <!-- 纸纹纹理蒙层 (Paper Texture) 喵 -->
        <div
          class="absolute inset-0 pointer-events-none opacity-20 bg-texture-rice-paper mix-blend-multiply"
        ></div>

        <div
          v-if="loading"
          class="flex flex-col items-center justify-center h-full gap-4 text-izakaya-wood/60"
        >
          <Loader2 class="w-10 h-10 animate-spin text-touhou-red" />
          <p class="font-serif animate-pulse text-lg">正在回顾历史，撰写总结...</p>
        </div>

        <div
          v-else-if="error"
          class="flex flex-col items-center justify-center h-full gap-4 text-red-600"
        >
          <p class="text-lg">⚠️ {{ error }}</p>
          <button
            @click="generateSummary"
            class="px-4 py-2 bg-white border border-red-200 rounded shadow-sm hover:bg-red-50 transition-colors"
          >
            重试
          </button>
        </div>

        <div
          v-else
          class="prose prose-stone max-w-none font-serif text-ink leading-relaxed whitespace-pre-wrap text-lg"
        >
          {{ summary }}
        </div>
      </div>

      <!-- 底部操作栏 (Footer) 喵 -->
      <div
        class="p-4 border-t border-izakaya-wood/10 bg-white/50 flex justify-end items-center gap-3 relative z-10"
      >
        <button
          v-if="!loading && summary"
          @click="handleApplyToPersona"
          class="mr-auto px-4 py-2 flex items-center gap-2 text-sm font-bold bg-touhou-red/10 text-touhou-red hover:bg-touhou-red/20 rounded-lg transition-all active:scale-95 border border-touhou-red/20"
          :disabled="hasApplied"
        >
          <Check v-if="hasApplied" class="w-4 h-4" />
          <Sparkles v-else class="w-4 h-4" />
          {{ hasApplied ? '已应用到设定' : '应用到角色设定' }}
        </button>

        <button
          v-if="!loading && summary"
          @click="copyToClipboard"
          class="px-4 py-2 flex items-center gap-2 text-sm text-izakaya-wood hover:bg-black/5 rounded transition-colors border border-transparent hover:border-izakaya-wood/10"
        >
          <Copy class="w-4 h-4" /> 复制
        </button>
        <button
          v-if="!loading"
          @click="generateSummary"
          class="px-4 py-2 flex items-center gap-2 text-sm text-izakaya-wood hover:bg-black/5 rounded transition-colors border border-transparent hover:border-izakaya-wood/10"
        >
          <RefreshCw class="w-4 h-4" /> 重新生成
        </button>
        <button
          @click="emit('close')"
          class="px-6 py-2 bg-touhou-red text-white rounded shadow-sm hover:bg-touhou-red-dark transition-colors font-display border-2 border-white/20"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
