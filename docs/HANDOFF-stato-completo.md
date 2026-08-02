# ═══════════════════════════════════════════════════════════════
# VSD PADDOCK — HANDOFF STATO COMPLETO (per ripartire in nuova chat)
# Aggiornato: sessione 1 agosto 2026
# ═══════════════════════════════════════════════════════════════

## COME USARMI
Incolla questo documento all'inizio della nuova chat. Sostituisce integralmente la
versione precedente (26 luglio, focus UE144/SEO/notifiche — quell'arco è chiuso,
deployato, non più attivo). Contiene: chi sei, stato del progetto, cosa è fatto, cosa
è aperto, priorità. Claude agisce come team principal e-sports + senior dev: critico,
verifica invece di assumere, frena lo scope creep. Demetrio gestisce tutto da solo —
l'obiettivo di ogni feature è ridurre il lavoro manuale, non aggiungerne.

## CHI / COSA
Demetrio Crucitti (VSD005, #69), founder e unico dev di VSD Paddock — web app per il
suo team sim racing endurance. Stack: React 19 + Vite + TanStack Query → Vercel
(Hobby, **solo `main`, nessuna preview deployment** — ogni verifica visiva richiede
push + hard reload/incognito per bypassare cache). Backend: Google Apps Script +
Google Sheets (`clasp push` aggiorna solo l'editor — serve SEMPRE Deploy "Nuova
versione" a mano per andare in produzione, vedi bug ricorrente sotto). Storage file
(nuovo, questa sessione): Vercel Blob, store `vsd-paddock-blob`, regione Parigi
(CDG1), accesso Public. Repo: crucittidemetrio/vsd-paddock, locale
`C:\Users\Demetrio\Dev\vsd-paddock`.

**⚠️ Stato particolare del repo git in questo ambiente sandbox**: `HEAD` locale è
fermo su un branch vecchio (`chore/academy-nav-promote` @ `915dd52`), ma
`refs/heads/main` (il ref "vero" con cui lavoro) è avanti e il **contenuto dei file
su disco corrisponde sempre a `refs/heads/main`**, non a HEAD. Questo fa sì che
`git status` mostri come "modified" file che in realtà sono già a posto — è un
artefatto noto di questo ambiente, non un problema reale. Per i commit ho sempre
usato il workflow di bypass: `GIT_INDEX_FILE` temporaneo + `git read-tree
refs/heads/main` + `git add` solo dei file toccati + `git commit-tree -p
refs/heads/main` + `git update-ref refs/heads/main`. Il sandbox non ha credenziali
di push: ogni volta è Demetrio a fare `git push origin main` dal suo terminale reale
(stesso filesystem montato, quindi il push si riflette qui su
`remotes/origin/main`). **Verificato**: l'ultimo push risulta effettuato
(`remotes/origin/main` allineato a `e62898f`).

Esiste anche qualche file spazzatura da 0 byte (`src/pages/SocialManager_prevcheck.jsx`,
`src/pages/__orig_SocialManager.jsx`) che non riesco a cancellare per un blocco del
filesystem condiviso (`Operation not permitted` anche con `rm -f`/`chmod`). Sono
untracked, innocui, ignorati da git — se Demetrio vuole toglierli di mezzo può
farlo lui da Explorer, altrimenti si possono ignorare indefinitamente.

**Workflow di sicurezza mandatorio** (richiesto esplicitamente da Demetrio, vale per
ogni modifica): verifica sintattica (`node --check` per Apps Script, `npx vite
build --outDir /tmp/...` per il frontend, dato che `npm run build` normale spesso
fallisce nel pulire `dist/` per lo stesso motivo di permessi del mount — usare
sempre un outDir temporaneo per verificare) → commit solo dopo verifica pulita.

## STATO REPO
`refs/heads/main` @ `e62898f`, pushato e confermato su `origin/main`. Nessun branch
feature pendente da mergiare.

---

## FASE CORRENTE (chiusa in questa sessione): Social Manager completo

Arco iniziato con "voglio uno strumento per gestire i social" (sessioni precedenti,
non coperte in dettaglio da questo handoff) e **esteso in questa sessione** su
richiesta esplicita di Demetrio con tre aggiunte: provider AI selezionabile, piano
editoriale automatico + Discord, e infine — dopo che Demetrio ha mostrato uno
screenshot di un mockup con un layout diverso e ha detto esplicitamente "gestisco
tutto da solo, mi serve il massimo aiuto possibile" — **Media Gallery** con upload
file reale e promozione del Piano Editoriale a sezione propria (invece di reskin
estetico completo, deliberatamente scartato: vedi "decisioni prese" sotto).

Percorso: `/social-manager` (route admin-only, verificare in `src/App.jsx` /
`Sidebar.jsx` per l'esatto path e la voce di menu).

## ✅ FATTO E DEPLOYATO (questa sessione, in ordine cronologico)

**AI a due provider**
- `payload.provider` selezionabile lato frontend: `gemini` (default, gratuito,
  `gemini-3.5-flash` via Gemini Interactions API) o `anthropic` (a pagamento,
  `claude-haiku-4-5-20251001`, tenuto solo come opzione futura di confronto qualità —
  Demetrio non vuole configurarlo/usarlo ora per costo).
- Due bug fix in sequenza sul path Gemini: modello deprecato
  (`gemini-2.5-flash` → `gemini-3.5-flash`) e risposta troncata/frammentata
  (`thinking_level: 'low'`→`'minimal'`, `max_output_tokens` 400→600, estrazione
  testo passata da `.find()` singolo blocco a `.filter().map().join()` multi-blocco).

**Piano editoriale automatico**
- 5 "pilastri" di contenuto per ogni gara (anteprima T-7, iscrizioni T-2, live T0,
  risultati T+1, highlight T+3), calcolati dinamicamente dalla data gara — funziona
  per qualunque gara nel foglio `Races`, non solo UE144.
- Schema `SocialPosts` esteso (append-only) con `race_id`/`pillar` per collegare un
  post a uno slot del piano; poi ulteriormente con `media_url` (vedi Media Gallery).
- Bottone "+ Crea bozza" sugli slot mancanti → precompila form Post via oggetto
  `suggestion` sollevato a livello del componente root (`SocialManager()`).
- **Estratto in questa sessione dal tab Calendario a un tab proprio** ("Piano
  editoriale", secondo nella barra dopo Dashboard) — prima era annegato dentro
  Calendario, poco visibile.

**Discord come piattaforma social a tutti gli effetti**
- Discord aggiunto a `PLATFORM_OPTIONS` (creazione post) e a `METRICS_PLATFORMS`.
- `social.discord.stats`: numero membri reale via endpoint pubblico Discord
  `/invites/{code}?with_counts=true` (**nessun bot/token necessario** — deliberata
  scelta architetturale: un bot Composio esiste ma vive solo nella sessione agente,
  non può essere "passato" al backend Apps Script standalone). Config: Script
  Property `DISCORD_INVITE_CODE` = `GQ3Xg8efxT` (link permanente generato da me via
  browser, non scade mai).
- Bottone "🔄 Aggiorna da Discord" nel tab Metriche pre-compila il campo follower col
  dato reale.

**Media Gallery (novità principale di questa sessione, non esisteva prima)**
- Motivazione: Demetrio ha mostrato un mockup con sidebar diversa + voce "Media
  Gallery" assente nell'app. Ho consigliato esplicitamente di **non** rifare la UI a
  sidebar (costo di styling puro, nessun beneficio reale per un solo utente) e di
  **non** frammentare "Gestione FB"/"Gestione IG" in pagine separate (più click per
  fare la stessa cosa). Ho invece proposto — e Demetrio ha scelto — upload file
  reale (non solo libreria di URL incollati a mano come per i poster gara) +
  mantenere il layout a topbar/tab esistente.
- Storage: **Vercel Blob**, store `vsd-paddock-blob` (Public, regione Parigi CDG1),
  collegato al progetto `vsd-paddock` con env var `BLOB_READ_WRITE_TOKEN` +
  `BLOB_STORE_ID` + `BLOB_WEBHOOK_PUBLIC_KEY` su Production e Preview.
- `api/media-upload.js` (nuova funzione Vercel, Node runtime): genera token per
  upload diretto browser→Blob via `@vercel/blob/client` `handleUpload` — bypassa il
  limite ~4.5MB del body delle funzioni serverless.
- `api/media-delete.js`: cancella il file da Blob dato l'URL (usa `del()`,
  `BLOB_READ_WRITE_TOKEN` mai esposto al browser).
- Nuovo tab foglio `SocialMedia` (headers: `media_id, url, filename, media_type,
  tags, uploaded_by, uploaded_at`) + 3 action (`social.media.list/add/remove`) in
  `apps-script/SocialManager.js` + `Codice.js`. Il file vive su Blob, i metadati sul
  foglio — Apps Script non tocca mai i byte del file.
- Nuovo tab frontend "Media Gallery": dropzone drag&drop, tag, ricerca, "Usa nel
  post" (passa `media_url` a PostCreator senza svuotare il testo già scritto — vedi
  distinzione `suggestion.type === 'media'` vs `'pillar'` in `SocialManager.jsx`),
  "Copia URL" (riusabile anche per i poster gara, che restano a incolla-URL-a-mano).
- `SocialPosts` esteso con `media_url` (append-only).

**Fix layout minore**
- Barra dei tab (`.tabs`) andava a piena larghezza mentre `.content` sotto è
  centrato con `max-width: 980px` → su schermi larghi il menu sembrava "spostato"
  rispetto all'area di lavoro. Fix: wrapper `.tabsInner` con stessa
  max-width/centratura/padding di `.content`.

## 🔧 DECISIONI PRESE (per non ridiscuterle da capo)

- **Reskin completo a sidebar (dal mockup mostrato da Demetrio): scartato.** Motivo:
  puro costo di styling, zero funzionalità aggiuntiva, sidebar fissa toglie spazio
  su schermi stretti. Se Demetrio lo richiede di nuovo esplicitamente si può fare,
  ma non è nel backlog implicito.
- **"Gestione FB"/"Gestione IG" come pagine separate (dal mockup): scartato.** La
  vista Metriche unificata (IG+FB+Discord in un'unica tabella/form) è più efficiente
  per chi gestisce tutto da solo — frammentare peggiorerebbe l'usabilità.
- **Upload reale via Vercel Blob (non libreria di URL manuali)**: scelto
  esplicitamente da Demetrio via domanda diretta, perché riduce lavoro manuale
  quotidiano (drag&drop vs. caricare su Drive/Imgur e incollare link).
- Nessun connettore di pubblicazione automatica Facebook/Instagram esiste
  (verificato nel registro MCP, di nuovo in questa sessione) — "pubblicato" nel
  Social Manager significa sempre "Demetrio l'ha postato a mano e lo segna".

## ⚠️ BUG RICORRENTE DA CONOSCERE (successo 2 volte in questa sessione)

Sintomo: `{ok:false, error:'Action sconosciuta: <action>'}` anche con codice locale
corretto e registrato. Causa: `clasp push` sincronizza solo l'**editor** Apps
Script, non pubblica una nuova **Versione** sull'URL `/exec` live. Fix, sempre lo
stesso: Apps Script editor → **Gestisci deployment → matita (✎) → dropdown
"Nuova versione" (non lasciare il numero esistente) → Esegui il deployment**, poi
hard refresh del browser. Diagnosi rapida se ricapita: (1) grep locale per
confermare che l'action è registrata sia in `ACTIONS` (`Codice.js`) sia come
funzione handler, (2) chiedere l'output completo di `clasp push` per confermare che
il file giusto è stato trasferito, (3) screenshot del dialog "Gestisci deployment"
PRIMA di cliccare nulla per vedere il numero di Versione reale.

## ⚠️ AZIONI MANUALI ANCORA IN SOSPESO (nessuna richiede codice)

1. **Verificare in produzione** che Media Gallery funzioni end-to-end (upload,
   visualizzazione griglia, "Usa nel post", delete) — il push è confermato ma non
   c'è ancora stata conferma esplicita di test riuscito dopo l'ultimo commit
   (`e62898f`, fix allineamento menu).
2. Eseguire `setupSocialManagerTabs()` nell'editor Apps Script (crea il tab
   `SocialMedia` + aggiunge la colonna `media_url` a `SocialPosts`) — **verificare
   che sia già stato fatto**, era l'ultimo passo dato prima del fix del menu.
3. `clasp push` + Deploy "Nuova versione" per la action `social.media.*` — stesso
   discorso, verificare se già fatto.
4. Prossimo contenuto con scadenza reale (ereditato dall'arco precedente, mai
   confermato come completato): post T-7 per Sebring, la prima gara UE144 (13
   settembre 2026) — andrebbe preparato entro il 6 settembre. Ora che il Piano
   Editoriale genera lo slot automaticamente, questo è il primo test reale della
   feature in condizioni normali d'uso.

## REMINDER OPERATIVI (validi sempre, non solo per questa fase)

- `apps-script/` → `clasp push` + **Deploy "Nuova versione"** nell'editor (il push da
  solo NON aggiorna la web app pubblica — causa il bug "Action sconosciuta" sopra).
- `src/` → push su `main` + solo allora è visibile (niente preview deploy su
  Vercel Hobby). Hard reload/incognito per bypassare cache dopo ogni deploy.
- Registrare SEMPRE una nuova action sia in `client.js` sia nello switch di
  `realApi.js` — dimenticare il secondo produce un fallimento silenzioso che React
  Query ingoia senza errore visibile in console.
- `npm run build` locale spesso fallisce a ripulire `dist/` per un problema di
  permessi del mount Windows↔Linux (`EPERM unlink`) — non è un bug del codice, usare
  `npx vite build --outDir /tmp/qualcosa` per verificare senza toccare `dist/` reale.
- Ambiente sandbox: `git` dà quasi sempre warning `unable to unlink tmp_obj...` sugli
  oggetti — è lo stesso problema di permessi mount, gli oggetti vengono comunque
  scritti correttamente (verificare con `git fsck` se in dubbio, non con l'assenza
  di warning).
- SICUREZZA: mai incollare webhook/token/API key in chat. Se esposti, rigenerarli.
  `access_code`/`BLOB_READ_WRITE_TOKEN`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY` mai
  esposti, a nessun livello — tutti in Script Properties (Apps Script) o env var
  Vercel, mai nel codice.

## MEMORIA CONTESTUALE VSD

- 25 piloti attivi pubblici (28 totali incl. inactive; VSD001 = account sistema).
- 4 sim (LMU primario, preferito da Demetrio).
- UE144: campionato endurance LMU, 6 round, 3 classi (Hypercar/LMP2/LMGT3), aperto
  a piloti esterni senza requisito membership VSD, iscrizioni su SimGrid, partenza
  13 settembre 2026.
- Colori brand VSD riusati ovunque: cyan `#00d9ff`/`#00e5ff`, blu `#3b82f6`, arancio
  `#f5a623`/`#fbbf24`, rosso `#f87171`, navy scuro `#060d1f`.
- Preferenze di stile di Demetrio (da istruzioni permanenti): risposte concise,
  dirette, no premesse cerimoniali. Su bozze scritte: agire da senior editor,
  critico, senza paura di smontare. Su codice: agire da programmatore esperto. Su
  Sim Racing/VSD: agire da team manager e-sports esperto.

## APERTURA RACCOMANDATA PER LA NUOVA CHAT
> "Social Manager completo (AI dual-provider, piano editoriale, Discord, Media
> Gallery). Ultimo push confermato (`e62898f`). Da verificare: setup tab
> SocialMedia + deploy Apps Script + test upload in produzione. Prossimo: [post
> T-7 Sebring entro il 6 settembre — oppure altro, a scelta di Demetrio]."
