// Deterministic initials avatar — no photo storage exists for residents/
// officers, so this is the permanent visual identity, not a placeholder
// waiting on an upload feature.

const PALETTE = [
  'bg-brass-50 text-brass',
  'bg-verified-50 text-verified',
  'bg-warn-50 text-warn',
  'bg-alert-50 text-alert',
  'bg-white/10 text-ink-400',
];

function hashOf(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-[13px]',
  lg: 'h-14 w-14 text-base',
};

export function Avatar({ name, size = 'md', className = '' }: AvatarProps) {
  const tone = PALETTE[hashOf(name) % PALETTE.length];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${sizeClasses[size]} ${tone} ${className}`}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
