import { useToastStore } from '@/stores/toastStore';
import { X } from 'lucide-react';

const ToastContainer = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-center gap-3 rounded-lg bg-gray-800 px-4 py-3 text-sm text-white shadow-xl ring-1 ring-white/10 animate-in slide-in-from-bottom-4 fade-in duration-300"
        >
          <span>{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-2 text-gray-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
