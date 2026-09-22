import { InputHTMLAttributes } from 'react';
import { SearchIcon } from '@/components/ui/icons';

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function SearchInput({ className = '', ...props }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        type="text"
        className="w-full rounded-2xl border border-ink-100 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm font-medium
          text-ink placeholder:text-ink-400/70 backdrop-blur-glass transition-colors
          focus:outline-none focus:ring-2 focus:ring-brass/40 focus:border-brass/60"
        {...props}
      />
    </div>
  );
}
