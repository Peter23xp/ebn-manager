import { useEffect } from 'react';

/**
 * L'application fige html, body et #root (height: 100% + overflow: hidden) car
 * les écrans métier gèrent leur propre zone de défilement. Les pages publiques
 * (accueil, connexions, pages légales) doivent défiler comme un site classique.
 *
 * On rend donc au document un défilement unique : body et #root reprennent une
 * hauteur naturelle. Les passer seulement en overflow: auto créait deux zones
 * de défilement imbriquées (#root + document) et laissait le document défiler
 * dans le vide après le pied de page.
 */
export function usePageScroll() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const styles: Array<[HTMLElement | null, Partial<CSSStyleDeclaration>]> = [
      [html, { overflow: 'auto', height: 'auto' }],
      [body, { overflow: 'visible', height: 'auto' }],
      [root, { overflow: 'visible', height: 'auto' }],
    ];
    for (const [el, s] of styles) if (el) Object.assign(el.style, s);
    return () => {
      for (const [el, s] of styles) if (el) for (const k of Object.keys(s)) (el.style as unknown as Record<string, string>)[k] = '';
    };
  }, []);
}
