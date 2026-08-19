import { Github, Mail, Globe } from 'lucide-react';

export function DeveloperCard() {
  return (
    <div className="rounded-xl border border-border bg-white shadow-sm p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-4">
        Développé par
      </p>
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white text-[18px] font-extrabold select-none">
          PA
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-primary">Peter AKILIMALI</p>
          <p className="text-[12px] text-text-muted">Développeur Full-Stack — EBN Manager</p>
          <div className="flex flex-wrap gap-3 mt-2">
            <a
              href="mailto:peter23xp@gmail.com"
              className="flex items-center gap-1.5 text-[12px] text-text-muted hover:text-primary-accent transition-colors"
              aria-label="Envoyer un email"
            >
              <Mail size={13} aria-hidden />
              peter23xp@gmail.com
            </a>
            <a
              href="https://github.com/peter23xp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12px] text-text-muted hover:text-primary-accent transition-colors"
              aria-label="Profil GitHub"
            >
              <Github size={13} aria-hidden />
              peter23xp
            </a>
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-center justify-center rounded-lg border border-border px-3 py-2 gap-1">
          <Globe size={18} className="text-primary-accent" aria-hidden />
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">v1.0</p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Écrans',  value: '42' },
          { label: 'Modules', value: '10' },
          { label: 'Rôles',   value: '6'  },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-[18px] font-extrabold font-mono text-primary">{value}</p>
            <p className="text-[10px] text-text-muted uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
