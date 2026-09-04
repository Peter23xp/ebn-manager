import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2, Copy, Check, Users } from 'lucide-react';

interface ParrainCardProps {
  codeParrain: string;
  nbFilleulsActifs: number;
  nbFilleulsTotal: number;
}

export function ParrainCard({ codeParrain, nbFilleulsActifs, nbFilleulsTotal }: ParrainCardProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeParrain);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore — clipboard not available */
    }
  }, [codeParrain]);

  return (
    <div className="rounded-2xl border border-border bg-bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 size={14} className="text-text-subtle" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
            Votre matricule membre
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={copied
            ? 'flex h-8 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700'
            : 'flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-[#2E86C1] transition-colors hover:bg-blue-50'}
          aria-label="Copier le code parrain"
        >
          {copied ? <><Check size={13} /> Copié !</> : <><Copy size={13} /> Copier</>}
        </button>
      </div>

      <p
        className="mt-2 font-mono text-[22px] font-bold tracking-[0.08em] text-primary"
        data-testid="code-parrain"
      >
        {codeParrain}
      </p>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <button
          type="button"
          onClick={() => navigate('/portal/referrals')}
          className="flex items-center gap-2 text-left"
        >
          <Users size={16} className="text-text-subtle" />
          <span className="text-xs text-text-muted">
            <span className="font-bold text-primary">{nbFilleulsActifs} filleuls actifs</span>
            {' '}/ {nbFilleulsTotal} total
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/portal/referrals')}
          className="text-xs font-semibold text-[#2E86C1] transition-colors hover:text-[#1E3A5F]"
        >
          Voir le réseau →
        </button>
      </div>
    </div>
  );
}
