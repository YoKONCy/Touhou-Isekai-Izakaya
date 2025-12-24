
<template>
  <div class="izakaya-game-container">
    <canvas ref="canvasRef"></canvas>
    
    <div class="ui-overlay">
      <div class="header">
        <span class="title">居酒屋经营模式 (Phase 2: Environment & Interaction)</span>
        <button @click="closeGame" class="close-btn">关闭 (Debug)</button>
      </div>

      <!-- Floor Switcher (Removed) -->


      <!-- Money Display -->
      <div class="money-display">
        <div class="coin-icon">¥</div>
        <span class="amount">{{ revenue }}</span>
      </div>

      <!-- Active Orders Stack -->
      <div class="orders-stack-container" v-if="activeOrders.length > 0">
        <h3 class="orders-title">待处理订单</h3>
        <div class="orders-stack">
           <div 
             v-for="(order, index) in activeOrders" 
             :key="order.id" 
             class="order-card-stack"
             :class="{ 'expanded': expandedOrderId === order.id }"
             :style="{ zIndex: activeOrders.length - index, transform: getStackTransform(index, order.id) }"
             @click="toggleExpand(order.id)"
           >
              <div class="order-header">
                  <span class="table-id">桌号 {{ order.seatId.replace(',', '-') }}</span>
                  <span class="order-price">¥{{ order.price }}</span>
              </div>
              <div class="order-content">
                  <div class="customer-name">{{ order.customerName }}</div>
                  <div class="dish-name">{{ order.dishName }}</div>
                  
                  <div v-if="expandedOrderId === order.id" class="order-details animate-fade-in">
                      <div class="detail-row">
                          <span class="label">特殊要求:</span>
                          <span class="value">无</span>
                      </div>
                      <div class="detail-row">
                          <span class="label">等待时间:</span>
                          <span class="value">刚刚</span>
                      </div>
                  </div>
              </div>
           </div>
        </div>
      </div>

      <!-- Cooking Interface -->
      <CookingInterface 
        v-if="showCooking"
        :customerRequirement="activeCookingCustomer?.requirements"
        @finish="handleCookingFinish"
        @close="handleCookingClose"
      />

      <!-- Interaction Dialog Modal -->
      <div v-if="showInteraction && currentInteraction" class="dialog-overlay animate-fade-in">
        <div class="dialog-box slide-in">
           <div class="dialog-header">
               <span class="dialog-title">{{ currentInteraction.customer.name }}</span>
               <button class="dialog-close" @click="showInteraction = false">×</button>
           </div>
           <div class="dialog-content">
               <p class="dialog-text">"{{ currentInteraction.dialogue }}"</p>
           </div>
           <div class="dialog-actions">
               <button class="action-btn chat-btn">
                   <span>💬</span> Chat
               </button>
               <button v-if="currentInteraction.isOrdering" class="action-btn confirm-btn" @click="handleAcceptOrder">
                   <span>📝</span> Take Order
               </button>
           </div>
        </div>
      </div>

      <!-- Evaluation Result Modal -->
      <div v-if="showEvaluation && evaluationResult" class="dialog-overlay animate-fade-in">
          <div class="evaluation-box pop-in">
              <div class="eval-header">
                  <h2>Dish Evaluation</h2>
                  <div class="score-badge" :class="evaluationResult.score >= 80 ? 'high' : evaluationResult.score >= 60 ? 'mid' : 'low'">
                      {{ evaluationResult.score }}
                  </div>
              </div>
              
              <div class="eval-content">
                  <div class="customer-comment">
                      <span class="quote">“</span>
                      {{ evaluationResult.comment }}
                      <span class="quote">”</span>
                  </div>
                  
                  <div class="eval-stats">
                      <div class="stat-row">
                          <span class="label">Deliciousness:</span>
                          <span class="value">{{ evaluationResult.isDelicious ? 'Delicious! 😋' : 'Average 😐' }}</span>
                      </div>
                      <div class="stat-row">
                          <span class="label">Payment:</span>
                          <span class="value text-gold">¥{{ evaluationResult.payment }}</span>
                      </div>
                      <div class="stat-row">
                          <span class="label">Reputation:</span>
                          <span class="value" :class="evaluationResult.reputation >= 0 ? 'text-green' : 'text-red'">
                              {{ evaluationResult.reputation > 0 ? '+' : '' }}{{ evaluationResult.reputation }}
                          </span>
                      </div>
                  </div>
              </div>

              <div class="eval-actions">
                  <button class="action-btn confirm-btn full-width" @click="showEvaluation = false">
                      Excellent!
                  </button>
              </div>
          </div>
      </div>

      <!-- Hand Inventory -->
      <div class="hand-inventory">
        <div class="hand-slot left-hand" :class="{ 'has-item': handInventory[0] }">
            <span class="hand-label">L</span>
            <div v-if="handInventory[0]" class="item-icon">
                {{ handInventory[0].type === 'bowl' ? '🥣' : '🍲' }}
            </div>
            <span v-if="handInventory[0]" class="item-name">{{ handInventory[0].name }}</span>
            <span v-else class="empty-text">Empty</span>
        </div>
        <div class="hand-slot right-hand" :class="{ 'has-item': handInventory[1] }">
            <span class="hand-label">R</span>
            <div v-if="handInventory[1]" class="item-icon">
                {{ handInventory[1].type === 'bowl' ? '🥣' : '🍲' }}
            </div>
            <span v-if="handInventory[1]" class="item-name">{{ handInventory[1].name }}</span>
            <span v-else class="empty-text">Empty</span>
        </div>
      </div>

      <div class="controls-hint">
        WASD / Arrow Keys to Move | F / Space to Interact
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { IzakayaScene } from '@/services/management/IzakayaScene';
import { generateMap } from '@/services/management/MapGenerator';
import { useGameStore } from '@/stores/game';
import { useToastStore } from '@/stores/toast';
import { generateCustomerDialogue, evaluateDish } from '@/services/management/CustomerService';
import CookingInterface from './CookingInterface.vue';
import type { Item, Customer, CookingSession } from '@/types/management';

const gameStore = useGameStore();
const toastStore = useToastStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);

// State for Interaction Modal
const showInteraction = ref(false);
const currentInteraction = ref<{
    customer: Customer;
    dialogue: string;
    isOrdering: boolean;
} | null>(null);

const evaluationResult = ref<{
    score: number;
    comment: string;
    payment: number;
    reputation: number;
    isDelicious: boolean;
} | null>(null);
const showEvaluation = ref(false);
let scene: IzakayaScene | null = null;
const isGeneratingMap = ref(false);

const revenue = ref(0);
// Inventory State
const handInventory = ref<(Item | null)[]>([null, null]);
const kitchenPot = ref<{ hasFood: boolean, food: CookingSession | null }>({ hasFood: false, food: null });

interface Order {
  id: string;
  customerName: string;
  dishName: string;
  price: number;
  seatId: string;
}
const activeOrders = ref<Order[]>([]);
const expandedOrderId = ref<string | null>(null);

// Cooking State
const showCooking = ref(false);
const activeCookingCustomer = ref<{ id: string, name: string, requirements: string } | null>(null);

const emit = defineEmits(['close']);



const getStackTransform = (index: number, id: string) => {
    if (expandedOrderId.value === id) {
        // Expanded card pops up and centers slightly
        return `translateY(-${index * 4}px) scale(1.02) translateY(-10px)`;
    }
    // Stack effect: lower cards are pushed down and scaled down
    return `translateY(${index * 5}px) scale(${1 - index * 0.02})`;
};

const toggleExpand = (id: string) => {
    if (expandedOrderId.value === id) {
        expandedOrderId.value = null;
    } else {
        expandedOrderId.value = id;
    }
};

const handleCustomerInteract = async (event: Event) => {
    const { customer, dialogType } = (event as CustomEvent).detail;
    
    if (dialogType === 'ordering') {
        let dialogue = "Please... I'm hungry.";
        
        if (customer.isSpecial) {
             // Use pre-generated or generate now
             if (customer.dialogue) {
                 dialogue = customer.dialogue;
             } else {
                 dialogue = await generateCustomerDialogue(customer.name, "Ordering food at Izakaya");
                 customer.dialogue = dialogue; // Cache it
             }
        } else {
            const commonLines = ["Menu, please!", "What's recommended?", "I'm starving!"];
            dialogue = commonLines[Math.floor(Math.random() * commonLines.length)] || "Menu, please!";
        }

        currentInteraction.value = {
            customer,
            dialogue,
            isOrdering: true
        };
        showInteraction.value = true;
    }
};

const handleAcceptOrder = () => {
    if (currentInteraction.value && scene) {
        scene.takeOrder(currentInteraction.value.customer.id);
        showInteraction.value = false;
        currentInteraction.value = null;
    }
};

const handleInteract = (e: Event) => {
  const customEvent = e as CustomEvent;
  const { tileName, x, y } = customEvent.detail;
  
  let message = `Interacted with ${tileName} at (${x}, ${y})`;
  let type: 'info' | 'success' | 'warning' | 'error' = 'info';

  if (tileName === 'COOKING_POT') {
    // Kitchen Interaction Logic
    if (kitchenPot.value.hasFood) {
        // Plating Logic
          const bowlIndex = handInventory.value.findIndex(item => item?.type === 'bowl');
          if (bowlIndex !== -1) {
              // Found a bowl, plate the food
            const food = kitchenPot.value.food!;
            handInventory.value[bowlIndex] = {
                id: `dish-${Date.now()}`,
                name: food.dishName,
                type: 'dish',
                data: food
            };
            kitchenPot.value = { hasFood: false, food: null };
            
            message = `成功装盘: ${food.dishName}`;
            type = 'success';
        } else {
            message = "需要拿碗来装盘";
            type = 'warning';
        }
    } else {
        // Cooking Logic
        // Check if hands are free (Prompt: "In player hand has items, cannot cook")
        // Strict: If any item is held, cannot start cooking
        const hasItems = handInventory.value.some(item => item !== null);
        
        if (hasItems) {
            message = "手里拿着东西无法烹饪 (需要空手)";
            type = 'warning';
        } else {
            // Open Cooking UI
            handleCookingInteract();
            return; // Skip default toast
        }
    }
  } else if (tileName === 'BOWL_STACK') {
      // Let's make it: If holding ONLY empty bowls, interact with BOWL_STACK puts them back.
      
      const bowlIndex = handInventory.value.findIndex(item => item?.type === 'bowl');
      if (bowlIndex !== -1) {
          // Keep reference if needed for future logic
      }

      const hasOnlyBowls = handInventory.value.every(item => item === null || item.type === 'bowl') && handInventory.value.some(item => item !== null);
      
      if (hasOnlyBowls) {
          // Put back one bowl
          const slot = handInventory.value.findIndex(item => item?.type === 'bowl');
          if (slot !== -1) {
              handInventory.value[slot] = null;
              message = "放回: 空碗";
              type = 'info';
          }
      } else {
          // Try to take bowl
           const emptySlotIndex = handInventory.value.findIndex(item => item === null);
           if (emptySlotIndex !== -1) {
               handInventory.value[emptySlotIndex] = {
                   id: `bowl-${Date.now()}`,
                   name: '空碗',
                   type: 'bowl'
               };
               message = "获得: 空碗";
               type = 'success';
           } else {
               message = "手拿不下了";
               type = 'warning';
           }
      }
  } else if (tileName === 'SERVING_TABLE') {
      const placedItem = scene?.getPlacedItem(x, y);
      
      if (placedItem) {
          // Table has item, try to pick it up
          const emptySlotIndex = handInventory.value.findIndex(item => item === null);
          if (emptySlotIndex !== -1) {
              const item = scene?.pickItem(x, y);
              if (item) {
                  handInventory.value[emptySlotIndex] = item;
                  message = `拿起了: ${item.name}`;
                  type = 'info';
              }
          } else {
              message = "手里满了，无法拿起";
              type = 'warning';
          }
      } else {
          // Table is empty, try to place item
          // Place the first item found in hand
          const slotIndex = handInventory.value.findIndex(item => item !== null);
          if (slotIndex !== -1) {
              const itemToPlace = handInventory.value[slotIndex];
              if (itemToPlace) {
                  if (scene?.placeItem(x, y, itemToPlace)) {
                      handInventory.value[slotIndex] = null;
                      message = `放置了: ${itemToPlace.name}`;
                      type = 'info';
                  } else {
                      message = "无法放置";
                      type = 'warning';
                  }
              }
          } else {
              message = "手里没有东西可放";
              type = 'info';
          }
      }
  } else if (tileName === 'CHAIR' || tileName === 'COUNTER') {
    // Check if there is a customer
    const entity = (customEvent.detail as any).entity;
    if (entity && entity.type === 'customer') {
        const customer = entity;
        // Check if customer is waiting for food
        // Note: We need access to customer state. IzakayaScene exposes entity, but we need to know its state.
        // Assuming entity object in event detail is the actual reference or copy with state.
        
        if (customer.state === 'waiting_food') {
             // Check if player has dish
             const dishIndex = handInventory.value.findIndex(item => item?.type === 'dish');
             if (dishIndex !== -1) {
                 const dishItem = handInventory.value[dishIndex];
                 const dishSession = dishItem?.data as CookingSession;
                 
                 // Serve food
                 // Remove dish from hand
                 handInventory.value[dishIndex] = null;
                 
                 // Evaluation Logic
                 if (customer.isSpecial && dishSession) {
                     // Trigger LLM Evaluation
                     evaluateDish(customer, dishSession).then(result => {
                         evaluationResult.value = result;
                         showEvaluation.value = true;
                         
                         // Update Revenue and Reputation based on result
                         // Note: serveCustomer in scene just sets state to eating.
                         // We should override revenue calculation or handle it here?
                         // Scene calculates revenue on finish eating based on order price.
                         // We can update order price?
                         if (customer.order) {
                             customer.order.price = result.payment;
                         }
                         gameStore.state.player.reputation += result.reputation;
                     });
                 } else {
                     // Simple logic for normal customers
                     // Maybe bonus if cooked well?
                     // For now, just standard price.
                 }

                 // Tell scene to update customer
                  if (scene) {
                      scene.serveCustomer(customer.id);
                  }
                  
                  toastStore.addToast({
                     message: `上菜成功: ${dishItem!.name}`,
                     type: 'success',
                     duration: 2000
                 });
             } else {
                 toastStore.addToast({
                     message: "顾客在等餐，但你手里没有料理",
                     type: 'warning',
                     duration: 2000
                 });
             }
        } else {
            // Just chatting or other states
            // If seated and not ordering/waiting, maybe small talk?
            // Let's stick to ordering interaction for now.
        }
    }
    return; 
  } else if (tileName === 'EXIT') {
    message = "准备打烊? (End Day UI Placeholder)";
    type = 'warning';
  }

  toastStore.addToast({
    message,
    type,
    duration: 2000
  });
};

const handleOrderUpdate = (e: Event) => {
    const customEvent = e as CustomEvent;
    const { type, orderId, customerName, dishName, price, seatId } = customEvent.detail;

    if (type === 'add') {
        activeOrders.value.push({
            id: orderId,
            customerName,
            dishName,
            price,
            seatId
        });
        toastStore.addToast({
            message: `新订单: ${dishName} (${customerName})`,
            type: 'info',
            duration: 3000
        });
    } else if (type === 'complete' || type === 'cancel') {
        const index = activeOrders.value.findIndex(o => o.id === orderId);
        if (index !== -1) {
            activeOrders.value.splice(index, 1);
        }
    }
};

const handleRevenue = (e: Event) => {
    const customEvent = e as CustomEvent;
    const { amount } = customEvent.detail;
    revenue.value += amount;
    
    toastStore.addToast({
        message: `获得收入: ¥${amount}`,
        type: 'success',
        duration: 2000
    });
};

const handleCookingInteract = () => {
    // Check if we have an active order that needs cooking
    // For now, we'll just open the cooking interface. 
    // In a real scenario, we might want to link it to a specific order if we want to show requirements.
    
    // Find the oldest active order to serve as "current context" if available
    const order = activeOrders.value[0];
    if (order) {
        activeCookingCustomer.value = {
            id: order.id, // Using order ID as link
            name: order.customerName,
            requirements: order.dishName // Using dish name as requirement for now
        };
    } else {
        activeCookingCustomer.value = null;
    }
    
    showCooking.value = true;
};

const handleCookingFinish = (result: CookingSession) => {
    console.log('Cooking Finished:', result);
    showCooking.value = false;
    
    // Store food in pot
    kitchenPot.value = {
        hasFood: true,
        food: result
    };
    
    toastStore.addToast({
        message: `烹饪完成! 料理在锅里 (请拿碗装盘)`,
        type: 'success',
        duration: 2000
    });
};

const handleCookingClose = () => {
    showCooking.value = false;
};

const initScene = (mapData: any) => {
    if (!canvasRef.value) return;

    console.log("[IzakayaGame] Initializing scene with map data:", mapData);

    // Cleanup existing scene if any
    if (scene) {
        console.log("[IzakayaGame] Stopping existing scene...");
        scene.stop();
        canvasRef.value.removeEventListener('izakaya-interact', handleInteract);
        canvasRef.value.removeEventListener('izakaya-customer-interact', handleCustomerInteract);
        canvasRef.value.removeEventListener('izakaya-order-update', handleOrderUpdate);
        canvasRef.value.removeEventListener('izakaya-revenue', handleRevenue);
    }

    scene = new IzakayaScene(
        canvasRef.value, 
        mapData?.layout
    );

    scene.start();
    console.log("[IzakayaGame] Scene started.");

    canvasRef.value.addEventListener('izakaya-interact', handleInteract);
    canvasRef.value.addEventListener('izakaya-customer-interact', handleCustomerInteract);
    canvasRef.value.addEventListener('izakaya-order-update', handleOrderUpdate);
    canvasRef.value.addEventListener('izakaya-revenue', handleRevenue);
};

// Watch for map updates
watch(() => gameStore.state.system.customMap, (newMap) => {
    if (newMap) {
        console.log("Map updated, re-initializing scene...", newMap);
        // Deep log to verify content
        if (newMap.layout) console.log("New Layout Rows:", newMap.layout.length);
        
        initScene(newMap);
        toastStore.addToast({
            message: "场景已更新！",
            type: "success",
            duration: 3000
        });
    }
}, { deep: true });

onMounted(async () => {
  if (canvasRef.value) {
    // Check if we need to generate a map
    // Access customMap from system state
    if (!gameStore.state.system.customMap && !isGeneratingMap.value) {
        isGeneratingMap.value = true;
        console.log("Generating initial map...");
        try {
            // Get context from system state if available
            const managementState = gameStore.state.system.management;
            // Combine storeDescription (layout) and context (story) if available
            const parts = [];
            if (managementState?.storeDescription) {
                parts.push(`Layout Requirements: ${managementState.storeDescription}`);
            }
            if (managementState?.context) {
                parts.push(`Story Context: ${managementState.context}`);
            }
            const context = parts.join('\n\n');
            
            console.log("[IzakayaGame] Generating map with context length:", context.length);
            console.log("[IzakayaGame] Using context for map:", context.substring(0, 50) + "...");
            
            // Check for previous map (Renovation context)
            const previousMap = managementState?.previousMap;
            if (previousMap) {
                console.log("[IzakayaGame] Renovation Mode: Using previous map as reference.");
            }

            const mapData = await generateMap("New Izakaya", context, previousMap);
            // Update state with correct structure
            const newSystemState: any = {
                ...gameStore.state.system,
                customMap: mapData
            };

            if (managementState) {
                newSystemState.management = {
                    ...managementState,
                    previousMap: undefined // Clear previous map after usage to avoid stale refs
                };
            }

            gameStore.updateState({
                system: newSystemState
            });
        } catch (e) {
            console.error("Map gen failed", e);
        } finally {
            isGeneratingMap.value = false;
        }
    }

    // Initial Scene Setup
    const mapData = gameStore.state.system.customMap;
    initScene(mapData);
  }
});

onUnmounted(() => {
  if (scene) {
    scene.stop();
  }
  if (canvasRef.value) {
    canvasRef.value.removeEventListener('izakaya-interact', handleInteract);
    canvasRef.value.removeEventListener('izakaya-customer-interact', handleCustomerInteract);
    canvasRef.value.removeEventListener('izakaya-order-update', handleOrderUpdate);
    canvasRef.value.removeEventListener('izakaya-revenue', handleRevenue);
  }
});

const closeGame = () => {
  emit('close');
  // In real implementation, this would trigger the "End of Day" logic
};
</script>

<style scoped>
.izakaya-game-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: #1a1a1a;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000; /* High z-index to cover everything */
}

canvas {
  background: #2c3e50;
  box-shadow: 0 0 20px rgba(0,0,0,0.5);
  border-radius: 4px;
  image-rendering: pixelated; /* Sharp pixels */
  image-rendering: crisp-edges;
}

.ui-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* Let clicks pass through to canvas if needed, but here we capture button clicks */
}

.header {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  padding: 10px 20px;
  border-radius: 8px;
  color: white;
  pointer-events: auto;
  display: flex;
  gap: 20px;
  align-items: center;
}

/* Floor Switcher */
/* Removed */

/* Money Display */
.money-display {
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid #FFD700;
    padding: 10px 20px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #FFD700;
    font-family: 'Courier New', monospace;
    font-weight: bold;
    font-size: 1.5rem;
    backdrop-filter: blur(4px);
}

.coin-icon {
    background: #FFD700;
    color: #333;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 14px;
}

/* Orders Stack */
.orders-stack-container {
    position: absolute;
    bottom: 20px;
    left: 20px;
    width: 250px;
    height: 300px; /* Fixed height area for stack */
    display: flex;
    flex-direction: column;
    pointer-events: none; /* Let clicks pass through, but children will catch them */
}

.orders-title {
    color: white;
    font-size: 1.1rem;
    text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    margin: 0 0 10px 0;
    padding-left: 5px;
    border-left: 4px solid #FF5252;
}

.orders-stack {
    position: relative;
    width: 100%;
    flex: 1;
    perspective: 1000px;
}

.order-card-stack {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    background: #fff;
    border-radius: 12px;
    padding: 12px;
    box-shadow: 0 -4px 10px rgba(0,0,0,0.2);
    border: 1px solid rgba(0,0,0,0.1);
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    transform-origin: bottom center;
    cursor: pointer;
    pointer-events: auto;
    
    /* Poker card look */
    background-image: linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%);
}

.order-card-stack:hover {
    transform: translateY(-15px) !important; /* Peek up on hover */
    z-index: 100 !important;
}

.order-card-stack.expanded {
    z-index: 200 !important;
    bottom: 50px; /* Lift up */
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

.order-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: #666;
    margin-bottom: 8px;
    border-bottom: 1px dashed #ccc;
    padding-bottom: 4px;
}

.table-id {
    background: #333;
    color: #fff;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 0.7rem;
}

.order-price {
    color: #4CAF50;
    font-weight: bold;
}

.order-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.dish-name {
    font-size: 1.2rem;
    font-weight: bold;
    color: #333;
}

.customer-name {
    font-size: 0.85rem;
    color: #888;
    font-style: italic;
}

.order-details {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #eee;
    font-size: 0.9rem;
    color: #555;
}

.detail-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
}

.label {
    color: #999;
}

/* Dialog Modal */
.dialog-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.4);
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: auto;
    backdrop-filter: blur(2px);
    z-index: 3000;
}

.dialog-box {
    background: white;
    width: 90%;
    max-width: 500px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
    overflow: hidden;
    animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.dialog-header {
    background: #2c3e50;
    color: white;
    padding: 15px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.dialog-title {
    font-weight: bold;
    font-size: 1.1rem;
}

.dialog-close {
    background: none;
    border: none;
    color: rgba(255,255,255,0.6);
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
}

.dialog-close:hover {
    color: white;
}

.dialog-content {
    padding: 20px;
    min-height: 100px;
}

.dialog-text {
    font-size: 1.1rem;
    line-height: 1.5;
    color: #333;
    margin-bottom: 10px;
}

.dialog-hint {
    font-size: 0.8rem;
    color: #999;
    font-style: italic;
}

.dialog-actions {
    padding: 15px 20px;
    background: #f9f9f9;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    border-top: 1px solid #eee;
}

.action-btn {
    padding: 8px 16px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
}

.chat-btn {
    background: #e0f7fa;
    color: #006064;
}

.chat-btn:hover {
    background: #b2ebf2;
}

.confirm-btn {
    background: #4CAF50;
    color: white;
    box-shadow: 0 2px 5px rgba(76, 175, 80, 0.3);
}

.confirm-btn:hover {
    background: #43A047;
    transform: translateY(-1px);
}

@keyframes popIn {
    from { opacity: 0; transform: scale(0.9) translateY(20px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateX(-20px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.close-btn {
  background: #e74c3c;
  border: none;
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
}

.hand-inventory {
    position: absolute;
    bottom: 50px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 20px;
    pointer-events: auto;
}

.hand-slot {
    width: 80px;
    height: 80px;
    background: rgba(0, 0, 0, 0.5);
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    position: relative;
    transition: all 0.2s;
}

.hand-slot.has-item {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.8);
    box-shadow: 0 0 15px rgba(255, 255, 255, 0.2);
}

.hand-label {
    position: absolute;
    top: 5px;
    left: 5px;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.5);
    font-weight: bold;
}

.item-icon {
    font-size: 2rem;
    margin-bottom: 5px;
}

.item-name {
    font-size: 0.8rem;
    color: white;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 90%;
}

.empty-text {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.3);
}

.controls-hint {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.6);
  font-family: monospace;
}

/* Evaluation Box Styles */
.evaluation-box {
    background: white;
    border-radius: 16px;
    width: 400px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
    overflow: hidden;
    animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.eval-header {
    background: linear-gradient(135deg, #FF9800, #F57C00);
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: white;
}

.eval-header h2 {
    margin: 0;
    font-size: 1.5rem;
    text-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.score-badge {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: white;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.8rem;
    font-weight: bold;
    box-shadow: 0 4px 10px rgba(0,0,0,0.2);
}

.score-badge.high { color: #4CAF50; border: 4px solid #4CAF50; }
.score-badge.mid { color: #FF9800; border: 4px solid #FF9800; }
.score-badge.low { color: #F44336; border: 4px solid #F44336; }

.eval-content {
    padding: 20px;
}

.customer-comment {
    font-style: italic;
    color: #555;
    font-size: 1.1rem;
    text-align: center;
    margin-bottom: 20px;
    padding: 10px;
    background: #f9f9f9;
    border-radius: 8px;
    position: relative;
}

.quote {
    font-size: 2rem;
    color: #FF9800;
    opacity: 0.3;
    line-height: 0;
    vertical-align: sub;
}

.eval-stats {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.stat-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px dashed #eee;
}

.stat-row:last-child {
    border-bottom: none;
}

.text-gold { color: #FFC107; font-weight: bold; }
.text-green { color: #4CAF50; font-weight: bold; }
.text-red { color: #F44336; font-weight: bold; }

.eval-actions {
    padding: 20px;
    background: #f5f5f5;
    display: flex;
    justify-content: center;
}

.full-width {
    width: 100%;
    justify-content: center;
}
</style>
