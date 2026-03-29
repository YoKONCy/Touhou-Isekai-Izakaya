<template>
  <div class="izakaya-game-container">
    <canvas ref="canvasRef"></canvas>

    <div class="ui-overlay">
      <div class="header">
        <span class="title">居酒屋经营模式 (第二阶段：环境与交互)</span>
        <button @click="closeGame" class="close-btn">关闭 (调试)</button>
      </div>

      <!-- 钱币显示 -->
      <div class="money-display">
        <div class="coin-icon">¥</div>
        <span class="amount">{{ revenue }}</span>
      </div>

      <!-- 待处理订单 -->
      <div class="orders-stack-container" v-if="activeOrders.length > 0">
        <h3 class="orders-title">待处理订单</h3>
        <div class="orders-stack">
          <div
            v-for="(order, index) in activeOrders"
            :key="order.id"
            class="order-card-stack"
            :class="{ expanded: expandedOrderId === order.id }"
            :style="{
              zIndex: activeOrders.length - index,
              transform: getStackTransform(index, order.id)
            }"
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

      <!-- 烹饪界面 -->
      <CookingInterface
        v-if="showCooking"
        :customerRequirement="activeCookingCustomer?.requirements"
        @finish="handleCookingFinish"
        @close="handleCookingClose"
      />

      <!-- 交互对话弹窗 -->
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
            <button class="action-btn chat-btn"><span>💬</span> 对话</button>
            <button
              v-if="currentInteraction.isOrdering"
              class="action-btn confirm-btn"
              @click="handleAcceptOrder"
            >
              <span>📝</span> 接单
            </button>
          </div>
        </div>
      </div>

      <!-- 评价结果弹窗 -->
      <div v-if="showEvaluation && evaluationResult" class="dialog-overlay animate-fade-in">
        <div class="evaluation-box pop-in">
          <div class="eval-header">
            <h2>料理评价</h2>
            <div
              class="score-badge"
              :class="
                evaluationResult.score >= 80 ? 'high' : evaluationResult.score >= 60 ? 'mid' : 'low'
              "
            >
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
                <span class="label">美味度:</span>
                <span class="value">{{
                  evaluationResult.isDelicious ? '太好吃了! 😋' : '一般般 😐'
                }}</span>
              </div>
              <div class="stat-row">
                <span class="label">支付金额:</span>
                <span class="value text-gold">¥{{ evaluationResult.payment }}</span>
              </div>
              <div class="stat-row">
                <span class="label">声望:</span>
                <span
                  class="value"
                  :class="evaluationResult.reputation >= 0 ? 'text-green' : 'text-red'"
                >
                  {{ evaluationResult.reputation > 0 ? '+' : '' }}{{ evaluationResult.reputation }}
                </span>
              </div>
            </div>
          </div>

          <div class="eval-actions">
            <button class="action-btn confirm-btn full-width" @click="showEvaluation = false">
              太棒了!
            </button>
          </div>
        </div>
      </div>

      <!-- 手持物品栏 -->
      <div class="hand-inventory">
        <div class="hand-slot left-hand" :class="{ 'has-item': handInventory[0] }">
          <span class="hand-label">左</span>
          <div v-if="handInventory[0]" class="item-icon">
            {{ handInventory[0].type === 'bowl' ? '🥣' : '🍲' }}
          </div>
          <span v-if="handInventory[0]" class="item-name">{{ handInventory[0].name }}</span>
          <span v-else class="empty-text">空</span>
        </div>
        <div class="hand-slot right-hand" :class="{ 'has-item': handInventory[1] }">
          <span class="hand-label">右</span>
          <div v-if="handInventory[1]" class="item-icon">
            {{ handInventory[1].type === 'bowl' ? '🥣' : '🍲' }}
          </div>
          <span v-if="handInventory[1]" class="item-name">{{ handInventory[1].name }}</span>
          <span v-else class="empty-text">空</span>
        </div>
      </div>

      <div class="controls-hint hidden md:block">
        WASD / 方向键 移动 | F / 空格 交互
      </div>

      <!-- 移动端虚拟摇杆 -->
      <VirtualControls @move="handleVirtualMove" @action="handleVirtualAction" />
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
import VirtualControls from './VirtualControls.vue';
import type { Item, Customer, CookingSession } from '@/types/management';

const gameStore = useGameStore();
const toastStore = useToastStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);

// 交互弹窗状态
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
// 手持物品与厨房设施状态
const handInventory = ref<(Item | null)[]>([null, null]);
const kitchenPot = ref<{ hasFood: boolean; food: CookingSession | null }>({
  hasFood: false,
  food: null
});

interface Order {
  id: string;
  customerName: string;
  dishName: string;
  price: number;
  seatId: string;
}
const activeOrders = ref<Order[]>([]);
const expandedOrderId = ref<string | null>(null);

// 烹饪逻辑状态
const showCooking = ref(false);
const activeCookingCustomer = ref<{ id: string; name: string; requirements: string } | null>(null);

const emit = defineEmits(['close']);

const getStackTransform = (index: number, id: string) => {
  if (expandedOrderId.value === id) {
    // 展开后的卡片弹出并轻微居中
    return `translateY(-${index * 4}px) scale(1.02) translateY(-10px)`;
  }
  // 堆叠效果：下面的卡片被向下推并缩小
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
    let dialogue = '请... 我饿了。';

    if (customer.isSpecial) {
      // 使用预生成的对话或立即生成
      if (customer.dialogue) {
        dialogue = customer.dialogue;
      } else {
        dialogue = await generateCustomerDialogue(customer.name, 'Ordering food at Izakaya');
        customer.dialogue = dialogue; // 缓存对话
      }
    } else {
      const commonLines = ['麻烦给个菜单！', '有什么推荐吗？', '饿死我啦！'];
      dialogue = commonLines[Math.floor(Math.random() * commonLines.length)] || '麻烦给个菜单！';
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

  let message = `交互对象: ${tileName} (${x}, ${y})`;
  let type: 'info' | 'success' | 'warning' | 'error' = 'info';

  if (tileName === 'COOKING_POT') {
    // 厨房交互逻辑
    if (kitchenPot.value.hasFood) {
      // 装盘逻辑
      const bowlIndex = handInventory.value.findIndex((item) => item?.type === 'bowl');
      if (bowlIndex !== -1) {
        // 找到空碗，将料理装盘
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
        message = '需要拿碗来装盘';
        type = 'warning';
      }
    } else {
      // 烹饪逻辑
      // 检查手是否空着（提示：“手里拿着东西无法烹饪”）
      // 严格限制：如果手里拿着任何东西，都无法开始烹饪
      const hasItems = handInventory.value.some((item) => item !== null);

      if (hasItems) {
        message = '手里拿着东西无法烹饪 (需要空手)';
        type = 'warning';
      } else {
        // 打开烹饪界面
        handleCookingInteract();
        return; // 跳过默认的吐司提示
      }
    }
  } else if (tileName === 'BOWL_STACK') {
    // 交互逻辑：如果只拿着空碗，与碗堆交互会将其放回。

    const bowlIndex = handInventory.value.findIndex((item) => item?.type === 'bowl');
    if (bowlIndex !== -1) {
      // 如果后续逻辑需要，保留引用
    }

    const hasOnlyBowls =
      handInventory.value.every((item) => item === null || item.type === 'bowl') &&
      handInventory.value.some((item) => item !== null);

    if (hasOnlyBowls) {
      // 放回一个空碗
      const slot = handInventory.value.findIndex((item) => item?.type === 'bowl');
      if (slot !== -1) {
        handInventory.value[slot] = null;
        message = '放回: 空碗';
        type = 'info';
      }
    } else {
      // 尝试拿起一个空碗
      const emptySlotIndex = handInventory.value.findIndex((item) => item === null);
      if (emptySlotIndex !== -1) {
        handInventory.value[emptySlotIndex] = {
          id: `bowl-${Date.now()}`,
          name: '空碗',
          type: 'bowl'
        };
        message = '获得: 空碗';
        type = 'success';
      } else {
        message = '手拿不下了';
        type = 'warning';
      }
    }
  } else if (tileName === 'SERVING_TABLE') {
    const placedItem = scene?.getPlacedItem(x, y);

    if (placedItem) {
      // 桌子上有物品，尝试拿起
      const emptySlotIndex = handInventory.value.findIndex((item) => item === null);
      if (emptySlotIndex !== -1) {
        const item = scene?.pickItem(x, y);
        if (item) {
          handInventory.value[emptySlotIndex] = item;
          message = `拿起了: ${item.name}`;
          type = 'info';
        }
      } else {
        message = '手里满了，无法拿起';
        type = 'warning';
      }
    } else {
      // 桌子是空的，尝试放置物品
      // 放置手里找到的第一个物品
      const slotIndex = handInventory.value.findIndex((item) => item !== null);
      if (slotIndex !== -1) {
        const itemToPlace = handInventory.value[slotIndex];
        if (itemToPlace) {
          if (scene?.placeItem(x, y, itemToPlace)) {
            handInventory.value[slotIndex] = null;
            message = `放置了: ${itemToPlace.name}`;
            type = 'info';
          } else {
            message = '无法放置';
            type = 'warning';
          }
        }
      } else {
        message = '手里没有东西可放';
        type = 'info';
      }
    }
  } else if (tileName === 'CHAIR' || tileName === 'COUNTER') {
    // 检查对应的位置是否有顾客
    const entity = (customEvent.detail as any).entity;
    if (entity && entity.type === 'customer') {
      const customer = entity;
      // 检查顾客是否在等餐
      // 注意：我们需要访问顾客状态。IzakayaScene 虽然暴露了实体，但我们需要获取其实时状态。
      // 假设事件详情中的实体对象是包含状态的实际引用。

      if (customer.state === 'waiting_food') {
        // 检查玩家手中是否有料理
        const dishIndex = handInventory.value.findIndex((item) => item?.type === 'dish');
        if (dishIndex !== -1) {
          const dishItem = handInventory.value[dishIndex];
          const dishSession = dishItem?.data as CookingSession;

          // 上菜逻辑
          // 从手中移除料理
          handInventory.value[dishIndex] = null;

          if (customer.isSpecial && dishSession) {
            // 触发大模型评价逻辑
            evaluateDish(customer, dishSession).then((result) => {
              evaluationResult.value = result;
              showEvaluation.value = true;

              // 根据结果更新收入与声望
              // 注意：场景中的 serveCustomer 仅将状态设置为正在进食。
              // 我们是否应该在这里覆盖收入计算或处理它？
              // 场景在顾客吃完后根据订单价格计算收入。
              // 我们是否可以更新订单价格？
              if (customer.order) {
                customer.order.price = result.payment;
              }
              gameStore.state.player.reputation += result.reputation;
            });
          } else {
            // 普通顾客的简单逻辑
            // 如果做得好或许会有加成？
            // 目前仅使用标准价格。
          }

          // 通知场景更新顾客状态
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
            message: '顾客在等餐，但你手里没有料理',
            type: 'warning',
            duration: 2000
          });
        }
      } else {
        // 仅聊天或其他状态
        // 如果已就座但未下单或等待，或许可以触发闲聊？
        // 目前先保持下单交互。
      }
    }
    return;
  } else if (tileName === 'EXIT') {
    message = '准备打烊? (结算界面占位符)';
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
    const index = activeOrders.value.findIndex((o) => o.id === orderId);
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
  const order = activeOrders.value[0];
  if (order) {
    activeCookingCustomer.value = {
      id: order.id,
      name: order.customerName,
      requirements: order.dishName
    };
  } else {
    activeCookingCustomer.value = null;
  }

  showCooking.value = true;
};

const handleCookingFinish = (result: CookingSession) => {
  showCooking.value = false;

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

  if (scene) {
    scene.stop();
    canvasRef.value.removeEventListener('izakaya-interact', handleInteract);
    canvasRef.value.removeEventListener('izakaya-customer-interact', handleCustomerInteract);
    canvasRef.value.removeEventListener('izakaya-order-update', handleOrderUpdate);
    canvasRef.value.removeEventListener('izakaya-revenue', handleRevenue);
  }

  scene = new IzakayaScene(canvasRef.value, mapData?.layout);

  scene.start();

  canvasRef.value.addEventListener('izakaya-interact', handleInteract);
  canvasRef.value.addEventListener('izakaya-customer-interact', handleCustomerInteract);
  canvasRef.value.addEventListener('izakaya-order-update', handleOrderUpdate);
  canvasRef.value.addEventListener('izakaya-revenue', handleRevenue);
};

watch(
  () => gameStore.state.system.customMap,
  (newMap) => {
    if (newMap) {
      console.log('地图已更新，正在重新初始化场景...', newMap);
      // 深度记录以验证内容
      if (newMap.layout) console.log('新布局行数:', newMap.layout.length);

      initScene(newMap);
      toastStore.addToast({
        message: '场景已更新！',
        type: 'success',
        duration: 3000
      });
    }
  },
  { deep: true }
);

onMounted(async () => {
  if (canvasRef.value) {
    // 检查是否需要生成初始地图
    // 从系统状态访问 customMap
    if (!gameStore.state.system.customMap && !isGeneratingMap.value) {
      isGeneratingMap.value = true;
      console.log('正在生成初始地图...');
      try {
        // 获取系统管理状态
        const managementState = gameStore.state.system.management;
        // 结合店铺描述（布局）和上下文（故事情节）
        const parts = [];
        if (managementState?.storeDescription) {
          parts.push(`布局要求: ${managementState.storeDescription}`);
        }
        if (managementState?.context) {
          parts.push(`故事背景: ${managementState.context}`);
        }
        const context = parts.join('\n\n');

        console.log('[IzakayaGame] 正在生成地图，上下文长度:', context.length);
        console.log('[IzakayaGame] 地图生成上下文预览:', context.substring(0, 50) + '...');

        // 检查之前地图 (用于装修改造上下文)
        const previousMap = managementState?.previousMap;
        if (previousMap) {
          console.log('[IzakayaGame] 装修改造模式: 使用之前地图作为参考。');
        }

        const mapData = await generateMap('New Izakaya', context, previousMap);
        // 更新全局状态结构
        const newSystemState: any = {
          ...gameStore.state.system,
          customMap: mapData
        };

        if (managementState) {
          newSystemState.management = {
            ...managementState,
            previousMap: undefined // 使用后清空前置地图以避免引用过时
          };
        }

        gameStore.updateState({
          system: newSystemState
        });
      } catch (e) {
        console.error('地图生成失败', e);
      } finally {
        isGeneratingMap.value = false;
      }
    }

    // 初始场景设置
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
  // 在实际实现中，这里将触发“结束营业”的结算逻辑
};

// 移动端虚拟按键处理程序
const handleVirtualMove = (direction: { x: number; y: number }) => {
  if (scene) {
    scene.setVirtualInput(direction.x, direction.y);
  }
};

const handleVirtualAction = () => {
  if (scene) {
    scene.triggerInteraction();
  }
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
  z-index: 2000; /* 设置高 Z 轴索引以覆盖所有界面元素 */
  overflow: hidden;
}

canvas {
  background: #1a1a1a; /* 与容器颜色一致以避免颜色断层 */
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  image-rendering: pixelated; /* 像素锐化处理 */
  image-rendering: crisp-edges;

  /* 适配移动端的响应式缩放 */
  max-width: 100vw;
  max-height: 100vh;
  width: auto;
  height: auto;
  object-fit: contain;
}

.ui-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 如果需要，允许点击穿透到画布，但此处我们捕获按钮点击 */
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

/* 楼层切换器 */
/* 已移除 */

/* 钱币显示 */
.money-display {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(255, 215, 0, 0.2);
  border: 2px solid #ffd700;
  padding: 10px 20px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #ffd700;
  font-family: 'Courier New', monospace;
  font-weight: bold;
  font-size: 1.5rem;
  backdrop-filter: blur(4px);
}

.coin-icon {
  background: #ffd700;
  color: #333;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 14px;
}

/* 订单栈布局 */
.orders-stack-container {
  position: absolute;
  bottom: 20px;
  left: 20px;
  width: 250px;
  height: 300px; /* 固定高度的堆叠区域 */
  display: flex;
  flex-direction: column;
  pointer-events: none; /* 允许点击穿透，但子元素将捕获点击事件 */
}

.orders-title {
  color: white;
  font-size: 1.1rem;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  margin: 0 0 10px 0;
  padding-left: 5px;
  border-left: 4px solid #ff5252;
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
  box-shadow: 0 -4px 10px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(0, 0, 0, 0.1);
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
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
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
  color: #4caf50;
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
  background: rgba(0, 0, 0, 0.4);
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
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
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
  color: rgba(255, 255, 255, 0.6);
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
  background: #4caf50;
  color: white;
  box-shadow: 0 2px 5px rgba(76, 175, 80, 0.3);
}

.confirm-btn:hover {
  background: #43a047;
  transform: translateY(-1px);
}

@keyframes popIn {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
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
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.eval-header {
  background: linear-gradient(135deg, #ff9800, #f57c00);
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
}

.eval-header h2 {
  margin: 0;
  font-size: 1.5rem;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
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
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

.score-badge.high {
  color: #4caf50;
  border: 4px solid #4caf50;
}
.score-badge.mid {
  color: #ff9800;
  border: 4px solid #ff9800;
}
.score-badge.low {
  color: #f44336;
  border: 4px solid #f44336;
}

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
  color: #ff9800;
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

.text-gold {
  color: #ffc107;
  font-weight: bold;
}
.text-green {
  color: #4caf50;
  font-weight: bold;
}
.text-red {
  color: #f44336;
  font-weight: bold;
}

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

/* Mobile Responsive Styles */
@media (max-width: 768px) {
  .header {
    top: 10px;
    padding: 6px 12px;
    font-size: 0.75rem;
    gap: 10px;
  }

  .header .title {
    display: none;
  }

  .money-display {
    top: 10px;
    right: 10px;
    padding: 6px 12px;
    font-size: 1rem;
    gap: 6px;
  }

  .coin-icon {
    width: 18px;
    height: 18px;
    font-size: 11px;
  }

  .orders-stack-container {
    bottom: 140px;
    left: 10px;
    width: 180px;
    height: 200px;
  }

  .orders-title {
    font-size: 0.9rem;
  }

  .order-card-stack {
    padding: 8px;
  }

  .dish-name {
    font-size: 0.95rem;
  }

  .customer-name {
    font-size: 0.75rem;
  }

  .hand-inventory {
    bottom: 160px;
  }

  .hand-slot {
    width: 60px;
    height: 60px;
  }

  .item-icon {
    font-size: 1.5rem;
  }

  .item-name {
    font-size: 0.7rem;
  }

  .dialog-box {
    width: 95%;
    max-width: none;
  }

  .evaluation-box {
    width: 90%;
    max-width: 350px;
  }

  .eval-header {
    padding: 15px;
  }

  .eval-header h2 {
    font-size: 1.2rem;
  }

  .score-badge {
    width: 50px;
    height: 50px;
    font-size: 1.4rem;
  }

  .eval-content {
    padding: 15px;
  }

  .customer-comment {
    font-size: 0.95rem;
  }
}
</style>
