<script setup lang="ts">
import { ref, watch } from 'vue';
import { dbService } from '@/services/DatabaseService';
import { useSaveStore } from '@/stores/save';
import { X, MapPin, Users, Activity, Home, Trash2 } from 'lucide-vue-next';
import { audioManager } from '@/services/audio';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits(['close']);

const saveStore = useSaveStore();
const facilities = ref<any[]>([]);
const isLoading = ref(false);

async function loadFacilities() {
  if (!saveStore.currentSaveId) return;
  isLoading.value = true;

  try {
    // 1. Fetch from new Registry (Source of Truth)
    const registryFacilities = await dbService.getFacilities(saveStore.currentSaveId);

    // 2. Fetch from Memory (For backward compatibility and turn/date info)
    const allFacilityMemories = await dbService.getAllMemoriesByType(
      saveStore.currentSaveId,
      'facility'
    );

    // Create a lookup for memory info
    const memoryLookup = new Map<string, any>();
    allFacilityMemories.forEach((m) => {
      const name = extractFacilityName(m.content);
      if (name && !memoryLookup.has(name)) {
        memoryLookup.set(name, m);
      }
    });

    // 3. Merge: Prioritize Registry data, supplement with Memory metadata
    facilities.value = registryFacilities.map((f) => {
      const mem = memoryLookup.get(f.name);
      return {
        id: f.id,
        name: f.name,
        location: f.location,
        description: f.description,
        status: f.status,
        subLocations:
          f.sub_locations
            ?.map((sl: any) =>
              typeof sl === 'string'
                ? sl
                : `${sl.name}${sl.description ? '(' + sl.description + ')' : ''}`
            )
            .join('、') || '',
        staff: f.staff?.join('、') || '',
        turnCount: mem?.turnCount || '?',
        gameDate: mem?.gameDate || '?',
        isFromRegistry: true
      };
    });

    // 4. If registry is empty (unlikely after sync, but safe), fallback to old memory logic
    if (facilities.value.length === 0 && allFacilityMemories.length > 0) {
      const facilityMap = new Map<string, any>();
      allFacilityMemories.forEach((m) => {
        const name = extractFacilityName(m.content);
        if (name && !facilityMap.has(name)) {
          const parsed = parseFacilityContent(m.content);
          facilityMap.set(name, {
            ...parsed,
            id: m.id,
            turnCount: m.turnCount,
            gameDate: m.gameDate
          });
        }
      });
      facilities.value = Array.from(facilityMap.values());
    }
  } catch (error) {
    console.error('Failed to load facilities:', error);
  } finally {
    isLoading.value = false;
  }
}

function extractFacilityName(content: string): string | null {
  const match = content.match(/【([^】]+)】/);
  if (match) return match[1] ?? null;

  // Fallback for old data
  const locMatch = content.match(/地点：([^，\n]+)/);
  if (locMatch) return locMatch[1] ?? null;

  return null;
}

function parseFacilityContent(content: string) {
  const lines = content.split('\n');
  const data: any = {
    name: extractFacilityName(content),
    location: '',
    description: '',
    status: '',
    subLocations: '',
    staff: ''
  };

  lines.forEach((line) => {
    if (line.startsWith('地点：')) data.location = line.replace('地点：', '').trim();
    if (line.startsWith('介绍：') || line.startsWith('描述：'))
      data.description = line.replace(/介绍：|描述：/, '').trim();
    if (line.startsWith('状态：')) data.status = line.replace('状态：', '').trim();
    if (line.startsWith('子地点：') || line.startsWith('子区域：'))
      data.subLocations = line.replace(/子地点：|子区域：/, '').trim();
    if (line.startsWith('人员：') || line.startsWith('成员：'))
      data.staff = line.replace(/人员：|成员：/, '').trim();
  });

  return data;
}

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      loadFacilities();
      audioManager.playPageFlip();
    }
  }
);

function close() {
  emit('close');
  audioManager.playSoftClick();
}

async function removeFacility(id: string) {
  if (confirm('确定要清除这处设施的档案吗？(操作无法撤销)')) {
    await dbService.deleteFacility(id);
    audioManager.playSoftClick();
    loadFacilities();
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[110] flex items-center justify-center bg-izakaya-wood/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div
        class="bg-izakaya-paper w-full max-w-2xl h-[70vh] flex flex-col overflow-hidden rounded-xl shadow-2xl border-2 border-touhou-red/30 relative"
      >
        <!-- Texture Overlay -->
        <div class="absolute inset-0 pointer-events-none opacity-10 bg-texture-rice-paper"></div>

        <!-- Header -->
        <div
          class="p-4 border-b border-izakaya-wood/10 flex items-center justify-between bg-touhou-red/5 relative z-10"
        >
          <h2 class="text-xl font-bold font-display flex items-center gap-2 text-izakaya-wood">
            <Home class="w-6 h-6 text-touhou-red" />
            领地与设施 (Facilities)
          </h2>
          <button
            @click="close"
            class="p-1.5 hover:bg-white/50 text-izakaya-wood/50 hover:text-touhou-red rounded-full transition-colors"
          >
            <X class="w-6 h-6" />
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-6 bg-white/20 relative z-10 custom-scrollbar">
          <div
            v-if="isLoading"
            class="flex flex-col items-center justify-center py-20 gap-3 text-izakaya-wood/40"
          >
            <div
              class="w-8 h-8 border-4 border-touhou-red/20 border-t-touhou-red rounded-full animate-spin"
            ></div>
            <span>正在检索领地信息...</span>
          </div>

          <div
            v-else-if="facilities.length === 0"
            class="text-center py-20 text-izakaya-wood/40 flex flex-col items-center gap-4"
          >
            <Home class="w-16 h-16 opacity-10" />
            <div class="space-y-1">
              <p class="text-lg font-display">暂无名下设施</p>
              <p class="text-sm">在幻想乡中努力经营，获取属于你的领地吧。</p>
            </div>
          </div>

          <div v-else class="grid grid-cols-1 gap-6">
            <div
              v-for="fac in facilities"
              :key="fac.id"
              class="bg-white/70 rounded-xl border border-izakaya-wood/10 shadow-sm hover:shadow-md transition-all overflow-hidden group"
            >
              <!-- Card Header -->
              <div
                class="bg-izakaya-wood/5 p-4 border-b border-izakaya-wood/5 flex justify-between items-center"
              >
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-touhou-red/10 rounded-lg">
                    <Home class="w-5 h-5 text-touhou-red" />
                  </div>
                  <div>
                    <h3 class="font-bold text-lg text-izakaya-wood font-display">{{ fac.name }}</h3>
                    <div class="flex items-center gap-1 text-xs text-izakaya-wood/60">
                      <MapPin class="w-3 h-3" />
                      {{ fac.location }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <div
                    class="px-3 py-1 rounded-full text-xs font-bold"
                    :class="
                      fac.status.includes('正常') || fac.status.includes('经营')
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    "
                  >
                    {{ fac.status }}
                  </div>
                  <button
                    @click="removeFacility(fac.id)"
                    class="p-1.5 bg-white/50 text-red-500 hover:text-white hover:bg-red-500 rounded-full transition-colors shadow-sm"
                    title="清除该条目"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <!-- Card Body -->
              <div class="p-4 space-y-4">
                <div
                  v-if="fac.description"
                  class="text-sm text-izakaya-wood/80 italic border-l-2 border-izakaya-wood/10 pl-3 leading-relaxed"
                >
                  {{ fac.description }}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <!-- Sub-locations -->
                  <div class="space-y-2">
                    <div class="text-xs font-bold text-izakaya-wood/40 flex items-center gap-1">
                      <Activity class="w-3 h-3" /> 子地点 / 区域
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <template v-if="fac.subLocations">
                        <span
                          v-for="loc in fac.subLocations.split('、')"
                          :key="loc"
                          class="px-2 py-1 bg-white border border-izakaya-wood/5 rounded text-xs text-izakaya-wood/70 shadow-sm"
                        >
                          {{ loc }}
                        </span>
                      </template>
                      <span v-else class="text-xs text-izakaya-wood/30 italic">暂无记录</span>
                    </div>
                  </div>

                  <!-- Staff -->
                  <div class="space-y-2">
                    <div class="text-xs font-bold text-izakaya-wood/40 flex items-center gap-1">
                      <Users class="w-3 h-3" /> 相关人员
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <template v-if="fac.staff">
                        <span
                          v-for="person in fac.staff.split('、')"
                          :key="person"
                          class="px-2 py-1 bg-touhou-red/5 border border-touhou-red/10 rounded text-xs text-touhou-red/70 font-medium"
                        >
                          {{ person }}
                        </span>
                      </template>
                      <span v-else class="text-xs text-izakaya-wood/30 italic">暂无记录</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Card Footer -->
              <div
                class="px-4 py-2 bg-izakaya-wood/[0.02] text-[10px] text-izakaya-wood/30 flex justify-between"
              >
                <span>最后变动于 Turn {{ fac.turnCount }}</span>
                <span>档案更新：{{ fac.gameDate }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(139, 69, 19, 0.1);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 69, 19, 0.2);
}
</style>
