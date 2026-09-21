import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw, FileSpreadsheet, ShieldCheck, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { useExportJob } from '@/hooks/useExportJob';
import { useReportScope } from '@/hooks/useReportScope';
import { reportsApi, type ExportType, type ExportFormat, type ExportJobDto } from '@/lib/reports.api';
import { ReportSiteFilter } from '@/components/reports/ReportSiteFilter';
import { ReportPageLayout } from '@/components/reports/ReportPageLayout';
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

  return <ReportPageLayout active="export" title="Export de rapports" description="Préparez un fichier CSV ou Excel à partir des données autorisées de votre réseau.">
    <div className="report-export-grid">
    <div className="card min-w-0 space-y-5">
      {job.jobId || job.isStarting ? <>
        <div role="status" aria-live="polite" className="space-y-2">
          <div className="flex items-center gap-2">
            {jobError || expired ? <AlertCircle size={20} className="shrink-0 text-danger" aria-hidden="true" /> : job.status?.statut === 'READY' ? <CheckCircle2 size={20} className="shrink-0 text-success" aria-hidden="true" /> : <RefreshCw size={20} className="shrink-0 text-primary-accent motion-safe:animate-spin" aria-hidden="true" />}
            <h2>{jobError ? 'Export interrompu' : expired ? 'Export expiré' : job.status?.statut === 'READY' ? 'Export prêt' : 'Génération en cours…'}</h2>
          </div>
          <p className="text-sm text-text-muted">{EXPORT_TYPES.find(item => item.value === type)?.label ?? 'Rapport'} — {format}</p>
          {(job.isStarting || job.isPolling) && <p className="mt-2 text-sm">Préparation du fichier. Le suivi s’arrête après deux minutes.</p>}
        </div>
        {jobError && <p role="alert" className="text-sm text-danger">{reportErrorMessage(jobError, 'Impossible de suivre l’export.')}</p>}
        {job.status?.statut === 'READY' && <div className="space-y-4 border-t border-border pt-5">
          <p className="break-words text-base font-semibold text-primary">{job.status.fileName ?? 'Fichier prêt'}</p>
          <p className="text-sm text-text-muted">{job.status.rowCount != null && `${job.status.rowCount.toLocaleString('fr-FR')} lignes`}{job.status.fileSize != null && ` · ${(job.status.fileSize / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`}</p>
          {job.status.expiresAt && <p className="text-sm">Disponible jusqu’au {new Date(job.status.expiresAt).toLocaleString('fr-FR')}</p>}
          {expired && <p role="alert" className="text-sm text-danger">Cet export a expiré. Générez un nouvel export.</p>}
          <button type="button" disabled={expired || job.isDownloading} onClick={() => void job.download()} className="btn-primary flex min-h-11 w-full items-center justify-center gap-2 disabled:opacity-50 sm:w-auto">
            <Download size={18} />{job.isDownloading ? 'Téléchargement…' : 'Télécharger maintenant'}
          </button>
          {job.downloadError && <p role="alert" className="text-sm text-danger">{job.downloadError}</p>}
        </div>}
        <button type="button" onClick={job.reset} className="btn-secondary flex min-h-11 w-full items-center justify-center gap-2 sm:w-auto"><RefreshCw size={16} />{job.isStarting || job.isPolling ? 'Annuler le suivi / Réinitialiser' : 'Générer un autre export'}</button>
        {(job.isStarting || job.isPolling) && <p className="text-sm text-text-muted">Arrêter le suivi ne supprime pas le travail déjà envoyé au serveur.</p>}
      </> : <form onSubmit={event => { event.preventDefault(); if (canSubmit && scope.isCurrent()) void job.startJob(body); }} className="space-y-5">
        <div className="report-panel-heading">
          <h2>Configuration de l’export</h2>
          <p>Choisissez les données à récupérer, puis précisez leur périmètre.</p>
        </div>
        <fieldset className="space-y-3"><legend className="text-sm font-semibold text-primary">Type de rapport</legend>
          <div className="grid gap-2 sm:grid-cols-2">{EXPORT_TYPES.map(item => <label key={item.value} className="report-export-choice">
            <input type="radio" name="export-type" value={item.value} checked={type === item.value} onChange={() => { job.reset(); setType(item.value); }} />{item.label}
          </label>)}</div>
        </fieldset>
        <fieldset className="report-export-section"><legend>Format du fichier</legend><div className="grid grid-cols-2 gap-2">{(['XLSX', 'CSV'] as const).map(value => <label key={value} className="report-export-choice">
          <input type="radio" name="export-format" value={value} checked={format === value} onChange={() => { job.reset(); setFormat(value); }} />{value === 'XLSX' ? 'XLSX (Excel)' : 'CSV'}
        </label>)}</div></fieldset>
        <fieldset className="report-export-section space-y-3"><legend>Périmètre des données</legend>
        <ReportSiteFilter value={filtres.siteId ?? ''} onChange={value => updateFilter('siteId', value)} />
        {type && type !== 'STOCKS' && <div className="report-fields !grid-cols-1 sm:!grid-cols-2">
          <label className="space-y-1 text-sm">Date de début<input type="date" value={filters.dateDebut ?? ''} onChange={event => updateFilter('dateDebut', event.target.value)} className={inputClass} /></label>
          <label className="space-y-1 text-sm">Date de fin<input type="date" value={filters.dateFin ?? ''} onChange={event => updateFilter('dateFin', event.target.value)} className={inputClass} /></label>
        </div>}
        {type === 'STOCKS' && <p className="text-sm text-text-muted">Inventaire actuel, sans filtre de période.</p>}
        {type && <div className="report-fields !grid-cols-1 sm:!grid-cols-2">{optionalFilters[type].map(key => <label key={key} className="block min-w-0 space-y-1 text-sm">{filterLabels[key]}
          {filterOptions[key] ? <select value={filters[key] ?? ''} onChange={event => updateFilter(key, event.target.value)} className={inputClass}>
            {filters[key] && !filterOptions[key].some(([value]) => value === filters[key]) && <option value={filters[key]}>{filters[key]}</option>}
            {filterOptions[key].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select> : <input value={filters[key] ?? ''} onChange={event => updateFilter(key, event.target.value)} className={inputClass} />}
        </label>)}</div>}
        </fieldset>
        {dateError && <p role="alert" className="text-sm text-danger">La date de début doit précéder la date de fin.</p>}
        {type && !dateError && <div aria-live="polite" className="border-t border-border pt-4 text-sm">
          {estimate.isFetching && <p role="status">Estimation du nombre de lignes…</p>}
          {estimate.error && <div role="alert" className="space-y-2 text-danger"><p>Estimation impossible : {reportErrorMessage(estimate.error, 'Réessayez.')}</p><button type="button" className="btn-secondary min-h-11" onClick={() => { if (scope.isCurrent()) void estimate.refetch(); }}>Réessayer l’estimation</button></div>}
          {!estimate.isFetching && !estimate.error && rows !== undefined && <p>{rows === 0 ? 'Aucune ligne à exporter pour ces filtres.' : rows > MAX_EXPORT_ROWS ? 'L’export dépasse 10 000 lignes. Réduisez la période ou les filtres.' : `${rows.toLocaleString('fr-FR')} lignes estimées`}</p>}
        </div>}
        {job.startError && <div role="alert" className="space-y-2 text-sm text-danger"><p>{reportErrorMessage(job.startError, 'Impossible de créer l’export.')}</p><button type="button" className="btn-secondary min-h-11" onClick={job.reset}>Réinitialiser</button></div>}
        <button type="submit" disabled={!canSubmit} className="btn-primary flex min-h-11 w-full items-center justify-center gap-2 disabled:opacity-50 sm:w-auto"><Download size={18} aria-hidden="true" />Générer l’export</button>
      </form>}
    </div>
    <aside className="min-w-0 px-1" aria-label="Informations sur les exports">
      <h2 className="text-section-title">Un fichier adapté à vos besoins</h2>
      <div className="report-export-note">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-primary"><FileSpreadsheet size={16} aria-hidden="true" />Excel ou CSV</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">Excel pour consulter et analyser vos tableaux. CSV pour réutiliser les données dans un autre outil.</p>
      </div>
      <div className="report-export-note">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck size={16} aria-hidden="true" />Accès protégé</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">L’export respecte vos droits et les sites autorisés. Le téléchargement nécessite votre session.</p>
      </div>
      <div className="report-export-note">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-primary"><Clock size={16} aria-hidden="true" />Disponibilité limitée</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">Téléchargez le fichier avant la date d’expiration affichée. Au-delà, générez un nouvel export.</p>
      </div>
      <p className="pt-4 text-xs leading-relaxed text-text-muted">Maximum 10 000 lignes par fichier. Affinez les filtres pour limiter le volume de données.</p>
    </aside>
    </div>
  </ReportPageLayout>;
}

export default function ExportPage() {
  const scope = useReportScope();
  if (!scope.enabled) return <p role="alert" className="card text-sm text-danger">L’accès aux exports nécessite une session autorisée et un site attribué au gérant.</p>;
  return <ExportContent key={scope.key} />;
}
