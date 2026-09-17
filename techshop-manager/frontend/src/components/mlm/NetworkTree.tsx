import { Children, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Focus, Maximize, Minus, Plus } from 'lucide-react';
import './NetworkTree.css';

export function NetworkTree({ children, view = 'tree' }: { children: ReactNode; view?: 'tree' | 'list' }) {
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const previous = useRef({ width: 0, zoom: 1 });
  const drag = useRef<{ left: number; top: number; clientX: number; clientY: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const helpId = useId();

  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element || view === 'list') return;
    const measure = () => setSize(current => {
      const next = { width: element.offsetWidth, height: element.offsetHeight };
      return current.width === next.width && current.height === next.height ? current : next;
    });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [view]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || !size.width || view === 'list') return;
    const before = previous.current;
    const center = before.width ? (element.scrollLeft + element.clientWidth / 2) / before.zoom + (size.width - before.width) / 2 : size.width / 2;
    element.scrollLeft = Math.max(0, center * zoom - element.clientWidth / 2);
    element.scrollTop = element.scrollTop * zoom / before.zoom;
    previous.current = { width: size.width, zoom };
  }, [size.width, zoom, view]);

  const recenter = () => {
    if (!viewport.current) return;
    viewport.current.scrollLeft = Math.max(0, (size.width * zoom - viewport.current.clientWidth) / 2);
    viewport.current.scrollTop = 0;
  };

  return <div className="network-tree" data-view={view}>
    <div hidden={view === 'list'} className={view === 'list' ? 'hidden' : 'flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-card px-3 py-2'}>
      <p id={helpId} className="text-xs text-text-muted">Déplacez l’arbre · Cliquez sur un membre pour ses détails</p>
      <div className="flex items-center gap-1" role="group" aria-label="Navigation de l’arbre">
        <button type="button" className="network-tool" aria-label="Zoom arrière" disabled={zoom <= 0.25} onClick={() => setZoom(value => Math.max(0.25, value - 0.25))}><Minus size={18} /></button>
        <output className="w-16 text-center text-sm tabular-nums text-text" aria-label="Zoom actuel" aria-live="polite">{Math.round(zoom * 100)} %</output>
        <button type="button" className="network-tool" aria-label="Zoom avant" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + 0.25))}><Plus size={18} /></button>
        <button type="button" className="network-tool" aria-label="Ajuster l’arbre à l’écran" title="Vue d’ensemble" onClick={() => {
          if (viewport.current && size.width) setZoom(Math.max(0.1, Math.min(1, viewport.current.clientWidth / size.width, viewport.current.clientHeight / size.height)));
          recenter();
        }}><Maximize size={18} /></button>
        <button type="button" className="network-tool" aria-label="Recentrer sur la racine" title="Recentrer sur la racine" onClick={recenter}><Focus size={18} /></button>
      </div>
    </div>
    <div ref={viewport} className="network-viewport" role="region" aria-label={view === 'tree' ? 'Arbre du réseau' : 'Liste du réseau'} aria-describedby={view === 'tree' ? helpId : undefined} tabIndex={0}
      onPointerDown={event => {
        if (view === 'list' || event.pointerType !== 'mouse' || event.button !== 0 || (event.target as HTMLElement).closest('button, a, input, summary')) return;
        drag.current = { left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop, clientX: event.clientX, clientY: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={event => {
        if (!drag.current) return;
        event.currentTarget.scrollLeft = drag.current.left - event.clientX + drag.current.clientX;
        event.currentTarget.scrollTop = drag.current.top - event.clientY + drag.current.clientY;
      }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        const direction = { ArrowLeft: [-120, 0], ArrowRight: [120, 0], ArrowUp: [0, -120], ArrowDown: [0, 120] }[event.key];
        if (!direction) return;
        event.preventDefault();
        event.currentTarget.scrollLeft += direction[0];
        event.currentTarget.scrollTop += direction[1];
      }}>
      <div className="network-scaled-space" style={view === 'tree' ? { width: size.width * zoom || undefined, height: size.height * zoom || undefined } : undefined}>
        <div ref={canvas} className="network-canvas" style={view === 'tree' ? { transform: `scale(${zoom})` } : undefined}>
          <ul className="network-roots">{children}</ul>
        </div>
      </div>
    </div>
  </div>;
}

interface TreeBranchProps extends Omit<HTMLAttributes<HTMLLIElement>, 'content'> {
  content: ReactNode;
  childrenLabel?: string;
}

export function TreeBranch({ content, children, childrenLabel, className = '', ...props }: TreeBranchProps) {
  const row = useRef<HTMLUListElement>(null);
  const count = Children.count(children);
  const [centers, setCenters] = useState<number[]>([]);

  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    const measure = () => {
      if (!element.offsetWidth) return;
      const next = Array.from(element.children, child => {
        const branch = child as HTMLElement;
        return (branch.offsetLeft + branch.offsetWidth / 2) / element.offsetWidth * 100;
      });
      setCenters(current => current.length === next.length && current.every((value, index) => value === next[index]) ? current : next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, [children, count]);

  return <li {...props} className={`network-branch ${className}`}>
    <div className="network-node-frame">{content}</div>
    {count > 0 && <div className="network-descendants">
      <svg data-tree-connectors aria-hidden="true" className="network-connectors" preserveAspectRatio="none" viewBox="0 0 100 72">
        {Array.from({ length: count }, (_, index) => <line key={index} x1="50" y1="0" x2={centers[index] ?? (index + 0.5) / count * 100} y2="72" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <ul ref={row} className="network-children" aria-label={childrenLabel}>{children}</ul>
    </div>}
  </li>;
}
