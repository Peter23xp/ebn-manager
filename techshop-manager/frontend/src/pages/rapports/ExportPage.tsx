import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, RefreshCw } from 'lucide-react';
import { useExportJob } from '@/hooks/useExportJob';
import { useReportScope } from '@/hooks/useReportScope';
import { reportsApi, type ExportType, type ExportFormat, type ExportJobDto } from '@/lib/reports.api';
import { ReportSiteFilter } from '@/components/reports/ReportSiteFilter';
import { exportFilters, readReportFilters, reportErrorMessage, MAX_EXPORT_ROWS, type ReportFilters } from '@/lib/reportExport.utils';

const EXPORT_TYPES: Array<{ value: ExportType; label: string }> = [
  { value: 'VENTES', label: 'Ventes (synthèse)' },
  { value: 'VENTES_DETAIL', label: 'Ventes détaillées' },
  { value: 'STOCKS', label: 'Stocks multi-sites' },
  { value: 'CLIENTS', label: 'Clients' },
];
const inputClass = 'min-h-11 w-full min-w-0 rounded-lg border border-border bg-white px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary';
const filterLabels: Record<string, string> = {
  modePaiement: 'Mode de paiement', agentId: 'Agent (identifiant)', categorie: 'Catégorie', search: 'Recherche', statut: 'Statut client', sortDir: 'Ordre des ventes',
};
const optionalFilters: Record<ExportType, Array<keyof ReportFilters>> = {
  VENTES: ['search', 'categorie', 'modePaiement', 'agentId', 'sortDir'],
  VENTES_DETAIL: ['search', 'categorie', 'modePaiement', 'agentId', 'sortDir'],
  STOCKS: ['search', 'categorie'],
  CLIENTS: ['search', 'statut'],
};
const filterOptions: Record<string, Array<[string, string]>> = {
  modePaiement: [['', 'Tous les paiements'], ['CASH', 'Cash'], ['MPESA', 'M-Pesa'], ['AIRTEL_MONEY', 'Airtel Money'], ['VIREMENT', 'Virement']],
  sortDir: [['', 'Ordre par défaut'], ['desc', 'Plus récentes d’abord'], ['asc', 'Plus anciennes d’abord']],
  statut: [['', 'Tous les statuts'], ['EN_COURS', 'En cours'], ['ACTIF', 'Actif'], ['SUSPENDU', 'Suspendu'], ['ARCHIVE', 'Archivé']],
};

function ExportContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scope = useReportScope();
  const [type, setType] = useState<ExportType | ''>(() => EXPORT_TYPES.find(item => item.value === searchParams.get('type'))?.value ?? '');
  const [format, setFormat] = useState<ExportFormat>(searchParams.get('format') === 'CSV' ? 'CSV' : 'XLSX');
  const [filters, setFilters] = useState<ReportFilters>(() => readReportFilters(searchParams));
  const job = useExportJob();
  const filtres = type ? exportFilters(type, { ...filters, ...(scope.siteId ? { siteId: scope.siteId } : {}) }) : {};
  const body: ExportJobDto = { type: type || 'VENTES', format, filtres };
  const dateError = filtres.dateDebut && filtres.dateFin && filtres.dateDebut > filtres.dateFin;
  const estimate = useQuery({
    queryKey: ['export-estimate', scope.key, body],
    queryFn: async ({ signal }) => {
      if (!scope.isCurrent()) throw new Error('Session terminée');
      const data = await reportsApi.getExportEstimate(body, signal);
      if (!scope.isCurrent()) throw new Error('Session terminée');
      if (!Number.isSafeInteger(data.estimatedRows) || data.estimatedRows < 0) throw new Error('Estimation invalide. Réessayez.');
      return data;
    },
    enabled: scope.enabled && !!type && !dateError && !job.jobId && !job.isStarting,
    staleTime: 30_000,
    retry: false,
  });
  const rows = estimate.data?.estimatedRows;
  const canSubmit = scope.enabled && !!type && !dateError && !estimate.isFetching && !estimate.error && rows !== undefined && rows > 0 && rows <= MAX_EXPORT_ROWS && !job.isStarting;
  const updateFilter = (key: keyof ReportFilters, value: string) => {
    job.reset();
    setFilters(previous => ({ ...previous, [key]: value }));
  };
  const expired = !!job.status?.expiresAt && Date.parse(job.status.expiresAt) <= Date.now();
  const jobError = job.pollingError || (job.status?.statut === 'ERROR' ? new Error(job.status.errorMsg ?? 'La génération a échoué.') : null);

  return <div className="space-y-5">
    <div className="page-header">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" aria-label="Retour aux rapports" onClick={() => navigate('/reports')} className="btn-ghost min-h-11 min-w-11"><ArrowLeft size={18} /></button>
        <div><h1 className="text-page-title text-primary">Export de rapports</h1><p className="text-sm text-text-muted">Fichiers CSV ou Excel, réservés à votre session.</p></div>
      </div>
    </div>
    <div className="card mx-auto max-w-2xl space-y-5">
      {job.jobId || job.isStarting ? <>
        <div role="status" aria-live="polite">
          <h2 className="font-semibold text-primary">{jobError ? 'Export interrompu' : job.status?.statut === 'READY' ? 'Export prêt' : 'Génération en cours…'}</h2>
          <p className="text-sm text-text-muted">{type} — {format}</p>
          {(job.isStarting || job.isPolling) && <p className="mt-2 text-sm">Préparation du fichier. Le suivi s’arrête après deux minutes.</p>}
        </div>
        {jobError && <p role="alert" className="text-sm text-danger">{reportErrorMessage(jobError, 'Impossible de suivre l’export.')}</p>}
        {job.status?.statut === 'READY' && <div className="space-y-3">
          <p className="break-words font-medium">{job.status.fileName ?? 'Fichier prêt'}</p>
          <p className="text-sm text-text-muted">{job.status.rowCount != null && `${job.status.rowCount.toLocaleString('fr-FR')} lignes`}{job.status.fileSize != null && ` · ${(job.status.fileSize / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`}</p>
          {job.status.expiresAt && <p className="text-sm">Disponible jusqu’au {new Date(job.status.expiresAt).toLocaleString('fr-FR')}</p>}
          {expired && <p role="alert" className="text-sm text-danger">Cet export a expiré. Générez un nouvel export.</p>}
          <button type="button" disabled={expired || job.isDownloading} onClick={() => void job.download()} className="btn-primary flex min-h-11 w-full items-center justify-center gap-2 disabled:opacity-50">
            <Download size={18} />{job.isDownloading ? 'Téléchargement…' : 'Télécharger maintenant'}
          </button>
          {job.downloadError && <p role="alert" className="text-sm text-danger">{job.downloadError}</p>}
        </div>}
        <button type="button" onClick={job.reset} className="btn-secondary flex min-h-11 w-full items-center justify-center gap-2"><RefreshCw size={16} />{job.isStarting || job.isPolling ? 'Annuler le suivi / Réinitialiser' : 'Générer un autre export'}</button>
        {(job.isStarting || job.isPolling) && <p className="text-sm text-text-muted">Arrêter le suivi ne supprime pas le travail déjà envoyé au serveur.</p>}
      </> : <form onSubmit={event => { event.preventDefault(); if (canSubmit && scope.isCurrent()) void job.startJob(body); }} className="space-y-5">
        <h2 className="font-semibold text-primary">Configuration de l’export</h2>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">Type de rapport</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">{EXPORT_TYPES.map(item => <label key={item.value} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name="export-type" value={item.value} checked={type === item.value} onChange={() => { job.reset(); setType(item.value); }} className="h-4 w-4 accent-primary" />{item.label}
          </label>)}</div>
        </fieldset>
        <fieldset><legend className="text-sm font-medium">Format</legend><div className="flex gap-6">{(['XLSX', 'CSV'] as const).map(value => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="radio" name="export-format" value={value} checked={format === value} onChange={() => { job.reset(); setFormat(value); }} className="h-4 w-4 accent-primary" />{value === 'XLSX' ? 'XLSX (Excel)' : 'CSV'}
        </label>)}</div></fieldset>
        <ReportSiteFilter value={filtres.siteId ?? ''} onChange={value => updateFilter('siteId', value)} />
        {type && type !== 'STOCKS' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">Date de début<input type="date" value={filters.dateDebut ?? ''} onChange={event => updateFilter('dateDebut', event.target.value)} className={inputClass} /></label>
          <label className="space-y-1 text-sm">Date de fin<input type="date" value={filters.dateFin ?? ''} onChange={event => updateFilter('dateFin', event.target.value)} className={inputClass} /></label>
        </div>}
        {type === 'STOCKS' && <p className="text-sm text-text-muted">Inventaire actuel, sans filtre de période.</p>}
        {type && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{optionalFilters[type].map(key => <label key={key} className="block min-w-0 space-y-1 text-sm">{filterLabels[key]}
          {filterOptions[key] ? <select value={filters[key] ?? ''} onChange={event => updateFilter(key, event.target.value)} className={inputClass}>
            {filters[key] && !filterOptions[key].some(([value]) => value === filters[key]) && <option value={filters[key]}>{filters[key]}</option>}
            {filterOptions[key].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select> : <input value={filters[key] ?? ''} onChange={event => updateFilter(key, event.target.value)} className={inputClass} />}
        </label>)}</div>}
        {dateError && <p role="alert" className="text-sm text-danger">La date de début doit précéder la date de fin.</p>}
        {type && !dateError && <div aria-live="polite" className="text-sm">
          {estimate.isFetching && <p role="status">Estimation du nombre de lignes…</p>}
          {estimate.error && <div role="alert" className="space-y-2 text-danger"><p>Estimation impossible : {reportErrorMessage(estimate.error, 'Réessayez.')}</p><button type="button" className="btn-secondary min-h-11" onClick={() => { if (scope.isCurrent()) void estimate.refetch(); }}>Réessayer l’estimation</button></div>}
          {!estimate.isFetching && !estimate.error && rows !== undefined && <p>{rows === 0 ? 'Aucune ligne à exporter pour ces filtres.' : rows > MAX_EXPORT_ROWS ? 'L’export dépasse 10 000 lignes. Réduisez la période ou les filtres.' : `${rows.toLocaleString('fr-FR')} lignes estimées`}</p>}
        </div>}
        {job.startError && <div role="alert" className="space-y-2 text-sm text-danger"><p>{reportErrorMessage(job.startError, 'Impossible de créer l’export.')}</p><button type="button" className="btn-secondary min-h-11" onClick={job.reset}>Réinitialiser</button></div>}
        <button type="submit" disabled={!canSubmit} className="btn-primary flex min-h-11 w-full items-center justify-center gap-2 disabled:opacity-50"><Download size={18} />Générer l’export</button>
        <p className="text-sm text-text-muted">Maximum 10 000 lignes. La disponibilité du fichier est limitée dans le temps.</p>
      </form>}
    </div>
  </div>;
}

export default function ExportPage() {
  const scope = useReportScope();
  if (!scope.enabled) return <p role="alert" className="card text-sm text-danger">L’accès aux exports nécessite une session autorisée et un site attribué au gérant.</p>;
  return <ExportContent key={scope.key} />;
}
