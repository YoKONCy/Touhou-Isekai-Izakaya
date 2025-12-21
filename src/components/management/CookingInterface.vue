<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { X, ChefHat, Flame, Timer, Check, Info } from 'lucide-vue-next';
import type { Ingredient, CookingSession } from '@/types/management';

const props = defineProps<{
  customerRequirement?: string; // e.g. "I want something spicy"
}>();

const emit = defineEmits(['close', 'finish']);

onMounted(() => {
    // console.log('Cooking Interface Mounted');
});

// State
const dishName = ref('');
const potIngredients = ref<{ ingredient: Ingredient; timeAdded: number; x: number; y: number }[]>([]);
const isDragging = ref(false);
const draggedIngredient = ref<Ingredient | null>(null);
const cookingTime = ref(0);
const accumulatedHeat = ref(0); // Total heat energy
const fireLevel = ref<'low' | 'medium' | 'high'>('medium');
const timerInterval = ref<number | null>(null);
const potHovered = ref(false);

const HEAT_RATES = {
    low: 1,
    medium: 2,
    high: 4
};

// Constants
const BASE_INGREDIENTS: Ingredient[] = [
  { id: 'rice', name: '大米', type: 'base', icon: '🍚', color: '#f5f5f5' },
  { id: 'flour', name: '面粉', type: 'base', icon: '🌾', color: '#fff8e1' },
  { id: 'water', name: '泉水', type: 'base', icon: '💧', color: '#e3f2fd' },
  { id: 'oil', name: '食用油', type: 'base', icon: '🫗', color: '#fff9c4' },
];

const SPECIAL_INGREDIENTS: Ingredient[] = [
  { id: 'chili', name: '辣椒', type: 'spice', icon: '🌶️', color: '#ffcdd2' },
  { id: 'shrimp', name: '鲜虾', type: 'main', icon: '🦐', color: '#ffccbc' },
  { id: 'lemon', name: '柠檬', type: 'spice', icon: '🍋', color: '#fff9c4' },
  { id: 'pork', name: '猪肉', type: 'main', icon: '🥩', color: '#ef9a9a' },
  { id: 'cabbage', name: '卷心菜', type: 'vegetable', icon: '🥬', color: '#c8e6c9' },
  { id: 'egg', name: '鸡蛋', type: 'main', icon: '🥚', color: '#ffe0b2' },
  { id: 'mushroom', name: '蘑菇', type: 'vegetable', icon: '🍄', color: '#d7ccc8' },
  { id: 'onion', name: '洋葱', type: 'vegetable', icon: '🧅', color: '#e1bee7' },
];

// Computed
const currentPhase = computed(() => {
    // Phase depends on accumulated heat now
    // Adjusted thresholds since heat accumulates faster
    if (accumulatedHeat.value < 20) return '预热';
    if (accumulatedHeat.value < 60) return '烹饪中';
    if (accumulatedHeat.value < 100) return '收汁';
    return '过火';
});

const phaseColor = computed(() => {
    if (currentPhase.value === '预热') return 'text-blue-400';
    if (currentPhase.value === '烹饪中') return 'text-green-500';
    if (currentPhase.value === '收汁') return 'text-orange-500';
    return 'text-red-500';
});

// Methods
const startCooking = () => {
    if (timerInterval.value) return;
    const startTime = Date.now();
    timerInterval.value = window.setInterval(() => {
        // Increment real time
        cookingTime.value = Math.floor((Date.now() - startTime) / 1000);
        
        // Increment heat based on fire level
        accumulatedHeat.value += HEAT_RATES[fireLevel.value];
    }, 1000);
};

const setFireLevel = (level: 'low' | 'medium' | 'high') => {
    fireLevel.value = level;
};

const handleDragStart = (event: DragEvent, ingredient: Ingredient) => {
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', ingredient.id);
    }
    isDragging.value = true;
    draggedIngredient.value = ingredient;
};

const handleDragEnd = () => {
    isDragging.value = false;
    draggedIngredient.value = null;
    potHovered.value = false;
};

const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    potHovered.value = false;
    
    if (draggedIngredient.value) {
        // Start timer on first ingredient if not started
        if (potIngredients.value.length === 0) {
            startCooking();
        }

        // Add to pot with random position within the pot area
        // We'll just store normalized coordinates (0-100%)
        const x = 20 + Math.random() * 60;
        const y = 30 + Math.random() * 40;
        
        potIngredients.value.push({
            ingredient: draggedIngredient.value,
            timeAdded: cookingTime.value,
            x, 
            y
        });
        
        // Visual effect logic could go here
    }
    
    handleDragEnd();
};

const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    potHovered.value = true;
};

const handleDragLeave = () => {
    potHovered.value = false;
};

const finishCooking = () => {
    if (timerInterval.value) {
        clearInterval(timerInterval.value);
        timerInterval.value = null;
    }
    
    const result: CookingSession = {
        dishName: dishName.value || '无名料理',
        ingredients: potIngredients.value.map((item, index) => ({
            ingredient: item.ingredient,
            timeAdded: item.timeAdded,
            cookedDuration: cookingTime.value - item.timeAdded,
            sequence: index + 1
        })),
        startTime: Date.now() - cookingTime.value * 1000,
        totalDuration: cookingTime.value,
        accumulatedHeat: accumulatedHeat.value,
        finalPhase: currentPhase.value,
        status: 'finished'
    };
    
    emit('finish', result);
};

onUnmounted(() => {
    if (timerInterval.value) {
        clearInterval(timerInterval.value);
    }
});

</script>

<template>
  <div class="cooking-overlay animate-fade-in">
    <!-- Header -->
    <div class="cooking-header">
        <div class="header-left">
            <ChefHat class="w-8 h-8 text-orange-400" />
            <h2 class="text-2xl font-bold text-white font-display tracking-wide">自由烹饪模式</h2>
        </div>
        <button class="close-btn" @click="$emit('close')">
            <X class="w-6 h-6" />
        </button>
    </div>

    <div class="cooking-container">
        <!-- Left Panel: Pot Area -->
        <div class="pot-section">
            <div class="pot-status">
                <div class="status-card">
                    <span class="label">当前火候</span>
                    <div class="value flex items-center gap-2">
                        <Flame class="w-5 h-5" :class="phaseColor" />
                        <span :class="phaseColor">{{ currentPhase }}</span>
                    </div>
                    <div class="fire-controls">
                        <button 
                            class="fire-btn low" 
                            :class="{ active: fireLevel === 'low' }"
                            @click="setFireLevel('low')"
                            title="小火"
                        >S</button>
                        <button 
                            class="fire-btn medium" 
                            :class="{ active: fireLevel === 'medium' }"
                            @click="setFireLevel('medium')"
                            title="中火"
                        >M</button>
                        <button 
                            class="fire-btn high" 
                            :class="{ active: fireLevel === 'high' }"
                            @click="setFireLevel('high')"
                            title="大火"
                        >L</button>
                    </div>
                </div>
                <div class="status-card">
                    <span class="label">烹饪时间</span>
                    <div class="value flex items-center gap-2">
                        <Timer class="w-5 h-5 text-gray-400" />
                        <span class="text-white">{{ cookingTime }}s</span>
                    </div>
                </div>
            </div>

            <!-- The Pot -->
            <div 
                class="pot-container"
                :class="{ 'pot-hovered': potHovered }"
                @dragover="handleDragOver"
                @dragleave="handleDragLeave"
                @drop="handleDrop"
            >
                <div class="pot-rim"></div>
                <div class="pot-body">
                    <div class="soup-base">
                        <!-- Bubbling animation could go here -->
                        <div class="bubble b1"></div>
                        <div class="bubble b2"></div>
                        <div class="bubble b3"></div>
                    </div>
                    
                    <!-- Floating Ingredients -->
                    <transition-group name="toss">
                        <div 
                            v-for="(item, index) in potIngredients" 
                            :key="index"
                            class="floating-ingredient"
                            :style="{ left: item.x + '%', top: item.y + '%' }"
                        >
                            <span class="text-2xl">{{ item.ingredient.icon }}</span>
                            <div class="ingredient-timer-badge">
                                {{ cookingTime - item.timeAdded }}s
                            </div>
                        </div>
                    </transition-group>
                </div>
                <div class="pot-handle-left"></div>
                <div class="pot-handle-right"></div>
            </div>

            <!-- Dish Naming & Finish -->
            <div class="finish-section">
                <input 
                    v-model="dishName"
                    type="text" 
                    placeholder="为这道菜命名..." 
                    class="dish-name-input"
                />
                <button 
                    class="finish-btn"
                    :disabled="potIngredients.length === 0"
                    @click="finishCooking"
                >
                    <Check class="w-5 h-5" />
                    <span>完成料理</span>
                </button>
            </div>
        </div>

        <!-- Right Panel: Ingredients -->
        <div class="ingredients-section">
            <!-- Customer Request Hint -->
            <div class="request-hint" v-if="customerRequirement">
                <Info class="w-4 h-4 text-blue-400" />
                <span class="text-sm text-gray-300">顾客要求: <span class="text-white font-bold">{{ customerRequirement }}</span></span>
            </div>

            <!-- Base Ingredients -->
            <div class="category-group">
                <h3 class="category-title">基础素材 (无限)</h3>
                <div class="ingredients-grid">
                    <div 
                        v-for="item in BASE_INGREDIENTS" 
                        :key="item.id"
                        class="ingredient-card base-card"
                        draggable="true"
                        @dragstart="handleDragStart($event, item)"
                        @dragend="handleDragEnd"
                    >
                        <div class="ingredient-icon">{{ item.icon }}</div>
                        <span class="ingredient-name">{{ item.name }}</span>
                    </div>
                </div>
            </div>

            <!-- Special Ingredients -->
            <div class="category-group mt-6">
                <h3 class="category-title">持有食材</h3>
                <div class="ingredients-grid">
                    <div 
                        v-for="item in SPECIAL_INGREDIENTS" 
                        :key="item.id"
                        class="ingredient-card special-card"
                        draggable="true"
                        @dragstart="handleDragStart($event, item)"
                        @dragend="handleDragEnd"
                    >
                        <div class="ingredient-icon">{{ item.icon }}</div>
                        <span class="ingredient-name">{{ item.name }}</span>
                        <span class="ingredient-count">x99</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
  </div>
</template>

<style scoped>
.cooking-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(15, 23, 42, 0.95);
    z-index: 5000;
    display: flex;
    flex-direction: column;
    padding: 20px;
    backdrop-filter: blur(8px);
    color: white;
    pointer-events: auto; /* Ensure events are captured */
}

.cooking-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 20px 20px 20px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
}

.header-left {
    display: flex;
    align-items: center;
    gap: 12px;
}

.close-btn {
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.6);
    cursor: pointer;
    transition: color 0.2s;
}

.close-btn:hover {
    color: white;
}

.cooking-container {
    flex: 1;
    display: flex;
    gap: 40px;
    padding: 30px;
    overflow: hidden;
}

/* Pot Section */
.pot-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
}

.pot-status {
    display: flex;
    gap: 30px;
    width: 100%;
    justify-content: center;
}

.status-card {
    background: rgba(255,255,255,0.05);
    padding: 10px 20px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.1);
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 120px;
}

.status-card .label {
    font-size: 0.8rem;
    color: rgba(255,255,255,0.5);
    margin-bottom: 4px;
}

.status-card .value {
    font-size: 1.2rem;
    font-weight: bold;
}

.fire-controls {
    display: flex;
    gap: 8px;
    margin-top: 8px;
}

.fire-btn {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.7);
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: bold;
}

.fire-btn:hover {
    background: rgba(255,255,255,0.2);
    color: white;
}

.fire-btn.low.active {
    background: #42a5f5; /* Blue */
    color: white;
    border-color: #42a5f5;
    box-shadow: 0 0 8px rgba(66, 165, 245, 0.5);
}

.fire-btn.medium.active {
    background: #66bb6a; /* Green */
    color: white;
    border-color: #66bb6a;
    box-shadow: 0 0 8px rgba(102, 187, 106, 0.5);
}

.fire-btn.high.active {
    background: #ef5350; /* Red */
    color: white;
    border-color: #ef5350;
    box-shadow: 0 0 8px rgba(239, 83, 80, 0.5);
}

.pot-container {
    width: 400px;
    height: 300px;
    position: relative;
    margin: 40px 0;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pot-hovered {
    transform: scale(1.05);
}

.pot-body {
    width: 100%;
    height: 100%;
    background: #37474f;
    border-radius: 0 0 100px 100px;
    position: relative;
    overflow: hidden;
    border: 8px solid #263238;
    box-shadow: inset 0 -20px 40px rgba(0,0,0,0.5);
    z-index: 2;
}

.soup-base {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 80%;
    background: linear-gradient(to bottom, rgba(255, 167, 38, 0.8), rgba(230, 81, 0, 0.9));
    border-radius: 0 0 90px 90px;
    transition: height 0.5s;
}

.pot-rim {
    position: absolute;
    top: -10px;
    left: -5%;
    width: 110%;
    height: 30px;
    background: #455a64;
    border-radius: 10px;
    z-index: 3;
    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
}

.pot-handle-left, .pot-handle-right {
    position: absolute;
    top: 40px;
    width: 60px;
    height: 40px;
    background: #263238;
    z-index: 1;
}

.pot-handle-left {
    left: -50px;
    border-radius: 20px 0 0 20px;
}

.pot-handle-right {
    right: -50px;
    border-radius: 0 20px 20px 0;
}

.floating-ingredient {
    position: absolute;
    transform: translate(-50%, -50%);
    animation: float 3s ease-in-out infinite;
    filter: drop-shadow(0 4px 4px rgba(0,0,0,0.3));
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.ingredient-timer-badge {
    font-size: 0.7rem;
    background: rgba(0,0,0,0.6);
    color: white;
    padding: 1px 4px;
    border-radius: 4px;
    margin-top: -5px; /* Pull it up a bit closer */
    pointer-events: none;
}

@keyframes float {
    0%, 100% { transform: translate(-50%, -50%) translateY(0) rotate(0deg); }
    50% { transform: translate(-50%, -50%) translateY(-10px) rotate(5deg); }
}

.bubble {
    position: absolute;
    background: rgba(255,255,255,0.3);
    border-radius: 50%;
    animation: rise 2s infinite ease-in;
}

.b1 { width: 10px; height: 10px; left: 30%; animation-delay: 0s; }
.b2 { width: 15px; height: 15px; left: 60%; animation-delay: 0.5s; }
.b3 { width: 8px; height: 8px; left: 45%; animation-delay: 1.2s; }

@keyframes rise {
    0% { bottom: 0; opacity: 0; }
    50% { opacity: 1; }
    100% { bottom: 100%; opacity: 0; }
}

.finish-section {
    width: 100%;
    max-width: 500px;
    display: flex;
    gap: 15px;
}

.dish-name-input {
    flex: 1;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 8px;
    padding: 12px 16px;
    color: white;
    font-size: 1rem;
    outline: none;
    transition: all 0.2s;
}

.dish-name-input:focus {
    background: rgba(255,255,255,0.15);
    border-color: rgba(255,255,255,0.5);
}

.finish-btn {
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0 24px;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.2s;
}

.finish-btn:hover:not(:disabled) {
    background: #43A047;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
}

.finish-btn:disabled {
    background: #2E3A40; /* Darker grey-green */
    color: rgba(255,255,255,0.3);
    cursor: not-allowed;
}

/* Ingredients Section */
.ingredients-section {
    width: 400px;
    background: rgba(255,255,255,0.03);
    border-left: 1px solid rgba(255,255,255,0.1);
    padding: 20px;
    border-radius: 20px;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}

.request-hint {
    background: rgba(33, 150, 243, 0.1);
    border: 1px solid rgba(33, 150, 243, 0.3);
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.category-title {
    font-size: 0.9rem;
    color: rgba(255,255,255,0.5);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 12px;
    font-weight: bold;
}

.ingredients-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 12px;
}

.ingredient-card {
    background: rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    cursor: grab;
    transition: all 0.2s;
    border: 1px solid transparent;
    position: relative;
}

.ingredient-card:hover {
    background: rgba(255,255,255,0.15);
    transform: translateY(-2px);
    border-color: rgba(255,255,255,0.3);
}

.ingredient-card:active {
    cursor: grabbing;
}

.ingredient-icon {
    font-size: 2rem;
    line-height: 1;
}

.ingredient-name {
    font-size: 0.8rem;
    color: rgba(255,255,255,0.9);
    text-align: center;
}

.ingredient-count {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 0.7rem;
    color: rgba(255,255,255,0.5);
    background: rgba(0,0,0,0.3);
    padding: 1px 4px;
    border-radius: 4px;
}

/* Animations */
.toss-enter-active {
    animation: toss-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes toss-in {
    0% { 
        transform: translate(-50%, -150%) scale(0.5); 
        opacity: 0; 
    }
    100% { 
        transform: translate(-50%, -50%) scale(1); 
        opacity: 1; 
    }
}
</style>
