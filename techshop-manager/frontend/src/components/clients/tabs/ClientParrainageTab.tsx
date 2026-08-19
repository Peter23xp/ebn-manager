import { Link } from 'react-router-dom';
import { Copy, GitBranch, Network } from 'lucide-react';
import { initials } from '@/lib/utils';
import type { ClientDetail } from '@/lib/clients.api';

interface ClientParrainageTabProps {
  client: ClientDetail;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function ClientParrainageTab({ client }: ClientParrainageTabProps) {
  return (
    <div className="space-y-6">

      {/* Section A — Parrain */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted mb-3">Mon parrain</p>
        {client.parrain ? (
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold bg-primary-light text-primary-accent"
                aria-hidden
              >
                {initials(client.parrain.nom, client.parrain.prenom)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-text">
                  {client.parrain.prenom} {client.parrain.nom}
                </p>
                <p className="text-[11px] font-mono font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded inline-block">
                  {client.parrain.matricule || client.parrain.codeParrain}
                </p>
              </div>
              <Link
                to={`/clients/${client.parrain.id}`}
                className="text-[13px] font-semibold text-primary-accent hover:text-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent rounded"
              >
                Voir fiche →
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-text-muted italic">Ce client n'a pas été parrainé.</p>
        )}
      </div>

      {/* Section B — Matricule */}
      {(client.matricule || client.codeParrain) && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted mb-3">Mon matricule membre</p>
          <div className="rounded-xl bg-bg border border-border px-4 py-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-[22px] font-extrabold font-mono text-primary tracking-wider">
                {client.matricule || client.codeParrain}
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(client.matricule || client.codeParrain!)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-text-muted hover:text-primary-accent hover:border-primary-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent"
              >
                <Copy size={13} aria-hidden />
                Copier
              </button>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-text-muted">
              <GitBranch size={13} className="text-primary-accent" aria-hidden />
              <span>Matricule officiel du membre — partageable avec les prospects</span>
            </div>
          </div>
        </div>
      )}

      {/* Section C — MLM notice */}
      <div className="rounded-xl border border-dashed border-primary-accent/30 bg-primary-light/20 px-4 py-5 flex items-start gap-3">
        <Network size={20} className="text-primary-accent flex-shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-[13px] font-semibold text-primary">Réseau MLM à 8 niveaux</p>
          <p className="text-[12px] text-text-muted mt-1">
            Les filleuls, matrices et commissions de ce membre sont gérés dans le module MLM.
          </p>
          <Link
            to="/mlm"
            className="inline-flex items-center gap-1 mt-2 text-[12px] font-semibold text-primary-accent hover:text-blue-700 transition-colors"
          >
            Accéder au tableau MLM →
          </Link>
        </div>
      </div>
    </div>
  );
}
