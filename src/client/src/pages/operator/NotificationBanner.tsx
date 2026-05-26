import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '../../services/auth';

/**
 * NotificationBanner Component
 *
 * Connects to Socket.IO and listens for 'lot:ready_to_store' events.
 * Shows a toast/badge notification when new lots are ready for storage.
 * Designed to be placed in the operator layout (MainLayout header area).
 *
 * Validates: Requirements 4.1 (real-time notification for ready lots)
 */

interface LotNotification {
  id: string;
  lot_number: string;
  material_group_code: string;
  timestamp: string;
}

export default function NotificationBanner() {
  const [notifications, setNotifications] = useState<LotNotification[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  const connectSocket = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;

    const newSocket = io(window.location.origin, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('[NotificationBanner] Socket connected');
    });

    newSocket.on('lot:ready_to_store', (data: LotNotification) => {
      setNotifications((prev) => [
        { ...data, timestamp: data.timestamp || new Date().toISOString() },
        ...prev.slice(0, 19), // Keep max 20 notifications
      ]);
    });

    newSocket.on('disconnect', () => {
      console.log('[NotificationBanner] Socket disconnected');
    });

    setSocket(newSocket);

    return newSocket;
  }, []);

  useEffect(() => {
    const sock = connectSocket();
    return () => {
      sock?.disconnect();
    };
  }, [connectSocket]);

  function dismissNotification(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function clearAll() {
    setNotifications([]);
    setShowPanel(false);
  }

  const unreadCount = notifications.length;

  return (
    <div className="relative">
      {/* Bell Icon with Badge */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="relative p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} new)` : ''}`}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {showPanel && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPanel(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-lg shadow-lg border border-gray-200 z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear all
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500">
                No new notifications
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notifications.map((notif) => (
                  <li
                    key={notif.id + notif.timestamp}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50"
                  >
                    <span className="flex-shrink-0 mt-0.5 w-2 h-2 rounded-full bg-blue-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        Lot Ready to Store
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        <span className="font-medium">{notif.lot_number}</span>
                        {' '}({notif.material_group_code})
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(notif.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    <button
                      onClick={() => dismissNotification(notif.id)}
                      className="flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-600 rounded"
                      aria-label="Dismiss notification"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* Toast notification for new items */}
      {notifications.length > 0 && notifications[0] && (
        <Toast
          notification={notifications[0]}
          onDismiss={() => dismissNotification(notifications[0].id)}
        />
      )}
    </div>
  );
}

/**
 * Toast component that auto-dismisses after 5 seconds
 */
function Toast({
  notification,
  onDismiss,
}: {
  notification: LotNotification;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [notification.id, notification.timestamp]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-80 bg-white rounded-lg shadow-lg border border-blue-200 p-4 animate-slide-up"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-blue-100">
          <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">Lot Ready to Store</p>
          <p className="text-xs text-gray-600 mt-0.5">
            {notification.lot_number} ({notification.material_group_code})
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
