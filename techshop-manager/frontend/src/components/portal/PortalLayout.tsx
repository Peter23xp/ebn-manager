import type { ReactNode } from 'react';
import { PortalHeader } from './PortalHeader';
import { PortalNav } from './PortalNav';

interface PortalLayoutProps {
  children: ReactNode;
  title?: string;
  showBackButton?: boolean;
  onBack?: () => void;
}

export function PortalLayout({
  children,
  title,
  showBackButton = false,
  onBack,
}: PortalLayoutProps) {
  return (
    <>
      {/* Mobile: full height (100dvh). Desktop: centered card */}
      <div className="h-[100dvh] bg-neutral-100 md:h-screen md:flex md:items-start md:justify-center md:pt-8 md:overflow-hidden">
        <div className="flex flex-col bg-white w-full h-full md:h-auto md:max-w-sm md:min-h-[calc(100vh-64px)] md:max-h-[calc(100vh-64px)] md:rounded-2xl md:shadow-xl md:overflow-hidden">
          <PortalHeader title={title} showBack={showBackButton} onBack={onBack} />
          <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 16 }}>
            {children}
          </main>
          <PortalNav />
        </div>
      </div>
    </>
  );
}
