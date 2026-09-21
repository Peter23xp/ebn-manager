import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrendData {
  value: number;
  label: string;
}

export interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  trend?: TrendData;
  isLoading?: boolean;
  onClick?: () => void;
  badge?: string;
  badgeVariant?: 'success' | 'warning' | 'danger';
  accent?: 'primary' | 'success' | 'warning' | 'danger';
  variant?: 'card' | 'summary';
  note?: string;
}

const accentMap: Record<string, {
  value:   string;
  icon:    string;
  bg:      string;
  border:  string;
  trend:   { up: string; down: string; neutral: string };
}> = {
  primary: {
    value:  'text-primary-accent',
    icon:   'text-primary-accent',
    bg:     'bg-primary-light/25 hover:bg-primary-light/40',
    border: 'border-primary-light',
    trend:  { up: 'text-success', down: 'text-danger', neutral: 'text-text-muted' },
  },
  success: {
    value:  'text-success',
    icon:   'text-success',
    bg:     'bg-green-50/50 hover:bg-green-50/80',
    border: 'border-green-100',
    trend:  { up: 'text-success', down: 'text-danger', neutral: 'text-text-muted' },
  },
  warning: {
    value:  'text-warning',
    icon:   'text-warning',
    bg:     'bg-amber-50/60 hover:bg-amber-50/90',
    border: 'border-amber-100',
    trend:  { up: 'text-success', down: 'text-danger', neutral: 'text-text-muted' },
  },
  danger: {
    value:  'text-danger',
    icon:   'text-danger',
    bg:     'bg-red-50/60 hover:bg-red-50/90',
    border: 'border-red-100',
    trend:  { up: 'text-success', down: 'text-danger', neutral: 'text-text-muted' },
  },
};

const badgeClass: Record<string, string> = {
  success: 'bg-green-100 text-success',
  warning: 'bg-amber-100 text-warning',
  danger:  'bg-red-100 text-danger',
};

export function KpiCard({
  title,
  value,
  icon: Icon,
  trend,
  isLoading,
  onClick,
  badge,
  badgeVariant = 'warning',
  accent = 'primary',
  variant = 'card',
  note,
}: KpiCardProps) {
  const a = accentMap[accent];

  const isUp      = trend && trend.value > 0;
  const isDown    = trend && trend.value < 0;
  const isNeutral = trend && trend.value === 0;
  const trendColor = isUp ? a.trend.up : isDown ? a.trend.down : a.trend.neutral;
  const TrendIcon  = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  if (variant === 'summary') {
    const SummaryTag = onClick && !isLoading ? 'button' : 'div';
    return (
      <SummaryTag className="dashboard-metric" type={SummaryTag === 'button' ? 'button' : undefined} onClick={isLoading ? undefined : onClick} aria-busy={isLoading}>
        <span className="dashboard-metric-label"><Icon size={16} aria-hidden />{title}</span>
        {isLoading ? <span className="skeleton my-3 block h-8 w-24 max-w-full rounded" aria-hidden /> : <span className="dashboard-metric-value">{value}</span>}
        {!isLoading && trend && <span className={cn('dashboard-metric-detail', isUp ? 'text-success' : isDown ? 'text-red-700' : 'text-text-muted')}>
          <TrendIcon size={14} aria-hidden />{isNeutral ? 'Stable' : `${isUp ? '+' : ''}${trend.value} %`} <span className="text-text-muted">{trend.label}</span>
        </span>}
        {!isLoading && badge && <span className={cn('dashboard-badge', badgeVariant === 'danger' ? 'bg-red-100 text-red-700' : badgeVariant === 'success' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800')}>{badge}</span>}
        {note && <span className="mt-1 block text-xs leading-relaxed text-text-muted">{note}</span>}
      </SummaryTag>
    );
  }

  if (isLoading) {
    return (
      <div className={cn('rounded-xl border p-5 space-y-3', a.bg, a.border)}>
        <div className="flex items-center gap-2">
          <div className="skeleton h-3.5 w-3.5 rounded" />
          <div className="skeleton h-3 w-20 rounded-full" />
        </div>
        <div className="skeleton h-9 w-32 rounded-lg" />
        <div className="skeleton h-3 w-16 rounded-full" />
      </div>
    );
  }

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      className={cn(
        'group rounded-xl border p-5 text-left w-full',
        'transition-all duration-150 ease-out-quart',
        a.bg, a.border,
        onClick && [
          'cursor-pointer',
          'hover:-translate-y-0.5 hover:shadow-card',
          'active:translate-y-0',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent focus-visible:ring-offset-2',
        ],
      )}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      {/* Label + icône inline */}
      <div className="flex items-center gap-1.5 mb-3">
        <Icon size={13} className={cn('flex-shrink-0', a.icon)} strokeWidth={2.5} aria-hidden />
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted leading-none">
          {title}
        </p>
      </div>

      {/* Valeur — couleur accent, domine la carte */}
      <p className={cn('text-[32px] font-black leading-none tracking-tight font-mono break-all', a.value)}>
        {value}
      </p>

      {/* Trend / badge */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 min-h-[18px]">
        {trend && (
          <span className={cn('flex items-center gap-1 text-[11px] font-semibold', trendColor)}>
            <TrendIcon size={11} aria-hidden />
            {isNeutral
              ? 'Stable'
              : `${isUp ? '+' : ''}${trend.value}% ${trend.label}`}
          </span>
        )}
        {badge && (
          <span className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide uppercase',
            badgeClass[badgeVariant],
          )}>
            {badge}
          </span>
        )}
      </div>
    </Tag>
  );
}
