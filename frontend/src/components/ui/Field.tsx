import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  trailing?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, error, trailing, id, className = '', ...props }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-[13px] font-medium text-ink-400">
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            className={`w-full rounded-2xl border bg-white/[0.03] px-4 py-3.5 text-[15px] font-medium
              text-ink placeholder:text-ink-400/70 backdrop-blur-glass transition-colors
              focus:outline-none focus:ring-2 focus:ring-brass/40 focus:border-brass/60
              [color-scheme:dark]
              ${error ? 'border-alert' : 'border-ink-100'} ${trailing ? 'pr-10' : ''} ${className}`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
          {trailing && (
            <div className="absolute inset-y-0 right-3.5 flex items-center text-ink-400">
              {trailing}
            </div>
          )}
        </div>
        {error ? (
          <p id={`${inputId}-error`} className="text-sm text-alert">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-sm text-ink-400">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
Field.displayName = 'Field';
