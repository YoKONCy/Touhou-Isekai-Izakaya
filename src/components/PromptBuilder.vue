<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePromptStore, type PromptBlock } from '@/stores/prompt';
import draggable from 'vuedraggable';
import {
  GripVertical,
  Eye,
  EyeOff,
  Edit,
  X,
  Save,
  RotateCcw,
  Play,
  Bug,
  Plus,
  Trash2,
  ArrowLeft
} from 'lucide-vue-next';
import PromptDebugger from './PromptDebugger.vue';
import { useConfirm } from '@/utils/confirm';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const promptStore = usePromptStore();
const { confirm } = useConfirm();
const isDebuggerOpen = ref(false);
const isDebugMode = ref(false); // Controls drag-and-drop and other debug features

// Edit mode state
const editingBlock = ref<PromptBlock | null>(null);
const editingOptionId = ref<string | null>(null);
const editContent = ref('');
const editMetadata = ref<any>({});
const mobileShowEditor = ref(false); // Mobile: show editor panel

function handleEdit(block: PromptBlock, optionId?: string) {
  editingBlock.value = block;
  editingOptionId.value = optionId || null;

  if (optionId) {
    const opt = block.options?.find((o) => o.id === optionId);
    editContent.value = opt?.content || '';
  } else {
    editContent.value = block.content || '';
  }

  editMetadata.value = block.metadata ? { ...block.metadata } : {};
  mobileShowEditor.value = true; // Mobile: show editor
}

function handleMobileBack() {
  mobileShowEditor.value = false;
}

function handleSaveContent() {
  if (editingBlock.value) {
    if (editingOptionId.value) {
      promptStore.updateOptionContent(
        editingBlock.value.id,
        editingOptionId.value,
        editContent.value
      );
    } else {
      promptStore.updateBlockContent(editingBlock.value.id, editContent.value, editMetadata.value);
    }
    editingBlock.value = null;
    editingOptionId.value = null;
  }
}

async function handleAddOption(blockId: string) {
  const name = window.prompt('请输入新文风选项的名称:');
  if (name) {
    promptStore.addOption(blockId, name, '在此输入文风 Prompt 内容...');
  }
}

async function handleDeleteOption(blockId: string, optionId: string) {
  if (await confirm('确定要删除这个文风选项吗？', { destructive: true })) {
    promptStore.deleteOption(blockId, optionId);
  }
}

async function handleReset() {
  if (await confirm('确定要重置所有积木配置吗？这将恢复默认顺序和内容。', { destructive: true })) {
    promptStore.resetToDefault();
  }
}

// Drag options
const dragOptions = computed(() => ({
  animation: 200,
  group: 'description',
  disabled: !isDebugMode.value,
  ghostClass: 'ghost'
}));
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-izakaya-wood/30 backdrop-blur-sm p-4 animate-fade-in"
  >
    <div
      class="bg-izakaya-paper w-full max-w-4xl h-[85vh] rounded-xl shadow-paper flex flex-col overflow-hidden border border-izakaya-wood/10 relative"
    >
      <!-- Texture -->
      <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-rice-paper"></div>

      <!-- Header -->
      <div
        class="flex items-center justify-between p-4 border-b border-izakaya-wood/10 bg-white/40 relative z-10"
      >
        <h2 class="text-lg font-bold font-display text-izakaya-wood flex items-center gap-2">
          <span class="text-touhou-red text-xl">🧩</span>
          提示词拼接中心
        </h2>
        <div class="flex items-center gap-2">
          <button
            @click="isDebuggerOpen = true"
            class="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-md text-sm font-medium transition-colors flex items-center gap-1 shadow-sm"
          >
            <Play class="w-4 h-4" />
            预览生成结果
          </button>
          <button
            @click="isDebugMode = !isDebugMode"
            class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 border shadow-sm"
            :class="
              isDebugMode
                ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                : 'bg-white/50 text-izakaya-wood/70 border-izakaya-wood/10 hover:bg-white hover:text-izakaya-wood'
            "
          >
            <Bug class="w-4 h-4" />
            {{ isDebugMode ? '关闭调试' : '开启调试' }}
          </button>
          <button
            @click="handleReset"
            class="px-3 py-1.5 bg-white/50 text-izakaya-wood/70 border border-izakaya-wood/10 hover:bg-white hover:text-izakaya-wood rounded-md text-sm font-medium transition-colors flex items-center gap-1 shadow-sm"
          >
            <RotateCcw class="w-4 h-4" />
            重置
          </button>
          <button
            @click="$emit('close')"
            class="p-1 hover:bg-touhou-red/10 rounded-full text-izakaya-wood/50 hover:text-touhou-red transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 flex flex-col md:flex-row overflow-hidden relative z-10">
        <!-- Left: Builder (Draggable List) - hidden on mobile when editing -->
        <div
          class="flex-1 p-4 md:p-6 overflow-y-auto bg-izakaya-wood/5 custom-scrollbar"
          :class="{ 'hidden md:block': mobileShowEditor }"
          style="-webkit-overflow-scrolling: touch"
        >
          <p class="text-sm text-izakaya-wood/60 mb-4 font-serif">
            开启调试模式后可拖拽调整积木顺序。点击编辑图标可修改静态积木的内容。
          </p>

          <draggable
            v-model="promptStore.blocks"
            item-key="id"
            v-bind="dragOptions"
            handle=".drag-handle"
            @end="promptStore.save()"
            class="space-y-3"
          >
            <template #item="{ element }">
              <div
                class="bg-white/80 backdrop-blur-sm rounded-lg border border-izakaya-wood/10 shadow-sm p-3 flex flex-col gap-3 transition-all hover:shadow-md hover:border-touhou-red/20 group"
                :class="{
                  'opacity-60 grayscale': !element.enabled,
                  'ring-2 ring-touhou-red/30 ring-offset-1': editingBlock?.id === element.id
                }"
              >
                <div class="flex items-center gap-3">
                  <!-- Drag Handle -->
                  <div
                    class="drag-handle p-1 transition-colors rounded hover:bg-izakaya-wood/5"
                    :class="
                      isDebugMode
                        ? 'cursor-move text-izakaya-wood/40 hover:text-izakaya-wood'
                        : 'cursor-default text-izakaya-wood/10'
                    "
                  >
                    <GripVertical class="w-5 h-5" />
                  </div>

                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <h3 class="font-bold text-izakaya-wood font-display text-sm">
                        {{ element.name }}
                      </h3>
                      <span
                        v-if="element.role === 'system'"
                        class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-50 text-purple-700 border border-purple-100"
                        >SYSTEM</span
                      >
                      <span
                        v-else
                        class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-100"
                        >USER</span
                      >
                    </div>
                    <p class="text-xs text-izakaya-wood/50 truncate font-serif">
                      {{ element.description }}
                    </p>
                  </div>

                  <!-- Actions -->
                  <div
                    class="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity"
                  >
                    <button
                      v-if="
                        element.configurable &&
                        (isDebugMode ||
                          (element.id !== 'system_root' && element.id !== 'experimental_system'))
                      "
                      @click="handleEdit(element)"
                      class="p-2 text-izakaya-wood/50 hover:text-touhou-red hover:bg-touhou-red/5 rounded-md transition-colors"
                      title="编辑内容"
                    >
                      <Edit class="w-4 h-4" />
                    </button>

                    <button
                      @click="promptStore.toggleBlock(element.id)"
                      class="p-2 rounded-md transition-colors"
                      :class="
                        element.enabled
                          ? 'text-green-600 hover:bg-green-50'
                          : 'text-izakaya-wood/30 hover:bg-izakaya-wood/5'
                      "
                      :title="element.enabled ? '已启用' : '已禁用'"
                    >
                      <Eye v-if="element.enabled" class="w-4 h-4" />
                      <EyeOff v-else class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <!-- Sub-options for blocks like Narrative Perspective -->
                <div v-if="element.options && element.enabled" class="pl-9 pr-1 pb-1">
                  <div
                    class="flex flex-wrap gap-2 p-2 bg-izakaya-wood/5 rounded-lg border border-izakaya-wood/5"
                  >
                    <div
                      v-for="opt in element.options"
                      :key="opt.id"
                      class="flex-1 min-w-[100px] relative group/opt"
                    >
                      <button
                        @click.stop="promptStore.updateBlockOption(element.id, opt.id)"
                        class="w-full px-3 py-1.5 rounded-md text-xs border transition-all text-center truncate font-display"
                        :class="
                          (element.selectedOptionId || element.options[0].id) === opt.id
                            ? 'bg-touhou-red text-white border-touhou-red shadow-sm'
                            : 'bg-white text-izakaya-wood/70 border-izakaya-wood/10 hover:bg-white hover:text-touhou-red hover:border-touhou-red/30'
                        "
                      >
                        {{ opt.name }}
                      </button>

                      <!-- Option Edit/Delete (Debug Mode only for Writing Style and System Root) -->
                      <div
                        v-if="
                          isDebugMode &&
                          (element.id === 'writing_style' || element.id === 'system_root')
                        "
                        class="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover/opt:opacity-100 transition-opacity"
                      >
                        <button
                          @click.stop="handleEdit(element, opt.id)"
                          class="p-1 bg-white border border-izakaya-wood/10 rounded-full text-izakaya-wood/50 hover:text-touhou-red shadow-sm"
                          title="编辑选项内容"
                        >
                          <Edit class="w-3 h-3" />
                        </button>
                        <button
                          v-if="
                            opt.id.startsWith('custom_') ||
                            (element.id === 'writing_style' && opt.id.startsWith('custom_'))
                          "
                          @click.stop="handleDeleteOption(element.id, opt.id)"
                          class="p-1 bg-white border border-izakaya-wood/10 rounded-full text-izakaya-wood/50 hover:text-touhou-red shadow-sm"
                          title="删除选项"
                        >
                          <Trash2 class="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <!-- Add Option Button (Debug Mode only for Writing Style) -->
                    <button
                      v-if="isDebugMode && element.id === 'writing_style'"
                      @click="handleAddOption(element.id)"
                      class="px-3 py-1.5 rounded-md text-xs border border-dashed border-izakaya-wood/20 text-izakaya-wood/40 hover:text-touhou-red hover:border-touhou-red/30 hover:bg-white transition-all flex items-center justify-center gap-1 min-w-[60px]"
                      title="添加自定义选项"
                    >
                      <Plus class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </draggable>
        </div>

        <!-- Right: Editor (Context) - fullscreen on mobile when editing -->
        <div
          class="md:w-1/3 bg-white/60 md:border-l border-izakaya-wood/10 flex flex-col backdrop-blur-sm"
          :class="{
            'hidden md:flex': !mobileShowEditor,
            'absolute inset-0 md:relative md:inset-auto z-30 bg-izakaya-paper': mobileShowEditor
          }"
        >
          <div v-if="editingBlock" class="flex flex-col h-full">
            <div
              class="p-3 md:p-4 border-b border-izakaya-wood/10 bg-white/40 flex justify-between items-center gap-2"
            >
              <!-- Mobile back button -->
              <button
                @click="handleMobileBack"
                class="md:hidden p-2 -ml-2 hover:bg-stone-200 rounded-lg transition-colors"
              >
                <ArrowLeft class="w-5 h-5 text-izakaya-wood" />
              </button>
              <span class="font-bold font-display text-sm text-izakaya-wood flex-1 truncate">
                编辑: {{ editingBlock.name }}
                <span v-if="editingOptionId" class="text-xs font-normal opacity-50 ml-1">
                  - {{ editingBlock.options?.find((o) => o.id === editingOptionId)?.name }}
                </span>
              </span>
              <button
                @click="handleSaveContent"
                class="text-xs bg-touhou-red text-white px-3 py-1.5 rounded hover:bg-red-700 flex items-center gap-1 shadow-sm transition-colors flex-shrink-0"
              >
                <Save class="w-3 h-3" /> 保存
              </button>
            </div>
            <div class="flex-1 p-3 md:p-4 overflow-hidden flex flex-col">
              <!-- Special UI for User Persona Metadata -->

              <textarea
                v-model="editContent"
                class="flex-1 w-full h-full resize-none border border-izakaya-wood/20 rounded-md p-3 font-mono text-sm bg-white/50 text-izakaya-wood focus:ring-1 focus:ring-touhou-red/30 focus:border-touhou-red/50 outline-none custom-scrollbar transition-all"
                placeholder="在此输入 Prompt 内容..."
              ></textarea>
              <p class="text-xs text-izakaya-wood/40 mt-2 font-serif">
                支持标准文本。对于 System Prompt，请确保指令清晰明确。
              </p>
            </div>
          </div>

          <div
            v-else
            class="flex-1 flex items-center justify-center text-izakaya-wood/30 p-8 text-center"
          >
            <div>
              <Edit class="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p class="font-display">点击左侧列表中的编辑图标<br />以修改积木内容</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Nested Debugger -->
    <PromptDebugger :is-open="isDebuggerOpen" @close="isDebuggerOpen = false" />
  </div>
</template>

<style scoped>
.ghost {
  opacity: 0.5;
  background: rgba(255, 255, 255, 0.5);
  border: 2px dashed #d1d5db;
}
</style>
