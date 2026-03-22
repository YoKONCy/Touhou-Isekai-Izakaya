<script setup lang="ts">
import { ref, watch } from 'vue';
import { X, User, Save, LayoutGrid, Edit3 } from 'lucide-vue-next';
import { PRESET_ORIGINS } from '@/constants/presets';
import { audioManager } from '@/services/audio';

const props = defineProps<{
  isOpen: boolean;
  initialData: {
    name: string;
    identity: string;
    persona: string;
    power: string;
    hp?: number;
    mp?: number;
    money?: number;
  };
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (
    e: 'save',
    data: {
      name: string;
      identity: string;
      persona: string;
      power: string;
      hp: number;
      mp: number;
      money: number;
    }
  ): void;
}>();

const activeTab = ref<'custom' | 'preset'>('custom');

const formData = ref({
  name: '',
  identity: '',
  persona: '',
  power: 'E',
  hp: 100,
  mp: 50,
  money: 500
});

// Initialize form data when opened
watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      formData.value = {
        name: props.initialData.name,
        identity: props.initialData.identity,
        persona: props.initialData.persona,
        power: props.initialData.power,
        hp: props.initialData.hp ?? 100,
        mp: props.initialData.mp ?? 50,
        money: props.initialData.money ?? 500
      };
    }
  },
  { immediate: true }
);

const handleSave = () => {
  emit('save', formData.value);
  audioManager.playSuccess();
  emit('close');
};

const handleSelectPreset = (preset: any) => {
  // Map preset data to form data
  formData.value.identity = preset.stats.identity || preset.name;
  formData.value.power = preset.stats.power || 'E';
  formData.value.hp = preset.stats.hp || 100;
  formData.value.mp = preset.stats.mp || 50;
  formData.value.money = preset.stats.money || 500;

  // Construct a persona description from the preset setting
  let personaDesc = preset.desc + '\n\n';
  if (preset.setting) {
    for (const [key, value] of Object.entries(preset.setting)) {
      if (typeof value === 'string') {
        personaDesc += `${key}: ${value}\n`;
      } else if (typeof value === 'object') {
        personaDesc += `${key}: ${JSON.stringify(value)}\n`;
      }
    }
  }
  formData.value.persona = personaDesc;

  // Don't overwrite name if user has set one, unless it's empty
  if (!formData.value.name) {
    // formData.value.name = '玩家'; // Maybe don't set a default name from preset as they are generic
  }

  audioManager.playClick();
  activeTab.value = 'custom'; // Switch back to custom tab to review
};

const RANKS = [
  '∞',
  'OMEGA',
  'UX',
  'EX',
  'US',
  'SSS',
  'SS',
  'S+',
  'S',
  'A+',
  'A',
  'B+',
  'B',
  'C+',
  'C',
  'D+',
  'D',
  'E+',
  'E',
  'F+',
  'F',
  'F-'
];
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in"
  >
    <div
      class="bg-izakaya-paper w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] border border-izakaya-wood/20 relative overflow-hidden"
    >
      <!-- Texture -->
      <div
        class="absolute inset-0 pointer-events-none opacity-20 bg-texture-rice-paper mix-blend-multiply"
      ></div>

      <!-- Header -->
      <div
        class="flex items-center justify-between p-4 border-b border-izakaya-wood/10 bg-white/40 relative z-10"
      >
        <h2 class="text-lg font-bold font-display text-izakaya-wood flex items-center gap-2">
          <User class="w-5 h-5 text-touhou-red" />
          客机身份配置
        </h2>
        <button
          @click="$emit('close')"
          class="p-1 hover:bg-touhou-red/10 rounded-full text-izakaya-wood/50 hover:text-touhou-red transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-izakaya-wood/10 bg-white/20 relative z-10">
        <button
          @click="
            activeTab = 'custom';
            audioManager.playSoftClick();
          "
          class="flex-1 py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2 relative"
          :class="
            activeTab === 'custom'
              ? 'text-touhou-red bg-white/60'
              : 'text-izakaya-wood/60 hover:bg-white/40'
          "
        >
          <Edit3 class="w-4 h-4" />
          自定义详情
          <div
            v-if="activeTab === 'custom'"
            class="absolute bottom-0 left-0 right-0 h-0.5 bg-touhou-red"
          ></div>
        </button>
        <button
          @click="
            activeTab = 'preset';
            audioManager.playSoftClick();
          "
          class="flex-1 py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2 relative"
          :class="
            activeTab === 'preset'
              ? 'text-touhou-red bg-white/60'
              : 'text-izakaya-wood/60 hover:bg-white/40'
          "
        >
          <LayoutGrid class="w-4 h-4" />
          选择预设模板
          <div
            v-if="activeTab === 'preset'"
            class="absolute bottom-0 left-0 right-0 h-0.5 bg-touhou-red"
          ></div>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto custom-scrollbar p-6 bg-white/30 relative z-10">
        <!-- Custom Tab -->
        <div v-if="activeTab === 'custom'" class="space-y-5 animate-fade-in">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="text-xs font-bold text-izakaya-wood/60">昵称 (Name)</label>
              <input
                v-model="formData.name"
                type="text"
                placeholder="您的名字"
                class="w-full px-4 py-2.5 bg-white/60 border border-izakaya-wood/10 rounded-xl text-sm outline-none focus:border-touhou-red transition-all"
              />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-bold text-izakaya-wood/60">身份 (Identity)</label>
              <input
                v-model="formData.identity"
                type="text"
                placeholder="例如: 异界魔法师"
                class="w-full px-4 py-2.5 bg-white/60 border border-izakaya-wood/10 rounded-xl text-sm outline-none focus:border-touhou-red transition-all"
              />
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold text-izakaya-wood/60">人设背景 & 性格 (Persona)</label>
            <textarea
              v-model="formData.persona"
              placeholder="简要描述您的背景故事、性格特征或外貌..."
              class="w-full h-48 px-4 py-3 bg-white/60 border border-izakaya-wood/10 rounded-xl text-sm outline-none focus:border-touhou-red transition-all resize-none font-serif-display leading-relaxed"
            ></textarea>
          </div>

          <!-- 基础数值配置 -->
          <div class="p-4 bg-izakaya-wood/5 rounded-2xl border border-izakaya-wood/10 space-y-4">
            <h4
              class="text-xs font-bold text-izakaya-wood/60 uppercase tracking-wider flex items-center gap-2"
            >
              <LayoutGrid class="w-3 h-3" />
              初始基础数值 (Base Stats)
            </h4>
            <div class="grid grid-cols-3 gap-4">
              <div class="space-y-1.5">
                <label class="text-[10px] font-bold text-izakaya-wood/40 flex items-center gap-1">
                  生命值 (HP)
                </label>
                <input
                  v-model.number="formData.hp"
                  type="number"
                  class="w-full px-3 py-1.5 bg-white/80 border border-izakaya-wood/10 rounded-lg text-xs outline-none focus:border-touhou-red transition-all"
                />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] font-bold text-izakaya-wood/40 flex items-center gap-1">
                  灵力值 (MP)
                </label>
                <input
                  v-model.number="formData.mp"
                  type="number"
                  class="w-full px-3 py-1.5 bg-white/80 border border-izakaya-wood/10 rounded-lg text-xs outline-none focus:border-touhou-red transition-all"
                />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] font-bold text-izakaya-wood/40 flex items-center gap-1">
                  初始金钱 (Money)
                </label>
                <input
                  v-model.number="formData.money"
                  type="number"
                  class="w-full px-3 py-1.5 bg-white/80 border border-izakaya-wood/10 rounded-lg text-xs outline-none focus:border-touhou-red transition-all"
                />
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold text-izakaya-wood/60">战斗力 (Rank)</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="rank in ['∞', 'EX', 'S', 'A', 'B', 'C', 'D', 'E', 'F']"
                :key="rank"
                @click="formData.power = rank"
                class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all"
                :class="
                  formData.power === rank
                    ? 'bg-touhou-red text-white border-touhou-red shadow-md'
                    : 'bg-white/40 text-izakaya-wood/60 border-izakaya-wood/10 hover:border-touhou-red/30'
                "
              >
                {{ rank }}
              </button>
              <select
                v-model="formData.power"
                class="px-3 py-1.5 bg-white/60 border border-izakaya-wood/10 rounded-lg text-xs outline-none focus:border-touhou-red ml-auto"
              >
                <option v-for="r in RANKS" :key="r" :value="r">{{ r }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Preset Tab -->
        <div
          v-if="activeTab === 'preset'"
          class="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in"
        >
          <div
            v-for="preset in PRESET_ORIGINS"
            :key="preset.id"
            @click="handleSelectPreset(preset)"
            class="p-4 bg-white/60 border border-izakaya-wood/10 rounded-xl cursor-pointer hover:border-touhou-red hover:shadow-md transition-all group relative overflow-hidden"
          >
            <div class="flex items-start gap-3">
              <div
                class="p-3 bg-touhou-red/5 rounded-full text-touhou-red group-hover:bg-touhou-red group-hover:text-white transition-colors"
              >
                <component :is="preset.icon" class="w-6 h-6" />
              </div>
              <div class="flex-1">
                <h4
                  class="font-bold text-izakaya-wood group-hover:text-touhou-red transition-colors"
                >
                  {{ preset.name }}
                </h4>
                <p class="text-xs text-izakaya-wood/60 mt-1 line-clamp-2">{{ preset.desc }}</p>
              </div>
            </div>
            <div class="mt-3 flex gap-2">
              <span
                class="px-2 py-0.5 bg-izakaya-wood/5 rounded text-[10px] text-izakaya-wood/50 font-bold"
              >
                {{ preset.stats.identity }}
              </span>
              <span
                class="px-2 py-0.5 bg-izakaya-wood/5 rounded text-[10px] text-izakaya-wood/50 font-bold"
              >
                Rank: {{ preset.stats.power }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div
        class="p-4 border-t border-izakaya-wood/10 bg-white/40 flex justify-end gap-3 relative z-10"
      >
        <button
          @click="$emit('close')"
          class="px-5 py-2.5 text-izakaya-wood/60 hover:bg-izakaya-wood/5 rounded-xl text-sm font-bold transition-all"
        >
          取消
        </button>
        <button
          @click="handleSave"
          class="px-6 py-2.5 bg-touhou-red text-white rounded-xl text-sm font-bold shadow-lg shadow-touhou-red/20 hover:bg-touhou-red-dark active:scale-95 transition-all flex items-center gap-2"
        >
          <Save class="w-4 h-4" />
          保存配置
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
