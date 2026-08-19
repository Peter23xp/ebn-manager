import { HelpCircle, MessageSquarePlus, BookOpen } from 'lucide-react';
import { DeveloperCard } from '@/components/support/DeveloperCard';
import { FaqAccordion } from '@/components/support/FaqAccordion';
import { SupportForm } from '@/components/support/SupportForm';

export default function SupportPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-light/40">
          <HelpCircle size={20} className="text-primary-accent" aria-hidden />
        </div>
        <div>
          <h1 className="text-[20px] font-extrabold text-primary leading-tight">Support technique</h1>
          <p className="text-[12px] text-text-muted">EBN Manager — assistance et documentation</p>
        </div>
      </div>

      {/* Carte développeur */}
      <DeveloperCard />

      {/* FAQ */}
      <section aria-labelledby="faq-title">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen size={16} className="text-primary-accent flex-shrink-0" aria-hidden />
          <h2 id="faq-title" className="text-[15px] font-bold text-primary">
            Questions fréquentes
          </h2>
        </div>
        <FaqAccordion />
      </section>

      {/* Formulaire ticket */}
      <section aria-labelledby="ticket-title">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquarePlus size={16} className="text-primary-accent flex-shrink-0" aria-hidden />
          <h2 id="ticket-title" className="text-[15px] font-bold text-primary">
            Soumettre un ticket
          </h2>
        </div>
        <div className="rounded-xl border border-border bg-white shadow-sm p-5">
          <p className="text-[12px] text-text-muted mb-5">
            Vous n'avez pas trouvé de réponse dans la FAQ ? Décrivez votre problème ci-dessous.
            Notre équipe vous répondra dans les meilleurs délais.
          </p>
          <SupportForm />
        </div>
      </section>

    </div>
  );
}
