import React from 'react';

export interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
  hint?: string;
  className?: string;
}

export function FormField({
  label,
  error,
  required = false,
  children,
  htmlFor,
  hint,
  className = '',
}: FormFieldProps) {
  const fieldId = htmlFor || `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const errorId = error ? `${fieldId}-error` : undefined;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-gray-700"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-red-500" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>

      <div
        aria-describedby={
          [errorId, hintId].filter(Boolean).join(' ') || undefined
        }
      >
        {children}
      </div>

      {hint && !error && (
        <p id={hintId} className="text-xs text-gray-500">
          {hint}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          className="flex items-center gap-1 text-xs text-red-600"
          role="alert"
          aria-live="polite"
        >
          <svg
            className="h-3.5 w-3.5 flex-shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

export default FormField;
