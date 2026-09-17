import { ArrowLeft, ChevronRight, List, Network } from 'lucide-react';

export type NetworkView = 'tree' | 'list';
export interface NetworkTarget { id: string; name: string }

export function NetworkNavigation({ root, path, view, onView, onBack }: {
  root: NetworkTarget;
  path: NetworkTarget[];
  view: NetworkView;
  onView: (view: NetworkView) => void;
  onBack: (index: number) => void;
}) {
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="min-w-0 break-words text-sm font-semibold text-text">Arbre de {path[path.length - 1]?.name ?? root.name}</h3>
      <div role="group" aria-label="Présentation du réseau" className="flex rounded-lg border border-border bg-bg-card p-1">
        <button type="button" aria-label="Vue arbre" aria-pressed={view === 'tree'} className={`network-tool ${view === 'tree' ? 'bg-primary-light text-primary-accent' : ''}`} onClick={() => onView('tree')}><Network size={16} />Arbre</button>
        <button type="button" aria-label="Vue liste" aria-pressed={view === 'list'} className={`network-tool ${view === 'list' ? 'bg-primary-light text-primary-accent' : ''}`} onClick={() => onView('list')}><List size={16} />Liste</button>
      </div>
    </div>
    {path.length > 0 && <div className="space-y-2">
      <button type="button" className="btn-secondary min-h-touch gap-2" onClick={() => onBack(-1)}><ArrowLeft size={16} />Retour à mon arbre</button>
      <nav aria-label="Chemin du réseau"><ol className="flex flex-wrap items-center gap-x-1 text-sm text-text-muted">
        {[root, ...path].map((item, index, items) => <li key={`${item.id}-${index}`} className="flex min-w-0 max-w-full items-center">
          {index > 0 && <ChevronRight size={14} className="shrink-0" aria-hidden="true" />}
          {index === items.length - 1 ? <span aria-current="page" className="break-words px-2 py-3 font-semibold text-text">{item.name}</span> : <button type="button" className="min-h-touch break-words rounded-lg px-2 text-left hover:bg-bg-inset focus-visible:outline-primary-accent" onClick={() => onBack(index - 1)}>{item.name}</button>}
        </li>)}
      </ol></nav>
    </div>}
  </div>;
}
