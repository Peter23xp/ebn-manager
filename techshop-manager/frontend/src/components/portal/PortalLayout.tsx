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
    // Mobile: plein écran (100dvh). Desktop: carte centrée type téléphone
    <div className="h-[100dvh] bg-bg md:h-screen md:flex md:items-start md:justify-center md:bg-gradient-to-b md:from-slate-100 md:to-slate-200 md:pt-10 md:overflow-hidden">
      <div className="flex flex-col bg-white w-full h-full md:h-[calc(100vh-80px)] md:w-full md:max-w-md md:rounded-[24px] md:border md:border-border md:shadow-2xl md:overflow-hidden">
        <PortalHeader title={title} showBack={showBackButton} onBack={onBack} />
        <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 16 }}>
          {children}
        </main>
        <PortalNav />
      </div>
    </div>
  );
}
