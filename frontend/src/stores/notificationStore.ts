import { create } from 'zustand';
import type { Notification } from '@/types';
import {
  getNotifications,
  markAsRead as apiMarkAsRead,
  markAllAsRead as apiMarkAllAsRead,
  deleteNotification as apiDeleteNotification,
  connectNotificationsWebSocket,
} from '@/api/notifications';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isOpen: boolean;
  isLoading: boolean;
  ws: WebSocket | null;
  loadNotifications: (page?: number) => Promise<void>;
  loadUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  addNotification: (notification: Notification) => void;
  togglePanel: () => void;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  isLoading: false,
  ws: null,

  loadNotifications: async (page = 1) => {
    set({ isLoading: true });
    try {
      const data = await getNotifications(page);
      set({ notifications: data.items, unreadCount: data.unread_count, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  loadUnreadCount: async () => {
    try {
      const { count } = await getNotifications(1) as any;
      set({ unreadCount: count });
    } catch {
      // ignore
    }
  },

  markAsRead: async (id: string) => {
    try {
      await apiMarkAsRead(id);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, is_read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch {
      // ignore
    }
  },

  markAllAsRead: async () => {
    try {
      await apiMarkAllAsRead();
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
        unreadCount: 0,
      }));
    } catch {
      // ignore
    }
  },

  deleteNotification: async (id: string) => {
    try {
      await apiDeleteNotification(id);
      set((state) => {
        const notification = state.notifications.find((n) => n.id === id);
        return {
          notifications: state.notifications.filter((n) => n.id !== id),
          unreadCount: notification && !notification.is_read
            ? Math.max(0, state.unreadCount - 1)
            : state.unreadCount,
        };
      });
    } catch {
      // ignore
    }
  },

  addNotification: (notification: Notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.is_read ? 0 : 1),
    }));
  },

  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),

  connectWebSocket: () => {
    const { ws: existingWs } = get();
    if (existingWs) return;

    const socket = connectNotificationsWebSocket();

    socket.onmessage = (event) => {
      const notification = JSON.parse(event.data) as Notification;
      get().addNotification(notification);
    };

    socket.onclose = () => {
      set({ ws: null });
    };

    set({ ws: socket });
  },

  disconnectWebSocket: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null });
    }
  },
}));
