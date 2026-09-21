import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ReportNavigation, type ReportNavigationProps } from './ReportNavigation';
import '@/pages/rapports/reports-dashboard.css';
import '@/pages/rapports/report-subpages.css';

interface Props {
  active: ReportNavigationProps['active'];
  title: string;
  description: string;
  action?: ReactNode;
  exportUrl?: string;
  children: ReactNode;
}

export function ReportPageLayout({ active, title, description, action, exportUrl, children }: Props) {
  const navigate = useNavigate();
  return (
    <div className="reports-dashboard report-subpage min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2">
          <button type="button" aria-label="Retour aux rapports" onClick={() => navigate('/reports')} className="btn-ghost min-h-11 min-w-11 shrink-0 !px-2"><ArrowLeft size={18} aria-hidden="true" /></button>
          <div className="min-w-0">
            <h1 className="text-page-title text-primary">{title}</h1>
            <p className="mt-1 max-w-prose text-sm text-text-muted">{description}</p>
          </div>
        </div>
        {action}
      </header>
      <ReportNavigation active={active} exportUrl={exportUrl} />
      {children}
    </div>
  );
}
