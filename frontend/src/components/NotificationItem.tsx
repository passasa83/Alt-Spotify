import { Music, UserPlus, Disc, Bell } from 'lucide-react';
import type { Notification } from '@/types';
import { useNavigate } from 'react-router-dom';

interface NotificationItemProps {
  notification: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}

const iconMap: Record<string, React.ReactNode> = {
  jam_invite: <Music size={16} className="text-green-400" />,
  follow: <UserPlus size={16} className="text-blue-400" />,
  new_release: <Disc size={16} className="text-purple-400" />,
  system: <Bell size={16} className="text-gray-400" />,
};

const NotificationItem = ({ notification, onRead, onDelete }: NotificationItemProps) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (!notification.is_read) {
      onRead(notification.id);
    }

    if (notification.type === 'jam_invite' && notification.data?.session_id) {
      navigate(`/jam/${notification.data.session_id}`);
    } else if (notification.type === 'new_release' && notification.data?.artist_id) {
      navigate(`/artist/${notification.data.artist_id}`);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  };

  return (
    <div
      onClick={handleClick}
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-700/50 transition-colors ${
        !notification.is_read ? 'bg-gray-800/50' : ''
      }`}
    >
      <div className="mt-0.5 flex-shrink-0">
        {iconMap[notification.type] || <Bell size={16} className="text-gray-400" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white truncate">{notification.title}</p>
          {!notification.is_read && (
            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-green-500" />
          )}
        </div>
        <p className="text-xs text-gray-400 truncate">{notification.message}</p>
        <p className="text-xs text-gray-500 mt-0.5">{formatTime(notification.created_at)}</p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(notification.id);
        }}
        className="flex-shrink-0 text-gray-500 hover:text-gray-300 text-xs"
      >
        &times;
      </button>
    </div>
  );
};

export default NotificationItem;
