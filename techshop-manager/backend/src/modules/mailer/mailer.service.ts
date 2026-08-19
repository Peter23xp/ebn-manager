import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface SupportTicketMailData {
  ticketRef: string;
  nom: string;
  email: string;
  siteNom: string;
  role: string;
  type: string;
  sujet: string;
  description: string;
  systemInfo?: string;
  hasScreenshot: boolean;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private resend: Resend | null = null;
  private from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    this.from = config.get<string>('MAIL_FROM') ?? 'EBN Network <onboarding@resend.dev>';

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend initialisé');
    } else {
      this.logger.warn('RESEND_API_KEY non défini — emails désactivés');
    }
  }

  // ── Méthode interne d'envoi (fire-and-forget) ──────────────────────
  private send(to: string, subject: string, html: string): void {
    if (!this.resend) {
      this.logger.warn(`Resend non configuré — email non envoyé à ${to}`);
      return;
    }
    this.resend.emails.send({ from: this.from, to, subject, html }).then(() => {
      this.logger.log(`Email envoyé à ${to} | ${subject}`);
    }).catch((err: Error) => {
      this.logger.error(`Échec envoi email à ${to}: ${err.message}`);
    });
  }

  // ── Diagnostic synchrone ───────────────────────────────────────────
  async testSmtp(to: string): Promise<{ ok: boolean; info?: string; error?: string; config: Record<string, string> }> {
    const diagConfig = {
      provider: 'Resend API',
      apiKey: this.config.get<string>('RESEND_API_KEY') ? '***défini***' : '(non défini)',
      from: this.from,
    };
    if (!this.resend) {
      return { ok: false, error: 'RESEND_API_KEY non défini', config: diagConfig };
    }
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject: 'Test Resend — EBN Network',
        html: '<p>Test de configuration email. Si vous recevez cet email, la configuration est correcte.</p>',
      });
      if (error) return { ok: false, error: error.message, config: diagConfig };
      return { ok: true, info: data?.id, config: diagConfig };
    } catch (err) {
      return { ok: false, error: (err as Error).message, config: diagConfig };
    }
  }

  // ── Template de base ───────────────────────────────────────────────
  private wrap(content: string): string {
    return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#ffffff">
  <div style="background:#1E3A5F;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0;font-size:18px">EBN Network</h2>
    <p style="margin:4px 0 0;opacity:.7;font-size:13px">Système de Gestion Commercial — RDC</p>
  </div>
  <div style="background:#f8fafc;padding:28px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
    ${content}
  </div>
  <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:16px">
    EBN Network · Goma · Bukavu · Kinshasa — RDC<br>
    Ce message est automatique, ne pas répondre.
  </p>
</div>`;
  }

  // ── 1. OTP Reset mot de passe ─────────────────────────────────────
  async sendOtpResetPassword(to: string, nom: string, otp: string, maskedPhone: string): Promise<void> {
    const html = this.wrap(`
      <h3 style="margin:0 0 8px;color:#1E3A5F;font-size:17px">Réinitialisation du mot de passe</h3>
      <p style="color:#64748b;font-size:14px;margin:0 0 24px">
        Bonjour <strong>${nom}</strong>, voici votre code de vérification pour le compte associé au numéro <strong>${maskedPhone}</strong>.
      </p>
      <div style="background:#1E3A5F;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px">
        <p style="color:rgba(255,255,255,0.6);font-size:12px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px">Code OTP</p>
        <p style="color:#ffffff;font-size:40px;font-weight:900;letter-spacing:10px;margin:0;font-family:monospace">${otp}</p>
      </div>
      <p style="color:#64748b;font-size:13px;margin:0 0 8px">
        ⏱ Ce code est valide pendant <strong>10 minutes</strong>.
      </p>
      <p style="color:#64748b;font-size:13px;margin:0">
        Si vous n'avez pas fait cette demande, ignorez cet email. Votre compte reste sécurisé.
      </p>
    `);
    this.send(to, 'Votre code de réinitialisation — EBN Network', html);
  }

  // ── 2. Mot de passe temporaire (reset admin) ──────────────────────
  async sendTempPassword(to: string, nom: string, telephone: string, tempPassword: string): Promise<void> {
    const html = this.wrap(`
      <h3 style="margin:0 0 8px;color:#1E3A5F;font-size:17px">Votre nouveau mot de passe</h3>
      <p style="color:#64748b;font-size:14px;margin:0 0 24px">
        Bonjour <strong>${nom}</strong>, un administrateur a réinitialisé votre mot de passe.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
        <tr>
          <td style="padding:10px 12px;background:#f1f5f9;border-radius:6px 6px 0 0;color:#64748b;width:160px">Téléphone</td>
          <td style="padding:10px 12px;background:#f1f5f9;border-radius:6px 6px 0 0;font-family:monospace;font-weight:600">${telephone}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#e2e8f0;color:#64748b">Mot de passe temp.</td>
          <td style="padding:10px 12px;background:#e2e8f0;font-family:monospace;font-weight:700;font-size:16px;color:#1E3A5F">${tempPassword}</td>
        </tr>
      </table>
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:16px">
        <p style="color:#92400e;font-size:13px;margin:0;font-weight:600">
          ⚠ Changez ce mot de passe dès votre première connexion.
        </p>
      </div>
      <p style="color:#64748b;font-size:13px;margin:0">
        Si vous n'attendiez pas cette action, contactez immédiatement votre responsable.
      </p>
    `);
    this.send(to, 'Votre mot de passe a été réinitialisé — EBN Network', html);
  }

  // ── 3. Activation compte client (onboarding) ──────────────────────
  async sendActivationBienvenue(to: string, nomClient: string, codeParrain: string, siteNom: string): Promise<void> {
    const html = this.wrap(`
      <h3 style="margin:0 0 8px;color:#1E3A5F;font-size:17px">Bienvenue chez EBN Network !</h3>
      <p style="color:#64748b;font-size:14px;margin:0 0 24px">
        Bonjour <strong>${nomClient}</strong>, votre compte client est maintenant <strong style="color:#1A6B3A">actif</strong>.
      </p>
      <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px">
        <p style="color:#166534;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;font-weight:600">Votre matricule membre</p>
        <p style="color:#15803d;font-size:32px;font-weight:900;letter-spacing:6px;margin:0;font-family:monospace">${codeParrain}</p>
        <p style="color:#166534;font-size:12px;margin:8px 0 0">Partagez ce matricule pour parrainer vos prospects et progresser dans le plan MLM EBN</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
        <tr>
          <td style="padding:8px 12px;background:#f1f5f9;border-radius:6px;color:#64748b;width:80px">Site</td>
          <td style="padding:8px 12px;background:#f1f5f9;font-weight:600">${siteNom}</td>
        </tr>
      </table>
      <p style="color:#64748b;font-size:13px;margin:0">
        Vous bénéficiez désormais du programme de fidélité Bronze → Platine.<br>
        Chaque achat vous rapporte des points et des remises exclusives.
      </p>
    `);
    this.send(to, 'Bienvenue — Votre compte EBN Network est actif', html);
  }

  // ── Support ticket ─────────────────────────────────────────────────
  async sendSupportTicket(data: SupportTicketMailData): Promise<void> {
    const to = this.config.get<string>('MAIL_SUPPORT_TO') ?? 'support@ebnnetwork.cd';

    const TYPE_LABELS: Record<string, string> = {
      BUG: 'Bug', SUGGESTION: 'Suggestion', QUESTION: 'Question',
      CONFIG: 'Configuration', URGENCE: 'Urgence',
    };

    const subject = `[${data.ticketRef}] ${TYPE_LABELS[data.type] ?? data.type} — ${data.sujet}`;

    const html = this.wrap(`
      <h3 style="margin:0 0 8px;color:#1E3A5F;font-size:17px">Nouveau ticket support</h3>
      <p style="color:#64748b;font-size:13px;margin:0 0 16px">${data.ticketRef}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b;width:140px">Nom</td><td style="padding:6px 0;font-weight:600">${data.nom}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Email</td><td style="padding:6px 0">${data.email}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Site</td><td style="padding:6px 0">${data.siteNom}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Rôle</td><td style="padding:6px 0">${data.role}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Type</td><td style="padding:6px 0">${TYPE_LABELS[data.type] ?? data.type}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Sujet</td><td style="padding:6px 0;font-weight:600">${data.sujet}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
      <p style="font-size:13px;color:#64748b;margin:0 0 8px">Description</p>
      <p style="font-size:14px;white-space:pre-wrap;margin:0">${data.description}</p>
      ${data.systemInfo ? `
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
      <p style="font-size:13px;color:#64748b;margin:0 0 8px">Informations système</p>
      <pre style="font-size:12px;background:#f1f5f9;padding:12px;border-radius:6px;overflow:auto">${data.systemInfo}</pre>` : ''}
      ${data.hasScreenshot ? '<p style="font-size:13px;color:#2E86C1;margin:12px 0 0">📎 Une capture d\'écran a été jointe.</p>' : ''}
    `);

    this.send(to, subject, html);
  }
}
