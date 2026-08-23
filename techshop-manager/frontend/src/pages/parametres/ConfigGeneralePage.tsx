import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Settings, MessageSquare, Hash, Clock, Info, Send,
  CheckCircle, AlertCircle, RefreshCw, X, Save,
  Lock, Eye, EyeOff, Database, Cpu, Wifi, WifiOff,
  Users, Building2, Package, ShoppingCart, GitBranch,
  Star, Plus, Trash2, ChevronRight, Activity, Server,
  MemoryStick, Zap,
} from 'lucide-react';
import { configApi, type AppConfig, type UpdateConfigPayload, type SystemStats } from '@/lib/settings.api';
import { cn, formatUSD } from '@/lib/utils';
import { getErrorMessage } from '@/lib/api';

// ── Helpers ────────────────────────────────────────────────────────
function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)}j ${h % 24}h`;
  return `${h}h ${m}m`;
}

// ── Toast ──────────────────────────────────────────────────────────
function Toast({ msg, ok, onDismiss }: { msg: string; ok: boolean; onDismiss: () => void }) {
  return (
    <div role="alert" className={cn(
      'fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-6 sm:right-6 z-[60] flex items-center gap-3 rounded-xl px-4 sm:px-5 py-3 text-sm font-semibold shadow-xl text-white sm:max-w-sm',
      ok ? 'bg-success' : 'bg-danger',
    )}>
      {ok ? <CheckCircle size={16} className="flex-shrink-0" /> : <AlertCircle size={16} className="flex-shrink-0" />}
      <span className="flex-1">{msg}</span>
      <button onClick={onDismiss} className="ml-1 opacity-70 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────
function Section({ icon, title, subtitle, children, badge, badgeOk }: {
  icon: React.ReactNode; title: string; subtitle?: string;
  children: React.ReactNode; badge?: string; badgeOk?: boolean;
}) {
  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-light">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-primary leading-none">{title}</h2>
          {subtitle && <p className="text-[11px] text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {badge && (
          <span className={cn(
            'text-[10px] font-bold rounded-full px-2.5 py-1 border flex-shrink-0',
            badgeOk ? 'bg-green-50 text-success border-green-200' : 'bg-slate-100 text-slate-500 border-border',
          )}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Toggle switch ──────────────────────────────────────────────────
function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-border hover:border-primary-accent/50 hover:bg-primary-light/10 transition-all">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative flex-shrink-0 w-10 h-6 rounded-full transition-colors duration-200',
          checked ? 'bg-primary-accent' : 'bg-slate-200',
        )}
      >
        <span className={cn(
          'absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
          checked && 'translate-x-4',
        )} />
      </button>
      <div>
        <p className="text-[13px] font-semibold text-text">{label}</p>
        {description && <p className="text-[11px] text-text-muted">{description}</p>}
      </div>
    </label>
  );
}

// ── Stat card mini ─────────────────────────────────────────────────
function MiniStat({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-white">
      <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', color)}>
        <Icon size={16} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-black text-primary leading-none">{value}</p>
        <p className="text-[10px] text-text-muted mt-0.5 truncate">{label}</p>
        {sub && <p className="text-[10px] text-text-subtle">{sub}</p>}
      </div>
    </div>
  );
}

// ── Panneau de navigation latérale ─────────────────────────────────
type Section_ID = 'systeme' | 'sms' | 'operations' | 'parrainage';

const NAV: { id: Section_ID; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: 'systeme',    label: 'Vue système',      icon: Activity },
  { id: 'sms',        label: 'SMS & Notifs',     icon: MessageSquare },
  { id: 'operations', label: 'Opérations',       icon: Settings },
  { id: 'parrainage', label: 'Parrainage',        icon: GitBranch },
];

// ════════════════════════════════════════════════════════════════════
// SECTIONS
// ════════════════════════════════════════════════════════════════════

// ── Vue Système ────────────────────────────────────────────────────
function SystemeSection({ stats, loadingStats, refetchStats }: {
  stats?: SystemStats; loadingStats: boolean; refetchStats: () => void;
}) {
  if (loadingStats) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse skeleton h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* Stats métier */}
      <Section
        icon={<Activity size={18} className="text-primary-accent" />}
        title="Données en temps réel"
        subtitle="État actuel de la base de données"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MiniStat icon={Users}       label="Clients actifs"   value={stats.clients.actifs}             sub={`${stats.clients.enCours} en cours`}   color="bg-blue-100 text-blue-700" />
          <MiniStat icon={Users}       label="Agents actifs"    value={stats.utilisateurs.actifs}        sub={`${stats.utilisateurs.inactifs} inactifs`} color="bg-indigo-100 text-indigo-700" />
          <MiniStat icon={Building2}   label="Sites actifs"     value={stats.sites.actifs}               sub={`${stats.sites.total} total`}          color="bg-violet-100 text-violet-700" />
          <MiniStat icon={Package}     label="Produits"         value={stats.stocks.totalProduits}       sub={`${stats.stocks.alertes} alertes`}     color="bg-amber-100 text-amber-700" />
          <MiniStat icon={ShoppingCart} label="Ventes aujourd'hui" value={stats.ventes.aujourdhui.count}  sub={formatUSD(stats.ventes.aujourdhui.montant)} color="bg-green-100 text-green-700" />
          <MiniStat icon={GitBranch}   label="Parrainages"      value={stats.parrainage?.total ?? 0}     sub={`${stats.ventes?.mois?.count ?? 0} ventes/mois`} color="bg-rose-100 text-rose-700" />
        </div>

        {stats.stocks.ruptures > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle size={15} className="text-danger flex-shrink-0" />
            <p className="text-[13px] text-danger font-semibold">
              {stats.stocks.ruptures} rupture{stats.stocks.ruptures > 1 ? 's' : ''} de stock — action requise
            </p>
            <a href="/stocks/alerts" className="ml-auto text-[12px] text-danger underline">Voir →</a>
          </div>
        )}
      </Section>

      {/* Stats serveur */}
      <Section
        icon={<Server size={18} className="text-primary-accent" />}
        title="Santé du serveur"
        subtitle="Métriques Node.js en direct"
        badge={stats.systeme.environnement === 'production' ? 'Production' : 'Développement'}
        badgeOk={stats.systeme.environnement === 'production'}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat icon={Zap}        label="Node.js"    value={stats.systeme.nodeVersion}           color="bg-green-100 text-green-700" />
          <MiniStat icon={Clock}      label="Uptime"     value={formatUptime(stats.systeme.uptime)}  color="bg-sky-100 text-sky-700" />
          <MiniStat icon={MemoryStick} label="Mémoire"   value={`${stats.systeme.memoire} MB`}       color="bg-amber-100 text-amber-700" />
          <MiniStat
            icon={stats.systeme.smsConfigured ? Wifi : WifiOff}
            label="SMS"
            value={stats.systeme.smsConfigured ? 'Configuré' : 'Non configuré'}
            color={stats.systeme.smsConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
          />
        </div>

        <div className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
          {[
            { label: 'Base de données',  value: 'PostgreSQL + Prisma ORM',                    icon: Database },
            { label: 'API endpoint',     value: import.meta.env.VITE_API_URL ?? '/api/v1',    icon: Server },
            { label: 'Auth',             value: 'JWT Bearer + httpOnly Cookie',               icon: Lock },
            { label: 'Ventes ce mois',   value: `${stats.ventes.mois.count} ventes — ${formatUSD(stats.ventes.mois.montant)}`, icon: ShoppingCart },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3 bg-white">
              <div className="flex items-center gap-2 text-[12px] text-text-muted">
                <Icon size={13} className="opacity-50 flex-shrink-0" />
                {label}
              </div>
              <span className="text-[12px] font-semibold text-text font-mono">{value}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={refetchStats}
            className="flex items-center gap-1.5 text-[12px] text-text-muted hover:text-primary-accent transition-colors"
          >
            <RefreshCw size={12} /> Actualiser les métriques
          </button>
        </div>
      </Section>
    </div>
  );
}

// ── SMS ─────────────────────────────────────────────────────────────
const smsSchema = z.object({
  smsApiKey: z.string().optional(),
  smsUsername: z.string().optional(),
  smsSenderId: z.string().max(11, 'Max 11 caractères').optional(),
});
type SmsForm = z.infer<typeof smsSchema>;

function SmsSection({ config, onSaved }: { config: AppConfig; onSaved: (msg: string, ok: boolean) => void }) {
  const qc = useQueryClient();
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const isConfigured = !!(config.generale.smsApiKey && config.generale.smsUsername);

  const { register, handleSubmit, formState: { isDirty } } = useForm<SmsForm>({
    resolver: zodResolver(smsSchema),
    values: { smsApiKey: config.generale.smsApiKey ?? '', smsUsername: config.generale.smsUsername ?? '', smsSenderId: config.generale.smsSenderId ?? '' },
  });

  const saveMut = useMutation({
    mutationFn: (data: SmsForm) => configApi.updateConfig({ generale: data } satisfies UpdateConfigPayload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); onSaved('Configuration SMS sauvegardée', true); },
    onError: (e) => onSaved(getErrorMessage(e), false),
  });
  const testMut = useMutation({
    mutationFn: () => configApi.testSms(testPhone),
    onSuccess: (r) => setTestResult({ msg: r.message, ok: r.success }),
    onError: (e) => setTestResult({ msg: getErrorMessage(e), ok: false }),
  });

  return (
    <Section
      icon={<MessageSquare size={18} className="text-primary-accent" />}
      title="SMS — Africa's Talking"
      subtitle="Notifications onboarding, activation et alertes clients"
      badge={isConfigured ? 'Opérationnel ✓' : 'Non configuré'}
      badgeOk={isConfigured}
    >
      {isConfigured && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
          <CheckCircle size={14} className="text-success flex-shrink-0" />
          <span className="text-[13px] text-success font-medium">SMS actifs</span>
          <span className="ml-auto text-[11px] text-text-muted font-mono">Sender : {config.generale.smsSenderId || 'défaut'}</span>
        </div>
      )}

      <form onSubmit={handleSubmit((d) => saveMut.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="form-group col-span-2 sm:col-span-1">
            <label className="form-label" htmlFor="sms-key">
              <Lock size={10} className="inline mr-1 opacity-60" />API Key Africa's Talking
            </label>
            <div className="relative">
              <input id="sms-key" type={showKey ? 'text' : 'password'} {...register('smsApiKey')}
                placeholder="at_live_XXXXXXXXXXXXXXXX" className="pr-10 font-mono text-xs" />
              <button type="button" onClick={() => setShowKey(v => !v)} tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text">
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sms-user">Username</label>
            <input id="sms-user" {...register('smsUsername')} placeholder="sandbox ou votre username" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sms-sender">
              Sender ID <span className="text-text-subtle normal-case font-normal">(max 11 car.)</span>
            </label>
            <input id="sms-sender" {...register('smsSenderId')} placeholder="EBN" />
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={saveMut.isPending || !isDirty}>
          {saveMut.isPending ? <><RefreshCw size={14} className="animate-spin" /> Sauvegarde…</> : <><Save size={14} /> Sauvegarder</>}
        </button>
      </form>

      {/* Test SMS */}
      <div className="mt-2 space-y-2 pt-4 border-t border-border">
        <p className="text-[11px] font-bold uppercase tracking-wider text-text-subtle">Tester l'envoi</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="tel" placeholder="+243900000001" value={testPhone} onChange={(e) => setTestPhone(e.target.value)}
            className="flex-1 text-[13px]" aria-label="Numéro pour test SMS" />
          <button type="button" className="btn-secondary w-full sm:w-auto whitespace-nowrap flex-shrink-0"
            onClick={() => testMut.mutate()} disabled={!testPhone || testMut.isPending || !isConfigured}
            title={!isConfigured ? 'Configurez et sauvegardez le SMS d\'abord' : ''}>
            {testMut.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
            {testMut.isPending ? 'Envoi…' : 'Tester'}
          </button>
        </div>
        {testResult && (
          <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px]',
            testResult.ok ? 'bg-green-50 border border-green-200 text-success' : 'bg-red-50 border border-red-200 text-danger')}>
            {testResult.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
            {testResult.msg}
            <button onClick={() => setTestResult(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={12} /></button>
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Opérations ─────────────────────────────────────────────────────
const opsSchema = z.object({
  dureeSectionHeures: z.number().min(1).max(24),
  delaiRetourJours: z.number().min(0).max(90),
  fraisRetourPct: z.number().min(0).max(100),
  matriculeExterneActif: z.boolean(),
  matriculeRegex: z.string().optional(),
  kpayAutoPayoutActif: z.boolean(),
  kpayAutoPayoutProvider: z.enum(['VODACOM_MPESA_COD', 'AIRTEL_COD', 'ORANGE_COD']).nullable(),
  kpayAutoPayoutPhone: z.string().regex(/^243[0-9]{9}$/, 'Format 243XXXXXXXXX').or(z.literal('')),
  kpayAdminMpesaPhone: z.string().regex(/^243[0-9]{9}$/, 'Format 243XXXXXXXXX').or(z.literal('')),
  kpayAdminAirtelPhone: z.string().regex(/^243[0-9]{9}$/, 'Format 243XXXXXXXXX').or(z.literal('')),
  kpayAdminOrangePhone: z.string().regex(/^243[0-9]{9}$/, 'Format 243XXXXXXXXX').or(z.literal('')),
});
type OpsForm = z.infer<typeof opsSchema>;

function OperationsSection({ config, onSaved }: { config: AppConfig; onSaved: (msg: string, ok: boolean) => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setValue, formState: { errors, isDirty } } = useForm<OpsForm>({
    resolver: zodResolver(opsSchema),
    values: {
      dureeSectionHeures: config.generale.dureeSectionHeures,
      delaiRetourJours: config.generale.delaiRetourJours,
      fraisRetourPct: config.generale.fraisRetourPct,
      matriculeExterneActif: config.generale.matriculeExterneActif,
      matriculeRegex: config.generale.matriculeRegex ?? '',
      kpayAutoPayoutActif: config.generale.kpayAutoPayoutActif ?? false,
      kpayAutoPayoutProvider: config.generale.kpayAutoPayoutProvider ?? 'VODACOM_MPESA_COD',
      kpayAutoPayoutPhone: config.generale.kpayAutoPayoutPhone ?? '',
      kpayAdminMpesaPhone: config.generale.kpayAdminMpesaPhone ?? '',
      kpayAdminAirtelPhone: config.generale.kpayAdminAirtelPhone ?? '',
      kpayAdminOrangePhone: config.generale.kpayAdminOrangePhone ?? '',
    },
  });
  const matActif = watch('matriculeExterneActif');
  const autoPayoutActif = watch('kpayAutoPayoutActif');
  const saveMut = useMutation({
    mutationFn: (data: OpsForm) => configApi.updateConfig({ generale: data } satisfies UpdateConfigPayload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); onSaved('Paramètres opérationnels sauvegardés', true); },
    onError: (e) => onSaved(getErrorMessage(e), false),
  });

  return (
    <Section
      icon={<Settings size={18} className="text-primary-accent" />}
      title="Paramètres opérationnels"
      subtitle="Sessions, retours, matricules — règles métier"
    >
      <form onSubmit={handleSubmit((d) => saveMut.mutate(d))} className="space-y-5">
        {/* Sessions & Retours */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-subtle mb-3">Sessions & Retours</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="form-group">
              <label className="form-label" htmlFor="ops-session">Durée session</label>
              <div className="relative">
                <input id="ops-session" type="number" min={1} max={24} className="pr-8"
                  {...register('dureeSectionHeures', { valueAsNumber: true })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-subtle font-semibold">h</span>
              </div>
              {errors.dureeSectionHeures && <p className="form-error">{errors.dureeSectionHeures.message}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ops-retour">Délai retour</label>
              <div className="relative">
                <input id="ops-retour" type="number" min={0} max={90} className="pr-14"
                  {...register('delaiRetourJours', { valueAsNumber: true })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-subtle font-semibold">jours</span>
              </div>
              {errors.delaiRetourJours && <p className="form-error">{errors.delaiRetourJours.message}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ops-frais">Frais retour</label>
              <div className="relative">
                <input id="ops-frais" type="number" min={0} max={100} step={0.5} className="pr-8"
                  {...register('fraisRetourPct', { valueAsNumber: true })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-text-subtle font-black">%</span>
              </div>
              {errors.fraisRetourPct && <p className="form-error">{errors.fraisRetourPct.message}</p>}
            </div>
          </div>

          {/* Résumé visuel */}
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-bg-inset border border-border p-3 text-center">
            {[
              { label: 'Session', value: `${watch('dureeSectionHeures')}h` },
              { label: 'Retour sous', value: `${watch('delaiRetourJours')} j` },
              { label: 'Frais retour', value: `${watch('fraisRetourPct')}%` },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-lg font-black text-primary leading-none">{item.value}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Matricule externe */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-subtle mb-3">Matricule externe</p>
          <Toggle
            checked={matActif}
            onChange={(v) => setValue('matriculeExterneActif', v, { shouldDirty: true })}
            label="Activer le matricule externe"
            description="Les agents pourront saisir un identifiant employeur lors de l'onboarding"
          />
          {matActif && (
            <div className="form-group mt-3">
              <label className="form-label" htmlFor="ops-regex">
                Regex de validation <span className="text-text-subtle normal-case font-normal">(optionnel)</span>
              </label>
              <input id="ops-regex" {...register('matriculeRegex')} placeholder="Ex: ^[A-Z]{2}\d{4}$" className="font-mono text-xs" />
              <p className="text-[11px] text-text-subtle mt-1">{"Vide = tout format accepté. Ex: ^[A-Z]{2}\\d{4}$ pour AB1234"}</p>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-subtle mb-3">Transfert automatique KPay</p>
          <Toggle checked={autoPayoutActif} onChange={(v) => setValue('kpayAutoPayoutActif', v, { shouldDirty: true })} label="Transférer automatiquement les encaissements" description="Après confirmation d'une vente KPay, effectuer un payout vers le numéro administrateur configuré." />
          {autoPayoutActif && <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div className="form-group"><label className="form-label" htmlFor="kpay-auto-provider">Opérateur administrateur</label><select id="kpay-auto-provider" {...register('kpayAutoPayoutProvider')}><option value="VODACOM_MPESA_COD">M-Pesa</option><option value="AIRTEL_COD">Airtel Money</option><option value="ORANGE_COD">Orange Money</option></select></div>
            <div className="form-group"><label className="form-label" htmlFor="kpay-auto-phone">Numéro administrateur</label><input id="kpay-auto-phone" placeholder="243XXXXXXXXX" {...register('kpayAutoPayoutPhone')} />{errors.kpayAutoPayoutPhone && <p className="form-error">{errors.kpayAutoPayoutPhone.message}</p>}</div>
          </div>}
        </div>

        <div className="border-t border-border pt-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-subtle mb-3">KPay — numéros administrateur</p>
          <p className="text-[11px] text-text-muted mb-3">Un numéro par opérateur. Ces destinations servent à la réception et aux payouts automatiques ; les retraits clients utilisent leur numéro de demande.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="form-group"><label className="form-label" htmlFor="kpay-admin-mpesa">M-Pesa</label><input id="kpay-admin-mpesa" placeholder="243XXXXXXXXX" {...register('kpayAdminMpesaPhone')} />{errors.kpayAdminMpesaPhone && <p className="form-error">{errors.kpayAdminMpesaPhone.message}</p>}</div>
            <div className="form-group"><label className="form-label" htmlFor="kpay-admin-airtel">Airtel Money</label><input id="kpay-admin-airtel" placeholder="243XXXXXXXXX" {...register('kpayAdminAirtelPhone')} />{errors.kpayAdminAirtelPhone && <p className="form-error">{errors.kpayAdminAirtelPhone.message}</p>}</div>
            <div className="form-group"><label className="form-label" htmlFor="kpay-admin-orange">Orange Money</label><input id="kpay-admin-orange" placeholder="243XXXXXXXXX" {...register('kpayAdminOrangePhone')} />{errors.kpayAdminOrangePhone && <p className="form-error">{errors.kpayAdminOrangePhone.message}</p>}</div>
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={saveMut.isPending || !isDirty}>
          {saveMut.isPending ? <><RefreshCw size={14} className="animate-spin" /> Sauvegarde…</> : <><Save size={14} /> Sauvegarder</>}
        </button>
      </form>
    </Section>
  );
}

// ── Fidélité ───────────────────────────────────────────────────────
const niveauSchema = z.object({ nom: z.string().min(1), seuilPts: z.number().min(0), remisePct: z.number().min(0).max(100) });
const fideliteSchema = z.object({
  ratioPtsCDF: z.number().min(100, 'Min 100 CDF'),
  dureeValiditeMois: z.number().min(0).max(120),
  cumulRemises: z.boolean(),
  niveaux: z.array(niveauSchema).min(1),
});
type FideliteForm = z.infer<typeof fideliteSchema>;

const NIVEAU_COLORS = ['bg-amber-700', 'bg-slate-400', 'bg-yellow-500', 'bg-violet-600'];

function FideliteSection({ config, onSaved }: { config: AppConfig; onSaved: (msg: string, ok: boolean) => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setValue, control, formState: { errors, isDirty } } = useForm<FideliteForm>({
    resolver: zodResolver(fideliteSchema),
    values: {
      ratioPtsCDF: config.fidelite.ratioPtsCDF,
      dureeValiditeMois: config.fidelite.dureeValiditeMois,
      cumulRemises: config.fidelite.cumulRemises,
      niveaux: config.fidelite.niveaux.map(n => ({ nom: n.nom, seuilPts: n.seuilPts, remisePct: Number(n.remisePct) })),
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'niveaux' });
  const saveMut = useMutation({
    mutationFn: (data: FideliteForm) => configApi.updateConfig({ fidelite: data } satisfies UpdateConfigPayload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); onSaved('Configuration fidélité sauvegardée', true); },
    onError: (e) => onSaved(getErrorMessage(e), false),
  });

  return (
    <Section
      icon={<Star size={18} className="text-primary-accent" />}
      title="Programme de fidélité"
      subtitle="Ratio points, niveaux et remises automatiques"
    >
      <form onSubmit={handleSubmit((d) => saveMut.mutate(d))} className="space-y-6">
        {/* Paramètres de base */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-subtle mb-3">Règles de calcul</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label" htmlFor="fid-ratio">
                Ratio points / $
              </label>
              <div className="relative">
                <input id="fid-ratio" type="number" min={100} step={100}
                  {...register('ratioPtsCDF', { valueAsNumber: true })} className="pr-16" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-subtle font-semibold">$/pt</span>
              </div>
              <p className="text-[11px] text-text-subtle mt-1">
                1 pt pour chaque ${watch('ratioPtsCDF')} dépensés
              </p>
              {errors.ratioPtsCDF && <p className="form-error">{errors.ratioPtsCDF.message}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="fid-duree">
                Validité des points <span className="text-text-subtle normal-case font-normal">(0 = illimité)</span>
              </label>
              <div className="relative">
                <input id="fid-duree" type="number" min={0} max={120}
                  {...register('dureeValiditeMois', { valueAsNumber: true })} className="pr-12" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-subtle font-semibold">mois</span>
              </div>
              {errors.dureeValiditeMois && <p className="form-error">{errors.dureeValiditeMois.message}</p>}
            </div>
          </div>
          <div className="mt-3">
            <Toggle
              checked={watch('cumulRemises')}
              onChange={(v) => setValue('cumulRemises', v, { shouldDirty: true })}
              label="Cumuler les remises de fidélité"
              description="Les remises s'ajoutent aux promotions en cours"
            />
          </div>
        </div>

        {/* Niveaux */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-subtle">Niveaux & Remises</p>
            <button type="button" onClick={() => append({ nom: 'Nouveau', seuilPts: 0, remisePct: 0 })}
              className="flex items-center gap-1 text-[12px] text-primary-accent hover:underline">
              <Plus size={13} /> Ajouter un niveau
            </button>
          </div>

          <div className="space-y-2">
            {fields.map((field, i) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-end p-3 rounded-xl border border-border bg-bg-inset">
                <div className={cn('col-span-1 flex h-8 w-8 items-center justify-center rounded-lg text-white text-[10px] font-black flex-shrink-0', NIVEAU_COLORS[i] ?? 'bg-slate-400')}>
                  {i + 1}
                </div>
                <div className="form-group col-span-4 mb-0">
                  <label className="form-label text-[10px]">Nom</label>
                  <input {...register(`niveaux.${i}.nom`)} placeholder="Bronze" className="text-[13px]" />
                </div>
                <div className="form-group col-span-3 mb-0">
                  <label className="form-label text-[10px]">Seuil (pts)</label>
                  <input type="number" min={0} {...register(`niveaux.${i}.seuilPts`, { valueAsNumber: true })} className="text-[13px]" />
                </div>
                <div className="form-group col-span-3 mb-0">
                  <label className="form-label text-[10px]">Remise %</label>
                  <div className="relative">
                    <input type="number" min={0} max={100} step={0.5} className="pr-6 text-[13px]"
                      {...register(`niveaux.${i}.remisePct`, { valueAsNumber: true })} />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-text-subtle font-black">%</span>
                  </div>
                </div>
                <div className="col-span-1 flex justify-end">
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(i)} className="text-danger/50 hover:text-danger transition-colors" aria-label="Supprimer ce niveau">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {errors.niveaux && <p className="form-error mt-1">Vérifiez les niveaux</p>}
        </div>

        <button type="submit" className="btn-primary" disabled={saveMut.isPending || !isDirty}>
          {saveMut.isPending ? <><RefreshCw size={14} className="animate-spin" /> Sauvegarde…</> : <><Save size={14} /> Sauvegarder</>}
        </button>
      </form>
    </Section>
  );
}

// ── Parrainage ─────────────────────────────────────────────────────
const parrainageSchema = z.object({
  multiNiveaux: z.boolean(),
  typeRecompense: z.enum(['POINTS', 'REMISE_PROCHAINE_VENTE', 'COMMISSION_CDF']),
  valeurNiveau1: z.number().min(0),
  valeurNiveau2: z.number().nullable(),
  conditionDeclenchement: z.enum(['ACTIVATION', 'PREMIER_ACHAT']),
  plafondMensuel: z.number().nullable(),
});
type ParrainageForm = z.infer<typeof parrainageSchema>;

function ParrainageSection({ config, onSaved }: { config: AppConfig; onSaved: (msg: string, ok: boolean) => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setValue, formState: { errors, isDirty } } = useForm<ParrainageForm>({
    resolver: zodResolver(parrainageSchema),
    values: {
      multiNiveaux: config.parrainage.multiNiveaux,
      typeRecompense: config.parrainage.typeRecompense,
      valeurNiveau1: Number(config.parrainage.valeurNiveau1),
      valeurNiveau2: config.parrainage.valeurNiveau2 !== null ? Number(config.parrainage.valeurNiveau2) : null,
      conditionDeclenchement: config.parrainage.conditionDeclenchement,
      plafondMensuel: config.parrainage.plafondMensuel,
    },
  });
  const multiNiv = watch('multiNiveaux');
  const typeRecomp = watch('typeRecompense');
  const saveMut = useMutation({
    mutationFn: (data: ParrainageForm) => configApi.updateConfig({ parrainage: data } satisfies UpdateConfigPayload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); onSaved('Configuration parrainage sauvegardée', true); },
    onError: (e) => onSaved(getErrorMessage(e), false),
  });

  const recompenseLabel = typeRecomp === 'POINTS' ? 'pts' : typeRecomp === 'COMMISSION_CDF' ? 'CDF' : '%';

  return (
    <Section
      icon={<GitBranch size={18} className="text-primary-accent" />}
      title="Règles de parrainage"
      subtitle="Récompenses, déclenchement et plafonds"
    >
      <form onSubmit={handleSubmit((d) => saveMut.mutate(d))} className="space-y-5">
        {/* Type de récompense */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-subtle mb-3">Type de récompense</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              { v: 'POINTS', label: 'Points fidélité', desc: 'Crédités au parrain' },
              { v: 'REMISE_PROCHAINE_VENTE', label: 'Remise prochaine vente', desc: '% sur le prochain achat' },
              { v: 'COMMISSION_CDF', label: 'Commission CDF', desc: 'Montant fixe en francs' },
            ] as const).map(({ v, label, desc }) => (
              <label key={v} className={cn(
                'cursor-pointer p-3 rounded-xl border-2 transition-all select-none',
                typeRecomp === v ? 'border-primary-accent bg-primary-light/30' : 'border-border hover:border-border-strong',
              )}>
                <input type="radio" value={v} {...register('typeRecompense')} className="sr-only" />
                <p className="text-[13px] font-semibold text-text">{label}</p>
                <p className="text-[11px] text-text-muted mt-0.5">{desc}</p>
              </label>
            ))}
          </div>
        </div>

        {/* Valeurs */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-subtle mb-3">Valeurs de récompense</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label" htmlFor="par-n1">Niveau 1 (parrain direct)</label>
              <div className="relative">
                <input id="par-n1" type="number" min={0} className="pr-12"
                  {...register('valeurNiveau1', { valueAsNumber: true })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-subtle font-bold">{recompenseLabel}</span>
              </div>
              {errors.valeurNiveau1 && <p className="form-error">{errors.valeurNiveau1.message}</p>}
            </div>
            {multiNiv && (
              <div className="form-group">
                <label className="form-label" htmlFor="par-n2">Niveau 2 (grand-parrain)</label>
                <div className="relative">
                  <input id="par-n2" type="number" min={0} className="pr-12"
                    {...register('valeurNiveau2', { valueAsNumber: true, setValueAs: v => v === '' ? null : Number(v) })} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-subtle font-bold">{recompenseLabel}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-subtle">Options</p>
          <Toggle
            checked={multiNiv}
            onChange={(v) => setValue('multiNiveaux', v, { shouldDirty: true })}
            label="Parrainage multi-niveaux"
            description="Récompenser aussi le grand-parrain (niveau 2)"
          />

          <div className="form-group">
            <label className="form-label">Déclenchement de la récompense</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {([
                { v: 'ACTIVATION', label: 'À l\'activation', desc: 'Dès que le filleul est activé' },
                { v: 'PREMIER_ACHAT', label: 'Premier achat', desc: 'Après le premier achat du filleul' },
              ] as const).map(({ v, label, desc }) => (
                <label key={v} className={cn(
                  'cursor-pointer p-3 rounded-xl border-2 transition-all select-none',
                  watch('conditionDeclenchement') === v ? 'border-primary-accent bg-primary-light/30' : 'border-border hover:border-border-strong',
                )}>
                  <input type="radio" value={v} {...register('conditionDeclenchement')} className="sr-only" />
                  <p className="text-[12px] font-semibold text-text">{label}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">{desc}</p>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="par-plafond">
              Plafond mensuel <span className="text-text-subtle normal-case font-normal">(0 = illimité)</span>
            </label>
            <div className="relative">
              <input id="par-plafond" type="number" min={0} className="pr-12"
                {...register('plafondMensuel', { valueAsNumber: true, setValueAs: v => v === '' || Number(v) === 0 ? null : Number(v) })} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-subtle font-bold">{recompenseLabel}</span>
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={saveMut.isPending || !isDirty}>
          {saveMut.isPending ? <><RefreshCw size={14} className="animate-spin" /> Sauvegarde…</> : <><Save size={14} /> Sauvegarder</>}
        </button>
      </form>
    </Section>
  );
}

// ════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ════════════════════════════════════════════════════════════════════
export default function ConfigGeneralePage() {
  const [activeSection, setActiveSection] = useState<Section_ID>('systeme');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const { data: config, isLoading, isError, refetch } = useQuery({
    queryKey: ['config'],
    queryFn: () => configApi.getConfig(),
  });

  const { data: stats, isLoading: loadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['config', 'system-stats'],
    queryFn: () => configApi.getSystemStats(),
    refetchInterval: 30_000,
  });

  return (
    <div className="animate-fade-up">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light" aria-hidden>
            <Settings size={20} className="text-primary-accent" />
          </div>
          <div>
            <h1 className="text-page-title text-primary break-words">Panneau de configuration</h1>
            <p className="text-xs text-text-muted mt-0.5">Contrôle complet du système — EBN Network</p>
          </div>
        </div>
        <button onClick={() => { refetch(); refetchStats(); }} disabled={isLoading}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-text-muted hover:border-primary-accent hover:text-primary-accent transition-colors"
          aria-label="Actualiser">
          <RefreshCw size={14} className={cn(isLoading && 'animate-spin')} />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch lg:items-start min-w-0">
        {/* Navigation latérale */}
        <nav className="hidden lg:flex flex-col w-48 flex-shrink-0 space-y-1 sticky top-4" aria-label="Sections configuration">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 min-h-11 rounded-xl text-[13px] font-medium transition-all text-left w-full',
                activeSection === id
                  ? 'bg-primary-accent text-white shadow-sm'
                  : 'text-text-muted hover:bg-bg-inset hover:text-text',
              )}
            >
              <Icon size={15} className="flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Navigation mobile */}
        <div className="lg:hidden flex gap-2 overflow-x-auto no-scrollbar mb-0 w-full max-w-full pb-1" style={{ scrollbarWidth: 'none' }}>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 min-h-11 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all flex-shrink-0',
                activeSection === id ? 'bg-primary-accent text-white' : 'bg-white border border-border text-text-muted',
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card animate-pulse space-y-4">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <div className="skeleton h-10 w-10 rounded-xl" />
                    <div className="space-y-1.5 flex-1">
                      <div className="skeleton h-4 w-1/3 rounded-full" />
                      <div className="skeleton h-3 w-1/2 rounded-full" />
                    </div>
                  </div>
                  <div className="skeleton h-10 w-full rounded-lg" />
                  <div className="skeleton h-10 w-2/3 rounded-lg" />
                  <div className="skeleton h-9 w-32 rounded-lg" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="card flex flex-col items-center gap-3 py-16" role="alert">
              <AlertCircle size={32} className="text-danger opacity-60" />
              <p className="font-medium text-text">Impossible de charger la configuration.</p>
              <button className="btn-secondary flex items-center gap-1.5" onClick={() => refetch()}>
                <RefreshCw size={13} /> Réessayer
              </button>
            </div>
          ) : config ? (
            <>
              {activeSection === 'systeme'    && <SystemeSection    stats={stats} loadingStats={loadingStats} refetchStats={refetchStats} />}
              {activeSection === 'sms'        && <SmsSection        config={config} onSaved={showToast} />}
              {activeSection === 'operations' && <OperationsSection config={config} onSaved={showToast} />}
              {activeSection === 'parrainage' && <ParrainageSection config={config} onSaved={showToast} />}
            </>
          ) : null}
        </div>
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />}
    </div>
  );
}
