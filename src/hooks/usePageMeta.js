import { useEffect } from 'react';

/**
 * Imposta title e meta description specifici per la pagina corrente.
 * Utile per SEO (Google esegue il JS e legge questi valori al crawl)
 * e per l'esperienza utente (tab del browser, bookmark, cronologia).
 *
 * Ripristina i valori precedenti allo smontaggio, così la navigazione
 * SPA tra pagine non lascia titoli "sporchi" in giro.
 *
 * @param {Object} params
 * @param {string} [params.title]
 * @param {string} [params.description]
 */
export function usePageMeta({ title, description } = {}) {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) document.title = title;

    const descTag = document.querySelector('meta[name="description"]');
    const prevDescription = descTag ? descTag.getAttribute('content') : null;
    if (description && descTag) {
      descTag.setAttribute('content', description);
    }

    return () => {
      document.title = prevTitle;
      if (descTag && prevDescription != null) {
        descTag.setAttribute('content', prevDescription);
      }
    };
  }, [title, description]);
}
