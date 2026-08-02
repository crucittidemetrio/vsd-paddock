# Brand assets — VSD Paddock

Logo ufficiale da usare in tutti i documenti (README, docs, guide, presentazioni)
dove si parla di vsd-paddock: `vsd-paddock-logo.png` (653×382, sfondo trasparente).

## Uso linkato a vsd-paddock.vercel.app

**Markdown** (README, docs/*.md):
```md
[![VSD Paddock](docs/brand/vsd-paddock-logo.png)](https://vsd-paddock.vercel.app/)
```

**HTML** (pagine statiche, post, email):
```html
<a href="https://vsd-paddock.vercel.app/">
  <img src="docs/brand/vsd-paddock-logo.png" alt="VSD Paddock" width="220">
</a>
```

**Word / PDF**: inserisci l'immagine, poi applica un collegamento ipertestuale
a `https://vsd-paddock.vercel.app/` sopra l'immagine (Inserisci → Collegamento).
Se generato da qui, lo imposto io automaticamente.

**Social/immagini statiche** (Instagram, Discord, poster): il link cliccabile
non esiste sull'immagine in sé — il logo va comunque accompagnato da un link
testuale nella bio/didascalia.

## Nota

Questo logo è per documenti/materiale esterno. Il logo usato *dentro* la web app
(header, favicon) è un asset diverso e separato: `src/assets/vsd-logo.png/.webp`,
gestito da `src/components/shared/Logo.jsx` — non toccato da questo file.
