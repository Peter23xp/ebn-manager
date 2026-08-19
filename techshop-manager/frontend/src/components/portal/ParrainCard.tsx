import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2, Copy, Check } from 'lucide-react';

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
    <div className="rounded-xl p-4 bg-blue-50 border border-blue-100">
      <div className="flex items-center gap-2 mb-2">
        <Share2 size={16} className="text-[#2E86C1]" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
          Votre matricule membre
        </span>
      </div>

      <p className="text-2xl font-mono font-bold text-[#1E3A5F] mb-3" data-testid="code-parrain">
        {codeParrain}
      </p>

      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-2 bg-[#1E3A5F] text-white rounded-xl h-10 px-4 text-sm font-semibold w-full justify-center mb-3"
        aria-label="Copier le matricule"
      >
        {copied ? (
          <><Check size={15} /> Copié !</>
        ) : (
          <><Copy size={15} /> Copier le matricule</>
        )}
      </button>

      <p className="text-xs text-neutral-500">
        <span className="font-semibold text-[#1E3A5F]">{nbFilleulsActifs} filleuls actifs</span>
        {' '}/{' '}{nbFilleulsTotal} total
      </p>
      <button
        type="button"
        onClick={() => navigate('/portal/referrals')}
        className="text-xs text-[#2E86C1] font-semibold mt-1 hover:underline"
      >
        Voir mes filleuls →
      </button>
    </div>
  );
}
