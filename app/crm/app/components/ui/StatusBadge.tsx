'use client';

import { 
  CheckCircle2, 
  PauseCircle, 
  XCircle,
  Clock,
  AlertCircle,
  type LucideIcon 
} from 'lucide-react';

type StatusType = 
  | 'active' 
  | 'paused' 
  | 'churned' 
  | 'inactive' 
  | 'onboarding'
  | 'pending'
  | 'approved'
  | 'denied'
  | 'draft'
  | 'paid'
  | 'completed'
  | 'neutral';

interface StatusBadgeProps {
  status: StatusType;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

interface StatusConfig {
  icon: LucideIcon;
  label: string;
  variant: 'success' | 'warning' | 'error' | 'neutral' | 'info' | 'brand';
}

const statusMap: Record<StatusType, StatusConfig> = {
  active: { icon: CheckCircle2, label: 'Active', variant: 'success' },
  approved: { icon: CheckCircle2, label: 'Approved', variant: 'success' },
  completed: { icon: CheckCircle2, label: 'Completed', variant: 'success' },
  paid: { icon: CheckCircle2, label: 'Paid', variant: 'success' },
  
  paused: { icon: PauseCircle, label: 'Paused', variant: 'warning' },
  pending: { icon: Clock, label: 'Pending', variant: 'warning' },
  onboarding: { icon: Clock, label: 'Onboarding', variant: 'warning' },
  draft: { icon: Clock, label: 'Draft', variant: 'warning' },
  
  churned: { icon: XCircle, label: 'Churned', variant: 'error' },
  denied: { icon: XCircle, label: 'Denied', variant: 'error' },
  inactive: { icon: XCircle, label: 'Inactive', variant: 'neutral' },
  
  neutral: { icon: AlertCircle, label: 'Neutral', variant: 'neutral' },
};

const variantClasses: Record<StatusConfig['variant'], string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  error: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
  neutral: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700',
  info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
  brand: 'bg-[var(--brand-muted)] text-[var(--brand)] border-[var(--brand)]/20',
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-[10px] gap-1',
  md: 'px-2.5 py-1 text-xs gap-1.5',
};

const iconSizes = {
  sm: 'w-3 h-3',
  md: 'w-3.5 h-3.5',
};

export function StatusBadge({ status, size = 'md', showIcon = true }: StatusBadgeProps) {
  const config = statusMap[status] || statusMap.neutral;
  const Icon = config.icon;
  const variantClass = variantClasses[config.variant];
  
  return (
    <span 
      className={`
        inline-flex items-center 
        rounded-full font-medium 
        border
        ${variantClass}
        ${sizeClasses[size]}
      `}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {config.label}
    </span>
  );
}

// Simple dot variant for compact displays
export function StatusDot({ status }: { status: StatusType }) {
  const config = statusMap[status] || statusMap.neutral;
  
  const dotColors: Record<StatusConfig['variant'], string> = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    neutral: 'bg-zinc-400',
    info: 'bg-blue-500',
    brand: 'bg-[var(--brand)]',
  };
  
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${dotColors[config.variant]}`} />
      <span className="text-sm text-[var(--foreground)]">{config.label}</span>
    </span>
  );
}

export { statusMap };
export type { StatusType };
