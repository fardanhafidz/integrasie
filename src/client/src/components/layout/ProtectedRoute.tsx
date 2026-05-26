import { Navigate } from 'react-router-dom';
import { isAuthenticated, getUser } from '../../services/auth';

/**
 * ProtectedRoute
 *
 * A route guard component that:
 * - Checks if the user is authenticated (valid JWT token)
 * - Checks if the user's role is in the allowedRoles list
 * - Redirects to /login if not authenticated
 * - Shows an access denied page if the user's role is not allowed
 *
 * Props:
 *   allowedRoles: string[] — roles permitted to access the wrapped content
 *   children: React.ReactNode — the protected content to render
 *
 * Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7
 */

interface ProtectedRouteProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  // Check authentication
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  // Check role authorization
  const user = getUser();
  if (!user || !allowedRoles.includes(user.role)) {
    return <AccessDenied userRole={user?.role} />;
  }

  return <>{children}</>;
}

/**
 * Access Denied page shown when a user's role doesn't match the required roles.
 */
function AccessDenied({ userRole }: { userRole?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
          <svg
            className="h-8 w-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-4">
          You do not have the required role to access this resource.
        </p>
        {userRole && (
          <p className="text-sm text-gray-500 mb-6">
            Your current role: <span className="font-medium capitalize">{userRole.replace('_', ' ')}</span>
          </p>
        )}
        <a
          href="/dashboard"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
