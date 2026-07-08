import { useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '@/stores/notificationStore';
import NotificationItem from './NotificationItem';

const NotificationBell = () => {
  const {
    notifications,
    unreadCount,
    isOpen,
    isLoading,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    togglePanel,
    connectWebSocket,
    disconnectWebSocket,
  } = useNotificationStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    loadNotifications();
    connectWebSocket();
    return () => disconnectWebSocket();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        if (isOpen) togglePanel();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={togglePanel}
        className="relative rounded-full p-2 text-gray-400 hover:text-white transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-hidden rounded-lg bg-gray-800 shadow-xl border border-gray-700"
        >
          <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-green-500 hover:text-green-400"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-72">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-green-500" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">
                No notifications yet
              </div>
            ) : (
              notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={markAsRead}
                  onDelete={deleteNotification}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
