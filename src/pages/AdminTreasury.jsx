import { useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTreasury, useAddTreasuryEntry, useUpdateTreasuryEntry, useRemoveTreasuryEntry } from '../hooks/useTreasury';
import styles from './AdminTreasury.module.css';

const TYPES = [
  { value: 'entrata', label: 'Entrata' },
  { value: 'uscita', label: 'Uscita' },
];

function fmtEuro(n) {
  return (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function fmtEuroCompact(n) {
  // Versione senza decimali/simbolo ripetuto — per assi ed etichette del
  // grafico, dove lo spazio è poco e i centesimi sono rumore.
  return (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
}

// '2026-09' → 'set 2026' — le date dei movimenti sono già ISO (YYYY-MM-DD
// o simile), quindi la chiave mese è solo una fetta di stringa: niente
// parsing Date che rischi di scivolare di fuso orario sul primo del mese.
function fmtMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });
}

// Genera e scarica un CSV client-side dei movimenti passati — niente
// round-trip al backend, i dati sono già in memoria dalla query.
function downloadTreasuryCsv(entries) {
  const header = ['Data', 'Tipo', 'Importo', 'Controparte', 'Descrizione'];
  const rows = entries.map(e => [
    e.date ? String(e.date).slice(0, 10) : '',
    e.type === 'entrata' ? 'Entrata' : 'Uscita',
    (Number(e.amount) || 0).toFixed(2).replace('.', ','),
    e.counterparty || '',
    e.description || '',
  ]);
  const escapeCsv = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map(r => r.map(escapeCsv).join(';')).join('\r\n');
  // BOM per far riconoscere l'UTF-8 a Excel su Windows (altrimenti storpia gli accenti)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `vsd-cassa-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function EmptyForm() {
  const today = new Date().toISOString().slice(0, 10);
  return { date: today, type: 'entrata', amount: '', counterparty: '', description: '' };
}

/**
 * AdminTreasury — Cassa / rendiconto team. Sostituisce l'inserimento
 * manuale sul foglio Google esterno "Rendiconto Comunity Virtual
 * Sim-Driver": entrate (donazioni community) e uscite (spese) si
 * registrano da qui. Solo admin/Team Principal (dato finanziario).
 */
export default function AdminTreasury() {
  const [typeFilter, setTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EmptyForm);
  const [formError, setFormError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  // Sempre TUTTI i movimenti, senza filtro lato backend: il filtro
  // entrate/uscite qui sotto è solo per la vista elenco. Prima il tipo
  // veniva passato alla query stessa, quindi con "Entrate" selezionato
  // il backend restituiva SOLO entrate — e "Saldo cassa"/i conteggi dei
  // chip finivano per riflettere il sottoinsieme filtrato invece del
  // totale reale (uscite azzerate → saldo mostrato = entrate). Bug non
  // ipotetico: è esattamente il tipo di numero che un Team Principal
  // legge una volta e considera vero.
  const query = useTreasury();
  const entries = useMemo(() => query.data?.entries || [], [query.data]);
  const addMutation = useAddTreasuryEntry();
  const updateMutation = useUpdateTreasuryEntry();
  const removeMutation = useRemoveTreasuryEntry();

  // Riepilogo per persona (donatori) — calcolato sempre su TUTTE le
  // entrate, indipendentemente dal filtro attivo sulla lista movimenti.
  const donorSummary = useMemo(() => {
    const byDonor = new Map();
    entries.filter(e => e.type === 'entrata').forEach(e => {
      const key = e.counterparty || '(sconosciuto)';
      const cur = byDonor.get(key) || { name: key, total: 0, count: 0 };
      cur.total += Number(e.amount) || 0;
      cur.count += 1;
      byDonor.set(key, cur);
    });
    return [...byDonor.values()].sort((a, b) => b.total - a.total);
  }, [entries]);

  // Riepilogo uscite — ordinate per importo decrescente.
  const expenseList = useMemo(() => {
    return entries.filter(e => e.type === 'uscita')
      .slice()
      .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
  }, [entries]);

  // Totali sempre calcolati sul set completo (vedi commento sopra),
  // non su query.data.totalIn/Out che il backend calcola DOPO il filtro.
  const totalIn = useMemo(
    () => entries.filter(e => e.type === 'entrata').reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [entries]
  );
  const totalOut = useMemo(
    () => entries.filter(e => e.type === 'uscita').reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [entries]
  );
  const balance = totalIn - totalOut;

  const visibleEntries = useMemo(
    () => entries
      .filter(e => !typeFilter || e.type === typeFilter)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [entries, typeFilter]
  );

  // Andamento mensile — bucket per YYYY-MM (slice della data ISO, niente
  // parsing Date per evitare scivoloni di fuso orario sul primo del
  // mese), poi saldo cumulato mese su mese per il trend di cassa.
  const monthlyBalanceData = useMemo(() => {
    if (entries.length === 0) return [];
    const byMonth = new Map();
    entries.forEach(e => {
      const key = e.date ? String(e.date).slice(0, 7) : null;
      if (!key) return;
      const cur = byMonth.get(key) || { month: key, in: 0, out: 0 };
      if (e.type === 'entrata') cur.in += Number(e.amount) || 0;
      else cur.out += Number(e.amount) || 0;
      byMonth.set(key, cur);
    });
    const months = [...byMonth.keys()].sort();
    let running = 0;
    return months.map(month => {
      const { in: inAmt, out: outAmt } = byMonth.get(month);
      running += inAmt - outAmt;
      return { month, monthLabel: fmtMonthLabel(month), in: inAmt, out: outAmt, balance: running };
    });
  }, [entries]);

  function handleAddSubmit(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.counterparty.trim()) {
      setFormError(form.type === 'entrata' ? 'Il nome del donatore è obbligatorio.' : 'Il beneficiario è obbligatorio.');
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setFormError('Importo non valido.');
      return;
    }
    addMutation.mutate(
      { ...form, amount: Number(form.amount) },
      {
        onSuccess: () => {
          setForm(EmptyForm());
          setShowForm(false);
        },
        onError: (err) => setFormError(err.message),
      }
    );
  }

  function startEdit(entry) {
    setEditingId(entry.entry_id);
    setEditForm({
      date: entry.date ? String(entry.date).slice(0, 10) : '',
      type: entry.type,
      amount: entry.amount,
      counterparty: entry.counterparty,
      description: entry.description || '',
    });
  }

  function saveEdit(entry_id) {
    updateMutation.mutate(
      { entry_id, ...editForm, amount: Number(editForm.amount) },
      { onSuccess: () => { setEditingId(null); setEditForm(null); } }
    );
  }

  function handleRemove(entry_id, counterparty) {
    if (!window.confirm(`Cancellare il movimento "${counterparty}"? Non è reversibile.`)) return;
    removeMutation.mutate(entry_id);
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>TEAM PRINCIPAL · RISERVATO</div>
        <h1 className={styles.title}>Cassa / rendiconto</h1>
        <p className={styles.sub}>
          Entrate (donazioni community) e uscite (spese) del team. Sostituisce il foglio
          Google usato finora — i movimenti storici sono stati migrati qui.
        </p>
      </header>

      <div className={styles.summaryCards}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Entrate totali</span>
          <span className={`${styles.summaryValue} ${styles.valueIn}`}>{fmtEuro(totalIn)}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Uscite totali</span>
          <span className={`${styles.summaryValue} ${styles.valueOut}`}>{fmtEuro(totalOut)}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Saldo cassa</span>
          <span className={`${styles.summaryValue} ${balance >= 0 ? styles.valueIn : styles.valueOut}`}>
            {fmtEuro(balance)}
          </span>
        </div>
      </div>

      {monthlyBalanceData.length > 1 && (
        <section className={styles.chartSection}>
          <div className={styles.chartHead}>
            <h2 className={styles.reportTitle}>Andamento cassa</h2>
            <span className={styles.chartMeta}>
              entrate/uscite per mese · saldo cumulato — {monthlyBalanceData.length} mesi
            </span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={monthlyBalanceData} margin={{ top: 8, right: 20, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="monthLabel" stroke="rgba(255,255,255,0.4)" fontSize={11} />
              <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickFormatter={fmtEuroCompact} width={72} />
              <Tooltip
                contentStyle={{
                  background: '#0a0e1a',
                  border: '1px solid rgba(0,212,255,0.3)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#00d4ff', fontFamily: 'monospace' }}
                formatter={(value, name) => [
                  fmtEuro(value),
                  name === 'in' ? 'Entrate' : name === 'out' ? 'Uscite' : 'Saldo cumulato',
                ]}
              />
              <Bar dataKey="in" fill="#22c55e" fillOpacity={0.55} radius={[3, 3, 0, 0]} />
              <Bar dataKey="out" fill="#ef4444" fillOpacity={0.55} radius={[3, 3, 0, 0]} />
              <Line
                type="monotone"
                dataKey="balance"
                stroke="var(--vsd-cyan)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'var(--vsd-cyan)', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className={styles.chartLegend}>
            <span className={styles.chartLegendItem}><span className={styles.legendDotIn} /> Entrate del mese</span>
            <span className={styles.chartLegendItem}><span className={styles.legendDotOut} /> Uscite del mese</span>
            <span className={styles.chartLegendItem}><span className={styles.legendDotBalance} /> Saldo cumulato</span>
          </div>
        </section>
      )}

      <div className={styles.summaryRow}>
        <button
          type="button"
          className={`${styles.chip} ${!typeFilter ? styles.chipActive : ''}`}
          onClick={() => setTypeFilter('')}
        >
          Tutti ({entries.length})
        </button>
        <button
          type="button"
          className={`${styles.chip} ${typeFilter === 'entrata' ? styles.chipActive : ''}`}
          onClick={() => setTypeFilter('entrata')}
        >
          Entrate ({entries.filter(e => e.type === 'entrata').length})
        </button>
        <button
          type="button"
          className={`${styles.chip} ${typeFilter === 'uscita' ? styles.chipActive : ''}`}
          onClick={() => setTypeFilter('uscita')}
        >
          Uscite ({entries.filter(e => e.type === 'uscita').length})
        </button>
        <button
          type="button"
          className={styles.exportBtn}
          onClick={() => downloadTreasuryCsv(visibleEntries)}
          disabled={visibleEntries.length === 0}
          title="Scarica CSV dei movimenti nella vista corrente"
        >
          ⇩ Esporta CSV
        </button>
        <button type="button" className={styles.addBtn} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Annulla' : '+ Nuovo movimento'}
        </button>
      </div>

      {showForm && (
        <form className={styles.addForm} onSubmit={handleAddSubmit}>
          <div className={styles.formGrid}>
            <select
              className={styles.select}
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}
            >
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input
              type="date"
              className={styles.input}
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Importo (€) *"
              className={styles.input}
              value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
            />
            <input
              type="text"
              placeholder={form.type === 'entrata' ? 'Donatore *' : 'Beneficiario *'}
              className={styles.input}
              value={form.counterparty}
              onChange={e => setForm({ ...form, counterparty: e.target.value })}
            />
          </div>
          <textarea
            placeholder="Motivazione / note…"
            className={styles.textarea}
            rows={2}
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
          {formError && <div className={styles.formError}>{formError}</div>}
          <button type="submit" className={styles.submitBtn} disabled={addMutation.isPending}>
            {addMutation.isPending ? 'Salvataggio…' : 'Aggiungi movimento'}
          </button>
        </form>
      )}

      {query.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {query.error && <div className={styles.errorBox}>Errore: {query.error.message}</div>}

      {!query.isLoading && !query.error && (
        <div className={styles.list}>
          {visibleEntries.length === 0 && (
            <div className={styles.empty}>Nessun movimento in questa vista.</div>
          )}
          {visibleEntries.map(e => (
            <div key={e.entry_id} className={`${styles.row} ${e.type === 'entrata' ? styles.rowIn : styles.rowOut}`}>
              {editingId === e.entry_id ? (
                <div className={styles.editGrid}>
                  <select
                    className={styles.select}
                    value={editForm.type}
                    onChange={ev => setEditForm({ ...editForm, type: ev.target.value })}
                  >
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input
                    type="date"
                    className={styles.input}
                    value={editForm.date}
                    onChange={ev => setEditForm({ ...editForm, date: ev.target.value })}
                  />
                  <input
                    type="number"
                    step="0.01"
                    className={styles.input}
                    value={editForm.amount}
                    onChange={ev => setEditForm({ ...editForm, amount: ev.target.value })}
                  />
                  <input
                    type="text"
                    className={styles.input}
                    value={editForm.counterparty}
                    onChange={ev => setEditForm({ ...editForm, counterparty: ev.target.value })}
                  />
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Motivazione…"
                    value={editForm.description}
                    onChange={ev => setEditForm({ ...editForm, description: ev.target.value })}
                  />
                  <div className={styles.editActions}>
                    <button type="button" className={styles.submitBtn} onClick={() => saveEdit(e.entry_id)}>
                      Salva
                    </button>
                    <button type="button" className={styles.cancelBtn} onClick={() => { setEditingId(null); setEditForm(null); }}>
                      Annulla
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.rowMain}>
                    <div className={styles.rowHead}>
                      <span className={styles.name}>{e.counterparty}</span>
                      <span className={`${styles.amount} ${e.type === 'entrata' ? styles.valueIn : styles.valueOut}`}>
                        {e.type === 'entrata' ? '+' : '−'}{fmtEuro(e.amount)}
                      </span>
                    </div>
                    <div className={styles.rowSub}>
                      <span className={styles.date}>{fmtDate(e.date)}</span>
                      {e.description && <span className={styles.meta}>{e.description}</span>}
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.editBtn} onClick={() => startEdit(e)} title="Modifica">
                      ✎
                    </button>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => handleRemove(e.entry_id, e.counterparty)}
                      title="Cancella movimento"
                    >
                      ✕
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {!query.isLoading && !query.error && donorSummary.length > 0 && (
        <section className={styles.reportSection}>
          <h2 className={styles.reportTitle}>Riepilogo versamenti per persona</h2>
          <div className={styles.reportTable}>
            {donorSummary.map((d, i) => (
              <div
                key={d.name}
                className={`${styles.reportRow} ${i === 0 ? styles.reportRowTop : ''} ${i === donorSummary.length - 1 ? styles.reportRowLow : ''}`}
              >
                <span className={styles.reportName}>{d.name}</span>
                <span className={styles.reportMeta}>{d.count} vers.</span>
                <span className={`${styles.reportValue} ${styles.valueIn}`}>{fmtEuro(d.total)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!query.isLoading && !query.error && expenseList.length > 0 && (
        <section className={styles.reportSection}>
          <h2 className={styles.reportTitle}>Riepilogo uscite (spese)</h2>
          <div className={styles.reportTable}>
            {expenseList.map((e, i) => (
              <div key={e.entry_id} className={`${styles.reportRow} ${i === 0 ? styles.reportRowLow : ''}`}>
                <span className={styles.reportName}>{e.counterparty}</span>
                <span className={styles.reportMeta}>{e.description || fmtDate(e.date)}</span>
                <span className={`${styles.reportValue} ${styles.valueOut}`}>{fmtEuro(e.amount)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
