import { create } from 'zustand';

interface Toast {
  id: number;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string) => void;
  removeToast: (id: number) => void;
}

let nextId = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message: string) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, message }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },
  removeToast: (id: number) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
