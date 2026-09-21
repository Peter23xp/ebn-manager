import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { reportsApi, type ExportJobDto } from '@/lib/reports.api';
import { downloadErrorMessage, saveExportBlob } from '@/lib/reportExport.utils';
import { useReportScope } from './useReportScope';

interface JobState {
  scopeKey: string;
  jobId: string | null;
  isStarting: boolean;
  startError: Error | null;
  isDownloading: boolean;
  downloadError: string | null;
  timedOut: boolean;
}

function emptyState(scopeKey: string): JobState {
  return { scopeKey, jobId: null, isStarting: false, startError: null, isDownloading: false, downloadError: null, timedOut: false };
}

export function useExportJob() {
  const scope = useReportScope();
  const queryClient = useQueryClient();
  const [state, setState] = useState(() => emptyState(scope.key));
  const operation = useRef({ controller: new AbortController() });
  const current = state.scopeKey === scope.key && scope.enabled ? state : emptyState(scope.key);
  const { jobId } = current;

  const invalidateOperation = () => {
    operation.current.controller.abort();
    operation.current = { controller: new AbortController() };
  };

  useEffect(() => {
    setState(emptyState(scope.key));
    return () => {
      invalidateOperation();
      void queryClient.cancelQueries({ queryKey: ['export-job', scope.key] });
      queryClient.removeQueries({ queryKey: ['export-job', scope.key] });
    };
  }, [scope.key, queryClient]);

  const pollingQuery = useQuery({
    queryKey: ['export-job', scope.key, jobId],
    queryFn: async ({ signal }) => {
      if (!scope.isCurrent() || !jobId) throw new Error('Session terminée');
      const data = await reportsApi.getExportJobStatus(jobId, signal);
      if (!scope.isCurrent()) throw new Error('Session terminée');
      if (!['PENDING', 'READY', 'ERROR'].includes(data.statut)) throw new Error('Statut de suivi inconnu. Générez un nouvel export.');
      return data;
    },
    enabled: scope.enabled && !!jobId && !current.timedOut,
    refetchInterval: query => !query.state.error && query.state.data?.statut === 'PENDING' ? 2000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    gcTime: 0,
  });
  const status = jobId ? pollingQuery.data ?? null : null;
  const pending = !!jobId && (!status || status.statut === 'PENDING') && !pollingQuery.error && !current.timedOut;

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setState(previous => previous.scopeKey === scope.key ? { ...previous, timedOut: true } : previous);
      void queryClient.cancelQueries({ queryKey: ['export-job', scope.key, jobId] });
    }, 120_000);
    return () => clearTimeout(timer);
  }, [pending, scope.key, jobId, queryClient]);

  const reset = () => {
    invalidateOperation();
    void queryClient.cancelQueries({ queryKey: ['export-job', scope.key] });
    queryClient.removeQueries({ queryKey: ['export-job', scope.key] });
    setState(emptyState(scope.key));
  };

  const startJob = async (body: ExportJobDto) => {
    if (!scope.isCurrent() || current.isStarting || jobId) return;
    invalidateOperation();
    const active = operation.current;
    setState({ ...emptyState(scope.key), isStarting: true });
    try {
      const data = await reportsApi.createExportJob({ ...body, filtres: { ...body.filtres, ...(scope.siteId ? { siteId: scope.siteId } : {}) } }, active.controller.signal);
      if (!scope.isCurrent() || active !== operation.current) return;
      if (!data.jobId) throw new Error('Le serveur n’a pas renvoyé de référence d’export.');
      setState({ ...emptyState(scope.key), jobId: data.jobId });
    } catch (error) {
      if (scope.isCurrent() && active === operation.current) {
        setState({ ...emptyState(scope.key), startError: error instanceof Error ? error : new Error('Impossible de créer l’export.') });
      }
    }
  };

  const download = async () => {
    if (!scope.isCurrent() || status?.statut !== 'READY' || !jobId || current.isDownloading) return;
    const active = operation.current;
    setState(previous => ({ ...previous, isDownloading: true, downloadError: null }));
    try {
      if (status.expiresAt && Date.parse(status.expiresAt) <= Date.now()) throw new Error('Cet export a expiré. Générez un nouvel export.');
      const blob = await reportsApi.downloadExportJob(jobId, active.controller.signal);
      if (!scope.isCurrent() || active !== operation.current) return;
      saveExportBlob(blob, status.fileName ?? `export.${status.format.toLowerCase()}`);
    } catch (error) {
      const message = await downloadErrorMessage(error);
      if (scope.isCurrent() && active === operation.current) setState(previous => ({ ...previous, downloadError: message }));
    } finally {
      if (scope.isCurrent() && active === operation.current) setState(previous => ({ ...previous, isDownloading: false }));
    }
  };

  return { ...current, startJob, status, isPolling: pending, reset, download,
    pollingError: current.timedOut ? new Error('Le suivi a dépassé deux minutes. Générez un nouvel export ou réessayez plus tard.') : jobId ? pollingQuery.error : null };
}
