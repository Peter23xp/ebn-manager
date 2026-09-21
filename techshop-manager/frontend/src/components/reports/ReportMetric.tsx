import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: string;
  icon: ReactNode;
  isLoading: boolean;
  note?: string;
  trend?: number;
}

export function ReportMetric({ label, value, icon, isLoading, note, trend }: Props) {
  return (
    <div className="report-summary-metric">
      <dt className="flex items-center gap-2 text-sm text-text-muted"><span className="shrink-0" aria-hidden="true">{icon}</span>{label}</dt>
      <dd className="mt-2 text-xl font-bold leading-tight tabular-nums text-primary">
        {isLoading ? <div className="skeleton h-7 w-28 max-w-full rounded" aria-hidden="true" /> : value}
        {!isLoading && note && <p className="mt-2 text-xs font-normal text-text-muted">{note}</p>}
        {!isLoading && trend !== undefined && trend !== 0 && <p className={`mt-2 text-xs font-semibold tabular-nums ${trend > 0 ? 'text-success' : 'text-danger'}`}>{trend > 0 ? '+' : '−'}{Math.abs(trend)} %</p>}
      </dd>
    </div>
  );
}
