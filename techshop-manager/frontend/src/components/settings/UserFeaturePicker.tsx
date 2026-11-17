import type { Role } from '@/types';
import { featuresForRole } from '@/lib/features';

interface UserFeaturePickerProps {
  role: Role;
  /** Clés des fonctionnalités retirées (décochées). */
  retirees: string[];
  onChange: (retirees: string[]) => void;
  disabled?: boolean;
}

/**
 * Cases à cocher « Fonctionnalités accessibles » du formulaire utilisateur.
 * Ne propose que ce que le rôle permet : on peut restreindre un compte, pas lui
 * donner plus que son rôle. Le super admin a toujours tout.
 */
export function UserFeaturePicker({ role, retirees, onChange, disabled }: UserFeaturePickerProps) {
  const features = featuresForRole(role);

  if (role === 'SUPER_ADMIN') {
    return (
      <fieldset className="form-group">
        <legend className="form-label">Fonctionnalités accessibles</legend>
        <p className="text-[12px] text-text-muted">Le super administrateur a accès à toutes les fonctionnalités.</p>
      </fieldset>
    );
  }
  if (features.length === 0) return null;

  const toggle = (key: string, allowed: boolean) => {
    const next = allowed ? retirees.filter((k) => k !== key) : [...new Set([...retirees, key])];
    onChange(next);
  };
  const allowedCount = features.filter((f) => !retirees.includes(f.key)).length;

  return (
    <fieldset className="form-group">
      <legend className="form-label">
        Fonctionnalités accessibles{' '}
        <span className="font-normal text-text-subtle">({allowedCount}/{features.length})</span>
      </legend>
      <p className="mb-2 text-[12px] text-text-muted">
        Décochez ce que cet utilisateur ne doit pas utiliser. Les menus correspondants disparaissent et le serveur bloque l’accès.
      </p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {features.map((f) => {
          const allowed = !retirees.includes(f.key);
          const id = `feature-${f.key}`;
          return (
            <label key={f.key} htmlFor={id} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50">
              <input
                id={id}
                type="checkbox"
                className="mt-0.5 h-4 w-4 min-h-0 shrink-0 accent-primary-accent"
                checked={allowed}
                disabled={disabled}
                onChange={(e) => toggle(f.key, e.target.checked)}
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-text">{f.label}</span>
                <span className="block text-[12px] text-text-muted">{f.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Ne garde que les retraits qui ont un sens pour ce rôle (au moment d'enregistrer). */
export function retireesForRole(role: Role, retirees: string[]): string[] {
  if (role === 'SUPER_ADMIN') return [];
  const keys = new Set(featuresForRole(role).map((f) => f.key as string));
  return retirees.filter((k) => keys.has(k));
}
