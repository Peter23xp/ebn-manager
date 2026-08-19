import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, UserPlus, Upload, Users, RefreshCw, AlertCircle, ChevronDown, X } from 'lucide-react';
import { cn, formatDate, initials } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useClients } from '@/hooks/useClients';
import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import type { StatutClient } from '@/types';

// ── Avatar initiales ──────────────────────────────────────────────

function ClientAvatar({ nom, prenom }: { nom: string; prenom: string }) {
  return (
    <span
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold bg-primary-light text-primary-accent select-none"
      aria-hidden
    >
      {initials(nom, prenom)}
    </span>
  );
}

// ── Skeleton de chargement ────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-px" role="status" aria-label="Chargement des clients">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg">
          <div className="skeleton h-9 w-9 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3.5 w-36 rounded-full" />
            <div className="skeleton h-3 w-24 rounded-full" />
          </div>
          <div className="skeleton h-5 w-16 rounded-full hidden sm:block" />
          <div className="skeleton h-5 w-14 rounded-full hidden sm:block" />
        </div>
      ))}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────

export default function ClientsListPage() {
  const navigate = useNavigate();
  const { hasRole, user } = useAuthStore();

  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState<StatutClient | ''>('');

  const [page, setPage]     = useState(1);

  const isAgent     = user?.role === 'AGENT';
  const isFormateur = user?.role === 'FORMATEUR';
  const canCreate   = !isFormateur;
  const canImport   = hasRole('GERANT');

  // Les AGENT/FORMATEUR/GERANT sont forcés sur leur site côté serveur.
  // On n'a pas besoin d'un filtre "Site" côté client pour eux.
  const showSiteFilter = hasRole('DIRECTEUR_REGIONAL');

  const { clients, meta, isLoading, isFetching, isError, refetch } = useClients({
    search,
    statut,

    page,
    limit: 25,
  });

  const hasActiveFilters = !!(search || statut);

  const resetFilters = () => {
    setSearch('');
    setStatut('');

    setPage(1);
  };

  return (
    <div className="space-y-5 animate-fade-up">

      {/* ── En-tête ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-light" aria-hidden>
            <Users size={20} className="text-primary-accent" />
          </div>
          <div>
            <h1 className="text-page-title text-primary">Clients</h1>
            <p className="text-xs text-text-muted">
              {meta ? `${meta.total.toLocaleString('fr')} client${meta.total !== 1 ? 's' : ''}` : '—'}
              {isFetching && !isLoading && (
                <span className="ml-2 inline-flex items-center gap-1 text-primary-accent">
                  <RefreshCw size={10} className="animate-spin" aria-hidden />
                  Actualisation…
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canImport && (
            <Link
              to="/clients/import"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[13px] font-medium text-text-muted hover:border-border-strong hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent"
            >
              <Upload size={14} aria-hidden />
              Import CSV
            </Link>
          )}
          {canCreate && (
            <Link
              to="/clients/new/recit"
              className="btn-primary flex items-center gap-1.5 text-[13px]"
            >
              <UserPlus size={15} aria-hidden />
              Nouveau client
            </Link>
          )}
        </div>
      </div>

      {/* ── Filtres + tableau ───────────────────────────────────── */}
      <div className="rounded-xl shadow-card border border-border bg-white">

        {/* Barre de filtres */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 px-4 py-3 border-b border-border">

          {/* Recherche — prend toute la largeur disponible */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none" aria-hidden />
            <input
              type="search"
              placeholder="Nom, téléphone, matricule…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] bg-white text-text placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-primary-accent/30 focus:border-primary-accent transition duration-150"
              aria-label="Rechercher un client"
            />
          </div>

          {/* Filtres — groupe compact à droite */}
          <div className="flex items-center gap-2 flex-shrink-0">

            {/* Filtre statut */}
            <div className="relative">
              <select
                value={statut}
                onChange={(e) => { setStatut(e.target.value as StatutClient | ''); setPage(1); }}
                className={cn(
                  'appearance-none pl-3 pr-7 py-2 border rounded-lg text-[12px] font-medium bg-white cursor-pointer',
                  'focus:outline-none focus:ring-2 focus:ring-primary-accent/30 focus:border-primary-accent transition duration-150',
                  statut
                    ? 'border-primary-accent text-primary-accent bg-primary-light/30'
                    : 'border-border text-text-muted hover:border-border-strong hover:text-text',
                )}
                aria-label="Filtrer par statut"
              >
                <option value="">Statut</option>
                <option value="ACTIF">Actif</option>
                <option value="EN_COURS">En cours</option>
                <option value="SUSPENDU">Suspendu</option>
                {!isAgent && <option value="ARCHIVE">Archivé</option>}
              </select>
              <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle" aria-hidden />
            </div>



            {/* Réinitialiser — séparé visuellement, style lien */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="flex items-center gap-1 px-2 py-2 rounded-lg text-[12px] font-semibold text-text-muted hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent"
                aria-label="Réinitialiser les filtres"
              >
                <X size={13} aria-hidden />
                <span className="hidden sm:inline">Effacer</span>
              </button>
            )}
          </div>
        </div>

        {/* Corps du tableau */}
        <div className={cn('overflow-x-auto transition-opacity duration-150', isFetching && !isLoading && 'opacity-70')}>
          {isLoading ? (
            <div className="p-2">
              <TableSkeleton />
            </div>
          ) : isError ? (
            <div
              className="flex flex-col items-center justify-center gap-3 py-16 px-5"
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle size={32} className="text-danger opacity-60" aria-hidden />
              <p className="text-[13px] font-medium text-text">
                Impossible de charger la liste des clients.
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="btn-secondary text-[13px] flex items-center gap-1.5"
              >
                <RefreshCw size={13} aria-hidden />
                Réessayer
              </button>
            </div>
          ) : clients.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 text-text-muted"
              role="status"
              aria-live="polite"
            >
              <Users size={36} className="mb-3 opacity-20" aria-hidden />
              <p className="text-[13px] font-semibold text-text">
                {hasActiveFilters ? 'Aucun résultat pour ces critères' : 'Aucun client enregistré'}
              </p>
              <p className="text-[12px] text-text-muted mt-1">
                {hasActiveFilters
                  ? 'Modifiez ou réinitialisez les filtres.'
                  : 'Créez le premier client pour commencer.'}
              </p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-3 text-[13px] font-semibold text-primary-accent hover:text-blue-700 transition-colors"
                >
                  Réinitialiser les filtres
                </button>
              ) : canCreate ? (
                <Link
                  to="/clients/new/recit"
                  className="mt-3 text-[13px] font-semibold text-primary-accent hover:text-blue-700 transition-colors"
                >
                  Nouveau client →
                </Link>
              ) : null}
            </div>
          ) : (
            <table className="w-full text-sm" aria-label="Liste des clients">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">Client</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Téléphone</th>
                  {showSiteFilter && (
                    <th className="px-4 py-3 text-left hidden md:table-cell">Site</th>
                  )}
                  <th className="px-4 py-3 text-left">Statut</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Inscription</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client, i) => (
                  <tr
                    key={client.id}
                    onClick={() => navigate(`/clients/${client.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/clients/${client.id}`);
                      }
                    }}
                    className={cn(
                      'cursor-pointer transition-colors duration-100 border-b border-border/60 last:border-b-0',
                      'hover:bg-blue-50/60',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-accent',
                    )}
                    style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}
                  >
                    {/* Client — Nom + code */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ClientAvatar nom={client.nom} prenom={client.prenom} />
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-text truncate">
                            {client.prenom} {client.nom}
                          </p>
                          {(client.matricule || client.codeParrain) && (
                            <p className="text-[11px] text-text-muted font-mono font-medium">{client.matricule || client.codeParrain}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Téléphone */}
                    <td className="px-4 py-3 text-[12px] text-text-muted font-mono hidden sm:table-cell">
                      {client.telephone}
                    </td>

                    {/* Site — visible uniquement pour les rôles hauts */}
                    {showSiteFilter && (
                      <td className="px-4 py-3 text-[13px] text-text-muted hidden md:table-cell">
                        {client.site?.nom ?? '—'}
                      </td>
                    )}

                    {/* Statut */}
                    <td className="px-4 py-3">
                      <ClientStatusBadge statut={client.statut} />
                    </td>

                    {/* Date inscription */}
                    <td className="px-4 py-3 text-[12px] text-text-muted hidden lg:table-cell">
                      {formatDate(client.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="px-4 border-t border-border">
            <Pagination
              page={page}
              totalPages={meta.totalPages}
              total={meta.total}
              onPageChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              isLoading={isFetching}
            />
          </div>
        )}
      </div>
    </div>
  );
}
