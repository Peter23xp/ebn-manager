import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer, MessageSquare, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, getErrorMessage } from '@/lib/api';
import { cn, formatUSD, formatDateTime } from '@/lib/utils';
import type { ModePaiement, StatutVente } from '@/types';

// ── Types locaux ──────────────────────────────────────────────────────────────

type ReceiptFormat = '80mm' | '58mm';

const LS_FORMAT_KEY = 'ebn_network_receipt_format';

interface LigneRecu {
  id: string;
  produit: { id: string; sku: string; nom: string };
  quantite: number;
  prixUnitaire: number;
  sousTotal: number;
}

interface VenteRecu {
  id: string;
  numeroVente: string;
  createdAt: string;
  statut: StatutVente;
  agent: { id: string; nom: string; prenom?: string };
  site: { id: string; nom: string; ville?: string };
  client?: {
    id: string;
    nom: string;
    prenom: string;
    telephone: string;
  };
  lignes: LigneRecu[];
  montantBrut: number;
  montantNet: number;
  modePaiement: ModePaiement;
  montantRecu?: number;
  monnaieRendue?: number;
}

const PAYMENT_LABELS: Record<ModePaiement, string> = {
  CASH: 'Espèces',
  MPESA: 'M-Pesa',
  AIRTEL_MONEY: 'Airtel Money',
  VIREMENT: 'Virement',
};

// ── Skeleton reçu ─────────────────────────────────────────────────────────────

function ReceiptSkeleton({ format }: { format: ReceiptFormat }) {
  return (
    <div
      className={cn(
        'bg-white border border-border rounded-xl p-4 mx-auto font-mono animate-pulse',
        format === '80mm' ? 'max-w-[300px]' : 'max-w-[218px]',
      )}
    >
      {[...Array(10)].map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-3 bg-slate-200 rounded mb-2',
            i % 3 === 0 ? 'w-2/3 mx-auto' : 'w-full',
          )}
        />
      ))}
    </div>
  );
}

// ── Dialog SMS ────────────────────────────────────────────────────────────────

interface SmsDialogProps {
  id: string;
  defaultPhone: string;
  onClose: () => void;
}

function SmsDialog({ id, defaultPhone, onClose }: SmsDialogProps) {
  const [telephone, setTelephone] = useState(defaultPhone);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/ventes/${id}/sms-recu`, { telephone }),
    onSuccess: () => {
      toast.success('Reçu envoyé par SMS avec succès.');
      onClose();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-text text-lg">Envoyer par SMS</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg text-text-muted"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-2">
          <label className="form-label" htmlFor="sms-phone">
            Numéro de téléphone
          </label>
          <input
            id="sms-phone"
            type="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="+243XXXXXXXXX"
            className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-accent"
          />
        </div>
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary flex-1"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!telephone.trim() || mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {mutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <MessageSquare size={16} />
            )}
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function RecuPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Format 80mm / 58mm — URL param prioritaire, sinon localStorage
  const getInitialFormat = (): ReceiptFormat => {
    const fromUrl = searchParams.get('format');
    if (fromUrl === '58mm' || fromUrl === '80mm') return fromUrl;
    const fromStorage = localStorage.getItem(LS_FORMAT_KEY);
    if (fromStorage === '58mm' || fromStorage === '80mm') return fromStorage;
    return '80mm';
  };
  const [format, setFormat] = useState<ReceiptFormat>(getInitialFormat);
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const autoPrintTriggered = useRef(false);

  const { data: vente, isLoading } = useQuery<VenteRecu>({
    queryKey: ['vente-recu', id],
    queryFn: () => api.get(`/ventes/${id}`).then((r) => r.data),
  });

  // Injection du CSS print dans <head> — retiré au démontage
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-print-receipt', 'true');
    styleEl.textContent = `
      @media print {
        body * { visibility: hidden; }
        #thermal-receipt, #thermal-receipt * { visibility: visible; }
        #thermal-receipt { position: absolute; left: 0; top: 0; }
        @page { size: 80mm auto; margin: 2mm; }
      }
    `;
    document.head.appendChild(styleEl);
    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);

  // Auto-print si ?autoprint=true
  useEffect(() => {
    if (
      !isLoading &&
      vente &&
      searchParams.get('autoprint') === 'true' &&
      !autoPrintTriggered.current
    ) {
      autoPrintTriggered.current = true;
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, vente, searchParams]);

  const handleFormatChange = (f: ReceiptFormat) => {
    setFormat(f);
    localStorage.setItem(LS_FORMAT_KEY, f);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('format', f);
        return next;
      },
      { replace: true },
    );
  };

  // Séparateur thermique
  const sep80 = '═'.repeat(32);
  const dash80 = '─'.repeat(32);
  const sep58 = '═'.repeat(24);
  const dash58 = '─'.repeat(24);
  const sep = format === '80mm' ? sep80 : sep58;
  const dash = format === '80mm' ? dash80 : dash58;



  return (
    <div className="bg-bg min-h-screen">
      {/* Barre d'actions — masquée à l'impression */}
      <div className="print:hidden bg-white border-b border-border px-4 py-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate(`/sales/${id}`)}
          className="btn-secondary flex items-center gap-2"
        >
          <ArrowLeft size={16} />
          Retour à la vente
        </button>

        {/* Toggle format */}
        <div className="flex items-center gap-1 bg-bg rounded-xl p-1 ml-auto">
          {(['80mm', '58mm'] as ReceiptFormat[]).map((f) => (
            <button
              key={f}
              onClick={() => handleFormatChange(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                format === f
                  ? 'bg-white text-text shadow-sm border border-border'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <button
          onClick={() => setSmsDialogOpen(true)}
          className="btn-secondary flex items-center gap-2"
        >
          <MessageSquare size={16} />
          Envoyer par SMS
        </button>

        <button
          onClick={() => window.print()}
          className="btn-primary flex items-center gap-2"
        >
          <Printer size={16} />
          Imprimer
        </button>
      </div>

      {/* Zone reçu */}
      <div className="flex justify-center p-6">
        {isLoading ? (
          <ReceiptSkeleton format={format} />
        ) : !vente ? (
          <p className="text-text-muted text-sm">Reçu introuvable.</p>
        ) : (
          <div
            id="thermal-receipt"
            className={cn(
              'bg-white border border-border rounded-xl p-4 mx-auto font-mono text-[12px] leading-relaxed',
              format === '80mm' ? 'max-w-[300px]' : 'max-w-[218px]',
            )}
          >
            {/* En-tête */}
            <div className="text-center mb-1">
              <p>{sep}</p>
              <p className="font-bold text-[14px]">EBN NETWORK</p>
              <p>EBN Network {vente.site.nom}</p>
              <p>{sep}</p>
            </div>

            {/* Infos vente */}
            <div className="mb-1">
              <p>
                N° Reçu : <span className="font-semibold">{vente.numeroVente}</span>
              </p>
              <p>Date    : {formatDateTime(vente.createdAt)}</p>
              <p>
                Agent   :{' '}
                {vente.agent.prenom
                  ? `${vente.agent.prenom} ${vente.agent.nom}`
                  : vente.agent.nom}
              </p>
            </div>
            <p>{dash}</p>

            {/* Client */}
            {vente.client && (
              <>
                <p>
                  CLIENT  : {vente.client.prenom} {vente.client.nom}
                </p>
                <p>{dash}</p>
              </>
            )}

            {/* Articles */}
            <div className="mb-1">
              {vente.lignes.map((ligne) => (
                <div key={ligne.id}>
                  <p className="truncate">{ligne.produit.nom}</p>
                  <div className="flex justify-between">
                    <span>
                      {ligne.quantite}×{formatUSD(ligne.prixUnitaire)}
                    </span>
                    <span className="font-semibold">
                      {formatUSD(ligne.sousTotal)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p>{dash}</p>

            {/* Totaux */}
            <div className="mb-1">
              <div className="flex justify-between">
                <span>Sous-total :</span>
                <span>{formatUSD(vente.montantBrut)}</span>
              </div>

            </div>
            <p>{sep}</p>

            <div className="mb-1">
              <div className="flex justify-between font-bold text-[14px]">
                <span>TOTAL :</span>
                <span>{formatUSD(vente.montantNet)}</span>
              </div>
              <div className="flex justify-between">
                <span>Payé  :</span>
                <span>{PAYMENT_LABELS[vente.modePaiement]}</span>
              </div>
              {vente.modePaiement === 'CASH' && vente.montantRecu != null && (
                <div className="flex justify-between">
                  <span>Reçu  :</span>
                  <span>{formatUSD(vente.montantRecu)}</span>
                </div>
              )}
              {vente.modePaiement === 'CASH' &&
                vente.monnaieRendue != null &&
                vente.monnaieRendue > 0 && (
                  <div className="flex justify-between">
                    <span>Monnaie :</span>
                    <span>{formatUSD(vente.monnaieRendue)}</span>
                  </div>
                )}
            </div>



            {/* Pied */}
            <p>{dash}</p>
            <div className="text-center">
              <p>Merci pour votre achat !</p>
              <p>Ce reçu est votre preuve d'achat.</p>
              <p>EBN Network — Goma, RDC</p>
            </div>
            <p>{sep}</p>
          </div>
        )}
      </div>

      {/* Dialog SMS */}
      {smsDialogOpen && vente && (
        <SmsDialog
          id={id ?? ''}
          defaultPhone={vente.client?.telephone ?? ''}
          onClose={() => setSmsDialogOpen(false)}
        />
      )}
    </div>
  );
}
