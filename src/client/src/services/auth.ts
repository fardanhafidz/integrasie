/**
 * Auth Service
 *
 * Handles JWT token storage, retrieval, and automatic refresh logic.
 * Tokens are stored in localStorage. The access token is decoded (base64)
 * to determine expiration and trigger refresh before it expires.
 *
 * Validates: Requirements 1.1, 1.9
 */

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  fullName: string;
}

interface TokenPayload {
  exp: number;
  iat: number;
  userId: string;
  role: string;
}

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

// Refresh the token 60 seconds before it expires
const REFRESH_BUFFER_SECONDS = 60;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Decode a JWT token payload without external dependencies.
 * Uses base64url decoding of the payload segment.
 */
function decodeToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    // base64url → base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = atob(base64);
    return JSON.parse(jsonStr) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Get the stored access token.
 */
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * Get the stored refresh token.
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Get the stored user object.
 */
export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Store tokens and user info in localStorage.
 * Schedules automatic token refresh based on access token expiration.
 */
export function setTokens(accessToken: string, refreshToken: string, user: AuthUser): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  scheduleTokenRefresh(accessToken);
}

/**
 * Clear all auth data from localStorage and cancel any pending refresh.
 */
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  cancelScheduledRefresh();
}

/**
 * Check if the user is currently authenticated.
 * Returns true if an access token exists and is not expired.
 */
export function isAuthenticated(): boolean {
  const token = getAccessToken();
  if (!token) return false;

  const payload = decodeToken(token);
  if (!payload) return false;

  const now = Math.floor(Date.now() / 1000);
  return payload.exp > now;
}

/**
 * Refresh the access token by calling POST /api/auth/refresh.
 * On success, stores the new access token and reschedules refresh.
 * On failure, clears all tokens (user must re-login).
 */
export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    return false;
  }

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      const currentUser = getUser();

      if (data.accessToken && currentUser) {
        localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
        scheduleTokenRefresh(data.accessToken);
        return true;
      }
    }

    // Refresh failed — clear tokens
    clearTokens();
    return false;
  } catch {
    clearTokens();
    return false;
  }
}

/**
 * Schedule automatic token refresh before the access token expires.
 */
function scheduleTokenRefresh(accessToken: string): void {
  cancelScheduledRefresh();

  const payload = decodeToken(accessToken);
  if (!payload) return;

  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = payload.exp - now;
  const refreshIn = Math.max((timeUntilExpiry - REFRESH_BUFFER_SECONDS) * 1000, 0);

  refreshTimer = setTimeout(() => {
    refreshAccessToken();
  }, refreshIn);
}

/**
 * Cancel any scheduled token refresh.
 */
function cancelScheduledRefresh(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * Initialize auth on app startup.
 * If a valid token exists, schedule its refresh.
 * If the token is expired but a refresh token exists, attempt refresh.
 */
export async function initAuth(): Promise<void> {
  const token = getAccessToken();
  if (!token) return;

  const payload = decodeToken(token);
  if (!payload) {
    clearTokens();
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp > now) {
    // Token still valid — schedule refresh
    scheduleTokenRefresh(token);
  } else {
    // Token expired — try to refresh
    await refreshAccessToken();
  }
}
