import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

/**
 * Déconnexion complète :
 *  - révoque le cookie de rafraîchissement côté serveur (sans attendre : la
 *    déconnexion locale ne doit jamais bloquer, même hors ligne) ;
 *  - vide le cache des requêtes, pour qu'aucune donnée de l'utilisateur
 *    précédent ne reste en mémoire sur un appareil partagé en boutique ;
 *  - efface la session locale et revient à l'accueil.
 */
export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);

  return useCallback(() => {
    authApi.logout().catch(() => { /* hors ligne ou session déjà expirée */ });
    logout();
    queryClient.clear();
    navigate('/', { replace: true });
  }, [logout, navigate, queryClient]);
}
