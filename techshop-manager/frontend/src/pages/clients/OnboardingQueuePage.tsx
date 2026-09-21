import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, Clock, ChevronRight, RefreshCw, FileText, Zap, Plus, CheckCircle2, Circle, ListFilter } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatRelative, initials, cn } from '@/lib/utils';
import { useSites } from '@/hooks/useSites';
import { useAuthStore } from '@/store/auth.store';
import { hasMinimumRole, isSiteScopedStaff } from '@/lib/roles';
import { usePrivateQueryScope } from '@/hooks/usePrivateQueryScope';
import './onboarding-queue.css';

interface QueueClient {
  id: string;
  prenom: string;
  nom: string;
  telephone: string;
  site: { id: string; nom: string } | null;
  createdBy: { id: string; nom: string } | null;
  createdAt: string;
  etapeActuelle: 'RECIT' | 'FICHE' | 'ACTIVATION';
  prochainRoute: string;
  etapes: {
    recit: { statut: string; completeeAt?: string | null } | null;
    fiche: { statut: string; completeeAt?: string | null } | null;
    activation: { statut: string; completeeAt?: string | null } | null;
  };
}

interface QueueResponse {
  queue: QueueClient[];
  stats: { ficheEnAttente: number; activationEnAttente: number; total: number };
}

const ETAPE_CONFIG = {
  RECIT: { label: 'Récit à encaisser', labelAction: 'Compléter le récit', color: 'bg-amber-100 text-amber-800', icon: Clock },
  FICHE: { label: 'Fiche à payer', labelAction: 'Enregistrer la fiche', color: 'bg-blue-50 text-blue-700', icon: FileText },
  ACTIVATION: { label: 'Prêt à activer', labelAction: 'Activer le compte', color: 'bg-green-100 text-green-700', icon: Zap },
};

function StepStatus({ done, label }: { done: boolean; label: string }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className={cn('queue-step', done ? 'text-success' : 'text-text-muted')} aria-label={`${label} : ${done ? 'terminé' : 'en attente'}`}>
      <Icon size={14} aria-hidden />
      <span className={done ? 'text-success' : 'text-text-muted'}>{label}</span>
    </li>
  );
}

function ClientRow({ client, canCollect, onAction }: { client: QueueClient; canCollect: boolean; onAction: (route: string) => void }) {
  const config = ETAPE_CONFIG[client.etapeActuelle] ?? ETAPE_CONFIG.RECIT;
  const Icon = config.icon;
  const clientName = `${client.prenom} ${client.nom}`.trim();

  return (
    <tr role="row">
      <th scope="row" role="rowheader" className="queue-client">
        <div className="flex min-w-0 items-start gap-3">
          <span className="queue-avatar" aria-hidden>{initials(clientName) || '?'}</span>
          <div className="min-w-0">
            <p className="queue-client-name">{clientName}</p>
            <p className="queue-meta">{client.telephone}</p>
          </div>
        </div>
      </th>
      <td role="cell" className="queue-site">
        <span className="queue-mobile-label">Site / Agent</span>
        <p className="text-sm text-text">{client.site?.nom ?? '—'}</p>
        <p className="queue-meta">{client.createdBy ? `Préparé par ${client.createdBy.nom}` : 'Agent non renseigné'}</p>
      </td>
      <td role="cell" className="queue-stage">
        <span className={cn('queue-badge', canCollect ? config.color : 'bg-slate-100 text-slate-700')}>
          <Icon size={14} aria-hidden />
          {canCollect ? config.label : 'En attente de passage en caisse'}
        </span>
      </td>
      <td role="cell" className="queue-progress">
        <span className="queue-mobile-label">Progression du dossier</span>
        <ol className="queue-steps" aria-label="Progression du dossier">
          <StepStatus done={client.etapes.recit?.statut === 'COMPLETE'} label="Récit" />
          <StepStatus done={client.etapes.fiche?.statut === 'COMPLETE'} label="Fiche" />
          <StepStatus done={client.etapes.activation?.statut === 'COMPLETE'} label="Activation" />
        </ol>
      </td>
      <td role="cell" className="queue-since">
        <span className="queue-mobile-label">Inscrit le</span>
        <time dateTime={client.createdAt} className="text-sm tabular-nums">{formatDate(client.createdAt)}</time>
        <p className="queue-meta">{formatRelative(client.createdAt)}</p>
      </td>
      <td role="cell" className="queue-action">
        <button
          type="button"
          onClick={() => onAction(canCollect ? client.prochainRoute : `/clients/${client.id}`)}
          className="btn-secondary"
        >
          <span>{canCollect ? config.labelAction : 'Ouvrir le dossier'}</span>
          <ChevronRight size={16} aria-hidden />
        </button>
      </td>
    </tr>
  );
}

export default function OnboardingQueuePage() {
  const scope = usePrivateQueryScope();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { sites } = useSites();
  const isScoped = !!user && isSiteScopedStaff(user.role);
  const canCollect = hasMinimumRole(user?.role, 'CAISSIER');
  const [selectedSiteId, setSiteId] = useState(user?.siteId ?? '');
  const siteId = isScoped ? user.siteId ?? '' : selectedSiteId;
  const [filterEtape, setFilterEtape] = useState('');
  const [deniedScopes, setDeniedScopes] = useState<string[]>([]);
  const queryScope = JSON.stringify([siteId, scope.key]);

  const { data: response, isLoading, refetch, isFetching, isError, isSuccess, error } = useQuery<QueueResponse>({
    queryKey: ['onboarding-queue', siteId, scope.key],
    queryFn: () => api.get('/clients/onboarding-queue', { params: siteId ? { siteId } : {} }).then(result => result.data),
    refetchInterval: 30_000,
    enabled: scope.enabled,
  });
  const responseDenied = (error as { response?: { status?: number } } | null)?.response?.status === 403;
  useEffect(() => {
    if (responseDenied) {
      setDeniedScopes(current => current.includes(queryScope) ? current : [...current, queryScope]);
    } else if (isSuccess) {
      setDeniedScopes(current => current.includes(queryScope) ? current.filter(key => key !== queryScope) : current);
    }
  }, [responseDenied, isSuccess, queryScope]);
  const accessDenied = responseDenied || deniedScopes.includes(queryScope);
  const data = scope.enabled && !accessDenied ? response : undefined;
  const queue = (data?.queue ?? []).filter(client => !filterEtape || client.etapeActuelle === filterEtape);
  const showData = scope.enabled && !accessDenied && (!isError || !!data);
  const filteredEmpty = !!filterEtape && (data?.queue.length ?? 0) > 0;

  return (
    <div className="onboarding-queue">
      <header className="queue-header">
        <div>
          <h1 className="text-page-title text-primary">File d’attente des clients</h1>
          <p className="mt-1 text-sm text-text-muted">Suivez les dossiers en cours, du récit à l’activation du compte.</p>
        </div>
        {scope.enabled && <button type="button" onClick={() => navigate('/clients/new/recit')} className="btn-primary">
          <Plus size={16} aria-hidden />Nouveau client
        </button>}
      </header>

      <div className="queue-toolbar">
        <div className="queue-filter-fields" role="group" aria-label="Filtres de la file">
          {!isScoped ? (
            <div className="queue-site-field">
              <label htmlFor="queue-site">Site</label>
              <select id="queue-site" value={siteId} disabled={!scope.enabled} onChange={event => setSiteId(event.target.value)}>
                <option value="">Tous les sites</option>
                {sites.map(site => <option key={site.id} value={site.id}>{site.nom}</option>)}
              </select>
            </div>
          ) : (
            <div className="queue-site-field">
              <span className="queue-field-label">Site attribué</span>
              <p className="queue-assigned-site">{user.siteId ? user.site?.nom ?? user.siteName ?? 'Votre site' : 'Aucun site attribué'}</p>
            </div>
          )}
          <div className="min-w-0 max-w-full">
            <p className="queue-field-label mb-1.5">Étape du dossier</p>
            <div className="queue-stage-filter" role="group" aria-label="Étape du dossier">
              {[
                { key: '', label: 'Tous' },
                { key: 'RECIT', label: 'Récit' },
                { key: 'FICHE', label: 'Fiche' },
                { key: 'ACTIVATION', label: 'À activer' },
              ].map(option => (
                <button key={option.key} type="button" disabled={!scope.enabled} onClick={() => setFilterEtape(option.key)} aria-pressed={filterEtape === option.key}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="queue-refresh">
          <p className="text-xs leading-relaxed text-text-muted">Actualisation automatique<br />toutes les 30 secondes</p>
          <button type="button" onClick={() => scope.isCurrent() && refetch()} disabled={!scope.enabled || isFetching} className="btn-secondary">
            <RefreshCw size={16} className={cn(isFetching && 'animate-spin')} aria-hidden />Actualiser
          </button>
        </div>
      </div>

      {!scope.enabled ? (
        <div className="queue-notice" role="alert">
          <p>{isScoped && !user.siteId ? 'Votre compte n’est pas associé à un site. Contactez votre responsable pour consulter la file des clients.' : 'Cette file n’est pas accessible avec votre session actuelle. Contactez votre responsable.'}</p>
        </div>
      ) : accessDenied ? (
        <div className="queue-notice" role="alert">
          <p>Vous n’avez pas accès à cette file de clients. Contactez votre responsable pour vérifier vos autorisations.</p>
        </div>
      ) : isError ? (
        <div className="queue-notice" role="alert">
          <p>{data ? 'L’actualisation a échoué. Les dernières données chargées restent affichées.' : 'Impossible de charger la file des clients. Vérifiez votre connexion puis réessayez.'}</p>
          <button type="button" onClick={() => scope.isCurrent() && refetch()} disabled={isFetching} className="btn-secondary">Réessayer</button>
        </div>
      ) : null}

      {showData && <>
        <section aria-label="Synthèse de la file" aria-busy={isLoading}>
          <dl className="queue-metrics">
            {[
              { label: 'Clients en attente', value: data?.stats.total, icon: Users },
              { label: 'Fiches à payer', value: data?.stats.ficheEnAttente, icon: FileText },
              { label: 'Comptes à activer', value: data?.stats.activationEnAttente, icon: Zap },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="queue-metric">
                <dt><Icon size={16} aria-hidden />{label}</dt>
                <dd>{isLoading ? <span className="skeleton block h-8 w-16 rounded" aria-hidden /> : value?.toLocaleString('fr') ?? '—'}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs leading-relaxed text-text-muted">{siteId ? 'Tous les dossiers du site sélectionné' : 'Tous les dossiers, tous sites confondus'}, avant le filtre d’étape.</p>
        </section>

        {!canCollect && <p className="text-sm leading-relaxed text-text-muted">
          Vous pouvez consulter les dossiers. Les encaissements et l’activation des comptes sont réservés à la caisse.
        </p>}

        <section className="queue-results" aria-labelledby="queue-results-heading" aria-busy={isFetching}>
          <div className="queue-results-heading">
            <div>
              <h2 id="queue-results-heading" className="text-section-title text-primary">Dossiers à traiter</h2>
              <p className="mt-1 text-xs text-text-muted">Du plus ancien au plus récent.</p>
            </div>
            {!isLoading && <span role="status" aria-label="Nombre de dossiers affichés" className="queue-count">
              {queue.length.toLocaleString('fr')} {queue.length === 1 ? 'dossier affiché' : 'dossiers affichés'}
            </span>}
          </div>

          {isLoading ? <div className="queue-loading" role="status" aria-label="Chargement des dossiers">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton h-24 rounded-lg" />)}
          </div> : queue.length === 0 ? (
            <div className="queue-empty" role="status">
              {filteredEmpty ? <ListFilter size={28} aria-hidden /> : <Users size={28} aria-hidden />}
              <h3 className="text-sm font-semibold text-text">{filteredEmpty ? 'Aucun dossier à cette étape' : 'Aucun client en attente'}</h3>
              <p className="text-sm leading-relaxed text-text-muted">
                {filteredEmpty ? 'Les autres dossiers sont toujours disponibles dans la file.' : 'Utilisez « Nouveau client » pour préparer un dossier. Il apparaîtra ici jusqu’à son activation.'}
              </p>
              {filteredEmpty && <button type="button" className="btn-secondary" onClick={() => setFilterEtape('')}>Afficher toutes les étapes</button>}
            </div>
          ) : (
            <div className="queue-table-scroll">
              <table className="queue-table" role="table" aria-label="Clients en cours d’enregistrement">
                <thead role="rowgroup"><tr role="row">
                  <th scope="col" role="columnheader">Client</th>
                  <th scope="col" role="columnheader">Site / Agent</th>
                  <th scope="col" role="columnheader">Étape actuelle</th>
                  <th scope="col" role="columnheader">Progression</th>
                  <th scope="col" role="columnheader">Inscrit le</th>
                  <th scope="col" role="columnheader">Action</th>
                </tr></thead>
                <tbody role="rowgroup">
                  {queue.map(client => <ClientRow key={client.id} client={client} canCollect={canCollect} onAction={route => navigate(route)} />)}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>}
    </div>
  );
}
