// Small, dependency-free icon set. Kept together so every screen draws
// from the same stroke weight (1.75) and viewBox conventions instead of
// each component hand-rolling slightly different SVGs.

type IconProps = { className?: string };

const base = 'stroke-current';

export function HomeIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M4 11.5 12 4l8 7.5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VisitorsIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <circle cx="9" cy="8" r="3" strokeWidth="1.75" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M16 5.5a3 3 0 0 1 0 6" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M15 14.2c2.9.4 4.9 1.9 5.5 5.8" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BellIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M18 16v-5a6 6 0 1 0-12 0v5l-1.5 2.5h15L18 16Z" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M10 20.5a2 2 0 0 0 4 0" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function UserIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <circle cx="12" cy="8" r="3.5" strokeWidth="1.75" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <rect x="3.5" y="5" width="17" height="16" rx="3" strokeWidth="1.75" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function ClockIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <circle cx="12" cy="12" r="8.5" strokeWidth="1.75" />
      <path d="M12 7.5V12l3 2" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BuildingIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <rect x="5" y="3" width="14" height="18" rx="1.5" strokeWidth="1.75" />
      <path d="M9 7h1.2M13.8 7H15M9 11h1.2M13.8 11H15M9 15h1.2M13.8 15H15" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function ShieldIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M12 3.5 5 6v6c0 4.4 3 7.9 7 8.5 4-.6 7-4.1 7-8.5V6l-7-2.5Z" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShareIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M12 15V4M12 4 8.5 7.5M12 4l3.5 3.5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <rect x="9" y="9" width="11" height="11" rx="2" strokeWidth="1.75" />
      <path d="M5.5 14.5H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 2 2v.5" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronRightIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M9 5l7 7-7 7" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckCircleIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <circle cx="12" cy="12" r="9" strokeWidth="1.75" />
      <path d="M8 12.5l2.5 2.5L16 9.5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LogoutIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 8l4 4-4 4M18 12H9" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SparkIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function PencilIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M4 20l.9-3.6L15.6 5.7a1.5 1.5 0 0 1 2.1 0l.6.6a1.5 1.5 0 0 1 0 2.1L7.6 19.1 4 20Z" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8.5 0 .8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function XIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M6 6l12 12M18 6 6 18" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M5 12.5l4.5 4.5L19 7" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PhoneIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path
        d="M6.5 4h2.7l1.3 4-2 1.2a11 11 0 0 0 5.3 5.3l1.2-2 4 1.3v2.7a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 5 5.6 1.5 1.5 0 0 1 6.5 4Z"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PhoneOffIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path
        d="M6.5 4h2.7l1.3 4-2 1.2a11 11 0 0 0 5.3 5.3l1.2-2 4 1.3v2.7a1.5 1.5 0 0 1-1.6 1.5 15.4 15.4 0 0 1-3.9-.8"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 4l16 16" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function ScanIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2M4 16v2a2 2 0 0 0 2 2h2M20 16v2a2 2 0 0 1-2 2h-2" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 12h9" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function KeypadIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <circle cx="7" cy="7" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="17" cy="7" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="7" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="17" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="7" cy="17" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="17" cy="17" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ArrowDownLeftIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M17 7 7 17M7 17V9M7 17h8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowUpRightIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M7 17 17 7M17 7v8M17 7H9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WifiOffIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M3 3l18 18" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M5 8.8a15.5 15.5 0 0 1 4.6-2.6M19 8.8a15.5 15.5 0 0 0-6.4-3.2M8.5 12.3a9 9 0 0 1 4-1.7M15.8 12.6a9 9 0 0 0-1.4-1" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M12 15.2a3.8 3.8 0 0 1 2 .8" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function WifiIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M4.5 9.8a11 11 0 0 1 15 0M7.3 12.9a7 7 0 0 1 9.4 0M10.2 16a3.2 3.2 0 0 1 3.6 0" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function DoorExitIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M13 4H7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h6" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 12h9M17 8.5l3.5 3.5-3.5 3.5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MenuIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <circle cx="10.5" cy="10.5" r="6.5" strokeWidth="1.75" />
      <path d="M20 20l-4.8-4.8" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function LayersIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M12 3.5 4 8l8 4.5L20 8l-8-4.5Z" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M4 12l8 4.5L20 12M4 16l8 4.5L20 16" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AlertIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M12 4 3 19h18L12 4Z" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M12 10v4.2" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MapPinIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M12 21s7-6.4 7-11.5A7 7 0 0 0 5 9.5C5 14.6 12 21 12 21Z" strokeWidth="1.75" strokeLinejoin="round" />
      <circle cx="12" cy="9.5" r="2.3" strokeWidth="1.75" />
    </svg>
  );
}

export function GlobeIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <circle cx="12" cy="12" r="8.5" strokeWidth="1.75" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.3 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.3-3.6-8.5S9.6 5.8 12 3.5Z" strokeWidth="1.75" />
    </svg>
  );
}

export function MicIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M9 5.5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0Z" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11a6 6 0 0 0 12 0" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M12 17v3M9 20h6" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function MicOffIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`}>
      <path d="M9 5.5a3 3 0 0 1 6 0v5a3 3 0 0 1-.2 1.1" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M6 11a6 6 0 0 0 8.6 5.4M18 11a6 6 0 0 1-1 3.3" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M12 17v3M9 20h6" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M4 4l16 16" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
