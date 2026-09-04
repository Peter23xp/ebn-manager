import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Search } from 'lucide-react';
import { PageSEO } from '@/components/seo/PageSEO';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <>
      <PageSEO
        title="Page introuvable - 404"
        description="La page que vous recherchez n'existe pas ou a été déplacée."
      />
      
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-neutral-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          {/* 404 Animation */}
          <div className="mb-8">
            <div className="relative inline-block">
              <div className="text-[120px] font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#1E3A5F] to-[#2E86C1] leading-none">
                404
              </div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-10">
                <Search size={80} className="text-[#1E3A5F] animate-pulse" />
              </div>
            </div>
          </div>

          {/* Message */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[#0A1628] mb-3">
              Page introuvable
            </h1>
            <p className="text-neutral-600 text-base leading-relaxed">
              La page que vous recherchez n'existe pas ou a été déplacée.
              Vérifiez l'URL ou retournez à l'accueil.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 border-neutral-200 bg-white text-[#0A1628] font-semibold hover:border-[#2E86C1] hover:text-[#2E86C1] transition-all duration-150"
            >
              <ArrowLeft size={18} />
              Retour
            </button>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#1E3A5F] text-white font-semibold hover:bg-[#2E86C1] transition-all duration-150 shadow-lg"
            >
              <Home size={18} />
              Accueil
            </button>
          </div>

          {/* Suggestions */}
          <div className="mt-12 p-6 rounded-2xl bg-white border border-neutral-100 shadow-sm text-left">
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-3">
              Liens utiles
            </p>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full text-left px-4 py-2 rounded-lg text-sm text-neutral-700 hover:bg-blue-50 hover:text-[#2E86C1] transition-colors"
              >
                → Tableau de bord
              </button>
              <button
                onClick={() => navigate('/clients')}
                className="w-full text-left px-4 py-2 rounded-lg text-sm text-neutral-700 hover:bg-blue-50 hover:text-[#2E86C1] transition-colors"
              >
                → Gestion des clients
              </button>
              <button
                onClick={() => navigate('/sales/pos')}
                className="w-full text-left px-4 py-2 rounded-lg text-sm text-neutral-700 hover:bg-blue-50 hover:text-[#2E86C1] transition-colors"
              >
                → Point de vente (POS)
              </button>
              <button
                onClick={() => navigate('/mlm')}
                className="w-full text-left px-4 py-2 rounded-lg text-sm text-neutral-700 hover:bg-blue-50 hover:text-[#2E86C1] transition-colors"
              >
                → Réseau MLM
              </button>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-8 text-xs text-neutral-400">
            TechShop Manager © {new Date().getFullYear()} — Progress Business
          </p>
        </div>
      </div>
    </>
  );
}
