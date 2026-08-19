import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, Download, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatUSD, formatDateTime, cn } from '@/lib/utils';

interface Ecriture {
  compte: string;
  libelle: string;
  intitule: string;
  debit: number;
  credit: number;
}

interface EcrituresOhada {
  numeroAvoir: string;
  dateEcriture: string;
  journalCode: string;
  journalLabel: string;
  vente: { numeroVente: string };
  site: { id: string; nom: string };
  ecritures: Ecriture[];
  totaux: {
    totalDebit: number;
    totalCredit: number;
    montantHT: number;
    montantTVA: number;
    montantTTC: number;
  };
}

export default function EcrituresOhadaPage() {
  const { retourId } = useParams<{ retourId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<EcrituresOhada>({
    queryKey: ['ecritures-ohada', retourId],
    queryFn: () => api.get(`/ventes/retours/${retourId}/ecritures-ohada`).then((r) => r.data),
    enabled: !!retourId,
  });

  const handleExportCsv = () => {
    if (!data) return;
    const today = new Date().toISOString().slice(0, 10);
    const rows = [
      ['Date', 'Journal', 'Compte', 'Libellé compte', 'Intitulé opération', 'Débit $', 'Crédit $'],
      ...data.ecritures.map((e) => [
        new Date(data.dateEcriture).toLocaleDateString('fr-FR'),
        `${data.journalCode} - ${data.journalLabel}`,
        e.compte,
        e.libelle,
        e.intitule,
        e.debit > 0 ? e.debit.toString() : '0',
        e.credit > 0 ? e.credit.toString() : '0',
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecritures-ohada-${data.numeroAvoir}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6 animate-pulse space-y-4">
        <div className="h-8 w-40 bg-slate-200 rounded" />
        <div className="h-64 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle size={40} className="text-danger opacity-60" />
        <p className="text-text font-semibold">Écritures introuvables.</p>
        <button onClick={() => navigate(-1)} className="btn-secondary">← Retour</button>
      </div>
    );
  }

  const balanced = data.totaux.totalDebit === data.totaux.totalCredit;

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4">
      {/* Actions */}
      <div className="flex items-center justify-between print:hidden flex-wrap gap-2">
        <button onClick={() => navigate(-1)} className="btn-secondary flex items-center gap-2 text-[13px]">
          <ArrowLeft size={15} />Retour
        </button>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCsv} className="btn-secondary flex items-center gap-1.5 text-[13px]">
            <Download size={14} />Export CSV
          </button>
          <button onClick={() => window.print()} className="btn-primary flex items-center gap-1.5 text-[13px]">
            <Printer size={14} />Imprimer
          </button>
        </div>
      </div>

      {/* Document */}
      <div className="bg-white rounded-xl border border-border shadow-card p-8 space-y-6 print:shadow-none print:rounded-none print:border-0">

        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <h1 className="text-[20px] font-extrabold text-primary">ÉCRITURES COMPTABLES</h1>
            <p className="text-[12px] text-text-muted mt-0.5">Plan comptable OHADA — Journal {data.journalCode}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[13px] font-bold text-primary-accent">{data.numeroAvoir}</p>
            <p className="text-[12px] text-text-muted">{formatDateTime(data.dateEcriture)}</p>
          </div>
        </div>

        {/* Infos */}
        <div className="flex flex-wrap gap-4 text-[12px]">
          <div>
            <span className="text-text-muted">Journal :</span>{' '}
            <span className="font-semibold text-text">{data.journalCode} — {data.journalLabel}</span>
          </div>
          <div>
            <span className="text-text-muted">Vente d'origine :</span>{' '}
            <span className="font-mono font-semibold text-text">{data.vente.numeroVente}</span>
          </div>
          <div>
            <span className="text-text-muted">Site :</span>{' '}
            <span className="font-semibold text-text">{data.site.nom}</span>
          </div>
        </div>

        {/* Table des écritures */}
        <div>
          <p className="font-bold text-text-muted uppercase tracking-wide text-[10px] mb-3">Écritures de passation</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="py-2 font-semibold w-16">Compte</th>
                  <th className="py-2 font-semibold">Libellé du compte</th>
                  <th className="py-2 font-semibold">Intitulé opération</th>
                  <th className="py-2 font-semibold text-right w-28">Débit $</th>
                  <th className="py-2 font-semibold text-right w-28">Crédit $</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.ecritures.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2.5 font-mono font-bold text-primary-accent">{e.compte}</td>
                    <td className="py-2.5 font-semibold text-text">{e.libelle}</td>
                    <td className="py-2.5 text-text-muted">{e.intitule}</td>
                    <td className={cn('py-2.5 text-right font-mono', e.debit > 0 ? 'text-text font-semibold' : 'text-text-muted')}>
                      {e.debit > 0 ? formatUSD(e.debit) : '—'}
                    </td>
                    <td className={cn('py-2.5 text-right font-mono', e.credit > 0 ? 'text-text font-semibold' : 'text-text-muted')}>
                      {e.credit > 0 ? formatUSD(e.credit) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={cn('border-t-2 font-bold', balanced ? 'border-success' : 'border-danger')}>
                  <td colSpan={3} className="py-2.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">Totaux</td>
                  <td className="py-2.5 text-right font-mono text-text">{formatUSD(data.totaux.totalDebit)}</td>
                  <td className="py-2.5 text-right font-mono text-text">{formatUSD(data.totaux.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Équilibre */}
        <div className={cn('rounded-lg px-4 py-3 text-[12px] font-semibold flex items-center gap-2', balanced ? 'bg-green-50 border border-green-200 text-success' : 'bg-red-50 border border-red-200 text-danger')}>
          {balanced ? '✓ Écriture équilibrée (Débit = Crédit)' : '⚠ Écriture déséquilibrée — vérifier les données'}
        </div>

        {/* Ventilation */}
        <div className="rounded-lg bg-slate-50 border border-border px-4 py-3 space-y-1 text-[12px]">
          <p className="font-bold text-text-muted uppercase tracking-wide text-[10px] mb-2">Ventilation TVA</p>
          <div className="flex justify-between text-text-muted">
            <span>Montant HT (classe 7)</span>
            <span className="font-semibold text-text">{formatUSD(data.totaux.montantHT)}</span>
          </div>
          <div className="flex justify-between text-text-muted">
            <span>TVA 16% (compte 4431)</span>
            <span className="font-semibold text-text">{formatUSD(data.totaux.montantTVA)}</span>
          </div>
          <div className="flex justify-between font-bold text-text border-t border-border pt-1 mt-1">
            <span>Montant TTC (compte 411)</span>
            <span>{formatUSD(data.totaux.montantTTC)}</span>
          </div>
        </div>

        {/* Pied */}
        <div className="border-t border-border pt-4 text-[11px] text-text-muted text-center">
          <p>Conforme au Plan Comptable OHADA (SYSCOHADA) — EBN Network</p>
        </div>
      </div>
    </div>
  );
}
