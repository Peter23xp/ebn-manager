import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Wallet,
  Award,
  History,
  Layers,
  Users,
  UserCheck,
  Gift,
  Trophy,
  DollarSign,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useMemberProgress } from '@/hooks/useMlm';
import { MlmLevelBadge } from '@/components/mlm/MlmLevelBadge';
import { CareerProgressBar } from '@/components/mlm/CareerProgressBar';
import { MatrixGrid } from '@/components/mlm/MatrixGrid';
import { formatDate, formatUSD } from '@/lib/utils';

const BONUS_STATUT_LABEL: Record<string, { label: string; badge: string }> = {
  EN_ATTENTE: { label: 'En attente', badge: 'badge-warning' },
  EN_COURS: { label: 'En cours', badge: 'badge-info' },
  LIVRE: { label: 'Livré', badge: 'badge-success' },
  ANNULE: { label: 'Annulé', badge: 'badge-danger' },
};

const COMMISSION_STATUT_LABEL: Record<string, { label: string; badge: string }> = {
  EN_ATTENTE: { label: 'En attente', badge: 'badge-warning' },
  VALIDEE: { label: 'Validée', badge: 'badge-info' },
  PAYEE: { label: 'Payée', badge: 'badge-success' },
  ANNULEE: { label: 'Annulée', badge: 'badge-danger' },
};

export default function MemberProgressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useMemberProgress(id ?? '');
  const [selectedMatrixLevelId, setSelectedMatrixLevelId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="skeleton h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <div className="skeleton h-7 w-48 rounded" />
            <div className="skeleton h-4 w-64 rounded" />
          </div>
        </div>
        <div className="skeleton h-40 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="skeleton h-40 rounded-xl lg:col-span-2" />
          <div className="skeleton h-40 rounded-xl" />
        </div>
        <div className="skeleton h-32 rounded-xl" />
      </div>
    );
  }

  if (!data?.membre) {
    return (
      <div className="text-center py-16">
        <p className="text-text-muted">Membre introuvable.</p>
        <button onClick={() => navigate('/mlm/members')} className="btn-secondary mt-4">
          Retour à la liste
        </button>
      </div>
    );
  }

  const {
    membre,
    progression,
    portefeuille,
    filleuls = [],
    matrices = [],
    commissions = [],
    commissionsByStatut = {},
    bonusAttribues = [],
    bonusRetraites = [],
    historiquePromotions = [],
  } = data;

  // Active matrix for display
  const activeMatrix =
    matrices?.find((m: any) => m.niveau.id === (selectedMatrixLevelId ?? membre.level.id)) ??
    matrices?.[0];

  const prochainNiveau = progression?.prochainNiveau;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Top navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/mlm/members')}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-text-muted hover:border-primary-accent hover:text-primary-accent transition-colors duration-150"
            aria-label="Retour"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-page-title text-primary">
                {membre.client.prenom} {membre.client.nom}
              </h1>
              <MlmLevelBadge level={membre.level.ordre} size="md" />
            </div>
            <p className="text-xs text-text-muted font-mono mt-0.5">
              Matricule : <span className="font-bold text-text">{membre.matricule}</span> • Téléphone : {membre.client.telephone}
            </p>
          </div>
        </div>

        <Link
          to={`/clients/${membre.client.id}`}
          className="btn-secondary flex items-center gap-1.5 text-[13px]"
        >
          <ExternalLink size={14} /> Profil client
        </Link>
      </div>

      {/* Hero Overview: Rank + Next Rank + Parrain + Wallet */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Current & Next Rank Card */}
        <div className="md:col-span-2 rounded-xl border border-border bg-bg-card shadow-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">Rang MLM actuel</p>
                <h2 className="text-2xl font-extrabold text-text mt-0.5">{membre.level.nom}</h2>
                <p className="text-xs text-text-muted mt-1">
                  Commission du niveau : <strong className="text-text">{formatUSD(membre.level.commissionParFilleul)}</strong> / personne (Total : {formatUSD(membre.level.commissionTotale)})
                </p>
              </div>
              <MlmLevelBadge level={membre.level.ordre} size="lg" />
            </div>

            {/* Progression details */}
            <div className="rounded-xl p-4 border border-border bg-bg">
              <div className="flex justify-between items-center text-sm font-semibold mb-2">
                <span className="text-text">
                  Progression vers {prochainNiveau ? prochainNiveau.nom : 'Crown Ambassadeur (max)'}
                </span>
                <span className="text-primary-accent font-bold">
                  {progression?.filleulsValidesNiveauActuel} / {progression?.filleulsRequis} personnes ({progression?.pourcentage}%)
                </span>
              </div>
              <div className="w-full bg-bg-inset rounded-full h-3">
                <div
                  className="bg-primary-accent h-3 rounded-full transition-all duration-500 ease-out-quart"
                  style={{ width: `${progression?.pourcentage}%` }}
                />
              </div>
              <div className="flex flex-wrap justify-between text-xs text-text-muted mt-2">
                <span>
                  {progression?.filleulsRestants === 0
                    ? 'Matrice prête pour promotion !'
                    : `Il reste ${progression?.filleulsRestants} personne${(progression?.filleulsRestants ?? 0) > 1 ? 's' : ''} pour passer ${prochainNiveau?.nom ?? 'au niveau suivant'}.`}
                </span>
                {prochainNiveau && (
                  <span className="font-medium text-text">
                    Prochain gain : {formatUSD(prochainNiveau.commissionTotale)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Bonus du niveau */}
          <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-text-muted flex items-center gap-1">
              <Gift size={14} className="text-warning" /> Bonus associé :
            </span>
            <span className="font-semibold text-text">{membre.level.bonusDescription}</span>
          </div>
        </div>

        {/* Side summary: Parrain & Portefeuille */}
        <div className="space-y-4">
          {/* Parrain Direct */}
          <div className="rounded-xl border border-border bg-bg-card shadow-card p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted mb-2 flex items-center gap-1.5">
              <UserCheck size={14} className="text-primary-accent" /> Parrain direct
            </p>
            {membre.parrain ? (
              <div className="space-y-1.5">
                <p className="font-bold text-text text-sm">
                  {membre.parrain.client?.prenom} {membre.parrain.client?.nom}
                </p>
                <p className="text-xs font-mono text-text-muted">
                  Matricule : <span className="font-semibold text-text">{membre.parrain.matricule}</span>
                </p>
                <div className="pt-1">
                  <MlmLevelBadge level={membre.parrain.level?.ordre ?? 1} size="sm" />
                </div>
                <Link
                  to={`/mlm/members/${membre.parrain.id}`}
                  className="inline-flex items-center gap-1 text-xs text-primary-accent font-semibold hover:underline pt-1"
                >
                  Voir la progression du parrain <ChevronRight size={12} />
                </Link>
              </div>
            ) : (
              <p className="text-xs text-text-subtle italic">Aucun parrain (membre racine)</p>
            )}
          </div>

          {/* Portefeuille USD */}
          <div className="rounded-xl border border-primary-light bg-bg-card shadow-card p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted mb-3 flex items-center gap-1.5">
              <Wallet size={14} className="text-primary-accent" /> Portefeuille USD
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-text-muted">Total gagné</p>
                <p className="text-lg font-extrabold font-mono text-success">
                  {formatUSD(portefeuille?.totalGagne ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-text-muted">Solde disponible</p>
                <p className="text-lg font-extrabold font-mono text-text">
                  {formatUSD(portefeuille?.soldeDisponible ?? 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Global Career Progression (8 levels) */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-section-title text-primary flex items-center gap-2">
            <Award size={18} className="text-warning" />
            Parcours de carrière (8 niveaux)
          </h2>
          <span className="text-xs font-bold text-text-muted bg-bg px-3 py-1 rounded-full">
            Étape {membre.level.ordre} / 8 • {progression?.progressionGlobaleCrownAmbassadeur}% achevé
          </span>
        </div>
        <div className="overflow-x-auto pb-1">
          <CareerProgressBar currentLevel={membre.level.ordre} />
        </div>
      </div>

      {/* Matrix Viewer (4 positions) */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-section-title text-primary flex items-center gap-2">
              <Layers size={18} className="text-primary-accent" />
              Matrice 4 positions — {activeMatrix?.niveau?.nom}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Positions occupées par les filleuls à ce niveau de carrière
            </p>
          </div>

          {/* Matrix level tabs */}
          {matrices && matrices.length > 1 && (
            <div className="period-toggle" role="group" aria-label="Niveau de matrice">
              {matrices.map((m: any) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMatrixLevelId(m.niveau.id)}
                  className={`period-btn ${
                    (selectedMatrixLevelId ?? membre.level.id) === m.niveau.id ? 'active' : ''
                  }`}
                >
                  {m.niveau.nom} ({m.filleulsValides}/4)
                </button>
              ))}
            </div>
          )}
        </div>

        <MatrixGrid matrix={activeMatrix} />
      </div>

      {/* Filleuls Directs List */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-section-title text-primary flex items-center gap-2">
            <Users size={18} className="text-platine" />
            Filleuls directs ({filleuls.length})
          </h2>
          <span className="text-xs text-text-muted">
            {filleuls.filter((f: any) => f.statut === 'ACTIF').length} actifs
          </span>
        </div>

        {filleuls.length === 0 ? (
          <p className="text-sm text-text-subtle italic py-6 text-center">
            Aucun filleul direct enregistré pour ce membre.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3">Filleul</th>
                  <th className="px-4 py-3">Matricule</th>
                  <th className="px-4 py-3">Rang</th>
                  <th className="px-4 py-3">Progression</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Date activation</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filleuls.map((f: any) => (
                  <tr key={f.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-text">
                      {f.client.prenom} {f.client.nom}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">{f.matricule}</td>
                    <td className="px-4 py-3">
                      <MlmLevelBadge level={f.level?.ordre ?? 1} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      {f.progression ? (
                        <div className="w-32">
                          <div className="flex justify-between text-xs text-text-muted mb-0.5">
                            <span>{f.progression.filleulsValides}/4</span>
                            <span>{f.progression.pourcentage}%</span>
                          </div>
                          <div className="w-full bg-bg-inset rounded-full h-1.5">
                            <div
                              className="bg-primary-accent h-1.5 rounded-full transition-all duration-300 ease-out-quart"
                              style={{ width: `${f.progression.pourcentage}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-text-subtle">0/4</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold ${f.statut === 'ACTIF' ? 'text-success' : 'text-text-subtle'}`}>
                        {f.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {formatDate(f.dateActivation)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/mlm/members/${f.id}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-primary-accent hover:text-blue-700"
                      >
                        Voir profil <ChevronRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Commissions & Physical Bonuses in 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Commissions section */}
        <div className="rounded-xl border border-border bg-bg-card shadow-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-section-title text-primary flex items-center gap-2">
              <DollarSign size={18} className="text-success" />
              Commissions ({commissions.length})
            </h2>
            <div className="flex gap-1.5 text-xs">
              {Object.entries(commissionsByStatut).map(([st, val]: [string, any]) => {
                const cfg = COMMISSION_STATUT_LABEL[st] ?? COMMISSION_STATUT_LABEL['EN_ATTENTE'];
                return (
                  <span key={st} className={`badge ${cfg.badge}`}>
                    {cfg.label} ({val.count})
                  </span>
                );
              })}
            </div>
          </div>

          {commissions.length === 0 ? (
            <p className="text-sm text-text-subtle italic py-6 text-center">
              Aucune commission enregistrée pour le moment.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-bg-card">
                  <tr>
                    <th className="px-3 py-2">Niveau</th>
                    <th className="px-3 py-2">Montant</th>
                    <th className="px-3 py-2">Statut</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {commissions.map((c: any) => {
                    const cfg = COMMISSION_STATUT_LABEL[c.statut] ?? COMMISSION_STATUT_LABEL['EN_ATTENTE'];
                    return (
                      <tr key={c.id}>
                        <td className="px-3 py-2.5 font-semibold text-text">
                          {c.level?.nom}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-text">
                          {formatUSD(c.montant)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`badge ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-text-muted">
                          {formatDate(c.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Physical Bonuses section */}
        <div className="rounded-xl border border-border bg-bg-card shadow-card p-6 space-y-4">
          <h2 className="text-section-title text-primary flex items-center gap-2">
            <Gift size={18} className="text-warning" />
            Bonus en nature ({bonusAttribues.length})
          </h2>

          {bonusAttribues.length === 0 ? (
            <p className="text-sm text-text-subtle italic py-6 text-center">
              Aucun bonus en nature attribué pour le moment.
            </p>
          ) : (
            <div className="space-y-3">
              {bonusAttribues.map((b: any) => {
                const cfg = BONUS_STATUT_LABEL[b.statut] ?? BONUS_STATUT_LABEL['EN_ATTENTE'];
                return (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-border bg-bg"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-text">{b.level?.nom}</span>
                        <span className={`badge ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mt-1">{b.description}</p>
                    </div>
                    <span className="text-[11px] text-text-muted flex-shrink-0">
                      {formatDate(b.dateAttribution)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Retirement Bonus (Crown Ambassadeur referral) */}
      {bonusRetraites && bonusRetraites.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-warning">
              <Trophy size={20} />
            </div>
            <h2 className="text-section-title text-primary">Bonus de retraite (50 000 $)</h2>
          </div>
          <p className="text-sm text-text-muted">
            Félicitations ! Un ou plusieurs de vos filleuls ont atteint le rang <strong className="font-semibold text-text">Crown Ambassadeur</strong>.
            Vous êtes éligible au bonus de retraite exceptionnel.
          </p>
          <div className="space-y-2 pt-1">
            {bonusRetraites.map((br: any) => (
              <div
                key={br.id}
                className="rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 bg-bg-card border border-amber-200"
              >
                <div>
                  <p className="font-bold text-sm text-text">
                    Filleul : {br.filleulCrown?.client?.prenom} {br.filleulCrown?.client?.nom}
                  </p>
                  <p className="text-xs text-text-muted">
                    Montant : <strong className="text-text font-mono">{formatUSD(br.montant)}</strong> • Statut : {br.statut}
                  </p>
                </div>
                <span className="text-xs font-bold bg-white text-warning border border-amber-200 px-3 py-1 rounded-full">
                  {br.statut === 'PAYE' ? '✓ Payé' : 'En attente de validation'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Promotion History */}
      {historiquePromotions && historiquePromotions.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-card shadow-card p-6 space-y-4">
          <h2 className="text-section-title text-primary flex items-center gap-2">
            <History size={18} className="text-text-muted" />
            Historique des promotions
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Transition</th>
                  <th className="px-4 py-3">Commission associée</th>
                </tr>
              </thead>
              <tbody>
                {historiquePromotions.map((p: any) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-text">{formatDate(p.datePromotion)}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-text">
                        {p.niveauAvant?.nom ?? `Niveau ${p.niveauAvantId}`} → {p.niveauApres?.nom ?? `Niveau ${p.niveauApresId}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-success">
                      {formatUSD(p.commissionVersee)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}