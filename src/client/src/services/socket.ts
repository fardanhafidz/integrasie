/**
 * Socket.IO client service
 *
 * Provides a singleton Socket.IO connection for real-time events.
 * Used by temperature monitoring, PPIC stock updates, and notifications.
 */
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './auth';

let socket: Socket | null = null;

/**
 * Get or create the Socket.IO connection.
 * Authenticates with the current JWT token.
 */
export function getSocket(): Socket {
  if (!socket) {
    const token = getAccessToken();
    socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });
  }
  return socket;
}

/**
 * Disconnect and clean up the socket connection.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
