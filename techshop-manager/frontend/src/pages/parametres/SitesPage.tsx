import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Plus, Pencil, CheckCircle, AlertCircle, RefreshCw, X, Power, PowerOff } from 'lucide-react';
import { sitesApi, usersApi, type SiteWithCounts } from '@/lib/settings.api';
import { cn, formatDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/api';
import { SettingsPageLayout, SettingsSummary } from '@/components/settings/SettingsPageLayout';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import './settings-directory.css';

const siteSchema = z.object({
  nom: z.string().min(2, 'Nom trop court'),
  ville: z.string().min(2, 'Ville requise'),
  adresse: z.string().optional(),
  gerantId: z.string().optional(),
});
type SiteForm = z.infer<typeof siteSchema>;

function SiteDialog({ mode, site, onClose, onSaved }: {
  mode: 'create' | 'edit'; site?: SiteWithCounts; onClose: () => void; onSaved: (name: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: gerants, isError: gerantsError } = useQuery({
    queryKey: ['users', 'GERANT'],
    queryFn: () => usersApi.getAll({ role: 'GERANT', actif: 'true' }),
  });
  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<SiteForm>({
    resolver: zodResolver(siteSchema),
    defaultValues: site ? { nom: site.nom, ville: site.ville, adresse: site.adresse ?? '', gerantId: '' } : {},
  });
  const mutation = useMutation({
    mutationFn: (data: SiteForm) => {
      const payload = { ...data, gerantId: data.gerantId || undefined };
      return mode === 'create' ? sitesApi.create(payload) : sitesApi.update(site!.id, payload);
    },
    onSuccess: (saved) => { queryClient.invalidateQueries({ queryKey: ['sites'] }); onSaved(saved.nom); onClose(); },
  });
  const title = mode === 'create' ? 'Nouveau site' : `Modifier — ${site?.nom}`;
  return (
    <SettingsDialog title={title} onClose={onClose} busy={mutation.isPending}>
      <header>
        <h2>{title}</h2>
        <button type="button" className="btn-ghost !px-2" onClick={onClose} disabled={mutation.isPending} aria-label="Fermer"><X size={18} /></button>
      </header>
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
        <p className="settings-description">Renseignez le point de vente. Son équipe pourra ensuite y être rattachée.</p>
        <div className="form-group">
          <label className="form-label" htmlFor="sd-nom">Nom du site</label>
          <input id="sd-nom" {...register('nom')} placeholder="Goma Principal" aria-invalid={!!errors.nom} aria-describedby={errors.nom ? 'sd-nom-error' : undefined} autoFocus />
          {errors.nom && <p id="sd-nom-error" className="form-error">{errors.nom.message}</p>}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="sd-ville">Ville</label>
          <input id="sd-ville" {...register('ville')} placeholder="Goma" aria-invalid={!!errors.ville} aria-describedby={errors.ville ? 'sd-ville-error' : undefined} />
          {errors.ville && <p id="sd-ville-error" className="form-error">{errors.ville.message}</p>}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="sd-adresse">Adresse complète (optionnel)</label>
          <input id="sd-adresse" {...register('adresse')} placeholder="Av. du Commerce, 12 — Goma" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="sd-gerant">Gérant (optionnel)</label>
          <select id="sd-gerant" {...register('gerantId')}>
            <option value="">{mode === 'edit' ? 'Ne pas modifier l’affectation' : '— Aucun —'}</option>
            {(gerants?.data ?? []).map((gerant) => <option key={gerant.id} value={gerant.id}>{gerant.nom}</option>)}
          </select>
          {gerantsError && <p className="settings-description" role="status">La liste des gérants est indisponible. Vous pouvez enregistrer les autres informations.</p>}
        </div>
        {mutation.isError && <p className="settings-notice" role="alert">{getErrorMessage(mutation.error)}</p>}
        <div className="settings-form-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={mutation.isPending}>Annuler</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending || (mode === 'edit' && !isDirty)} aria-label={mode === 'create' ? 'Créer le site' : 'Enregistrer'}>
            {mutation.isPending ? 'Enregistrement…' : mode === 'create' ? 'Créer le site' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </SettingsDialog>
  );
}

export default function SitesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit'; site?: SiteWithCounts } | null>(null);
  const [confirm, setConfirm] = useState<SiteWithCounts | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.getAll(),
  });
  const toggleMut = useMutation({
    mutationFn: (site: SiteWithCounts) => sitesApi.update(site.id, { actif: !site.actif }),
    onSuccess: (site) => { queryClient.invalidateQueries({ queryKey: ['sites'] }); showToast(`${site.nom} ${site.actif ? 'activé' : 'désactivé'}`); setConfirm(null); },
    onError: (error) => { showToast(getErrorMessage(error), false); setConfirm(null); },
  });
  const sites = isError ? [] : data?.data ?? [];
  const ready = !!data && !isError;
  const hasCounts = ready && sites.every((site) => !!site._count);
  const filtered = sites.filter((site) => (
    (!status || String(site.actif) === status) &&
    [site.nom, site.ville, site.adresse ?? ''].some((value) => value.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr')))
  ));
  const resetFilters = () => { setSearch(''); setStatus(''); };
  return (
    <SettingsPageLayout active="sites" title="Gestion des sites" description="Retrouvez vos points de vente, leurs équipes et leur état d’activité."
      action={<><button type="button" className="btn-secondary" onClick={() => refetch()} disabled={isFetching}><RefreshCw size={16} className={cn(isFetching && 'animate-spin')} aria-hidden="true" />Actualiser</button><button className="btn-primary" onClick={() => setDialog({ mode: 'create' })} aria-label="Créer un nouveau site"><Plus size={16} aria-hidden="true" />Nouveau site</button></>}>
      <SettingsSummary label="Synthèse des sites" loading={isLoading} items={[
        { label: 'Sites enregistrés', value: ready ? sites.length : undefined },
        { label: 'Sites actifs', value: ready ? sites.filter((site) => site.actif).length : undefined },
        { label: 'Utilisateurs rattachés', value: hasCounts ? sites.reduce((total, site) => total + site._count!.utilisateurs, 0) : undefined },
        { label: 'Clients rattachés', value: hasCounts ? sites.reduce((total, site) => total + site._count!.clients, 0) : undefined },
      ]} note="Ensemble des sites, indépendamment des filtres ci-dessous." />
      <section className="settings-panel settings-toolbar" aria-label="Filtres des sites">
        <div className="settings-search"><label htmlFor="sites-search">Rechercher un site</label><input type="search" id="sites-search" placeholder="Nom, ville ou adresse…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="settings-filter"><label htmlFor="sites-status">Statut des sites</label><select id="sites-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tous les statuts</option><option value="true">Actifs</option><option value="false">Inactifs</option></select></div>
        {(search || status) && <button className="btn-secondary" onClick={resetFilters}>Effacer</button>}
      </section>
      <section className="settings-directory" aria-labelledby="sites-list-title">
        <div className="settings-directory-heading"><h2 id="sites-list-title" className="settings-section-title">Points de vente</h2>{ready && <p className="settings-description" role="status">{filtered.length} sur {sites.length} site{sites.length > 1 ? 's' : ''}</p>}</div>
        {isLoading ? <div className="settings-panel space-y-4" role="status" aria-label="Chargement des sites">{[0, 1, 2].map((index) => <div key={index} className="skeleton h-20 w-full" />)}</div>
          : isError ? <div className="settings-panel settings-empty" role="alert"><AlertCircle size={28} /><p>Impossible de charger les sites.</p><button className="btn-secondary" onClick={() => refetch()}>Réessayer</button></div>
          : !filtered.length ? <div className="settings-panel settings-empty" role="status"><Building2 size={28} /><h3 className="settings-section-title">{sites.length ? 'Aucun site ne correspond aux filtres' : 'Aucun site configuré'}</h3><p className="settings-description">{sites.length ? 'Essayez une autre recherche ou affichez tous les statuts.' : 'Créez votre premier point de vente pour y rattacher une équipe.'}</p>{sites.length ? <button className="btn-secondary" onClick={resetFilters}>Réinitialiser les filtres</button> : <button className="btn-primary" onClick={() => setDialog({ mode: 'create' })}>Créer le premier site</button>}</div>
          : <ul className="settings-site-list">{filtered.map((site) => (
            <li className="settings-site-row" key={site.id} data-testid={`site-card-${site.id}`}>
              <div className="settings-site-identity"><h3>{site.nom}</h3><p>{site.ville}</p><p className="settings-description">{site.adresse || 'Adresse non renseignée'}</p></div>
              <div className="settings-site-status"><span className={site.actif ? 'badge-success' : 'badge-gray'}>{site.actif ? <CheckCircle size={13} aria-hidden="true" /> : <PowerOff size={13} aria-hidden="true" />}{site.actif ? 'Actif' : 'Inactif'}</span><p className="settings-description mt-2">Créé le {formatDate(site.createdAt)}</p></div>
              <dl className="settings-site-counts"><div><dt>Utilisateurs</dt><dd>{site._count?.utilisateurs.toLocaleString('fr-CD') ?? 'Non disponible'}</dd></div><div><dt>Clients</dt><dd>{site._count?.clients.toLocaleString('fr-CD') ?? 'Non disponible'}</dd></div></dl>
              <div className="settings-site-actions"><button className="btn-secondary" onClick={() => setDialog({ mode: 'edit', site })} aria-label={`Modifier ${site.nom}`}><Pencil size={14} aria-hidden="true" />Modifier</button><button className={cn('btn-secondary', site.actif ? '!text-red-700' : '!text-green-700')} onClick={() => setConfirm(site)} aria-label={`${site.actif ? 'Désactiver' : 'Activer'} ${site.nom}`}>{site.actif ? <PowerOff size={14} aria-hidden="true" /> : <Power size={14} aria-hidden="true" />}{site.actif ? 'Désactiver' : 'Activer'}</button></div>
            </li>
          ))}</ul>}
      </section>
      {dialog && <SiteDialog mode={dialog.mode} site={dialog.site} onClose={() => setDialog(null)} onSaved={(name) => showToast(dialog.mode === 'create' ? `Site "${name}" créé` : `Site "${name}" mis à jour`)} />}
      {confirm && <SettingsDialog title={`${confirm.actif ? 'Désactiver' : 'Activer'} ${confirm.nom} ?`} onClose={() => setConfirm(null)} busy={toggleMut.isPending}>
        <header><h2>{confirm.actif ? 'Désactiver' : 'Activer'} {confirm.nom} ?</h2></header>
        <div className="settings-confirm-content space-y-4"><p>{confirm.actif ? 'Les agents de ce site ne pourront plus accéder à l’application.' : 'Ce site sera à nouveau accessible pour ses agents.'}</p><div className="settings-form-actions"><button className="btn-secondary" onClick={() => setConfirm(null)} disabled={toggleMut.isPending}>Annuler</button><button className={confirm.actif ? 'btn-danger' : 'btn-primary'} onClick={() => toggleMut.mutate(confirm)} disabled={toggleMut.isPending}>{toggleMut.isPending ? 'Enregistrement…' : confirm.actif ? 'Désactiver' : 'Activer'}</button></div></div>
      </SettingsDialog>}
      {toast && createPortal(<div role="alert" className={cn('settings-toast', toast.ok ? 'bg-success' : 'bg-danger')}><span>{toast.msg}</span><button onClick={() => setToast(null)} aria-label="Fermer la notification"><X size={18} /></button></div>, document.body)}
    </SettingsPageLayout>
  );
}
