import { useState } from 'react';
import { upload } from '@vercel/blob/client';
import { useAuth } from './useAuth';

const DEFAULT_ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Upload diretto a Vercel Blob, stesso pattern già in produzione per il
 * Media Gallery del Social Manager (SocialManager.jsx) — riusato qui per
 * chiudere due gap chiesti da Demetrio (21/09/2026): galleria foto Gare
 * (#380) e avatar Roster (#381), entrambi finora solo incolla-URL/DB
 * diretto. `/api/media-upload.js` è già generico: verifica il token
 * (legacy Discord OAuth via Apps Script, lo stesso di `useAuth().token`)
 * senza richiedere un ruolo specifico — è il chiamante a decidere chi può
 * invocare l'hook (qui: solo pannelli staff/admin).
 *
 * Non salva alcun metadato da nessuna parte: ritorna solo `{url, filename,
 * type}` per ogni file, il chiamante decide dove metterlo (gallery_urls,
 * avatar_url, ...).
 */
export function useBlobUpload({ allowedTypes = DEFAULT_ALLOWED } = {}) {
  const { token } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []).filter(
      f => allowedTypes.length === 0 || allowedTypes.includes(f.type)
    );
    if (files.length === 0) return [];

    setError(null);
    setUploading(true);
    const results = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Caricamento ${i + 1}/${files.length}: ${file.name}…`);
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/media-upload',
          clientPayload: JSON.stringify({ token }),
        });
        results.push({ url: blob.url, filename: file.name, type: file.type });
      }
      return results;
    } catch (err) {
      setError(err.message || 'Errore durante il caricamento');
      throw err;
    } finally {
      setUploading(false);
      setProgress('');
    }
  }

  return { uploadFiles, uploading, progress, error, setError };
}
