<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '@/stores/game';
import { useCharacterStore } from '@/stores/character';
import { audioManager } from '@/services/audio';
import { Users, X } from 'lucide-vue-next';
import type { NPCStatus } from '@/types/game';

const gameStore = useGameStore();
const characterStore = useCharacterStore();
const systemState = computed(() => gameStore.state.system);
const npcs = computed(() => gameStore.state.npcs);

const currentSceneNPCs = computed(() => {
  return systemState.value.current_scene_npcs.map(id => {
    // 1. Try Runtime State (Match by ID or Name)
    let npc = npcs.value[id];
    if (!npc) {
       npc = Object.values(npcs.value).find(n => n.name === id || n.id === id);
    }

    // 2. Try Static Data (Match by UUID or Name)
    const staticChar = characterStore.characters.find(c => 
        (c.uuid && (c.uuid === id || (npc && c.uuid === npc.id))) || 
        (c.name && (c.name === id || (npc && c.name === npc.name)))
    );

    // 3. Merge: Static Data first, then Runtime Data overrides
    const displayNpc: any = {
        id: id, // Default ID
        name: id, // Default Name
        ...staticChar, // Base with static data
        ...npc, // Override with runtime data
    };

    // 4. Ensure Critical Fields & Defaults
    if (!displayNpc.name) displayNpc.name = id;
    if (!displayNpc.clothing) displayNpc.clothing = '未知';
    if (!displayNpc.mood) displayNpc.mood = '平静';
    if (!displayNpc.posture) displayNpc.posture = '站立';
    
    // Handle HP/MaxHP specific logic
    // Static 'hp' usually implies MaxHP in character definitions
    if (displayNpc.max_hp === undefined && (staticChar as any)?.hp) {
        displayNpc.max_hp = (staticChar as any).hp;
    }
    // If we still don't have max_hp, fallback to a standard value? Or keep undefined.
    
    // Note: displayNpc.hp comes from npc.hp (runtime). If undefined, it remains undefined.

    return displayNpc as NPCStatus;
  });
});

const selectedNPC = ref<NPCStatus | null>(null);

function handleSelectNPC(npc: NPCStatus) {
  selectedNPC.value = npc;
  audioManager.playPageFlip();
}

function handleCloseModal() {
  selectedNPC.value = null;
  audioManager.playSoftClick();
}

function getAvatarColor(name: string) {
  if (!name) return 'bg-gray-100 text-gray-500';
  // Simple hash for color
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['bg-red-100 text-red-700', 'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700', 'bg-yellow-100 text-yellow-700'];
  return colors[Math.abs(hash) % colors.length];
}


</script>

<template>
  <div class="bg-izakaya-paper/60 backdrop-blur-md shadow-sm border border-izakaya-wood/10 rounded-lg p-4 flex-1 flex flex-col min-h-0 relative overflow-hidden">
    <!-- 装饰性纹理 -->
    <div class="absolute inset-0 pointer-events-none opacity-5 bg-texture-rice-paper"></div>

    <h3 class="flex items-center gap-2 font-display font-bold text-izakaya-wood border-b border-izakaya-wood/10 pb-2 mb-3 relative z-10">
      <Users class="w-4 h-4 text-touhou-red" />
      当前区域角色
    </h3>
    <div class="space-y-2 overflow-y-auto flex-1 relative z-10 custom-scrollbar pr-1">
      
      <div v-if="currentSceneNPCs.length === 0" class="text-center text-sm text-izakaya-wood/40 py-4 font-serif">
        这里似乎只有你一个人...
      </div>

      <div 
        v-for="npc in currentSceneNPCs" 
        :key="npc.id"
        @click="handleSelectNPC(npc)"
        class="group p-2 hover:bg-white/60 rounded cursor-pointer border border-transparent hover:border-touhou-red/20 transition-all duration-200 hover:shadow-sm hover:-translate-x-[-2px]"
      >
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-sm border border-white/20 transition-transform group-hover:scale-110" :class="getAvatarColor(npc.name)">
             {{ npc.name ? npc.name.substring(0, 1) : '?' }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-display font-bold text-izakaya-wood truncate group-hover:text-touhou-red transition-colors">{{ npc.name || '未知角色' }}</div>
            <div class="text-xs text-izakaya-wood/60 truncate flex gap-2 mt-0.5">
                <span v-if="npc.posture" class="bg-izakaya-wood/5 px-1.5 py-0.5 rounded text-[10px]">{{ npc.posture }}</span>
                <span v-if="npc.mood" class="bg-izakaya-wood/5 px-1.5 py-0.5 rounded text-[10px]">{{ npc.mood }}</span>
            </div>
          </div>
        </div>
      </div>
      
    </div>

    <!-- NPC Detail Modal -->
    <Teleport to="body">
      <div v-if="selectedNPC" class="fixed inset-0 z-50 flex items-center justify-center bg-izakaya-wood/20 backdrop-blur-sm p-4 animate-fade-in">
        <div class="bg-izakaya-paper w-full max-w-md rounded-xl shadow-paper overflow-hidden flex flex-col max-h-[90vh] border border-izakaya-wood/10 relative">
           <!-- Modal Texture -->
           <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-rice-paper"></div>
           
           <div class="p-4 border-b border-izakaya-wood/10 flex justify-between items-center bg-white/40 relative z-10">
            <h3 class="font-display font-bold text-lg text-izakaya-wood flex items-center gap-2">
              <span class="text-touhou-red">◈</span>
              {{ selectedNPC.name }}
            </h3>
            <button @click="handleCloseModal" class="text-izakaya-wood/50 hover:text-touhou-red transition-colors"><X class="w-5 h-5"/></button>
          </div>
          
          <div class="flex-1 overflow-y-auto p-6 space-y-6 relative z-10 custom-scrollbar">
              <div class="flex justify-center">
                   <div class="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold shadow-[0_0_15px_rgba(0,0,0,0.1)] border-4 border-white/50" :class="getAvatarColor(selectedNPC.name)">
                      {{ selectedNPC.name ? selectedNPC.name.substring(0, 1) : '?' }}
                   </div>
              </div>

              <!-- Basic Stats Grid -->
              <div class="grid grid-cols-2 gap-3 text-sm">
                  <div class="p-3 bg-white/50 rounded-lg border border-izakaya-wood/5 hover:border-touhou-red/10 transition-colors">
                      <div class="text-xs text-izakaya-wood/50 mb-1 font-serif">关系</div>
                      <div class="font-bold text-izakaya-wood font-display">{{ selectedNPC.relationship || '未知' }}</div>
                  </div>
                  <div class="p-3 bg-white/50 rounded-lg border border-izakaya-wood/5 hover:border-touhou-red/10 transition-colors">
                      <div class="text-xs text-izakaya-wood/50 mb-1 font-serif">战斗力</div>
                      <div class="font-bold text-marisa-gold-dim font-display">{{ selectedNPC.power || '?' }}</div>
                  </div>
                  
                  <div class="p-3 bg-white/50 rounded-lg border border-izakaya-wood/5 hover:border-touhou-red/10 transition-colors">
                      <div class="text-xs text-izakaya-wood/50 mb-1 font-serif">HP / MaxHP</div>
                      <div class="font-bold text-green-700 font-display">{{ selectedNPC.hp || '?' }} / {{ selectedNPC.max_hp || '?' }}</div>
                  </div>
                   <div class="p-3 bg-white/50 rounded-lg border border-izakaya-wood/5 hover:border-touhou-red/10 transition-colors">
                      <div class="text-xs text-izakaya-wood/50 mb-1 font-serif">好感度 / 服从度</div>
                      <div class="font-bold font-display">
                          <span class="text-touhou-red">{{ selectedNPC.favorability || 0 }}</span>
                          <span class="text-izakaya-wood/30 mx-1">/</span>
                          <span class="text-purple-600">{{ selectedNPC.obedience || 0 }}</span>
                      </div>
                  </div>
              </div>

              <!-- Appearance & State -->
              <div class="space-y-3 text-sm">
                  <h4 class="font-display font-bold text-izakaya-wood/80 text-xs uppercase tracking-wider border-b border-izakaya-wood/10 pb-1 flex items-center gap-2">
                      <span class="w-1 h-1 rounded-full bg-touhou-red"></span>
                      当前状态
                  </h4>
                  
                  <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-izakaya-wood">
                      <div><span class="text-izakaya-wood/50 text-xs font-serif">衣着:</span> <span class="ml-1 font-medium">{{ selectedNPC.clothing || '未知' }}</span></div>
                      <div><span class="text-izakaya-wood/50 text-xs font-serif">心情:</span> <span class="ml-1 font-medium">{{ selectedNPC.mood || '平静' }}</span></div>
                      <div><span class="text-izakaya-wood/50 text-xs font-serif">姿势:</span> <span class="ml-1 font-medium">{{ selectedNPC.posture || '正常' }}</span></div>
                      <div><span class="text-izakaya-wood/50 text-xs font-serif">行为:</span> <span class="ml-1 font-medium">{{ selectedNPC.action || '无' }}</span></div>
                  </div>

                  <div class="p-3 bg-white/50 rounded-lg border border-izakaya-wood/5 space-y-2 text-izakaya-wood">
                       <div class="flex items-start gap-2">
                          <span class="text-xs text-izakaya-wood/50 w-8 shrink-0 font-serif">脸部:</span>
                          <span class="font-medium">{{ selectedNPC.face || '正常' }}</span>
                       </div>
                       <div class="flex items-start gap-2">
                          <span class="text-xs text-izakaya-wood/50 w-8 shrink-0 font-serif">嘴巴:</span>
                          <span class="font-medium">{{ selectedNPC.mouth || '正常' }}</span>
                       </div>
                       <div class="flex items-start gap-2">
                          <span class="text-xs text-izakaya-wood/50 w-8 shrink-0 font-serif">双手:</span>
                          <span class="font-medium">{{ selectedNPC.hands || '空闲' }}</span>
                       </div>
                       <div class="flex items-start gap-2" v-if="selectedNPC.chest || selectedNPC.gender === 'female'">
                          <span class="text-xs text-izakaya-wood/50 w-8 shrink-0 font-serif">胸部:</span>
                          <span class="font-medium">{{ selectedNPC.chest || '暂且未知' }}</span>
                       </div>
                       <div class="flex items-start gap-2" v-if="selectedNPC.buttocks || selectedNPC.gender === 'female'">
                          <span class="text-xs text-izakaya-wood/50 w-8 shrink-0 font-serif">臀部:</span>
                          <span class="font-medium">{{ selectedNPC.buttocks || '暂且未知' }}</span>
                       </div>
                       <div class="flex items-start gap-2" v-if="selectedNPC.vagina || selectedNPC.gender === 'female'">
                          <span class="text-xs text-izakaya-wood/50 w-8 shrink-0 font-serif">小穴:</span>
                          <span class="font-medium">{{ selectedNPC.vagina || '暂且未知' }}</span>
                       </div>
                       <div class="flex items-start gap-2" v-if="selectedNPC.anus || selectedNPC.gender === 'female'">
                          <span class="text-xs text-izakaya-wood/50 w-8 shrink-0 font-serif">菊穴:</span>
                          <span class="font-medium">{{ selectedNPC.anus || '暂且未知' }}</span>
                       </div>
                  </div>
              </div>

              <!-- Inner Thought -->
              <div class="p-4 bg-marisa-gold/5 rounded-lg border border-marisa-gold/20" v-if="selectedNPC.inner_thought">
                  <div class="text-xs text-marisa-gold-dim font-bold mb-1 flex items-center gap-1 font-display">
                      <span class="text-lg">💭</span> 心理活动 (GM可见)
                  </div>
                  <div class="italic text-izakaya-wood/80 text-sm leading-relaxed font-serif">"{{ selectedNPC.inner_thought }}"</div>
              </div>

          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>
