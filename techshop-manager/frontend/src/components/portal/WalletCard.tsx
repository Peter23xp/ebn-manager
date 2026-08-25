import { Wallet, ArrowRight, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';

interface WalletCardProps {
  solde: number;
  gainsTotaux: number;
}

export function WalletCard({ solde, gainsTotaux }: WalletCardProps) {
  const [showWithdraw, setShowWithdraw] = useState(false);

  return (
    <>
      <div 
        className="rounded-2xl p-5 text-white shadow-lg relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0A1628 0%, #1a3260 100%)' }}
      >
        {/* Decor */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
        <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-[#b45309]/20 rounded-full blur-xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={16} className="text-[#b45309]" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">
              Solde disponible
            </p>
          </div>
          
          <div className="flex items-baseline gap-1 my-2">
            <span className="text-4xl font-bold font-mono">${solde.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            <span className="text-sm text-white/60">USD</span>
          </div>

          <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/10">
            <div>
              <p className="text-[10px] text-white/50 uppercase tracking-wider mb-0.5">Gains totaux générés</p>
              <p className="text-sm font-semibold text-white/90">
                ${gainsTotaux.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <button
              onClick={() => setShowWithdraw(true)}
              className="flex items-center gap-1.5 bg-[#b45309] hover:bg-[#92400e] text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
            >
              Retirer <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {showWithdraw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowWithdraw(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#0A1628] mb-2">Demande de retrait</h3>
            <p className="text-sm text-neutral-600 mb-6">
              Votre solde actuel est de <strong>${solde.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>.<br/><br/>
              Pour effectuer un retrait (Mobile Money, Espèces en boutique ou Virement), veuillez contacter l'administration via WhatsApp ou vous rendre dans une de nos boutiques.
            </p>
            
            <a 
              href="https://wa.me/243974752784?text=Bonjour,%20je%20souhaite%20faire%20un%20retrait%20sur%20mon%20portefeuille%20partenaire."
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full h-12 bg-[#25D366] hover:bg-[#1da855] text-white font-bold rounded-xl transition-colors mb-3"
            >
              Contactez-nous sur WhatsApp
            </a>
            
            <button
              onClick={() => setShowWithdraw(false)}
              className="w-full h-11 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold rounded-xl transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
