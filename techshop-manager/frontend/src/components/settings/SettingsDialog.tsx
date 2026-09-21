import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './settings.css';

export function SettingsDialog({ title, onClose, busy = false, children }: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef(document.activeElement as HTMLElement | null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useLayoutEffect(() => {
    const previousFocus = previousFocusRef.current;
    const dialog = dialogRef.current!;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('*')).filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[hidden]') && element.getAttribute('type') !== 'hidden');
    if (!dialog.contains(document.activeElement)) (focusable()[0] ?? dialog).focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(
    <div className="settings-dialog-backdrop">
      <div ref={dialogRef} className="settings-dialog" role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} tabIndex={-1}>
        {children}
      </div>
    </div>, document.body,
  );
}
