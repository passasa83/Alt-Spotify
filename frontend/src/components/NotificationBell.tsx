import { useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '@/stores/notificationStore';
import { useTranslation } from '@/hooks/useTranslation';
import NotificationItem from './NotificationItem';
import { usePopover } from '@/hooks/usePopover';

const NotificationBell = () => {
  const { t } = useTranslation();
  const {
    notifications,
    unreadCount,
    isLoading,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    connectWebSocket,
    disconnectWebSocket,
  } = useNotificationStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { isOpen, toggle: togglePanel } = usePopover('notifications', [panelRef, buttonRef]);

  useEffect(() => {
    loadNotifications();
    connectWebSocket();
    return () => disconnectWebSocket();
  }, []);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={togglePanel}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-gray-400 hover:text-white transition-colors"
        aria-label={t('notifications.title')}
        aria-expanded={isOpen}
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
          className="fixed inset-x-4 top-16 z-50 max-h-[70vh] overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:max-h-96"
        >
          <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
            <h3 className="text-sm font-semibold text-white">{t('notifications.title')}</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-green-500 hover:text-green-400"
              >
                {t('notifications.mark_all_read')}
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
                {t('notifications.no_notifications')}
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
