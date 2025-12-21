import { ref } from 'vue';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

// Global state for the confirm dialog
export const confirmState = ref<{
  isOpen: boolean;
  options: ConfirmOptions;
  resolve: ((value: boolean) => void) | null;
}>({
  isOpen: false,
  options: { message: '' },
  resolve: null
});

// The hook to be used in components
export function useConfirm() {
  const confirm = (message: string, options?: Omit<ConfirmOptions, 'message'>) => {
    return new Promise<boolean>((resolve) => {
      confirmState.value = {
        isOpen: true,
        options: {
          message,
          ...options,
          title: options?.title || '确认操作',
          confirmText: options?.confirmText || '确定',
          cancelText: options?.cancelText || '取消',
          destructive: options?.destructive ?? true // Default to destructive for safety
        },
        resolve
      };
    });
  };

  return { confirm };
}
