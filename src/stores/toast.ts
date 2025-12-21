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

  function addToast(messageOrOptions: string | { message: string, type?: Toast['type'], duration?: number }, type: Toast['type'] = 'info', duration = 3000) {
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

    toasts.value.push({ id, message: msg, type: t, duration: d });

    if (d > 0) {
      setTimeout(() => {
        removeToast(id);
      }, d);
    }
  }

  function removeToast(id: string) {
    const idx = toasts.value.findIndex(t => t.id === id);
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
