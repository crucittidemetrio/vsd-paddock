import { useMemo, useState } from 'react';
import { useDrivers } from '../hooks/useRoster';
import { useMessengerSend } from '../hooks/useDiscordMessenger';
import styles from './AdminMessenger.module.css';

const CHANNEL_OPTIONS = [
  { key: 'staff', label: '⛔ Staff-only' },
  { key: 'barsport', label: '🍻 Bar-sport' },
  { key: 'gestione_gare', label: '🏁 Gestione gare' },
];

// Stessa palette di VSD_COLORS in apps-script/Notifications.js — le
// chiavi devono coincidere esattamente (il backend risolve il colore
// da lì, qui servono solo i valori esadecimali per lo swatch).
const COLOR_OPTIONS = [
  { key: 'cyan', label: 'Cyan', hex: '#00d4ff' },
  { key: 'green', label: 'Verde', hex: '#4ade80' },
  { key: 'orange', label: 'Arancio', hex: '#fbbf24' },
  { key: 'red', label: 'Rosso', hex: '#f87171' },
  { key: 'blue', label: 'Blu', hex: '#3b82f6' },
  { key: 'purple', label: 'Viola', hex: '#a855f7' },
];

const TEXT_MAX_LEN = 1900;

const FAILURE_REASON_LABELS = {
  discord_non_collegato: 'Discord non collegato',
  http_403_open_channel: 'DM chiuse dal pilota (o bot non nel server)',
  http_404_open_channel: 'ID Discord non valido',
  http_403_send_message: 'DM chiuse dal pilota',
};

function failureReasonLabel(reason) {
  return FAILURE_REASON_LABELS[reason] || reason || 'Errore sconosciuto';
}

export default function AdminMessenger() {
  const [mode, setMode] = useState('channel');
  const [text, setText] = useState('');
  const [channelKey, setChannelKey] = useState(CHANNEL_OPTIONS[0].key);
  const [colorKey, setColorKey] = useState('cyan');
  const [target, setTarget] = useState('few');
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const driversQuery = useDrivers({ status: 'active' });
  const drivers = useMemo(
    () => (driversQuery.data || []).slice().sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [driversQuery.data]
  );
  const linkedDrivers = useMemo(() => drivers.filter(d => d.discord_id), [drivers]);

  const sendMutation = useMessengerSend();

  function toggleDriver(driverId) {
    setSelectedIds(ids => ids.includes(driverId) ? ids.filter(id => id !== driverId) : [...ids, driverId]);
  }

  function resetAfterSend() {
    setConfirmingAll(false);
  }

  async function handleSend() {
    setFeedback(null);
    if (!text.trim()) {
      setFeedback({ ok: false, message: 'Scrivi un testo prima di inviare.' });
      return;
    }

    if (mode === 'channel') {
      try {
        await sendMutation.mutateAsync({ mode: 'channel', text: text.trim(), channel_key: channelKey, color: colorKey });
        setFeedback({ ok: true, message: 'Messaggio pubblicato su ' + (CHANNEL_OPTIONS.find(c => c.key === channelKey)?.label || channelKey) + '.' });
        setText('');
      } catch (err) {
        setFeedback({ ok: false, message: err.message || 'Invio fallito.' });
      }
      return;
    }

    // mode === 'dm'
    if (target !== 'all' && selectedIds.length === 0) {
      setFeedback({ ok: false, message: 'Seleziona almeno un pilota.' });
      return;
    }
    if (target === 'all' && !confirmingAll) {
      setConfirmingAll(true);
      return;
    }

    try {
      const payload = {
        mode: 'dm',
        text: text.trim(),
        color: colorKey,
        target,
        ...(target !== 'all' ? { driver_ids: selectedIds } : { confirm: true }),
      };
      const res = await sendMutation.mutateAsync(payload);
      const failedList = res.failed || [];
      setFeedback({
        ok: true,
        message: `Inviato a ${res.sent}/${res.total} piloti.` + (failedList.length ? ` ${failedList.length} falliti.` : ''),
        failed: failedList,
      });
      setText('');
      setSelectedIds([]);
      resetAfterSend();
    } catch (err) {
      setFeedback({ ok: false, message: err.message || 'Invio fallito.' });
      resetAfterSend();
    }
  }

  const sendLabel = mode === 'dm' && target === 'all'
    ? (confirmingAll ? `Conferma invio a ${linkedDrivers.length} piloti` : 'Invia a tutti i piloti attivi')
    : 'Invia messaggio';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>Admin · Comunicazione</div>
        <h1 className={styles.title}>Compilatore messaggi Discord</h1>
        <p className={styles.sub}>
          Testo libero verso un canale Discord o in DM diretta a uno o più piloti. Non è un
          annuncio pubblico automatico — resta a tua discrezione cosa e a chi scrivere.
        </p>
      </div>

      <div className={styles.modeToggle}>
        <button
          type="button"
          className={mode === 'channel' ? styles.modeBtnActive : styles.modeBtn}
          onClick={() => { setMode('channel'); setFeedback(null); }}
        >
          📢 Canale Discord
        </button>
        <button
          type="button"
          className={mode === 'dm' ? styles.modeBtnActive : styles.modeBtn}
          onClick={() => { setMode('dm'); setFeedback(null); }}
        >
          ✉️ DM ai piloti
        </button>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel} htmlFor="messenger-text">Testo del messaggio</label>
          <textarea
            id="messenger-text"
            className={styles.textarea}
            rows={5}
            value={text}
            onChange={e => setText(e.target.value.slice(0, TEXT_MAX_LEN))}
            placeholder="Scrivi qui il messaggio…"
          />
          <div className={styles.charCount}>{text.length} / {TEXT_MAX_LEN}</div>
        </div>

        {mode === 'channel' && (
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="messenger-channel">Canale</label>
            <select
              id="messenger-channel"
              className={styles.select}
              value={channelKey}
              onChange={e => setChannelKey(e.target.value)}
            >
              {CHANNEL_OPTIONS.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Colore</label>
          <div className={styles.colorRow}>
            {COLOR_OPTIONS.map(c => (
              <button
                key={c.key}
                type="button"
                title={c.label}
                onClick={() => setColorKey(c.key)}
                className={colorKey === c.key ? styles.colorSwatchActive : styles.colorSwatch}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>

        {mode === 'dm' && (
          <>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Destinatari</label>
              <div className={styles.targetRow}>
                <button type="button" className={target === 'single' ? styles.targetBtnActive : styles.targetBtn}
                  onClick={() => { setTarget('single'); setConfirmingAll(false); setSelectedIds(ids => ids.slice(0, 1)); }}>
                  Singolo pilota
                </button>
                <button type="button" className={target === 'few' ? styles.targetBtnActive : styles.targetBtn}
                  onClick={() => { setTarget('few'); setConfirmingAll(false); }}>
                  Pochi piloti
                </button>
                <button type="button" className={target === 'all' ? styles.targetBtnActive : styles.targetBtn}
                  onClick={() => { setTarget('all'); setConfirmingAll(false); }}>
                  Tutti i piloti attivi
                </button>
              </div>
            </div>

            {target !== 'all' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  {target === 'single' ? 'Pilota' : 'Piloti'} ({drivers.length - linkedDrivers.length > 0 ? `${linkedDrivers.length} con Discord collegato / ${drivers.length} attivi` : `${drivers.length} attivi`})
                </label>
                <div className={styles.driverList}>
                  {drivers.map(d => {
                    const linked = !!d.discord_id;
                    const checked = selectedIds.includes(d.driver_id);
                    return (
                      <label key={d.driver_id} className={linked ? styles.driverRow : styles.driverRowDisabled}>
                        <input
                          type={target === 'single' ? 'radio' : 'checkbox'}
                          name="messenger-driver"
                          disabled={!linked}
                          checked={checked}
                          onChange={() => {
                            if (target === 'single') setSelectedIds([d.driver_id]);
                            else toggleDriver(d.driver_id);
                          }}
                        />
                        <span>{d.display_name}</span>
                        {!linked && <span className={styles.driverNote}>Discord non collegato</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {target === 'all' && (
              <p className={styles.formNote}>
                Verranno raggiunti {linkedDrivers.length} piloti attivi con Discord collegato
                (su {drivers.length} totali). Chi non ha ancora collegato l'account non riceverà nulla.
              </p>
            )}
          </>
        )}

        <button
          type="button"
          className={styles.submitBtn}
          disabled={sendMutation.isPending}
          onClick={handleSend}
        >
          {sendMutation.isPending ? 'Invio…' : sendLabel}
        </button>

        {confirmingAll && !sendMutation.isPending && (
          <button type="button" className={styles.cancelBtn} onClick={() => setConfirmingAll(false)}>
            Annulla
          </button>
        )}

        {feedback && (
          <div className={feedback.ok ? styles.resultSuccess : styles.resultError}>
            {feedback.message}
            {feedback.failed && feedback.failed.length > 0 && (
              <ul className={styles.failedList}>
                {feedback.failed.map(f => (
                  <li key={f.driver_id}>{f.display_name} — {failureReasonLabel(f.reason)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
