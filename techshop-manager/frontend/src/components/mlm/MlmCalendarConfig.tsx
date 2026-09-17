import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { MlmApi } from '@/lib/mlm.api';
import type { CalendarYear } from '@/types/mlm';

export function MlmCalendarConfig() {
  const role = useAuthStore(state => state.user?.role);
  const allowed = role === 'SUPER_ADMIN' || role === 'DIRECTEUR_REGIONAL';
  const query = useQuery({ queryKey: ['mlm-calendar'], queryFn: MlmApi.getCalendar, enabled: allowed });
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  useEffect(() => {
    if (selectedYear === null && query.data) setSelectedYear(query.data[0]?.year ?? new Date().getFullYear());
  }, [selectedYear, query.data]);
  if (!allowed) return null;
  const year = selectedYear ?? query.data?.[0]?.year ?? new Date().getFullYear();
  return <section aria-label="Calendrier MLM" className="rounded-xl border border-border bg-bg-card p-5 space-y-4">
    <h2 className="text-section-title text-primary">Calendrier des jours ouvrables</h2>
    <p className="text-sm text-text-muted">Lundi à samedi, hors dimanches et jours fériés RDC. Une modification ne change pas les échéances déjà capturées. Toute année traversée doit être configurée.</p>
    {query.isError && <div role="alert">Calendrier indisponible. <button className="btn-secondary" onClick={() => query.refetch()}>Réessayer</button></div>}
    {query.isLoading ? <div className="skeleton h-32 rounded-lg" /> : query.data && <>
      <label className="form-label">Année du calendrier<input type="number" min="2000" max="9999" value={year} onChange={event => { if (event.target.value) setSelectedYear(Number(event.target.value)); }} /></label>
      <p className="text-xs text-text-muted">Années disponibles : {query.data?.map(item => item.year).join(', ') || 'Aucune'}</p>
      <CalendarForm key={year} year={year} data={query.data?.find(item => item.year === year)} canEdit={role === 'SUPER_ADMIN'} />
    </>}
  </section>;
}

function calendarValues(data?: CalendarYear) {
  return { holidays: data?.holidays.join('\n') ?? '', version: data?.version ?? '', source: data?.source ?? '' };
}

function CalendarForm({ year, data, canEdit }: { year: number; data?: CalendarYear; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const serverValues = calendarValues(data);
  const [draft, setDraft] = useState<{ values: ReturnType<typeof calendarValues>; baseline: string } | null>(null);
  const { holidays, version, source } = draft?.values ?? serverValues;
  const concurrentChange = draft && draft.baseline !== JSON.stringify(serverValues);
  const changeField = (field: keyof typeof serverValues, value: string) => setDraft(current => {
    const baseline = current?.baseline ?? JSON.stringify(serverValues);
    const values = { ...(current?.values ?? serverValues), [field]: value };
    return JSON.stringify(values) === baseline ? null : { values, baseline };
  });
  const mutation = useMutation({
    mutationFn: () => MlmApi.updateCalendar(year, { holidays: holidays.split(/\r?\n/).map(date => date.trim()).filter(Boolean), version: version.trim(), source: source.trim(), timezone: 'Africa/Lubumbashi' }),
    onSuccess: (accepted: CalendarYear) => {
      queryClient.setQueryData<CalendarYear[]>(['mlm-calendar'], previous => [...(previous ?? []).filter(item => item.year !== year), accepted]);
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['mlm-calendar'] });
    },
  });
  return <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (canEdit && !mutation.isPending) mutation.mutate(); }}>
    <fieldset disabled={!canEdit || mutation.isPending} className="space-y-3">
      <label className="form-label">Jours fériés (une date par ligne)<textarea rows={5} placeholder="AAAA-MM-JJ" value={holidays} onChange={event => changeField('holidays', event.target.value)} /></label>
      <label className="form-label">Version du calendrier<input required value={version} onChange={event => changeField('version', event.target.value)} /></label>
      <label className="form-label">Source officielle<input required value={source} onChange={event => changeField('source', event.target.value)} /></label>
      <p className="text-sm text-text">Fuseau : Africa/Lubumbashi</p>
      {canEdit && <button className="btn-primary" type="submit" disabled={!version.trim() || !source.trim()}>{mutation.isPending ? 'Enregistrement…' : 'Enregistrer le calendrier'}</button>}
      {canEdit && draft && <button className="btn-secondary" type="button" onClick={() => setDraft(null)}>Recharger la version serveur</button>}
    </fieldset>
    {concurrentChange && <p role="alert" className="text-sm text-warning">Le calendrier a changé sur le serveur. Votre brouillon est conservé ; rechargez la version serveur ou vérifiez vos modifications avant d’enregistrer.</p>}
    {!canEdit && <p className="text-sm text-text-muted">Lecture seule — modification réservée au super-administrateur.</p>}
    {mutation.isError && <p role="alert" className="text-sm text-danger">{(mutation.error as any)?.response?.data?.message ?? 'Enregistrement impossible. Vérifiez les dates et réessayez.'}</p>}
  </form>;
}
