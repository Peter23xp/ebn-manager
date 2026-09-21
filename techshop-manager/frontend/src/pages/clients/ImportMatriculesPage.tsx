import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, XCircle, AlertCircle, Download,
  AlertTriangle, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CsvDropzone } from '@/components/ui/CsvDropzone';
import { useAuthStore } from '@/store/auth.store';

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'upload' | 'preview' | 'result';

interface PreviewRow {
  ligne: number;
  matricule: string;
  telephone: string;
  clientId: string | null;
  clientNom: string | null;
  statut: 'TROUVE' | 'INTROUVABLE' | 'ERREUR_FORMAT';
  raisonErreur: string | null;
}

interface PreviewResponse {
  preview: PreviewRow[];
  total: number;
  resume: { trouves: number; introuvables: number; erreurs: number };
}

interface ImportDetail {
  matricule: string;
  telephone: string;
  statut: 'IMPORTE' | 'INTROUVABLE' | 'ERREUR';
  raisonErreur: string | null;
}

interface ImportResponse {
  imported: number;
  notFound: number;
  errors: number;
  details: ImportDetail[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadTemplate() {
  const csv = 'matricule,telephone\nNK-GOM-001-0001,+243812345678\nNK-GOM-001-0002,+243991234567\n';
  downloadCsv(csv, 'modele_import_progress_business.csv');
}

function downloadErrorReport(details: ImportDetail[]) {
  const errors = details.filter(d => d.statut === 'ERREUR' || d.statut === 'INTROUVABLE');
  if (!errors.length) return;
  const header = 'matricule,telephone,raison\n';
  const rows   = errors.map(d =>
    `${d.matricule},${d.telephone},${d.raisonErreur ?? d.statut}`,
  ).join('\n');
  downloadCsv(header + rows, 'rapport_erreurs_import.csv');
}

// ── Badges statut ─────────────────────────────────────────────────────────────

function StatutBadge({ statut, raison }: { statut: PreviewRow['statut']; raison: string | null }) {
  if (statut === 'TROUVE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-success">
        <CheckCircle2 size={11} aria-hidden /> Trouvé
      </span>
    );
  }
  if (statut === 'INTROUVABLE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-warning">
        <AlertCircle size={11} aria-hidden /> Introuvable
      </span>
    );
  }
  return (
    <div>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-danger">
        <XCircle size={11} aria-hidden /> Erreur format
      </span>
      {raison && <p className="text-[10px] text-danger mt-0.5">{raison}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ImportMatriculesPage() {
  const { hasRole } = useAuthStore();
  const [file,     setFile]     = useState<File | null>(null);
  const [phase,    setPhase]    = useState<Phase>('upload');
  const [preview,  setPreview]  = useState<PreviewResponse | null>(null);
  const [result,   setResult]   = useState<ImportResponse | null>(null);

  // Accès refusé pour AGENT
  if (!hasRole('GERANT')) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center space-y-3">
        <AlertTriangle size={36} className="text-warning mx-auto opacity-60" aria-hidden />
        <h2 className="text-[16px] font-bold text-primary">Accès refusé</h2>
        <p className="text-[13px] text-text-muted">
          Cette page est réservée aux Gérants et Super-Admins.
        </p>
        <Link to="/clients" className="text-[13px] text-primary-accent hover:underline">
          ← Retour à la liste
        </Link>
      </div>
    );
  }

  const previewMutation = useMutation({
    mutationFn: (f: File) => {
      const form = new FormData();
      form.append('file', f);
      return api.post<PreviewResponse>('/clients/import/preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (res) => {
      setPreview(res.data);
      setPhase('preview');
    },
    onError: (err) => toast.error(getErrorMessage(err) || 'Erreur de prévisualisation.'),
  });

  const importMutation = useMutation({
    mutationFn: (f: File) => {
      const form = new FormData();
      form.append('file', f);
      return api.post<ImportResponse>('/clients/import/execute', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (res) => {
      setResult(res.data);
      setPhase('result');
      toast.success(`Import terminé : ${res.data.imported} importé(s).`);
    },
    onError: (err) => toast.error(getErrorMessage(err) || "Erreur d'import."),
  });

  const isWorking = previewMutation.isPending || importMutation.isPending;

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/clients"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-strong hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent"
          aria-label="Retour à la liste des clients"
        >
          <ArrowLeft size={17} aria-hidden />
        </Link>
        <div>
          <h1 className="text-[18px] font-extrabold text-primary">Import de matricules externes</h1>
          <p className="text-[12px] text-text-muted">Association des matricules à des clients existants via CSV</p>
        </div>
      </div>

      {/* ── PHASE 1 — Upload ──────────────────────────────────────── */}
      {phase === 'upload' && (
        <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-4">
          <CsvDropzone
            onFileSelected={(f) => setFile(f)}
            maxSizeMB={5}
            disabled={isWorking}
          />

          {/* Format hint */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertCircle size={14} className="text-warning flex-shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="text-[12px] font-semibold text-warning mb-1">Format attendu :</p>
              <code className="text-[11px] font-mono text-text bg-amber-100 px-2 py-0.5 rounded block">
                matricule,telephone
              </code>
              <p className="text-[11px] text-text-muted mt-1">
                Encodage UTF-8 · Séparateur virgule · Première ligne = en-têtes
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 text-[12px] font-medium text-primary-accent hover:underline focus-visible:outline-none"
            >
              <Download size={13} aria-hidden />
              Télécharger le modèle CSV
            </button>
            <button
              type="button"
              onClick={() => file && previewMutation.mutate(file)}
              disabled={!file || isWorking}
              className="btn-primary text-[13px] flex items-center gap-2"
            >
              {previewMutation.isPending && <Loader2 size={14} className="animate-spin" aria-hidden />}
              Prévisualiser →
            </button>
          </div>
        </div>
      )}

      {/* ── PHASE 2 — Prévisualisation ────────────────────────────── */}
      {phase === 'preview' && preview && (
        <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-[15px] font-bold text-primary">
              Prévisualisation
              <span className="text-[13px] font-normal text-text-muted ml-2">
                (10 premières lignes sur {preview.total} total)
              </span>
            </h2>
            <button
              type="button"
              onClick={() => { setPhase('upload'); setPreview(null); setFile(null); }}
              className="btn-secondary text-[12px]"
            >
              ← Changer de fichier
            </button>
          </div>

          {/* Résumé */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Trouvés',      count: preview.resume.trouves,      classes: 'bg-green-100 text-success border-green-200' },
              { label: 'Introuvables', count: preview.resume.introuvables, classes: 'bg-amber-100 text-warning border-amber-200' },
              { label: 'Erreurs',      count: preview.resume.erreurs,      classes: 'bg-red-100 text-danger border-red-200' },
            ].map((s) => (
              <div key={s.label} className={cn('flex items-center gap-2 rounded-lg border px-4 py-2', s.classes)}>
                <span className="text-[20px] font-extrabold font-mono">{s.count}</span>
                <span className="text-[12px] font-semibold">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Alertes */}
          {preview.resume.trouves === 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" aria-hidden />
              <p className="text-[12px] text-warning font-medium">
                Aucun client trouvé dans ce fichier. Vérifiez le format ou les numéros de téléphone.
              </p>
            </div>
          )}
          {preview.resume.erreurs > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
              <AlertCircle size={14} className="text-yellow-600 flex-shrink-0 mt-0.5" aria-hidden />
              <p className="text-[12px] text-yellow-700 font-medium">
                {preview.resume.erreurs} ligne{preview.resume.erreurs > 1 ? 's' : ''} ignorée{preview.resume.erreurs > 1 ? 's' : ''} en raison d'erreurs de format.
              </p>
            </div>
          )}

          {/* Tableau prévisualisation */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm" aria-label="Prévisualisation du fichier CSV">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted">#</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted">Matricule</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted hidden sm:table-cell">Téléphone</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted hidden md:table-cell">Client trouvé</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted">Statut</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row, i) => (
                  <tr
                    key={row.ligne}
                    className={cn(
                      'border-b border-border/60 last:border-b-0',
                      row.statut === 'TROUVE'       ? (i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')
                      : row.statut === 'INTROUVABLE' ? 'bg-amber-50/40'
                                                     : 'bg-red-50/40',
                    )}
                  >
                    <td className="px-4 py-2.5 text-[11px] text-text-muted font-mono">{row.ligne}</td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-text">{row.matricule || '—'}</td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-text-muted hidden sm:table-cell">{row.telephone || '—'}</td>
                    <td className="px-4 py-2.5 text-[12px] text-text hidden md:table-cell">
                      {row.clientNom ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatutBadge statut={row.statut} raison={row.raisonErreur} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.total > 10 && (
            <p className="text-[12px] text-text-muted text-center">
              … et {(preview.total - 10).toLocaleString('fr')} autre{preview.total - 10 > 1 ? 's' : ''} ligne{preview.total - 10 > 1 ? 's' : ''}
            </p>
          )}

          {/* Lancer l'import */}
          {importMutation.isPending ? (
            <div className="space-y-2">
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-primary-accent animate-pulse rounded-full w-full" aria-hidden />
              </div>
              <p className="text-[12px] text-text-muted text-center">
                <Loader2 size={12} className="inline animate-spin mr-1" aria-hidden />
                Import en cours… ({preview.total} lignes à traiter)
              </p>
            </div>
          ) : (
            <div className="flex justify-end pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => file && importMutation.mutate(file)}
                disabled={!file || preview.resume.trouves === 0}
                className="btn-primary text-[13px] flex items-center gap-2"
              >
                Lancer l'import complet →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── PHASE 3 — Résultat ────────────────────────────────────── */}
      {phase === 'result' && result && (
        <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-success" aria-hidden />
            <h2 className="text-[16px] font-bold text-success">Import terminé</h2>
          </div>

          {/* 3 stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Importés',      value: result.imported, classes: 'border-green-200 bg-green-50',  text: 'text-success' },
              { label: 'Introuvables',  value: result.notFound,  classes: 'border-amber-200 bg-amber-50', text: 'text-warning' },
              { label: 'Erreurs',       value: result.errors,    classes: 'border-red-200 bg-red-50',     text: 'text-danger' },
            ].map((s) => (
              <div key={s.label} className={cn('rounded-xl border px-4 py-4 text-center', s.classes)}>
                <p className={cn('text-[28px] font-extrabold font-mono', s.text)}>{s.value}</p>
                <p className="text-[11px] text-text-muted mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-border">
            <div className="flex items-center gap-3 flex-wrap">
              {(result.errors > 0 || result.notFound > 0) && (
                <button
                  type="button"
                  onClick={() => downloadErrorReport(result.details)}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-danger hover:underline"
                >
                  <Download size={13} aria-hidden />
                  Télécharger le rapport d'erreurs (.csv)
                </button>
              )}
            </div>
            <Link to="/clients" className="btn-secondary text-[13px]">
              ← Retour à la liste des clients
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}
