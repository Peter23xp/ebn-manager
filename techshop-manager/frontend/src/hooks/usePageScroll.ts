import { useEffect } from 'react';

/**
 * L'application bloque le défilement global (html, body, #root en overflow: hidden)
 * car les écrans métier gèrent leur propre zone de scroll. Les pages publiques
 * (accueil, connexions) défilent normalement : on lève ce blocage le temps de la page.
 */
export function usePageScroll() {
  useEffect(() => {
    const targets = [document.documentElement, document.body, document.getElementById('root')];
    targets.forEach(el => { if (el) el.style.overflow = 'auto'; });
    return () => targets.forEach(el => { if (el) el.style.overflow = ''; });
  }, []);
}
