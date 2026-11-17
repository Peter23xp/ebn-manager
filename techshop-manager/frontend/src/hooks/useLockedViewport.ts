import { useEffect } from 'react';

const EDITABLE = 'input, textarea, select, [contenteditable="true"]';

/**
 * Les écrans de l'application (AppLayout, PortalLayout) sont une boîte fixe de
 * 100dvh : html, body et #root ne défilent jamais, seule la zone <main> défile.
 *
 * Sur iPhone (Safari), quand le clavier s'ouvre, iOS fait quand même défiler la
 * fenêtre pour amener le champ au-dessus du clavier. Quand le clavier se ferme,
 * il ne la ramène pas toujours en haut : l'en-tête reste hors écran et la zone
 * qu'occupait le clavier reste vide. Comme html est en overflow: hidden,
 * l'utilisateur ne peut pas corriger en faisant défiler.
 *
 * Ce hook remet la fenêtre à zéro dès que le clavier se referme (le champ perd
 * le focus sans qu'un autre champ le prenne, ou le viewport visuel retrouve sa
 * hauteur pleine).
 */
export function useLockedViewport() {
  useEffect(() => {
    const reset = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
      for (const el of [document.documentElement, document.body, document.getElementById('root')]) {
        if (el && (el.scrollTop !== 0 || el.scrollLeft !== 0)) {
          el.scrollTop = 0;
          el.scrollLeft = 0;
        }
      }
    };

    let timer: number | undefined;
    const onFocusOut = () => {
      window.clearTimeout(timer);
      // Laisser le focus se poser : passer d'un champ à l'autre garde le clavier ouvert.
      timer = window.setTimeout(() => {
        if (document.activeElement?.matches(EDITABLE)) return;
        reset();
      }, 120);
    };

    const vv = window.visualViewport;
    const onViewportResize = () => {
      // Clavier fermé : le viewport visuel a retrouvé la hauteur de la fenêtre.
      if (vv && vv.scale <= 1.01 && vv.height >= window.innerHeight - 2) reset();
    };

    document.addEventListener('focusout', onFocusOut);
    vv?.addEventListener('resize', onViewportResize);
    window.addEventListener('orientationchange', reset);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', onViewportResize);
      window.removeEventListener('orientationchange', reset);
    };
  }, []);
}
