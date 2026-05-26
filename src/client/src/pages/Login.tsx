import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Login Page
 *
 * Provides email/password authentication form with:
 * - Client-side validation (required fields, email format)
 * - Generic error messages for failed login (Req 1.8 - no field-specific hints)
 * - Account lockout messaging (Req 1.8 - 5 failed attempts → 15 min lock)
 * - Loading state during submission
 * - On success: stores tokens in localStorage and redirects to dashboard
 *
 * Validates: Requirements 1.1, 1.8
 */

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    fullName: string;
  };
}

interface LoginErrorResponse {
  error: string;
  message?: string;
}

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // Client-side validation
  function validate(): string | null {
    if (!email.trim()) {
      return 'Email is required';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'Please enter a valid email address';
    }
    if (!password) {
      return 'Password is required';
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsLocked(false);

    // Client-side validation
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (response.ok) {
        const data: LoginResponse = await response.json();

        // Store tokens and user info
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.user));

        // Redirect to dashboard
        navigate('/dashboard');
      } else {
        const errorData: LoginErrorResponse = await response.json();

        if (response.status === 423) {
          // Account locked
          setIsLocked(true);
          setError(
            errorData.message || 'Account locked due to too many failed attempts. Please try again later.'
          );
        } else {
          // Generic authentication failure message (Req 1.8 - no field-specific hints)
          setError('Invalid email or password. Please try again.');
        }
      }
    } catch {
      setError('Unable to connect to the server. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">IntegraSiE</h1>
          <p className="mt-2 text-sm text-gray-600">
            Smart Warehousing Platform
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Sign In</h2>

          {/* Error Display */}
          {error && (
            <div
              className={`mb-4 p-3 rounded-md text-sm ${
                isLocked
                  ? 'bg-orange-50 border border-orange-200 text-orange-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
              role="alert"
              aria-live="polite"
            >
              {isLocked && (
                <div className="flex items-center gap-2 mb-1">
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium">Account Locked</span>
                </div>
              )}
              <p>{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} noValidate>
            {/* Email Field */}
            <div className="mb-4">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="you@example.com"
                autoComplete="email"
                disabled={isLoading}
                required
              />
            </div>

            {/* Password Field */}
            <div className="mb-6">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isLoading}
                required
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-gray-500">
          IntegraSiE Smart Dashboard &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
