# Calendario editoriale Facebook/Instagram — Stagione UE144 2026

Obiettivo: usare i 6 round di UE144 (aperto a tutti, non solo piloti VSD) come motore di acquisizione esterna, e riportare sempre il traffico su vsd-paddock. Ogni post deve avere una ragione per esistere e un link di destinazione preciso — non pubblicare per riempire il calendario.

## Regola del link (il "viceversa" richiesto)

- **Bio Instagram** (un solo link possibile): punta a `vsd-paddock.vercel.app/ue144` per tutta la durata della stagione (13 set – 22 nov). A stagione conclusa, torna al link generico della home o a `/joinus` se in quel momento la priorità è il recruiting.
- **Pagina Facebook → campo "Sito web"**: `vsd-paddock.vercel.app` (fisso, non serve cambiarlo mai — su FB il link cliccabile va comunque messo per esteso in ogni post).
- **In ogni post**, il link nel testo (FB) o nello sticker link delle Stories (IG) cambia in base al contenuto:
  - Annuncio/anteprima gara → `/ue144`
  - Risultati/classifica → `/championships/chmp-lmu-ultimate-endurance-144-2026` (o `/ue144`, che ora mostra anche la classifica)
  - Storytelling pilota/recruiting → `/joinus`
  - Roster/team in generale → `/roster`

## Pilastri di contenuto

| Pilastro | Formato consigliato | Quando |
|---|---|---|
| Anteprima gara | Post statico (grafica circuito + meteo/moltiplicatore) | T-7 |
| Iscrizioni/entry list | Story con countdown sticker, o post se entry list interessante | T-2 |
| Live/race day | Stories multiple durante la gara (griglia, aggiornamenti, orari) | Giorno gara |
| Risultati | Post statico podio, stile banner già usato per i campionati | T+1 |
| Highlight/storytelling | Reel (sorpasso, incidente, onboard) o citazione pilota | T+3 |
| Recruiting | Post/reel "Unisciti a VSD" o "Corri con noi su UE144" | Nelle settimane senza gara |

Reel e Stories tendono a portare più reach su IG rispetto al post statico: se il tempo è poco, priorità a un Reel highlight dopo ogni gara piuttosto che a un post di solo testo.

## Calendario operativo (date reali)

| Round | T-7 (anteprima) | T-2 (iscrizioni) | Gara | T+1 (risultati) | T+3 (highlight) |
|---|---|---|---|---|---|
| R1 Sebring | 06 set | 11 set | **13 set** | 14 set | 16 set |
| R2 Imola | 20 set | 25 set | **27 set** | 28 set | 30 set |
| R3 Spa-Francorchamps | 04 ott | 09 ott | **11 ott** | 12 ott | 14 ott |
| R4 Fuji Speedway | 18 ott | 23 ott | **25 ott** | 26 ott | 28 ott |
| R5 Monza | 01 nov | 06 nov | **08 nov** | 09 nov | 11 nov |
| R6 Le Mans (finale) | 15 nov | 20 nov | **22 nov** | 23 nov | 25 nov + recap stagione il 29 nov |

Tutti i round cadono di domenica: entry list e anteprima il venerdì prima danno un buon anticipo per chi decide last-minute di iscriversi (le iscrizioni chiudono 48h prima, quindi il post T-2 è anche l'ultimo richiamo utile).

Nota Spa (R3): il regolamento prevede variabilità meteo forte (Sereno → Pioggia → Asciutto, moltiplicatore 10×) — buon contenuto per l'anteprima ("condizioni imprevedibili, chi si adatta vince").

## Cosa postare nelle settimane senza gara (gap di ~11 giorni tra T+3 e il prossimo T-7)

- Spotlight su un pilota VSD (foto + 2-3 risultati, riusa i dati già disponibili in `/roster/:driverId`)
- Classifica aggiornata di UE144 a metà stagione
- Riciclo testimonial Discord del GR86 (già raccolti per JoinUs) in formato grafico per IG
- Menzione sponsor Total Paint (asset logo già pronto in `src/assets/total-paint-logo.webp`)
- Richiamo generico "Unisciti a VSD" con link a `/joinus`

## Asset già pronti da riusare

- `public/ue144.banner.jpg` — banner principale UE144, ora anche usato come og:image quando condividi `/ue144`
- `public/og-image.png` — immagine generica team
- Testi bilingue IT/EN già scritti: `outputs/discord_info_ue144.md`, `outputs/briefing_ue144.md`, `outputs/social_ue144.md`
- Hai Canva collegato: puoi generare rapidamente varianti "instagram_post" o "facebook_post" partendo da questi asset e testi senza aprire un editor esterno.

## Prossimo passo pratico

Prima del 6 settembre (T-7 di R1) vanno sistemati: bio Instagram puntata a `/ue144`, campo sito web Facebook, e il primo post di anteprima. Se vuoi, preparo già ora il testo e la grafica del post T-7 per Sebring.
