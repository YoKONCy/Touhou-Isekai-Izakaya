import { defineStore } from 'pinia';
import { ref } from 'vue';
import { v4 as uuidv4 } from 'uuid';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([]);
  // 记录每个 toast 的自动消失定时器，便于去重复用时刷新及关闭时清理
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function addToast(
    messageOrOptions: string | { message: string; type?: Toast['type']; duration?: number },
    type: Toast['type'] = 'info',
    duration = 3000
  ) {
    const id = uuidv4();

    let msg = '';
    let t: Toast['type'] = 'info';
    let d = 3000;

    if (typeof messageOrOptions === 'object') {
      msg = messageOrOptions.message;
      t = messageOrOptions.type || 'info';
      d = messageOrOptions.duration !== undefined ? messageOrOptions.duration : 3000;
    } else {
      msg = messageOrOptions;
      t = type;
      d = duration;
    }

    // 去重：若已存在相同内容与类型的提示，则复用并刷新其消失计时，
    // 避免连续操作（如反复点击同一个按钮）导致同一条提示堆叠刷屏
    const existing = toasts.value.find((toast) => toast.message === msg && toast.type === t);
    if (existing) {
      const oldTimer = timers.get(existing.id);
      if (oldTimer) {
        clearTimeout(oldTimer);
        timers.delete(existing.id);
      }
      if (d > 0) {
        const timer = setTimeout(() => removeToast(existing.id), d);
        timers.set(existing.id, timer);
      }
      return;
    }

    toasts.value.push({ id, message: msg, type: t, duration: d });

    if (d > 0) {
      const timer = setTimeout(() => removeToast(id), d);
      timers.set(id, timer);
    }
  }

  function removeToast(id: string) {
    // 清理定时器，防止手动关闭后回调残留
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    const idx = toasts.value.findIndex((t) => t.id === id);
    if (idx > -1) {
      toasts.value.splice(idx, 1);
    }
  }

  return {
    toasts,
    addToast,
    removeToast
  };
});
