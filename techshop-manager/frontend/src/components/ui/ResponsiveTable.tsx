import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveTableProps {
  children: ReactNode;
  className?: string;
  minWidth?: string;
}

/**
 * Wrapper pour tables qui utilise overflow-x-auto sur desktop
 * et peut être remplacé par un layout card sur mobile si nécessaire.
 *
 * Usage: <ResponsiveTable><table>...</table></ResponsiveTable>
 */
export function ResponsiveTable({ children, className, minWidth = '700px' }: ResponsiveTableProps) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-border', className)}>
      <div style={{ minWidth }} className="w-full">
        {children}
      </div>
    </div>
  );
}
