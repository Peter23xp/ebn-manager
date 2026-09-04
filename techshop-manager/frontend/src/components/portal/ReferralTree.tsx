import { useState } from 'react';
import { ChevronDown, ChevronRight, User } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { PortalFilleul } from '@/lib/portal.api';

// ── Construction de la forêt ──────────────────────────────────────────────────

interface TreeNode {
  filleul: PortalFilleul;
  children: TreeNode[];
}

/**
 * Attache chaque filleul sous son parrain. Les membres dont le parrain est le
 * client lui-même (parrainId hors liste) deviennent racines de l'arbre.
 */
function buildForest(list: PortalFilleul[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const f of list) byId.set(f.id, { filleul: f, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.filleul.parrainId ? byId.get(node.filleul.parrainId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function countSubtree(node: TreeNode, seen = new Set<string>()): number {
  if (seen.has(node.filleul.id)) return 0;
  seen.add(node.filleul.id);
  let n = 0;
  for (const c of node.children) n += 1 + countSubtree(c, seen);
  return n;
}

function treeDepth(list: TreeNode[]): number {
  let max = 0;
  for (const t of list) max = Math.max(max, 1 + treeDepth(t.children));
  return max;
}

// ── Badge de statut (palette alignée sur la vue Liste) ────────────────────────

const STATUT_STYLE: Record<PortalFilleul['statut'], string> = {
  ACTIF: 'bg-emerald-50 text-emerald-700',
  EN_COURS: 'bg-amber-50 text-amber-700',
  SUSPENDU: 'bg-red-50 text-red-600',
};

// ── Branche récursive ─────────────────────────────────────────────────────────

function Branch({ node, depth }: { node: TreeNode; depth: number }) {
  const { filleul: f, children } = node;
  const hasChildren = children.length > 0;
  const [open, setOpen] = useState(depth < 2);

  const initials = `${f.prenom[0] ?? ''}${f.nom[0] ?? ''}`.toUpperCase();
  const subtree = hasChildren ? countSubtree(node) : 0;

  return (
    <li
      className="relative last:after:content-[''] last:after:absolute last:after:-left-[13px] last:after:top-[1.375rem] last:after:bottom-0 last:after:w-[2px] last:after:bg-bg-card"
      data-testid={`tree-node-${f.id}`}
      data-parent={f.parrainId ?? ''}
      data-depth={depth}
    >
      {/* Coude de connexion vers le rail parent */}
      <span aria-hidden className="absolute -left-[13px] top-[1.375rem] h-px w-[13px] bg-border" />

      <div className="flex items-center gap-2.5 py-2">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? `Replier la branche de ${f.prenom} ${f.nom}` : `Déplier la branche de ${f.prenom} ${f.nom}`}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-inset hover:text-text"
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span aria-hidden className="h-1 w-1 flex-shrink-0 rounded-full bg-border-strong" />
        )}

        <span
          aria-hidden
          className={cn(
            'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
            f.statut === 'ACTIF' ? 'bg-emerald-50 text-emerald-700'
              : f.statut === 'SUSPENDU' ? 'bg-red-50 text-red-600'
              : 'bg-amber-50 text-amber-700',
          )}
        >
          {initials}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-text">
              {f.prenom} {f.nom}
            </p>
            <span
              className={cn(
                'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                STATUT_STYLE[f.statut],
              )}
            >
              {f.statut === 'ACTIF' ? 'Actif' : f.statut === 'EN_COURS' ? 'En cours' : 'Suspendu'}
            </span>
          </div>
          <p className="text-[11px] text-text-subtle">
            G{f.generation ?? depth + 1}
            {' · '}Inscrit le {format(new Date(f.dateInscription), 'd MMM yyyy', { locale: fr })}
          </p>
        </div>

        {hasChildren && (
          <span className="flex-shrink-0 text-[11px] font-semibold tabular-nums text-text-subtle">
            {subtree}
          </span>
        )}
      </div>

      {hasChildren && open && (
        <ul className="ml-3.5 border-l border-border pl-3.5">
          {children.map((c) => (
            <Branch key={c.filleul.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

interface ReferralTreeProps {
  nodes: PortalFilleul[];
  total: number;
  isLoading: boolean;
  codeParrain?: string;
}

export function ReferralTree({ nodes, total, isLoading, codeParrain }: ReferralTreeProps) {
  if (isLoading) {
    return (
      <div className="space-y-2.5 rounded-2xl border border-border bg-bg-card p-4 shadow-card">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-xl bg-bg-inset" />
        ))}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-8 text-center">
        <p className="mb-1.5 text-sm text-text-muted">
          Personne n'est encore inscrit avec votre matricule.
        </p>
        {codeParrain && (
          <p className="text-sm font-semibold text-[#2E86C1]">
            Partagez votre code {codeParrain} pour démarrer votre réseau !
          </p>
        )}
      </div>
    );
  }

  const roots = buildForest(nodes);
  const maxDepth = treeDepth(roots);

  return (
    <div className="rounded-2xl border border-border bg-bg-card p-4 shadow-card">
      {/* Racine : le client */}
      <div className="flex items-center gap-2.5 pb-2">
        <span
          aria-hidden
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#1E3A5F] text-white"
        >
          <User size={13} />
        </span>
        <p className="text-sm font-semibold text-primary">Votre réseau</p>
        <span className="ml-auto text-[11px] text-text-subtle">
          {nodes.length} membre{nodes.length > 1 ? 's' : ''} · {maxDepth} niveau{maxDepth > 1 ? 'x' : ''}
        </span>
      </div>

      <ul className="mt-1">
        {roots.map((r) => (
          <Branch key={r.filleul.id} node={r} depth={0} />
        ))}
      </ul>

      {total > nodes.length && (
        <p className="mt-2 border-t border-border pt-2.5 text-[11px] text-text-subtle">
          Réseau volumineux : seuls les {nodes.length} premiers membres sont affichés dans l'arbre.
        </p>
      )}
    </div>
  );
}
