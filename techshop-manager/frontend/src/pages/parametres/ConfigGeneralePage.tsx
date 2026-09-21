import { useId, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Send,
  CheckCircle, AlertCircle, RefreshCw, X, Save,
  Eye, EyeOff, Star, Plus, Trash2,
} from 'lucide-react';
import { configApi, type AppConfig, type UpdateConfigPayload, type SystemStats } from '@/lib/settings.api';
import { cn, formatUSD } from '@/lib/utils';
import { getErrorMessage } from '@/lib/api';
import { SettingsPageLayout } from '@/components/settings/SettingsPageLayout';
import './settings-config.css';

function formatUptime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Indisponible';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days > 0 ? `${days} j ` : ''}${hours} h ${minutes} min`;
}

function Toast({ msg, ok, onDismiss }: { msg: string; ok: boolean; onDismiss: () => void }) {
  return (
    <div role="alert" className={cn(
      'config-toast', ok ? 'config-feedback-success' : 'config-feedback-error',
    )}>
      {ok ? <CheckCircle size={16} aria-hidden /> : <AlertCircle size={16} aria-hidden />}
      <span>{msg}</span>
      <button type="button" onClick={onDismiss} aria-label="Fermer la notification"><X size={16} aria-hidden /></button>
    </div>
  );
}

function Section({ title, subtitle, children, badge, badgeOk }: {
  icon?: React.ReactNode; title: string; subtitle?: string;
  children: React.ReactNode; badge?: string; badgeOk?: boolean;
}) {
  const headingId = useId();
  return (
    <section className="settings-panel config-section" aria-labelledby={headingId}>
      <div className="config-section-heading">
        <div>
          <h2 id={headingId} className="settings-section-title">{title}</h2>
          {subtitle && <p className="settings-description">{subtitle}</p>}
        </div>
        {badge && (
          <span className={cn(
            'config-badge', badgeOk && 'config-feedback-success',
          )}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  const controlId = useId();
  return (
    <div className="config-toggle">
      <div>
        <label id={`${controlId}-label`} htmlFor={controlId}>{label}</label>
        {description && <p id={`${controlId}-description`} className="settings-description">{description}</p>}
      </div>
      <button
        id={controlId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${controlId}-label`}
        aria-describedby={description ? `${controlId}-description` : undefined}
        onClick={() => onChange(!checked)}
        className="config-switch"
      >
        <span aria-hidden />
      </button>
    </div>
  );
}

function Metric({ label, value, sub }: {
  label: string; value: string | number | undefined; sub?: string;
}) {
  return (
    <div className="config-metric">
      <dt>{label}</dt>
      <dd>{value ?? 'Indisponible'}{sub && <span>{sub}</span>}</dd>
    </div>
  );
}

type Section_ID = 'systeme' | 'sms' | 'operations' | 'parrainage';

const NAV: { id: Section_ID; label: string }[] = [
  { id: 'systeme', label: 'Vue système' },
  { id: 'sms', label: 'SMS & notifications' },
  { id: 'operations', label: 'Opérations' },
  { id: 'parrainage', label: 'Parrainage' },
];

function SystemeSection({ stats, loadingStats, statsError, fetchingStats, refetchStats }: {
  stats?: SystemStats; loadingStats: boolean; statsError: boolean; fetchingStats: boolean; refetchStats: () => void;
}) {
  if (loadingStats) {
    return (
      <div className="settings-panel config-loading" role="status" aria-label="Chargement des métriques système">
        <p>Chargement des métriques système…</p>
        <div className="config-skeleton" aria-hidden />
        <div className="config-skeleton" aria-hidden />
      </div>
    );
  }
  if (statsError || !stats) {
    return (
      <div className="settings-panel config-empty" role="alert">
        <h2 className="settings-section-title">Les métriques système sont indisponibles.</h2>
        <p className="settings-description">Réessayez pour consulter l’état du système. Les autres sections restent accessibles.</p>
        <button type="button" className="btn-secondary" onClick={refetchStats} disabled={fetchingStats}>
          <RefreshCw size={16} aria-hidden /> Réessayer les métriques
        </button>
      </div>
    );
  }

  return (
    <div className="config-stack">
      <Section
        title="Données en temps réel"
        subtitle="Activité et données enregistrées. Actualisation automatique toutes les 30 secondes."
      >
        <dl className="config-metrics">
          <Metric label="Clients actifs" value={stats.clients.actifs} sub={`${stats.clients.enCours} en cours`} />
          <Metric label="Agents actifs" value={stats.utilisateurs.actifs} sub={`${stats.utilisateurs.inactifs} inactifs`} />
          <Metric label="Sites actifs" value={stats.sites.actifs} sub={`${stats.sites.total} au total`} />
          <Metric label="Produits" value={stats.stocks.totalProduits} sub={`${stats.stocks.alertes} alertes`} />
          <Metric label="Ventes aujourd'hui" value={stats.ventes.aujourdhui.count} sub={formatUSD(stats.ventes.aujourdhui.montant)} />
          <Metric label="Parrainages" value={stats.parrainage?.total} />
        </dl>

        {stats.stocks.ruptures > 0 && (
          <div className="config-stock-alert config-feedback-error">
            <AlertCircle size={16} aria-hidden />
            <p>
              {stats.stocks.ruptures} rupture{stats.stocks.ruptures > 1 ? 's' : ''} de stock — action requise
            </p>
            <a href="/stocks/alerts">Voir les alertes</a>
          </div>
        )}
      </Section>

      <Section
        title="Santé du serveur"
        subtitle="Métriques Node.js en direct"
        badge={stats.systeme.environnement === 'production' ? 'Production' : stats.systeme.environnement || 'Environnement indisponible'}
        badgeOk={stats.systeme.environnement === 'production'}
      >
        <dl className="config-metrics config-metrics-server">
          <Metric label="Node.js" value={stats.systeme.nodeVersion} />
          <Metric label="Durée de fonctionnement" value={formatUptime(stats.systeme.uptime)} />
          <Metric label="Mémoire utilisée" value={Number.isFinite(stats.systeme.memoire) ? `${stats.systeme.memoire} Mio` : 'Indisponible'} sub="Mémoire du processus Node.js" />
          <Metric label="SMS" value={stats.systeme.smsConfigured ? 'Configuré' : 'Non configuré'} />
        </dl>

        <dl className="config-details">
          {[
            { label: 'Base de données', value: 'PostgreSQL + Prisma ORM' },
            { label: 'Adresse de l’API', value: import.meta.env.VITE_API_URL ?? '/api/v1' },
            { label: 'Authentification', value: 'JWT Bearer + httpOnly Cookie' },
            { label: 'Ventes ce mois', value: `${stats.ventes.mois.count} ventes — ${formatUSD(stats.ventes.mois.montant)}` },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="settings-form-actions">
          <button
            type="button"
            onClick={refetchStats}
            disabled={fetchingStats}
            className="btn-secondary"
          >
            <RefreshCw size={16} aria-hidden /> {fetchingStats ? 'Actualisation…' : 'Actualiser les métriques'}
          </button>
        </div>
      </Section>
    </div>
  );
}

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

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<SmsForm>({
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
      title="SMS — Africa's Talking"
      subtitle="Identifiants du service utilisé pour l’inscription, l’activation et les alertes clients."
      badge={isConfigured ? 'Configuré' : 'Non configuré'}
      badgeOk={isConfigured}
    >
      <form onSubmit={handleSubmit((data) => saveMut.mutate(data))} className="config-form">
        <div className="settings-form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="sms-key">
              Clé API Africa's Talking
            </label>
            <div className="config-secret">
              <input id="sms-key" type={showKey ? 'text' : 'password'} {...register('smsApiKey')}
                autoComplete="off" spellCheck={false} placeholder="at_live_XXXXXXXXXXXXXXXX" />
              <button type="button" onClick={() => setShowKey(visible => !visible)}
                aria-label={showKey ? 'Masquer la clé API' : 'Afficher la clé API'} aria-pressed={showKey}>
                {showKey ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sms-user">Nom d’utilisateur Africa's Talking</label>
            <input id="sms-user" {...register('smsUsername')} placeholder="sandbox ou votre nom d’utilisateur" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sms-sender">
              Identifiant expéditeur (Sender ID)
            </label>
            <input id="sms-sender" {...register('smsSenderId')} placeholder="EBN"
              aria-invalid={!!errors.smsSenderId} aria-describedby={errors.smsSenderId ? 'sms-sender-hint sms-sender-error' : 'sms-sender-hint'} />
            <p id="sms-sender-hint" className="settings-description">11 caractères maximum.</p>
            {errors.smsSenderId && <p id="sms-sender-error" className="form-error">{errors.smsSenderId.message}</p>}
          </div>
        </div>

        <div className="settings-form-actions">
          <button type="submit" className="btn-primary" disabled={saveMut.isPending || !isDirty}>
            {saveMut.isPending ? <><RefreshCw size={16} aria-hidden /> Sauvegarde…</> : <><Save size={16} aria-hidden /> Sauvegarder</>}
          </button>
        </div>
      </form>

      <section className="config-subsection" aria-labelledby="sms-test-heading">
        <h3 id="sms-test-heading" className="config-subheading">Tester l’envoi</h3>
        <p id="sms-test-help" className="settings-description">
          {isConfigured ? 'Ce test envoie un SMS au numéro saisi avec la configuration sauvegardée.' : 'Configurez et sauvegardez le service SMS avant de lancer un test.'}
        </p>
        <div className="config-test-row">
          <div className="form-group">
            <label className="form-label" htmlFor="sms-test-phone">Numéro pour test SMS</label>
            <input id="sms-test-phone" type="tel" placeholder="+243900000001" value={testPhone}
              onChange={(event) => setTestPhone(event.target.value)} aria-describedby="sms-test-help" />
          </div>
          <button type="button" className="btn-secondary"
            onClick={() => testMut.mutate()} disabled={!testPhone || testMut.isPending || !isConfigured}
            title={!isConfigured ? 'Configurez et sauvegardez le SMS d\'abord' : ''}>
            {testMut.isPending ? <RefreshCw size={16} aria-hidden /> : <Send size={16} aria-hidden />}
            {testMut.isPending ? 'Envoi…' : 'Tester'}
          </button>
        </div>
        {testResult && (
          <div role={testResult.ok ? 'status' : 'alert'} className={cn('config-test-result',
            testResult.ok ? 'config-feedback-success' : 'config-feedback-error')}>
            {testResult.ok ? <CheckCircle size={16} aria-hidden /> : <AlertCircle size={16} aria-hidden />}
            <span>{testResult.msg}</span>
            <button type="button" onClick={() => setTestResult(null)} aria-label="Fermer le résultat du test"><X size={16} aria-hidden /></button>
          </div>
        )}
      </section>
    </Section>
  );
}

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
      title="Paramètres opérationnels"
      subtitle="Durées, conditions de retour et destinations des encaissements KPay."
    >
      <form onSubmit={handleSubmit((data) => saveMut.mutate(data))} className="config-form">
        <fieldset className="config-fieldset">
          <legend className="config-subheading">Sessions et retours</legend>
          <div className="settings-form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="ops-session">Durée de session (heures)</label>
              <div className="relative">
                <input id="ops-session" type="number" min={1} max={24} className="pr-8" aria-invalid={!!errors.dureeSectionHeures} aria-describedby={errors.dureeSectionHeures ? 'ops-session-error' : undefined}
                  {...register('dureeSectionHeures', { valueAsNumber: true })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-subtle font-semibold">h</span>
              </div>
              {errors.dureeSectionHeures && <p id="ops-session-error" className="form-error">{errors.dureeSectionHeures.message}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ops-retour">Délai de retour (jours)</label>
              <div className="relative">
                <input id="ops-retour" type="number" min={0} max={90} className="pr-14" aria-invalid={!!errors.delaiRetourJours} aria-describedby={errors.delaiRetourJours ? 'ops-retour-error' : undefined}
                  {...register('delaiRetourJours', { valueAsNumber: true })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-subtle font-semibold">jours</span>
              </div>
              {errors.delaiRetourJours && <p id="ops-retour-error" className="form-error">{errors.delaiRetourJours.message}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ops-frais">Frais de retour (%)</label>
              <div className="relative">
                <input id="ops-frais" type="number" min={0} max={100} step={0.5} className="pr-8" aria-invalid={!!errors.fraisRetourPct} aria-describedby={errors.fraisRetourPct ? 'ops-frais-error' : undefined}
                  {...register('fraisRetourPct', { valueAsNumber: true })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-text-subtle font-black">%</span>
              </div>
              {errors.fraisRetourPct && <p id="ops-frais-error" className="form-error">{errors.fraisRetourPct.message}</p>}
            </div>
          </div>

        </fieldset>

        <fieldset className="config-fieldset config-subsection">
          <legend className="config-subheading">Matricule externe</legend>
          <Toggle
            checked={matActif}
            onChange={(checked) => setValue('matriculeExterneActif', checked, { shouldDirty: true })}
            label="Activer le matricule externe"
            description="Permettre aux agents de saisir un identifiant employeur lors de l’inscription."
          />
          {matActif && (
            <div className="form-group mt-3">
              <label className="form-label" htmlFor="ops-regex">
                Regex de validation <span className="text-text-subtle normal-case font-normal">(optionnel)</span>
              </label>
              <input id="ops-regex" {...register('matriculeRegex')} placeholder="Ex: ^[A-Z]{2}\d{4}$" className="font-mono" aria-describedby="ops-regex-help" />
              <p id="ops-regex-help" className="settings-description">{"Vide = tout format accepté. Ex: ^[A-Z]{2}\\d{4}$ pour AB1234"}</p>
            </div>
          )}
        </fieldset>

        <fieldset className="config-fieldset config-subsection">
          <legend className="config-subheading">Transfert automatique KPay</legend>
          <Toggle checked={autoPayoutActif} onChange={(checked) => setValue('kpayAutoPayoutActif', checked, { shouldDirty: true })} label="Transférer automatiquement les encaissements" description="Après confirmation d’une vente KPay, effectuer un transfert vers le numéro administrateur configuré." />
          {autoPayoutActif && <div className="settings-form-grid mt-3">
            <div className="form-group"><label className="form-label" htmlFor="kpay-auto-provider">Opérateur administrateur</label><select id="kpay-auto-provider" {...register('kpayAutoPayoutProvider')}><option value="VODACOM_MPESA_COD">M-Pesa</option><option value="AIRTEL_COD">Airtel Money</option><option value="ORANGE_COD">Orange Money</option></select></div>
            <div className="form-group"><label className="form-label" htmlFor="kpay-auto-phone">Numéro administrateur</label><input id="kpay-auto-phone" type="tel" placeholder="243XXXXXXXXX" {...register('kpayAutoPayoutPhone')} aria-invalid={!!errors.kpayAutoPayoutPhone} aria-describedby={errors.kpayAutoPayoutPhone ? 'kpay-auto-error' : undefined} />{errors.kpayAutoPayoutPhone && <p id="kpay-auto-error" className="form-error">{errors.kpayAutoPayoutPhone.message}</p>}</div>
          </div>}
        </fieldset>

        <fieldset className="config-fieldset config-subsection">
          <legend className="config-subheading">KPay — numéros administrateur</legend>
          <p className="settings-description mb-3">Un numéro par opérateur, au format 243XXXXXXXXX. Ces destinations servent à la réception et aux transferts automatiques ; les retraits clients utilisent leur numéro de demande.</p>
          <div className="settings-form-grid">
            <div className="form-group"><label className="form-label" htmlFor="kpay-admin-mpesa">M-Pesa</label><input id="kpay-admin-mpesa" type="tel" placeholder="243XXXXXXXXX" {...register('kpayAdminMpesaPhone')} aria-invalid={!!errors.kpayAdminMpesaPhone} aria-describedby={errors.kpayAdminMpesaPhone ? 'kpay-mpesa-error' : undefined} />{errors.kpayAdminMpesaPhone && <p id="kpay-mpesa-error" className="form-error">{errors.kpayAdminMpesaPhone.message}</p>}</div>
            <div className="form-group"><label className="form-label" htmlFor="kpay-admin-airtel">Airtel Money</label><input id="kpay-admin-airtel" type="tel" placeholder="243XXXXXXXXX" {...register('kpayAdminAirtelPhone')} aria-invalid={!!errors.kpayAdminAirtelPhone} aria-describedby={errors.kpayAdminAirtelPhone ? 'kpay-airtel-error' : undefined} />{errors.kpayAdminAirtelPhone && <p id="kpay-airtel-error" className="form-error">{errors.kpayAdminAirtelPhone.message}</p>}</div>
            <div className="form-group"><label className="form-label" htmlFor="kpay-admin-orange">Orange Money</label><input id="kpay-admin-orange" type="tel" placeholder="243XXXXXXXXX" {...register('kpayAdminOrangePhone')} aria-invalid={!!errors.kpayAdminOrangePhone} aria-describedby={errors.kpayAdminOrangePhone ? 'kpay-orange-error' : undefined} />{errors.kpayAdminOrangePhone && <p id="kpay-orange-error" className="form-error">{errors.kpayAdminOrangePhone.message}</p>}</div>
          </div>
        </fieldset>

        <div className="settings-form-actions">
          <button type="submit" className="btn-primary" disabled={saveMut.isPending || !isDirty}>
            {saveMut.isPending ? <><RefreshCw size={16} aria-hidden /> Sauvegarde…</> : <><Save size={16} aria-hidden /> Sauvegarder</>}
          </button>
        </div>
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
      title="Règles de parrainage"
      subtitle="Récompenses, déclenchement et plafonds"
    >
      <form onSubmit={handleSubmit((data) => saveMut.mutate(data))} className="config-form">
        <fieldset className="config-fieldset">
          <legend className="config-subheading">Type de récompense</legend>
          <div className="config-choices">
            {([
              { v: 'POINTS', label: 'Points fidélité', desc: 'Crédités au parrain' },
              { v: 'REMISE_PROCHAINE_VENTE', label: 'Remise prochaine vente', desc: '% sur le prochain achat' },
              { v: 'COMMISSION_CDF', label: 'Commission CDF', desc: 'Montant fixe en francs' },
            ] as const).map(({ v: value, label, desc }) => (
              <label key={value} className="config-choice">
                <input type="radio" value={value} {...register('typeRecompense')} />
                <span><strong>{label}</strong><span className="settings-description">{desc}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="config-fieldset config-subsection">
          <legend className="config-subheading">Valeurs de récompense</legend>
          <p id="par-unit" className="settings-description mb-3">Unité des récompenses et du plafond : {recompenseLabel}.</p>
          <Toggle
            checked={multiNiv}
            onChange={(checked) => setValue('multiNiveaux', checked, { shouldDirty: true })}
            label="Parrainage multi-niveaux"
            description="Récompenser aussi le grand-parrain (niveau 2)."
          />
          <div className="settings-form-grid mt-3">
            <div className="form-group">
              <label className="form-label" htmlFor="par-n1">Niveau 1 (parrain direct)</label>
              <div className="relative">
                <input id="par-n1" type="number" min={0} className="pr-12" aria-invalid={!!errors.valeurNiveau1} aria-describedby={errors.valeurNiveau1 ? 'par-unit par-n1-error' : 'par-unit'}
                  {...register('valeurNiveau1', { valueAsNumber: true })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-subtle font-bold">{recompenseLabel}</span>
              </div>
              {errors.valeurNiveau1 && <p id="par-n1-error" className="form-error">{errors.valeurNiveau1.message}</p>}
            </div>
            {multiNiv && (
              <div className="form-group">
                <label className="form-label" htmlFor="par-n2">Niveau 2 (grand-parrain)</label>
                <div className="relative">
                  <input id="par-n2" type="number" min={0} className="pr-12" aria-invalid={!!errors.valeurNiveau2} aria-describedby={errors.valeurNiveau2 ? 'par-unit par-n2-error' : 'par-unit'}
                    {...register('valeurNiveau2', { valueAsNumber: true, setValueAs: v => v === '' ? null : Number(v) })} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-subtle font-bold">{recompenseLabel}</span>
                </div>
                {errors.valeurNiveau2 && <p id="par-n2-error" className="form-error">{errors.valeurNiveau2.message}</p>}
              </div>
            )}
          </div>
        </fieldset>

        <fieldset className="config-fieldset config-subsection">
          <legend className="config-subheading">Déclenchement de la récompense</legend>
            <div className="config-choices">
              {([
                { v: 'ACTIVATION', label: 'À l\'activation', desc: 'Dès que le filleul est activé' },
                { v: 'PREMIER_ACHAT', label: 'Premier achat', desc: 'Après le premier achat du filleul' },
              ] as const).map(({ v: value, label, desc }) => (
                <label key={value} className="config-choice">
                  <input type="radio" value={value} {...register('conditionDeclenchement')} />
                  <span><strong>{label}</strong><span className="settings-description">{desc}</span></span>
                </label>
              ))}
            </div>
        </fieldset>

        <div className="config-subsection">
          <div className="form-group config-cap-field">
            <label className="form-label" htmlFor="par-plafond">
              Plafond mensuel <span className="text-text-subtle normal-case font-normal">(0 = illimité)</span>
            </label>
            <div className="relative">
              <input id="par-plafond" type="number" min={0} className="pr-12" aria-invalid={!!errors.plafondMensuel} aria-describedby={errors.plafondMensuel ? 'par-unit par-plafond-error' : 'par-unit'}
                {...register('plafondMensuel', { valueAsNumber: true, setValueAs: v => v === '' || Number(v) === 0 ? null : Number(v) })} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-subtle font-bold">{recompenseLabel}</span>
            </div>
            {errors.plafondMensuel && <p id="par-plafond-error" className="form-error">{errors.plafondMensuel.message}</p>}
          </div>
        </div>

        <div className="settings-form-actions">
          <button type="submit" className="btn-primary" disabled={saveMut.isPending || !isDirty}>
            {saveMut.isPending ? <><RefreshCw size={16} aria-hidden /> Sauvegarde…</> : <><Save size={16} aria-hidden /> Sauvegarder</>}
          </button>
        </div>
      </form>
    </Section>
  );
}

export default function ConfigGeneralePage() {
  const [activeSection, setActiveSection] = useState<Section_ID>('systeme');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const { data: config, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['config'],
    queryFn: () => configApi.getConfig(),
  });

  const { data: stats, isLoading: loadingStats, isError: statsError, isFetching: fetchingStats, refetch: refetchStats } = useQuery({
    queryKey: ['config', 'system-stats'],
    queryFn: () => configApi.getSystemStats(),
    refetchInterval: 30_000,
  });

  return (
    <SettingsPageLayout
      active="general"
      title="Configuration générale"
      description="Consultez l’état du système et configurez les règles de fonctionnement."
      action={
        <button type="button" onClick={() => { refetch(); refetchStats(); }} disabled={isFetching || fetchingStats} className="btn-secondary" aria-label="Actualiser">
          <RefreshCw size={16} aria-hidden /> {isFetching || fetchingStats ? 'Actualisation…' : 'Actualiser'}
        </button>
      }
    >
      <div className="settings-config">
        <nav className="settings-tabs config-navigation" aria-label="Sections configuration">
          {NAV.map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setActiveSection(id)} aria-pressed={activeSection === id} aria-controls="config-section-content">
              {label}
            </button>
          ))}
        </nav>
        <div id="config-section-content">
          {isLoading ? (
            <div className="settings-panel config-loading" role="status" aria-label="Chargement de la configuration">
              <p>Chargement de la configuration…</p>
              <div className="config-skeleton" aria-hidden />
              <div className="config-skeleton" aria-hidden />
            </div>
          ) : isError ? (
            <div className="settings-panel config-empty" role="alert">
              <h2 className="settings-section-title">Impossible de charger la configuration.</h2>
              <p className="settings-description">Vérifiez votre connexion ou vos droits d’accès, puis réessayez.</p>
              <button type="button" className="btn-secondary" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw size={16} aria-hidden /> Réessayer
              </button>
            </div>
          ) : config ? (
            <>
              {activeSection === 'systeme'    && <SystemeSection stats={stats} loadingStats={loadingStats} statsError={statsError} fetchingStats={fetchingStats} refetchStats={refetchStats} />}
              {activeSection === 'sms'        && <SmsSection        config={config} onSaved={showToast} />}
              {activeSection === 'operations' && <OperationsSection config={config} onSaved={showToast} />}
              {activeSection === 'parrainage' && <ParrainageSection config={config} onSaved={showToast} />}
            </>
          ) : <div className="settings-panel config-empty"><h2 className="settings-section-title">Aucune configuration disponible.</h2><p className="settings-description">Actualisez pour réessayer de charger les paramètres.</p></div>}
        </div>
        {toast && <Toast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />}
      </div>
    </SettingsPageLayout>
  );
}
