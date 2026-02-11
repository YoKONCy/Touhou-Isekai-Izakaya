<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { User, ArrowRight, Check, X, BookUser, Store, Users, Brain, Sparkles, Save, Trash2 } from 'lucide-vue-next';
import { PRESET_ORIGINS, PRESET_LOCATIONS } from '@/constants/presets';

const emit = defineEmits(['complete', 'cancel']);

type StartMode = 'preset' | 'custom';

const mode = ref<StartMode>('preset');
const isStoreStart = ref(false);

// Custom Presets Management
const CUSTOM_ORIGINS_KEY = 'izakaya_custom_origins';
const customOrigins = ref<any[]>([]);

function loadCustomOrigins() {
  try {
    const saved = localStorage.getItem(CUSTOM_ORIGINS_KEY);
    if (saved) {
      customOrigins.value = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load custom origins:', e);
  }
}

function saveCustomOrigins() {
  localStorage.setItem(CUSTOM_ORIGINS_KEY, JSON.stringify(customOrigins.value));
}

function deleteCustomOrigin(id: string) {
  customOrigins.value = customOrigins.value.filter(o => o.id !== id);
  saveCustomOrigins();
  if (formData.originId === id) {
    formData.originId = 'traveler';
  }
}

function saveCurrentAsPreset() {
  const name = prompt('请输入预设名称：', '我的自定义开局');
  if (!name) return;

  const newOrigin = {
    id: 'custom_' + Date.now(),
    name: name,
    desc: '自定义预设：' + (formData.persona ? formData.persona.slice(0, 30) + '...' : '无描述'),
    setting: {
      "详细人设": formData.persona,
      "详细设定": formData.detailedSetting
    },
    stats: { ...formData.customStats },
    icon: Sparkles,
    isCustom: true
  };

  customOrigins.value.push(newOrigin);
  saveCustomOrigins();
  alert('预设保存成功！您可以在“预设开局”中选择它。');
}

loadCustomOrigins();

const steps = computed(() => {
  const baseSteps: { id: string, title: string }[] = [
    { id: 'difficulty_select', title: '世界难度' },
    { id: 'mode_select', title: '开局模式' }
  ];
  
  if (isStoreStart.value) {
    baseSteps.push({ id: 'store_config', title: '店铺配置' });
    baseSteps.push({ id: 'store_staff', title: '员工招募' });
  }

  if (mode.value === 'preset') {
    baseSteps.push({ id: 'origin', title: '出身背景' });
    
    if (!isStoreStart.value) {
      baseSteps.push({ id: 'location_preset', title: '出生地点' });
    }

    baseSteps.push(
      { id: 'profile_preset', title: '身份登记' },
      { id: 'review', title: '确认信息' }
    );
  } else {
    baseSteps.push(
      { id: 'profile_custom', title: '身份登记' },
      { id: 'stats_custom', title: '属性配置' },
      { id: 'review', title: '确认信息' }
    );
  }
  return baseSteps;
});

const currentStepIdx = ref(0);
const currentStep = computed(() => steps.value[currentStepIdx.value] || steps.value[0]!);

// Form Data
const formData = reactive({
  difficulty: 'normal',
  name: '',
  persona: '',
  detailedSetting: '', // For detailed JSON-like setting
  originId: 'traveler',
  presetLocation: '博丽神社',
  // Store Config
  store: {
    name: '',
    location: '人间之里',
    description: '',
    hasStaff: false,
    staffName: '',
    staffBackstoryType: 'custom', // 'custom' | 'random'
    staffBackstory: ''
  },
  // Custom stats
  customStats: {
    money: 1000,
    hp: 100,
    mp: 100,
    power: 'E',
    reputation: 0,
    identity: '流浪者',
    clothing: '普通的便服',
    location: '博丽神社',
    time: '10:00',
    date: '纪元2018年1月1日'
  }
});

// Origins Configuration
const origins = PRESET_ORIGINS;

const allOrigins = computed(() => [...origins, ...customOrigins.value]);

const selectedOrigin = computed(() => allOrigins.value.find(o => o.id === formData.originId)!);

// Validation
const canProceed = computed(() => {
  if (currentStep.value.id === 'store_config') {
    return formData.store.name.trim().length > 0 && formData.store.description.trim().length > 0;
  }
  if (currentStep.value.id === 'store_staff') {
    if (!formData.store.hasStaff) return true;
    if (formData.store.staffName.trim().length === 0) return false;
    if (formData.store.staffBackstoryType === 'custom' && formData.store.staffBackstory.trim().length === 0) return false;
    return true;
  }

  if (currentStep.value.id === 'profile_preset') {
    return formData.name.trim().length > 0;
  }
  if (currentStep.value.id === 'profile_custom') {
    // Basic validation for custom profile
    // Check if name is filled
    if (formData.name.trim().length === 0) return false;
    // Check if persona is filled
    if (formData.persona.trim().length === 0) return false;
    
    // Check if detailedSetting is valid JSON (if filled)
    // We allow empty string, but if filled, must be JSON
    if (formData.detailedSetting.trim().length > 0) {
      try {
        JSON.parse(formData.detailedSetting);
      } catch (e) {
        return false; // Invalid JSON
      }
    }
    return true;
  }
  return true;
});

function next() {
  if (currentStepIdx.value < steps.value.length - 1) {
    currentStepIdx.value++;
  } else {
    finish();
  }
}

function back() {
  if (currentStepIdx.value > 0) {
    currentStepIdx.value--;
  }
}

function selectMode(m: StartMode) {
  mode.value = m;
  // Reset index when changing mode to ensure we don't get out of bounds or weird state
  // But since this is step 0, we just stay at step 0 (actually we need to advance after selection if we treat selection as a step)
  // Current logic: mode selection IS step 0. So we select and then user clicks next.
}

function finish() {
  let finalStats: any = {};

  // Construct initial message for store start
  let initialMessage = '';
  if (isStoreStart.value) {
      initialMessage = `【店铺开局设定】
店铺名：${formData.store.name}
店铺位置：${formData.store.location}
店铺介绍：${formData.store.description}
`;
      if (formData.store.hasStaff) {
          initialMessage += `【开局员工设定】
员工名：${formData.store.staffName}
`;
          if (formData.store.staffBackstoryType === 'random') {
              initialMessage += `相关剧情：(请随机生成一段关于${formData.store.staffName}如何成为员工的剧情)\n`;
          } else {
              initialMessage += `相关剧情：${formData.store.staffBackstory}\n`;
          }
      }
      initialMessage += `\n请根据以上设定，编写一段精彩的开局剧情。${formData.store.hasStaff && formData.store.staffBackstoryType === 'random' ? '并描述员工加入的经过。' : ''}`;
  }
  
  if (mode.value === 'preset') {
    finalStats = {
      ...selectedOrigin.value.stats,
      // Default mp/max_mp if not in origin stats (though we added them)
      max_hp: selectedOrigin.value.stats.hp,
      max_mp: (selectedOrigin.value.stats as any).mp || 100,
      location: isStoreStart.value ? formData.store.location : formData.presetLocation // Override with selected location
    };
    
    // Combine origin setting with persona description if user added any
    // If user added persona text, we can append it or just use the JSON as the main persona.
    // The requirement says: "这些设定将会作为替换内容...自动替换掉占位符{{global_user_setting}}"
    // And also "玩家人设" info needs to be synced.
    // Let's store the JSON string in 'persona' field if it's a preset.
    // If user added extra text, we can add it as a field "用户补充" inside the JSON or append it.
    
    // Let's create a combined object
    const finalPersonaObj = {
      ...(selectedOrigin.value as any).setting,
      "补充设定": formData.persona // User typed text
    };
    
    // If user typed nothing, remove that field
    if (!formData.persona.trim()) {
        delete finalPersonaObj["补充设定"];
    }

    console.log('[NewGameWizard] Emitting complete (preset). isStoreStart:', isStoreStart.value);
    console.log('[NewGameWizard] Store Description:', formData.store.description);
    console.log('[NewGameWizard] Initial Message:', initialMessage);

    emit('complete', {
        name: formData.name,
        difficulty: formData.difficulty,
        persona: JSON.stringify(finalPersonaObj, null, 2), // This will be stored in gameStore.player.persona
        stats: finalStats,
        initialMessage,
        storeDescription: isStoreStart.value ? formData.store.description : undefined
    });
    return;

  } else {
    finalStats = {
      ...formData.customStats,
      max_hp: formData.customStats.hp,
      max_mp: formData.customStats.mp
    };
    
    if (isStoreStart.value) {
      finalStats.location = formData.store.location;
    }
    
    // For custom mode, user types in 'detailedSetting' (JSON friendly)
    // We should validate if it is valid JSON or just treat it as string.
    // The user said: "我们可以在界面中，进行“json格式编写友好”的UI设计"
    // For now, let's just assume formData.detailedSetting is the content.
    // We need to implement the UI for this in the next step.
    
    // In custom mode, 'persona' field in gameStore stores the detailedSetting JSON
    // But we also have 'formData.persona' which is the text description.
    // We need to decide where to store the text description.
    // Previous logic was: persona: formData.detailedSetting || formData.persona
    
    // But now we have BOTH.
    // The PromptService uses 'player.persona' for {{global_user_setting}} injection if it's JSON?
    // Wait, PromptService logic I wrote earlier:
    // const userSetting = gameStore.state.player.persona || '无特殊设定';
    // finalContent = finalContent.replace(/\{\{global_user_setting\}\}/g, userSetting);
    
    // And for <user_persona>:
    // if (p.persona && p.persona.trim()) { personaContent = ... p.persona ... }
    
    // This creates a conflict. 'player.persona' is used for BOTH <user_persona> AND {{global_user_setting}}.
    // If we store JSON in player.persona, then <user_persona> block will show raw JSON to LLM as persona description.
    // This might be okay, but user wanted them separate.
    
    // Ideally, we should update GameStore to have 'setting' field separate from 'persona'.
    // BUT, I cannot change GameStore structure right now easily without migration.
    // Let's stick to the pattern used in Preset Mode:
    // Store JSON in 'persona', but include the text description INSIDE that JSON as a field.
    
    let finalPersonaContent = formData.detailedSetting;
    
    // If detailedSetting is empty, just use text persona
    if (!finalPersonaContent.trim()) {
        finalPersonaContent = formData.persona;
    } else {
        // If both exist, try to merge text persona into JSON
        try {
            const obj = JSON.parse(finalPersonaContent);
            obj["详细人设"] = formData.persona;
            finalPersonaContent = JSON.stringify(obj, null, 2);
        } catch (e) {
            // If not valid JSON, just append
            finalPersonaContent = formData.persona + "\n\n" + formData.detailedSetting;
        }
    }

    console.log('[NewGameWizard] Emitting complete (custom). isStoreStart:', isStoreStart.value);
    console.log('[NewGameWizard] Store Description:', formData.store.description);
    console.log('[NewGameWizard] Initial Message:', initialMessage);

    emit('complete', {
      name: formData.name,
      difficulty: formData.difficulty,
      persona: finalPersonaContent, 
      stats: finalStats,
      initialMessage,
      storeDescription: isStoreStart.value ? formData.store.description : undefined
    });
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
    <!-- Main Wizard Card -->
    <div class="relative bg-[#fcfae8] dark:bg-stone-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border-4 border-double border-izakaya-wood/30 dark:border-stone-700">
      
      <!-- Texture Overlay -->
      <div class="absolute inset-0 pointer-events-none opacity-40 bg-texture-rice-paper z-0"></div>

      <!-- Header -->
      <div class="relative z-10 bg-izakaya-wood/5 dark:bg-stone-800/50 p-6 border-b border-izakaya-wood/20 flex justify-between items-center backdrop-blur-sm">
        <div>
          <h2 class="text-2xl font-bold text-izakaya-wood dark:text-stone-200 font-serif">幻想乡入境登记</h2>
          <p class="text-sm text-izakaya-wood/70 dark:text-stone-400 mt-1">请填写您的个人档案以生成签证。</p>
        </div>
        <button @click="$emit('cancel')" class="text-izakaya-wood/50 hover:text-touhou-red transition-colors">
          <X class="w-6 h-6" />
        </button>
      </div>

      <!-- Progress Bar -->
      <div class="relative z-10 h-1.5 bg-izakaya-wood/10 w-full">
        <div 
          class="h-full bg-touhou-red transition-all duration-500 ease-out shadow-[0_0_10px_rgba(200,50,50,0.4)]"
          :style="{ width: `${((currentStepIdx + 1) / steps.length) * 100}%` }"
        ></div>
      </div>

      <!-- Content -->
      <div class="relative z-10 flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
        
        <!-- Step: Difficulty Selection -->
        <div v-if="currentStep.id === 'difficulty_select'" class="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <h3 class="text-lg font-medium text-izakaya-wood dark:text-stone-200 mb-4 flex items-center gap-2">
            <span class="w-1 h-6 bg-touhou-red rounded-full"></span>
            请选择世界难度
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div 
              @click="formData.difficulty = 'gentle'"
              class="group relative p-6 rounded-xl border-2 cursor-pointer transition-all hover:shadow-lg flex flex-col gap-4 text-center items-center overflow-hidden"
              :class="formData.difficulty === 'gentle' ? 'border-green-500 bg-green-500/5' : 'border-izakaya-wood/20 bg-white/40 dark:bg-stone-800/40 hover:border-green-500/50'"
            >
              <div class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 bg-green-500/5 transition-opacity duration-300"></div>
              <div class="p-4 bg-green-100 dark:bg-green-900/30 rounded-full text-green-600 dark:text-green-400 relative z-10 transition-transform group-hover:scale-110 duration-300">
                <BookUser class="w-8 h-8" />
              </div>
              <div class="relative z-10">
                <h4 class="font-bold text-lg mb-2 text-izakaya-wood dark:text-stone-200">温柔的世界</h4>
                <p class="text-sm text-izakaya-wood/70 dark:text-stone-400">世界对你充满善意。NPC更加友好，战斗更加轻松。</p>
              </div>
            </div>

            <div 
              @click="formData.difficulty = 'normal'"
              class="group relative p-6 rounded-xl border-2 cursor-pointer transition-all hover:shadow-lg flex flex-col gap-4 text-center items-center overflow-hidden"
              :class="formData.difficulty === 'normal' ? 'border-blue-500 bg-blue-500/5' : 'border-izakaya-wood/20 bg-white/40 dark:bg-stone-800/40 hover:border-blue-500/50'"
            >
              <div class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 bg-blue-500/5 transition-opacity duration-300"></div>
              <div class="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400 relative z-10 transition-transform group-hover:scale-110 duration-300">
                <User class="w-8 h-8" />
              </div>
              <div class="relative z-10">
                <h4 class="font-bold text-lg mb-2 text-izakaya-wood dark:text-stone-200">普通的世界</h4>
                <p class="text-sm text-izakaya-wood/70 dark:text-stone-400">标准的幻想乡体验。一切如常，既有欢笑也有挑战。</p>
              </div>
            </div>

            <div 
              @click="formData.difficulty = 'cruel'"
              class="group relative p-6 rounded-xl border-2 cursor-pointer transition-all hover:shadow-lg flex flex-col gap-4 text-center items-center overflow-hidden"
              :class="formData.difficulty === 'cruel' ? 'border-red-600 bg-red-600/5' : 'border-izakaya-wood/20 bg-white/40 dark:bg-stone-800/40 hover:border-red-600/50'"
            >
              <div class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 bg-red-600/5 transition-opacity duration-300"></div>
              <div class="p-4 bg-red-100 dark:bg-red-900/30 rounded-full text-red-600 dark:text-red-400 relative z-10 transition-transform group-hover:scale-110 duration-300">
                <Swords class="w-8 h-8" />
              </div>
              <div class="relative z-10">
                <h4 class="font-bold text-lg mb-2 text-izakaya-wood dark:text-stone-200">残酷的世界</h4>
                <p class="text-sm text-izakaya-wood/70 dark:text-stone-400">在这个充满恶意的世界里，生存本身就是一种挑战。NPC更加冷漠，战斗异常艰难。</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 0: Mode Selection -->
        <div v-if="currentStep.id === 'mode_select'" class="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <h3 class="text-lg font-medium text-izakaya-wood dark:text-stone-200 mb-4 flex items-center gap-2">
            <span class="w-1 h-6 bg-touhou-red rounded-full"></span>
            请选择开局模式
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Mode Selection Cards (Existing) -->
            <div 
              @click="selectMode('preset')"
              class="group relative p-6 rounded-xl border-2 cursor-pointer transition-all hover:shadow-lg flex flex-col gap-4 text-center items-center overflow-hidden"
              :class="mode === 'preset' ? 'border-touhou-red bg-touhou-red/5' : 'border-izakaya-wood/20 bg-white/40 dark:bg-stone-800/40 hover:border-touhou-red/50'"
            >
              <div class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 bg-touhou-red/5 transition-opacity duration-300"></div>
              <div class="p-4 bg-red-100 dark:bg-red-900/30 rounded-full text-touhou-red relative z-10 transition-transform group-hover:scale-110 duration-300">
                <BookUser class="w-8 h-8" />
              </div>
              <div class="relative z-10">
                <h4 class="font-bold text-lg mb-2 text-izakaya-wood dark:text-stone-200">预设开局</h4>
                <p class="text-sm text-izakaya-wood/70 dark:text-stone-400">选择经典的预设背景，快速开始游戏。适合初次体验的玩家。</p>
              </div>
            </div>

            <div 
              @click="selectMode('custom')"
              class="group relative p-6 rounded-xl border-2 cursor-pointer transition-all hover:shadow-lg flex flex-col gap-4 text-center items-center overflow-hidden"
              :class="mode === 'custom' ? 'border-touhou-red bg-touhou-red/5' : 'border-izakaya-wood/20 bg-white/40 dark:bg-stone-800/40 hover:border-touhou-red/50'"
            >
              <div class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 bg-touhou-red/5 transition-opacity duration-300"></div>
              <div class="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400 relative z-10 transition-transform group-hover:scale-110 duration-300">
                <Settings class="w-8 h-8" />
              </div>
              <div class="relative z-10">
                <h4 class="font-bold text-lg mb-2 text-izakaya-wood dark:text-stone-200">自定义开局</h4>
                <p class="text-sm text-izakaya-wood/70 dark:text-stone-400">完全自定义各项数值和设定。适合想要尝试特定玩法的进阶玩家。</p>
              </div>
            </div>
          </div>

          <!-- Store Option Toggle -->
          <div class="pt-4 border-t border-izakaya-wood/10 dark:border-stone-700 animate-in fade-in slide-in-from-bottom-2 duration-500">
             <div 
               @click="isStoreStart = !isStoreStart"
               class="flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md group"
               :class="isStoreStart ? 'border-amber-500 bg-amber-500/5' : 'border-izakaya-wood/20 bg-white/40 dark:bg-stone-800/40 hover:border-amber-500/50'"
             >
               <div class="flex items-center gap-4">
                 <div class="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                   <Store class="w-6 h-6" />
                 </div>
                 <div>
                   <h4 class="font-bold text-base text-izakaya-wood dark:text-stone-200">店铺开局 (经营模式)</h4>
                   <p class="text-sm text-izakaya-wood/70 dark:text-stone-400">选择此项将在开局拥有一家店铺，并自动生成相关的经营剧情。</p>
                 </div>
               </div>
               <div class="relative w-12 h-6 bg-gray-200 dark:bg-stone-700 rounded-full transition-colors duration-300" :class="{ 'bg-amber-500': isStoreStart }">
                 <div class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-300" :class="{ 'translate-x-6': isStoreStart }"></div>
               </div>
             </div>
          </div>
        </div>
        
        <!-- Step: Store Config -->
        <div v-if="currentStep.id === 'store_config'" class="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <h3 class="text-lg font-medium text-izakaya-wood dark:text-stone-200 mb-4 flex items-center gap-2">
            <span class="w-1 h-6 bg-amber-500 rounded-full"></span>
            店铺基础配置
          </h3>
          
          <div class="space-y-4">
            <div class="space-y-2">
              <label class="block text-sm font-medium text-izakaya-wood dark:text-stone-300">店铺名称</label>
              <input 
                v-model="formData.store.name"
                type="text"
                name="shopName"
                autocomplete="off" 
                class="w-full px-4 py-3 rounded-lg border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder-izakaya-wood/30 dark:placeholder-stone-400"
                placeholder="例如：雾雨魔法店"
              />
            </div>
            
            <div class="space-y-2">
              <label class="block text-sm font-medium text-izakaya-wood dark:text-stone-300">店铺位置</label>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                <div 
                  v-for="loc in PRESET_LOCATIONS" 
                  :key="loc"
                  @click="formData.store.location = loc"
                  class="p-2 text-xs rounded border cursor-pointer text-center transition-colors"
                  :class="formData.store.location === loc ? 'bg-amber-500/10 border-amber-500 text-amber-600' : 'border-izakaya-wood/20 hover:bg-izakaya-wood/5 dark:border-stone-600 dark:text-stone-300'"
                >
                  {{ loc }}
                </div>
              </div>
              <input 
                v-model="formData.store.location"
                type="text" 
                class="w-full px-4 py-3 rounded-lg border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder-izakaya-wood/30 dark:placeholder-stone-400"
                placeholder="可以直接输入或选择上方预设..."
              />
            </div>
            
            <div class="space-y-2">
              <label class="block text-sm font-medium text-izakaya-wood dark:text-stone-300">店铺介绍</label>
              <p class="text-xs text-izakaya-wood/60 dark:text-stone-500 mb-2">请描述店铺的经营内容、内部构造、已有设施等。</p>
              <textarea 
                v-model="formData.store.description"
                rows="4"
                class="w-full px-4 py-3 rounded-lg border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all resize-none custom-scrollbar placeholder-izakaya-wood/30 dark:placeholder-stone-400"
                placeholder="例如：这是一家位于人间之里的小型食堂，主要经营和风料理。店内有四张桌子和一个吧台..."
              ></textarea>
            </div>
          </div>
        </div>

        <!-- Step: Store Staff -->
        <div v-if="currentStep.id === 'store_staff'" class="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <h3 class="text-lg font-medium text-izakaya-wood dark:text-stone-200 mb-4 flex items-center gap-2">
            <span class="w-1 h-6 bg-amber-500 rounded-full"></span>
            员工招募 (可选)
          </h3>
          
          <div 
             @click="formData.store.hasStaff = !formData.store.hasStaff"
             class="flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md mb-6"
             :class="formData.store.hasStaff ? 'border-amber-500 bg-amber-500/5' : 'border-izakaya-wood/20 bg-white/40 dark:bg-stone-800/40 hover:border-amber-500/50'"
           >
             <div class="flex items-center gap-4">
               <div class="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400">
                 <Users class="w-5 h-5" />
               </div>
               <div>
                 <h4 class="font-bold text-sm text-izakaya-wood dark:text-stone-200">配置初始员工</h4>
                 <p class="text-xs text-izakaya-wood/70 dark:text-stone-400">是否需要一位初始员工协助经营？</p>
               </div>
             </div>
             <div class="relative w-10 h-5 bg-gray-200 dark:bg-stone-700 rounded-full transition-colors duration-300" :class="{ 'bg-amber-500': formData.store.hasStaff }">
               <div class="absolute top-1 left-1 w-3 h-3 bg-white rounded-full shadow transition-transform duration-300" :class="{ 'translate-x-5': formData.store.hasStaff }"></div>
             </div>
           </div>

           <div v-if="formData.store.hasStaff" class="space-y-4 animate-in fade-in slide-in-from-top-2">
             <div class="space-y-2">
               <label class="block text-sm font-medium text-izakaya-wood dark:text-stone-300">员工姓名</label>
               <input 
                 v-model="formData.store.staffName"
                 type="text" 
                 class="w-full px-4 py-3 rounded-lg border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder-izakaya-wood/30 dark:placeholder-stone-400"
                 placeholder="例如：桑尼·米尔克"
               />
             </div>
             
             <div class="space-y-2">
               <label class="block text-sm font-medium text-izakaya-wood dark:text-stone-300">加入剧情</label>
               <div class="flex gap-4 mb-2">
                 <label class="flex items-center gap-2 text-sm cursor-pointer">
                   <input type="radio" v-model="formData.store.staffBackstoryType" value="custom" class="text-amber-500 focus:ring-amber-500" />
                   <span class="text-izakaya-wood dark:text-stone-300">自定义剧情</span>
                 </label>
                 <label class="flex items-center gap-2 text-sm cursor-pointer">
                   <input type="radio" v-model="formData.store.staffBackstoryType" value="random" class="text-amber-500 focus:ring-amber-500" />
                   <span class="text-izakaya-wood dark:text-stone-300">随机生成 (AI)</span>
                 </label>
               </div>
               
               <textarea 
                 v-if="formData.store.staffBackstoryType === 'custom'"
                 v-model="formData.store.staffBackstory"
                 rows="3"
                 class="w-full px-4 py-3 rounded-lg border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all resize-none custom-scrollbar placeholder-izakaya-wood/30 dark:placeholder-stone-400"
                 placeholder="描述她是如何成为你的员工的..."
               ></textarea>
               <div v-else class="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
                 <Brain class="w-4 h-4" />
                 <span>开局时将由 AI 自动生成一段关于该员工加入的剧情。</span>
               </div>
             </div>
           </div>
        </div>

        <!-- Preset Path -->
        
        <!-- Step: Origin (Preset) -->
        <div v-if="currentStep.id === 'origin'" class="space-y-4 animate-in slide-in-from-right-4 duration-300">
          <h3 class="text-lg font-medium text-izakaya-wood dark:text-stone-200 mb-4 flex items-center gap-2">
            <span class="w-1 h-6 bg-touhou-red rounded-full"></span>
            选择您的出身背景
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div 
              v-for="origin in allOrigins" 
              :key="origin.id"
              @click="() => { formData.originId = origin.id; formData.presetLocation = origin.stats.location; }"
              class="relative p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-2 group overflow-hidden"
              :class="formData.originId === origin.id ? 'border-touhou-red bg-touhou-red/5' : 'border-izakaya-wood/20 bg-white/40 dark:bg-stone-800/40 hover:border-touhou-red/50'"
            >
              <div class="flex items-center gap-3 relative z-10">
                <div class="p-2 rounded-lg bg-izakaya-wood/5 dark:bg-stone-700 text-izakaya-wood dark:text-stone-300 group-hover:text-touhou-red transition-colors">
                  <component :is="origin.icon" class="w-6 h-6" />
                </div>
                <div class="font-bold text-izakaya-wood dark:text-stone-200">{{ origin.name }}</div>
                <!-- Delete button for custom origins -->
                <button 
                  v-if="(origin as any).isCustom" 
                  @click.stop="deleteCustomOrigin(origin.id)"
                  class="ml-auto p-1 text-izakaya-wood/40 hover:text-red-500 transition-colors"
                  title="删除预设"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
              <p class="text-sm text-izakaya-wood/70 dark:text-stone-400 mt-2 relative z-10">{{ origin.desc }}</p>
              <div class="mt-auto pt-4 flex gap-2 text-xs font-mono text-izakaya-wood/60 flex-wrap relative z-10">
                <span class="bg-izakaya-wood/10 dark:bg-stone-700 px-2 py-1 rounded border border-izakaya-wood/10">💰 {{ origin.stats.money }}</span>
                <span class="bg-izakaya-wood/10 dark:bg-stone-700 px-2 py-1 rounded border border-izakaya-wood/10">⚔️ {{ origin.stats.power }}</span>
                <span class="bg-izakaya-wood/10 dark:bg-stone-700 px-2 py-1 rounded border border-izakaya-wood/10">❤️ {{ origin.stats.hp }}</span>
              </div>
              <div v-if="formData.originId === origin.id" class="absolute top-4 right-4 text-touhou-red animate-in zoom-in duration-300">
                <Check class="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>

        <!-- Step: Location (Preset) -->
        <div v-if="currentStep.id === 'location_preset'" class="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <h3 class="text-lg font-medium text-izakaya-wood dark:text-stone-200 mb-4 flex items-center gap-2">
            <span class="w-1 h-6 bg-touhou-red rounded-full"></span>
            选择出生地点
          </h3>
          <p class="text-sm text-izakaya-wood/70 dark:text-stone-400 mb-4">推荐：博丽神社、人间之里</p>
          
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div 
              v-for="loc in PRESET_LOCATIONS" 
              :key="loc"
              @click="formData.presetLocation = loc"
              class="p-3 rounded-lg border-2 cursor-pointer text-center text-sm transition-all relative overflow-hidden group"
              :class="formData.presetLocation === loc ? 'border-touhou-red bg-touhou-red/5 text-touhou-red font-bold' : 'border-izakaya-wood/20 bg-white/40 dark:bg-stone-800/40 text-izakaya-wood/80 dark:text-stone-300 hover:border-touhou-red/50'"
            >
              <span class="relative z-10">{{ loc }}</span>
            </div>
          </div>
        </div>

        <!-- Step: Profile (Preset) -->
        <div v-if="currentStep.id === 'profile_preset'" class="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div class="space-y-2">
            <label class="block text-sm font-medium text-izakaya-wood dark:text-stone-300">姓名 / 代号</label>
            <input 
              v-model="formData.name"
              type="text" 
              name="playerName"
              autocomplete="off"
              class="w-full px-4 py-3 rounded-lg border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:ring-2 focus:ring-touhou-red/20 focus:border-touhou-red outline-none transition-all placeholder-izakaya-wood/30 dark:placeholder-stone-400"
              placeholder="请输入您的名字..."
            />
          </div>
          <div class="space-y-2">
            <label class="block text-sm font-medium text-izakaya-wood dark:text-stone-300">人设补充 (可选)</label>
            <p class="text-xs text-izakaya-wood/60 dark:text-stone-500 mb-2">已选择“{{ selectedOrigin.name }}”模板。你可以在此补充一些性格细节。</p>
            <textarea 
              v-model="formData.persona"
              rows="4"
              class="w-full px-4 py-3 rounded-lg border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:ring-2 focus:ring-touhou-red/20 focus:border-touhou-red outline-none transition-all resize-none custom-scrollbar placeholder-izakaya-wood/30 dark:placeholder-stone-400"
              placeholder="例如：性格比较谨慎，喜欢吃甜食..."
            ></textarea>
          </div>
        </div>

        <!-- Custom Path -->

        <!-- Step: Profile (Custom) -->
        <div v-if="currentStep.id === 'profile_custom'" class="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div class="space-y-2">
            <label class="block text-sm font-medium text-izakaya-wood dark:text-stone-300">姓名 / 代号</label>
            <input 
              v-model="formData.name"
              type="text" 
              name="playerName"
              autocomplete="off"
              class="w-full px-4 py-3 rounded-lg border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:ring-2 focus:ring-touhou-red/20 focus:border-touhou-red outline-none transition-all placeholder-izakaya-wood/30 dark:placeholder-stone-400"
              placeholder="请输入您的名字..."
            />
          </div>

          <div class="space-y-2">
            <label class="block text-sm font-medium text-izakaya-wood dark:text-stone-300">详细人设 (Persona)</label>
            <p class="text-xs text-izakaya-wood/60 dark:text-stone-500 mb-2">这段描述将注入到 AI 的 System Prompt 中。</p>
            <textarea 
              v-model="formData.persona"
              rows="5"
              class="w-full px-4 py-3 rounded-lg border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:ring-2 focus:ring-touhou-red/20 focus:border-touhou-red outline-none transition-all resize-none custom-scrollbar placeholder-izakaya-wood/30 dark:placeholder-stone-400"
              placeholder="例如：一位来自外界的大学生，戴着黑框眼镜，性格随和但有些胆小..."
            ></textarea>
          </div>

          <div class="space-y-2">
            <label class="block text-sm font-medium text-izakaya-wood dark:text-stone-300">详细设定 (JSON 格式)</label>
            <p class="text-xs text-izakaya-wood/60 dark:text-stone-500 mb-2">请使用 JSON 格式编写您的详细设定。这将作为本存档世界观的一部分。</p>
            <div class="relative">
              <textarea 
                v-model="formData.detailedSetting"
                rows="8"
                class="w-full px-4 py-3 font-mono text-sm rounded-lg border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:ring-2 focus:ring-touhou-red/20 focus:border-touhou-red outline-none transition-all resize-none custom-scrollbar placeholder-izakaya-wood/30 dark:placeholder-stone-400"
                placeholder='<!--示例文本-->
{
"真实身份": "神选之人（失落的至高神）",
"穿越原因": "因时空乱流被卷入幻想乡...",
...
}'
              ></textarea>
              <div class="absolute top-2 right-2">
                 <!-- Simple helper to insert template -->
                 <button @click="formData.detailedSetting = JSON.stringify({ '真实身份': '', '当前状态': '', '特殊能力': '' }, null, 2)" class="text-xs bg-izakaya-wood/10 hover:bg-izakaya-wood/20 dark:bg-stone-600 px-2 py-1 rounded transition-colors text-izakaya-wood dark:text-stone-300">插入模板</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Step: Stats (Custom) -->
        <div v-if="currentStep.id === 'stats_custom'" class="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div class="grid grid-cols-2 gap-4">
             <div class="space-y-1">
               <label class="text-xs text-izakaya-wood/70 dark:text-stone-400">金钱 (Money)</label>
               <input v-model.number="formData.customStats.money" type="number" class="w-full p-2 rounded border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:border-touhou-red focus:outline-none" />
             </div>
             <div class="space-y-1">
               <label class="text-xs text-izakaya-wood/70 dark:text-stone-400">战斗力 (Power)</label>
               <input v-model="formData.customStats.power" type="text" class="w-full p-2 rounded border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:border-touhou-red focus:outline-none" />
             </div>
             <div class="space-y-1">
               <label class="text-xs text-izakaya-wood/70 dark:text-stone-400">生命值 (HP)</label>
               <input v-model.number="formData.customStats.hp" type="number" class="w-full p-2 rounded border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:border-touhou-red focus:outline-none" />
             </div>
             <div class="space-y-1">
               <label class="text-xs text-izakaya-wood/70 dark:text-stone-400">灵力值 (MP)</label>
               <input v-model.number="formData.customStats.mp" type="number" class="w-full p-2 rounded border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:border-touhou-red focus:outline-none" />
             </div>
             <div class="space-y-1">
               <label class="text-xs text-izakaya-wood/70 dark:text-stone-400">身份 (Identity)</label>
               <input v-model="formData.customStats.identity" type="text" class="w-full p-2 rounded border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:border-touhou-red focus:outline-none" />
             </div>
             <div class="space-y-1">
               <label class="text-xs text-izakaya-wood/70 dark:text-stone-400">衣着 (Clothing)</label>
               <input v-model="formData.customStats.clothing" type="text" class="w-full p-2 rounded border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:border-touhou-red focus:outline-none" />
             </div>
             <div class="space-y-1" v-if="!isStoreStart">
               <label class="text-xs text-izakaya-wood/70 dark:text-stone-400">初始地点</label>
               <input v-model="formData.customStats.location" type="text" class="w-full p-2 rounded border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:border-touhou-red focus:outline-none" />
             </div>
             <div class="space-y-1">
               <label class="text-xs text-izakaya-wood/70 dark:text-stone-400">初始时间</label>
               <input v-model="formData.customStats.time" type="text" class="w-full p-2 rounded border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:border-touhou-red focus:outline-none" />
             </div>
             <div class="col-span-2 space-y-1">
               <label class="text-xs text-izakaya-wood/70 dark:text-stone-400">初始日期</label>
               <input v-model="formData.customStats.date" type="text" class="w-full p-2 rounded border border-izakaya-wood/30 dark:border-stone-600 bg-white/50 dark:bg-stone-700 dark:text-stone-100 text-stone-900 focus:border-touhou-red focus:outline-none" />
             </div>
          </div>
          
          <div class="pt-4 border-t border-izakaya-wood/10 dark:border-stone-700 flex justify-end">
            <button 
              @click="saveCurrentAsPreset"
              class="flex items-center gap-2 px-4 py-2 bg-izakaya-wood/10 hover:bg-izakaya-wood/20 dark:bg-stone-700 dark:hover:bg-stone-600 text-izakaya-wood dark:text-stone-200 rounded-lg transition-colors text-sm font-medium"
            >
              <Save class="w-4 h-4" />
              <span>保存为预设</span>
            </button>
          </div>
        </div>

        <!-- Step: Review (Common) -->
        <div v-if="currentStep.id === 'review'" class="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div class="bg-white/40 dark:bg-stone-800/40 rounded-xl p-6 border border-izakaya-wood/20 dark:border-stone-700 shadow-sm relative overflow-hidden">
        <div class="absolute inset-0 pointer-events-none opacity-30 bg-texture-rice-paper"></div>
        <h3 class="text-lg font-bold text-izakaya-wood dark:text-stone-200 mb-4 flex items-center gap-2 relative z-10">
          <User class="w-5 h-5 text-touhou-red" />
          <span>档案预览</span>
        </h3>
            
            <div class="space-y-4 relative z-10">
              <div class="grid grid-cols-3 gap-4 border-b border-izakaya-wood/10 dark:border-stone-700 pb-4">
                <div class="text-sm text-izakaya-wood/60 dark:text-stone-500">登记姓名</div>
                <div class="col-span-2 font-medium text-izakaya-wood dark:text-stone-200">{{ formData.name }}</div>
                
                <div class="text-sm text-izakaya-wood/60 dark:text-stone-500">出身模式</div>
                <div class="col-span-2 font-medium text-izakaya-wood dark:text-stone-200">
                  {{ mode === 'preset' ? `预设：${selectedOrigin.name}` : '自定义' }}
                </div>
                
                <template v-if="mode === 'preset'">
                  <div class="text-sm text-izakaya-wood/60 dark:text-stone-500">初始地点</div>
                  <div class="col-span-2 text-sm text-izakaya-wood dark:text-stone-300">{{ formData.presetLocation }}</div>
                </template>
                <template v-else>
                   <div class="text-sm text-izakaya-wood/60 dark:text-stone-500">初始地点</div>
                   <div class="col-span-2 text-sm text-izakaya-wood dark:text-stone-300">{{ formData.customStats.location }}</div>
                </template>
              </div>

              <div>
                <div class="text-sm text-izakaya-wood/60 dark:text-stone-500 mb-2">人设描述</div>
                <div class="p-3 bg-white/60 dark:bg-stone-800/60 rounded-lg text-sm leading-relaxed border border-izakaya-wood/20 dark:border-stone-600 whitespace-pre-wrap font-mono text-xs text-izakaya-wood/80 dark:text-stone-300 custom-scrollbar max-h-40 overflow-y-auto">
                  {{ mode === 'preset' ? (formData.persona || '(使用默认预设描述)') : (formData.detailedSetting || '(无详细设定)') }}
                </div>
              </div>

              <div v-if="isStoreStart" class="mt-4 border-t border-izakaya-wood/10 dark:border-stone-700 pt-4">
                <div class="text-sm font-bold text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-2">
                  <Store class="w-4 h-4" /> 店铺设定
                </div>
                <div class="grid grid-cols-3 gap-4 text-sm">
                  <div class="text-izakaya-wood/60 dark:text-stone-500">店铺名称</div>
                  <div class="col-span-2 text-izakaya-wood dark:text-stone-300">{{ formData.store.name }}</div>
                  
                  <div class="text-izakaya-wood/60 dark:text-stone-500">店铺位置</div>
                  <div class="col-span-2 text-izakaya-wood dark:text-stone-300">{{ formData.store.location }}</div>

                  <div class="text-izakaya-wood/60 dark:text-stone-500">初始员工</div>
                  <div class="col-span-2 text-izakaya-wood dark:text-stone-300">
                    {{ formData.store.hasStaff ? formData.store.staffName : '无' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="p-4 bg-marisa-gold/10 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 rounded-lg text-sm border border-marisa-gold/20 flex gap-2 items-start">
             <span>⚠️</span>
             <span>确认后将生成新的世界线，此前的未保存进度将丢失。</span>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="relative z-10 p-6 border-t border-izakaya-wood/20 dark:border-stone-700 flex justify-between bg-izakaya-wood/5 dark:bg-stone-800/50 backdrop-blur-sm">
        <button 
          @click="back" 
          :disabled="currentStepIdx === 0"
          class="px-6 py-2 rounded-lg text-izakaya-wood/70 dark:text-stone-400 hover:bg-izakaya-wood/10 dark:hover:bg-stone-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
        >
          上一步
        </button>
        
        <button 
          @click="next" 
          :disabled="!canProceed"
          class="px-6 py-2 rounded-lg bg-touhou-red hover:bg-red-600 text-white shadow-lg shadow-red-500/30 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all font-medium flex items-center gap-2 group"
        >
          <span>{{ currentStepIdx === steps.length - 1 ? '开始旅程' : '下一步' }}</span>
          <ArrowRight v-if="currentStepIdx !== steps.length - 1" class="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

    </div>
  </div>
</template>
