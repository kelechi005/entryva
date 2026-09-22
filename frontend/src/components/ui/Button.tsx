import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-brass to-[#3B82F6] text-white shadow-[0px_10px_30px_rgba(93,168,255,0.35)] hover:brightness-110 active:scale-[0.97] disabled:opacity-40 disabled:shadow-none',
  secondary:
    'glass-surface text-ink hover:bg-white/[0.1] active:scale-[0.97] disabled:opacity-40',
  ghost:
    'bg-transparent text-ink border border-ink-100 hover:border-white/25 hover:bg-white/[0.04] active:scale-[0.97] disabled:opacity-40',
  danger:
    'bg-alert/90 text-white hover:bg-alert active:scale-[0.97] disabled:bg-alert/40',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', fullWidth, className = '', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 rounded-[28px] px-5 py-3.5
          text-sm font-semibold tracking-normal transition-all duration-150 ease-premium
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-brass disabled:cursor-not-allowed disabled:active:scale-100
          ${fullWidth ? 'w-full' : ''} ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
