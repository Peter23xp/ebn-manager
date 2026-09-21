import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import type { ClientRow } from '@/lib/clients.api';
import { ClientPrintDocument } from './ClientPrintDocument';
import { CLIENT_PRINT_MAX_ROWS, ClientPrintError, loadClientPrintRows, type ClientPrintMode, type ClientPrintSnapshot } from './client-print';
import './client-print.css';

type PreviewState = {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'denied';
  rows: ClientRow[];
  generatedAt: Date;
  message?: string;
  loaded?: number;
  total?: number;
};

export function ClientPrintPreview({ snapshot, onClose }: { snapshot: ClientPrintSnapshot; onClose: () => void }) {
  const [mode, setMode] = useState<ClientPrintMode>('page');
  const [state, setState] = useState<PreviewState>({ status: 'idle', rows: [], generatedAt: new Date() });
  const controller = useRef<AbortController | null>(null);
  const revoked = useRef(false);
  const output = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const allowed = !revoked.current && snapshot.isCurrent();
  const ready = allowed && state.status === 'ready' && state.rows.length > 0;
  const loading = state.status === 'loading';

  useEffect(() => {
    heading.current?.focus();
    document.documentElement.setAttribute('data-client-print', '');
    const checkAccess = () => {
      if (revoked.current || !snapshot.isCurrent()) {
        revoked.current = true;
        controller.current?.abort();
        output.current?.setAttribute('data-client-print-valid', 'false');
        setState(current => ({ ...current, status: 'denied', rows: [], message: 'La session ou les droits ont changé. Revenez à la liste avant de relancer l’impression.' }));
      }
    };
    const unsubscribe = useAuthStore.subscribe(checkAccess);
    window.addEventListener('beforeprint', checkAccess);
    checkAccess();
    return () => {
      controller.current?.abort();
      unsubscribe();
      window.removeEventListener('beforeprint', checkAccess);
      document.documentElement.removeAttribute('data-client-print');
    };
  }, [snapshot]);

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    setState(current => ({ ...current, status: 'idle', rows: [], message: 'Chargement annulé. Vous pouvez préparer un nouvel aperçu.' }));
  };

  const prepare = async () => {
    if (revoked.current || !snapshot.isCurrent()) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const isCurrent = () => !revoked.current && !request.signal.aborted && controller.current === request && snapshot.isCurrent();
    setState({ status: 'loading', rows: [], generatedAt: new Date(), loaded: 0 });
    try {
      const rows = await loadClientPrintRows({
        filters: snapshot.filters, mode, signal: request.signal, isCurrent,
        onProgress: (loaded, total) => {
          if (isCurrent()) setState(current => ({ ...current, loaded, total }));
        },
      });
      if (isCurrent()) setState({ status: rows.length ? 'ready' : 'empty', rows, generatedAt: new Date() });
    } catch (error) {
      if (isCurrent()) setState({
        status: 'error', rows: [], generatedAt: new Date(),
        message: error instanceof ClientPrintError ? error.message : 'Impossible de préparer l’aperçu complet. Vérifiez votre connexion et vos droits, puis réessayez.',
      });
    }
  };

  const print = () => {
    if (revoked.current || !snapshot.isCurrent()) {
      revoked.current = true;
      output.current?.setAttribute('data-client-print-valid', 'false');
      setState(current => ({ ...current, status: 'denied', rows: [], message: 'La session ou les droits ont changé. Revenez à la liste.' }));
      return;
    }
    if (ready) window.print();
  };

  const printDocument = ready ? <ClientPrintDocument snapshot={snapshot} rows={state.rows} mode={mode} generatedAt={state.generatedAt} /> : null;

  return (
    <section className="client-print-preview space-y-4" aria-label="Impression des clients">
      <button type="button" className="btn-secondary" onClick={onClose}><ArrowLeft size={16} aria-hidden />Retour aux clients</button>
      <div>
        <h1 ref={heading} tabIndex={-1} className="text-page-title">Impression des clients</h1>
        <p className="text-sm text-text-muted mt-1">Aperçu A4 · Filtres figés à l’ouverture · Maximum {CLIENT_PRINT_MAX_ROWS.toLocaleString('fr')} clients.</p>
      </div>
      <fieldset className="client-print-options" disabled={loading || !allowed}>
        <legend className="font-semibold mb-2">Que souhaitez-vous imprimer ?</legend>
        {([{ value: 'page', label: `Page courante (page ${snapshot.filters.page ?? 1})` }, { value: 'all', label: 'Tous les résultats filtrés' }] as const).map(option => (
          <label key={option.value} className="client-print-option">
            <input type="radio" name="client-print-mode" checked={mode === option.value} onChange={() => {
              setMode(option.value);
              setState(current => ({ ...current, status: 'idle', rows: [], message: undefined }));
            }} />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className="client-print-actions">
        <button type="button" className="btn-secondary" disabled={loading || !allowed} onClick={prepare}>Préparer l’aperçu</button>
        {loading && <button type="button" className="btn-secondary" onClick={cancel}>Annuler le chargement</button>}
        <button type="button" className="btn-primary" disabled={!ready} onClick={print}><Printer size={16} aria-hidden />Imprimer / Enregistrer en PDF</button>
      </div>
      {(state.status === 'error' || state.status === 'denied') && <p role="alert" className="rounded-lg border border-danger p-3 text-danger">{state.message}</p>}
      <div role="status" aria-live="polite" className="text-sm text-text-muted">
        {loading && <p>Chargement des clients… {state.loaded?.toLocaleString('fr')}{state.total !== undefined && ` / ${state.total.toLocaleString('fr')}`}</p>}
        {state.status === 'idle' && <p>{state.message || 'Préparez l’aperçu pour vérifier la liste avant impression.'}</p>}
        {state.status === 'empty' && <p>Aucun client à imprimer. Revenez à la liste pour modifier les filtres.</p>}
        {ready && <p>{state.rows.length.toLocaleString('fr')} client{state.rows.length !== 1 ? 's' : ''} prêt{state.rows.length !== 1 ? 's' : ''}. Sur mobile, faites défiler l’aperçu horizontalement. Choisissez A4 dans la fenêtre d’impression.</p>}
      </div>
      {ready && <div className="client-print-scroll" role="region" aria-label="Aperçu A4 des clients" tabIndex={0}>{printDocument}</div>}
      {createPortal(<div ref={output} className="client-print-output" data-client-print-valid={ready ? 'true' : 'false'} aria-hidden="true">{printDocument}</div>, document.body)}
    </section>
  );
}
