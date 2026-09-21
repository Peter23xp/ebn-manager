import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingStepperProps {
  currentStep: 1 | 2 | 3;
  clientId?: string;
  completedSteps?: readonly number[];
  canNavigate?: boolean;
}

const STEPS: {
  label: string;
  step: 1 | 2 | 3;
  route: (id?: string) => string;
}[] = [
  { label: 'Récit',      step: 1, route: (id) => id ? `/clients/${id}/recit` : '/clients/new/recit' },
  { label: 'Fiche',      step: 2, route: (id) => `/clients/${id}/fiche` },
  { label: 'Activation', step: 3, route: (id) => `/clients/${id}/activate` },
];

export function OnboardingStepper({ currentStep, clientId, completedSteps, canNavigate = true }: OnboardingStepperProps) {
  return (
    <nav aria-label="Étapes d'onboarding">
      <ol className="flex items-center">
        {STEPS.map(({ label, step, route }, idx) => {
          const done   = completedSteps ? completedSteps.includes(step) : step < currentStep;
          const active = step === currentStep;
          const href   = canNavigate && done && (step === 1 || clientId) ? route(clientId) : null;

          const circle = (
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold transition-colors',
              done   ? 'bg-success text-white'
                     : active ? 'bg-primary-accent text-white'
                              : 'bg-slate-200 text-text-muted',
            )}>
              {done ? <Check size={13} strokeWidth={3} aria-hidden /> : step}
            </div>
          );

          return (
            <li key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                {href ? (
                  <Link
                    to={href}
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent"
                    aria-label={`Retour à l'étape ${label}`}
                  >
                    {circle}
                  </Link>
                ) : circle}
                <span className={cn(
                  'text-[11px] mt-1.5 font-medium whitespace-nowrap',
                  done   ? 'text-success'
                         : active ? 'text-primary-accent'
                                  : 'text-text-muted',
                )}>
                  {label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={cn(
                  'h-0.5 flex-1 mx-2 mb-5 transition-colors duration-300',
                  done ? 'bg-success' : 'bg-border',
                )} aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
