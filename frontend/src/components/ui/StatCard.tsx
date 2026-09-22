interface StatCardProps {
  label: string;
  value: number | string;
  sublabel?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'accent' | 'success' | 'danger';
}

const toneText: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-ink',
  accent: 'text-brass',
  success: 'text-verified',
  danger: 'text-alert',
};

export function StatCard({ label, value, sublabel, icon, tone = 'default' }: StatCardProps) {
  return (
    <div className="glass-card flex flex-col gap-2 rounded-card px-5 py-5 transition-transform duration-150 ease-premium hover:scale-[1.02]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-400">{label}</span>
        {icon && <span className="text-ink-400">{icon}</span>}
      </div>
      <span className={`font-display text-[36px] font-bold leading-none ${toneText[tone]}`}>{value}</span>
      {sublabel && <span className="text-xs font-medium text-ink-400">{sublabel}</span>}
    </div>
  );
}
