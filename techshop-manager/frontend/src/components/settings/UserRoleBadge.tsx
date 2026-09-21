import { cn } from '@/lib/utils';
import type { Role } from '@/types';

interface Props {
  role: Role;
  className?: string;
}

const ROLE_CONFIG: Record<Role, { label: string; className: string }> = {
  SUPER_ADMIN:         { label: 'Super Admin',   className: 'bg-violet-100 text-violet-700' },
  DIRECTEUR_REGIONAL:  { label: 'Dir. Régional', className: 'bg-blue-100 text-blue-700' },
  GERANT:              { label: 'Gérant',         className: 'bg-indigo-100 text-indigo-700' },
  CAISSIER:            { label: 'Caissier',       className: 'bg-sky-100 text-sky-700' },
  AGENT:               { label: 'Agent',          className: 'bg-sky-100 text-sky-700' },
  FORMATEUR:           { label: 'Formateur',      className: 'bg-teal-100 text-teal-700' },
  CLIENT:              { label: 'Client',         className: 'bg-slate-100 text-slate-600' },
};

export function UserRoleBadge({ role, className }: Props) {
  const cfg = ROLE_CONFIG[role] ?? { label: role, className: 'bg-slate-100 text-slate-600' };
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide',
        cfg.className,
        className,
      )}
      data-testid={`role-badge-${role.toLowerCase()}`}
    >
      {cfg.label}
    </span>
  );
}
