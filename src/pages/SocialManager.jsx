import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { upload } from '@vercel/blob/client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  useSocialPosts,
  useCreateSocialPost,
  useUpdateSocialPost,
  useDeleteSocialPost,
  useSocialMetrics,
  useAddSocialMetric,
  useGenerateSocialText,
  useDiscordStats,
  useSocialMedia,
  useAddSocialMedia,
  useRemoveSocialMedia,
} from '../hooks/useSocialManager';
import { useRaces } from '../hooks/useRaces';
import styles from './SocialManager.module.css';

const PLATFORM_OPTIONS = [
  { id: 'facebook', label: 'Facebook', icon: '📘' },
  { id: 'instagram', label: 'Instagram', icon: '📷' },
  { id: 'discord', label: 'Discord', icon: '💬' },
];

// Pilastri del calendario editoriale, offset in giorni rispetto alla
// data gara (negativo = prima, positivo = dopo). Formati e timing
// ripresi da outputs/calendario_editoriale_ue144.md, generalizzati a
// qualunque gara nel foglio Races (non solo UE144) usando le pagine
// reali già esistenti come link di destinazione.
const PILLARS = [
  { id: 'anteprima', label: 'Anteprima gara', icon: '📣', offsetDays: -7 },
  { id: 'iscrizioni', label: 'Iscrizioni/entry list', icon: '📝', offsetDays: -2 },
  { id: 'live', label: 'Live/race day', icon: '🔴', offsetDays: 0 },
  { id: 'risultati', label: 'Risultati', icon: '🏆', offsetDays: 1 },
  { id: 'highlight', label: 'Highlight/storytelling', icon: '🎬', offsetDays: 3 },
];

// Pilastri "evergreen" — vita di squadra e community, non legati a una
// gara. A differenza dei pilastri sopra (generati nella finestra ±45gg
// attorno a un evento) questi ricompaiono su una cadenza fissa, così il
// piano editoriale non resta vuoto/vuoto-di-persone nei periodi senza
// gare in calendario. Cadenza uniforme a 14gg (ogni 2 settimane) per
// ciascuna categoria, decisa insieme a Demetrio il 1 ago 2026.
const EVERGREEN_PILLARS = [
  { id: 'spotlight', label: 'Pilot spotlight', icon: '🎙️', cadenceDays: 14 },
  { id: 'dietro_quinte', label: 'Dietro le quinte', icon: '🔧', cadenceDays: 14 },
  { id: 'milestone', label: 'News/milestone squadra', icon: '📰', cadenceDays: 14 },
  { id: 'community', label: 'Community engagement', icon: '💬', cadenceDays: 14 },
];

const PILLAR_BY_ID = Object.fromEntries([...PILLARS, ...EVERGREEN_PILLARS].map(p => [p.id, p]));
const PLATFORM_ICON = Object.fromEntries(PLATFORM_OPTIONS.map(p => [p.id, p.icon]));

const STATUS_FLOW = ['bozza', 'programmato', 'pubblicato'];
const STATUS_LABEL = { bozza: 'Bozza', programmato: 'Programmato', pubblicato: 'Pubblicato' };
const STATUS_ICON = { bozza: '📝', programmato: '⏰', pubblicato: '✅' };

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'piano', label: 'Piano editoriale', icon: '🗓️' },
  { id: 'post', label: 'Post', icon: '✨' },
  { id: 'calendario', label: 'Calendario', icon: '📅' },
  { id: 'gallery', label: 'Media Gallery', icon: '🖼️' },
  { id: 'metriche', label: 'Metriche', icon: '📈' },
];

const EMPTY_FORM = {
  content: '',
  platforms: ['facebook', 'instagram'],
  scheduled_date: '',
  link_destination: '',
  race_id: '',
  pillar: '',
  media_url: '',
};

const AI_PROVIDERS = [
  { id: 'gemini', label: 'Gemini — gratis' },
  { id: 'anthropic', label: 'Claude — a pagamento' },
];

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

export default function SocialManager() {
  const [tab, setTab] = useState('dashboard');
  const [suggestion, setSuggestion] = useState(null);

  const postsQuery = useSocialPosts();
  const metricsQuery = useSocialMetrics();

  const posts = postsQuery.data || [];
  const metrics = metricsQuery.data || [];

  function handleCreateFromSuggestion(sug) {
    setSuggestion({ type: 'pillar', ...sug });
    setTab('post');
  }

  function handleUseMediaInPost(media) {
    setSuggestion({ type: 'media', media_url: media.url });
    setTab('post');
  }

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <Link to="/" className={styles.backLink}>← VSD Paddock</Link>
          <span className={styles.divider}>/</span>
          <span className={styles.pageTitle}>📣 Social Manager</span>
        </div>
        <div className={styles.topbarMeta}>Gestione contenuti social VSD</div>
      </header>

      <nav className={styles.tabs}>
        <div className={styles.tabsInner}>
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              className={`${styles.tabBtn}${tab === t.id ? ' ' + styles.tabBtnActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className={styles.content}>
        {tab === 'dashboard' && (
          <DashboardHome posts={posts} metrics={metrics} postsQuery={postsQuery} metricsQuery={metricsQuery} />
        )}
        {tab === 'piano' && (
          <EditorialPlanView posts={posts} onCreateFromSuggestion={handleCreateFromSuggestion} />
        )}
        {/* Sempre montato (a differenza delle altre tab) e nascosto via CSS
            invece che smontato: la bozza in corso (form interno a
            PostCreator) deve sopravvivere quando si va su Media Gallery a
            scegliere una foto e si torna indietro — con il rendering
            condizionale precedente il componente si smontava e la bozza
            si perdeva. Vedi anche il fix nel branch "pillar" della
            useEffect in PostCreator, che ora preserva media_url. */}
        <div className={tab === 'post' ? undefined : styles.tabPanelHidden}>
          <PostCreator
            posts={posts}
            postsQuery={postsQuery}
            suggestion={suggestion}
            onConsumeSuggestion={() => setSuggestion(null)}
          />
        </div>
        {tab === 'calendario' && (
          <CalendarView posts={posts} postsQuery={postsQuery} />
        )}
        {tab === 'gallery' && (
          <MediaGalleryView onUseInPost={handleUseMediaInPost} />
        )}
        {tab === 'metriche' && <MetricsView metrics={metrics} metricsQuery={metricsQuery} />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD HOME
// ═══════════════════════════════════════════════════════════

function DashboardHome({ posts, metrics, postsQuery, metricsQuery }) {
  const trends = useMemo(() => computePlatformTrends(metrics), [metrics]);
  const chartData = useMemo(() => buildFollowerSeries(metrics), [metrics]);

  const igTrend = trends.find(t => t.platform === 'instagram');
  const fbTrend = trends.find(t => t.platform === 'facebook');
  const dcTrend = trends.find(t => t.platform === 'discord');

  const postiInCoda = posts.filter(p => p.status === 'programmato').length;
  const now = new Date();
  const pubblicatiMese = posts.filter(p => {
    if (p.status !== 'pubblicato' || !p.published_at) return false;
    const d = new Date(p.published_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  const recentPublished = useMemo(
    () => posts.filter(p => p.status === 'pubblicato').slice(0, 5),
    [posts]
  );

  return (
    <div className={styles.section}>
      {postsQuery.isLoading && <div className={styles.loading}>Caricamento post…</div>}
      {postsQuery.error && <div className={styles.errorBox}>Errore: {postsQuery.error.message}</div>}
      {metricsQuery.error && <div className={styles.errorBox}>Errore metriche: {metricsQuery.error.message}</div>}

      <div className={styles.statGrid}>
        <IconStatCard
          badgeClass={styles.badgeInstagram}
          icon="📷"
          label="Follower Instagram"
          value={igTrend ? igTrend.latest.toLocaleString('it-IT') : '—'}
          delta={igTrend?.delta ?? null}
        />
        <IconStatCard
          badgeClass={styles.badgeFacebook}
          icon="📘"
          label="Follower Facebook"
          value={fbTrend ? fbTrend.latest.toLocaleString('it-IT') : '—'}
          delta={fbTrend?.delta ?? null}
        />
        <IconStatCard
          badgeClass={styles.badgeDiscord}
          icon="💬"
          label="Membri Discord"
          value={dcTrend ? dcTrend.latest.toLocaleString('it-IT') : '—'}
          delta={dcTrend?.delta ?? null}
        />
        <IconStatCard
          badgeClass={styles.badgeQueue}
          icon="⏰"
          label="Post programmati"
          value={postiInCoda}
        />
        <IconStatCard
          badgeClass={styles.badgeCheck}
          icon="✅"
          label="Pubblicati questo mese"
          value={pubblicatiMese}
        />
      </div>

      <div className={styles.dashboardGrid}>
        <div className={styles.chartCard}>
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Crescita follower</h2>
          {metricsQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}
          {!metricsQuery.isLoading && chartData.length < 2 && (
            <div className={styles.empty}>
              Servono almeno 2 rilevazioni per disegnare il grafico. Aggiungile dalla tab Metriche.
            </div>
          )}
          {chartData.length >= 2 && (
            <div className={styles.chartWrap}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="igGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e1306c" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#e1306c" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fbGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b8bff" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3b8bff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="dcGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5865f2" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#5865f2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="dateLabel" tick={{ fill: '#8a96b0', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#8a96b0', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip
                    contentStyle={{ background: '#0d1730', border: '1px solid #1f2a4a', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#8a96b0' }}
                  />
                  <Area type="monotone" dataKey="instagram" name="Instagram" stroke="#e1306c"
                    fill="url(#igGrad)" strokeWidth={2} connectNulls dot={{ r: 3 }} />
                  <Area type="monotone" dataKey="facebook" name="Facebook" stroke="#3b8bff"
                    fill="url(#fbGrad)" strokeWidth={2} connectNulls dot={{ r: 3 }} />
                  <Area type="monotone" dataKey="discord" name="Discord" stroke="#5865f2"
                    fill="url(#dcGrad)" strokeWidth={2} connectNulls dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className={styles.recentPostsCard}>
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Ultimi post pubblicati</h2>
          {recentPublished.length === 0 && (
            <div className={styles.empty}>Nessun post ancora segnato come pubblicato.</div>
          )}
          {recentPublished.length > 0 && (
            <div className={styles.postList}>
              {recentPublished.map(p => <PostRow key={p.post_id} post={p} readOnly />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function computePlatformTrends(metrics) {
  const byPlatform = {};
  metrics.forEach(m => {
    if (!byPlatform[m.platform]) byPlatform[m.platform] = [];
    byPlatform[m.platform].push(m);
  });
  return Object.keys(byPlatform).map(platform => {
    const sorted = [...byPlatform[platform]].sort((a, b) =>
      String(a.recorded_date).localeCompare(String(b.recorded_date)));
    const last = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
    return {
      platform,
      latest: Number(last.followers) || 0,
      date: last.recorded_date,
      delta: prev ? Number(last.followers) - Number(prev.followers) : null,
    };
  });
}

function buildFollowerSeries(metrics) {
  const byDate = {};
  metrics.forEach(m => {
    const key = m.recorded_date;
    if (!byDate[key]) byDate[key] = { date: key };
    byDate[key][m.platform] = Number(m.followers);
  });
  return Object.values(byDate)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(row => ({ ...row, dateLabel: fmtDate(row.date) }));
}

function IconStatCard({ badgeClass, icon, label, value, delta }) {
  return (
    <div className={styles.statCard}>
      <div className={`${styles.iconBadge} ${badgeClass}`}>{icon}</div>
      <div className={styles.statCardBody}>
        <div className={styles.statValue}>{value}</div>
        <div className={styles.statLabel}>{label}</div>
        {delta !== null && delta !== undefined && (
          <div className={delta >= 0 ? styles.deltaUp : styles.deltaDown}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// POST CREATOR (crea + gestisce post esistenti)
// ═══════════════════════════════════════════════════════════

function PostCreator({ posts, postsQuery, suggestion, onConsumeSuggestion }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [aiTopic, setAiTopic] = useState('');
  const [aiProvider, setAiProvider] = useState('gemini');
  const [error, setError] = useState('');

  const createMutation = useCreateSocialPost();
  const updateMutation = useUpdateSocialPost();
  const deleteMutation = useDeleteSocialPost();
  const generateMutation = useGenerateSocialText();

  const isEdit = Boolean(editingId);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  // Arrivo da "+ Crea bozza" nel piano editoriale (tab omonima): resetta
  // il form e precompila argomento/piattaforme/link/race_id/pillar — MA
  // preserva media_url se una foto era già stata scelta da Media Gallery
  // in questa sessione di bozza, altrimenti l'ordine "prima foto, poi
  // pillar" perdeva la foto. Il resto (contenuto/argomento/collegamenti)
  // resta un reset pieno: è comunque l'inizio di una bozza nuova.
  // Arrivo da "Usa nel post" nella Media Gallery: NON resetta il form,
  // aggiunge solo l'immagine a quello che si sta già scrivendo.
  // In entrambi i casi si autoconsuma per non riapplicarsi ai render
  // successivi.
  useEffect(() => {
    if (!suggestion) return;

    if (suggestion.type === 'media') {
      setForm(prev => ({ ...prev, media_url: suggestion.media_url || '' }));
      onConsumeSuggestion();
      return;
    }

    setEditingId(null);
    setForm(prev => ({
      content: '',
      platforms: suggestion.platforms || ['facebook', 'instagram'],
      scheduled_date: suggestion.scheduled_date || '',
      link_destination: suggestion.link_destination || '',
      race_id: suggestion.race_id || '',
      pillar: suggestion.pillar || '',
      media_url: prev.media_url || '',
    }));
    setAiTopic(suggestion.topic || '');
    setError('');
    onConsumeSuggestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion]);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function unlinkFromRace() {
    setForm(prev => ({ ...prev, race_id: '', pillar: '' }));
  }

  function removeMedia() {
    setForm(prev => ({ ...prev, media_url: '' }));
  }

  function togglePlatform(id) {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(id)
        ? prev.platforms.filter(p => p !== id)
        : [...prev.platforms, id],
    }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAiTopic('');
    setError('');
  }

  function startEdit(post) {
    setEditingId(post.post_id);
    setForm({
      content: post.content || '',
      platforms: post.platforms ? String(post.platforms).split(',').filter(Boolean) : [],
      scheduled_date: post.scheduled_date || '',
      link_destination: post.link_destination || '',
      race_id: post.race_id || '',
      pillar: post.pillar || '',
      media_url: post.media_url || '',
    });
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleGenerate() {
    setError('');
    const topic = aiTopic.trim();
    if (!topic) {
      setError('Descrivi in breve l\'argomento del post prima di generare il testo');
      return;
    }
    const prompt = `Scrivi un post social per questo argomento: ${topic}`;
    generateMutation.mutate({ prompt, provider: aiProvider }, {
      onSuccess: (data) => update('content', data.text || ''),
      onError: (err) => setError(err.message || 'Errore generazione AI'),
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.content.trim()) { setError('Il testo del post è obbligatorio'); return; }
    if (form.platforms.length === 0) { setError('Seleziona almeno una piattaforma'); return; }

    const payload = {
      content: form.content.trim(),
      platforms: form.platforms,
      scheduled_date: form.scheduled_date || '',
      link_destination: form.link_destination.trim(),
      race_id: form.race_id || '',
      pillar: form.pillar || '',
      media_url: form.media_url || '',
    };

    const onSuccess = () => resetForm();
    const onError = (err) => setError(err.message || 'Errore durante il salvataggio');

    if (isEdit) {
      updateMutation.mutate({ ...payload, post_id: editingId }, { onSuccess, onError });
    } else {
      createMutation.mutate(payload, { onSuccess, onError });
    }
  }

  function handleStatusChange(post, nextStatus) {
    updateMutation.mutate(
      { post_id: post.post_id, status: nextStatus },
      { onError: (err) => setError(err.message || 'Errore aggiornamento stato') }
    );
  }

  function handleDelete(post) {
    const ok = window.confirm(`Eliminare il post "${(post.content || '').slice(0, 40)}…"?`);
    if (!ok) return;
    deleteMutation.mutate(post.post_id, {
      onError: (err) => setError(err.message || 'Errore durante l\'eliminazione'),
    });
    if (editingId === post.post_id) resetForm();
  }

  return (
    <div className={styles.section}>
      {error && <div className={styles.alertError}>❌ {error}</div>}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formCard}>
          <h2 className={styles.sectionTitle}>{isEdit ? `Modifica post — ${editingId}` : 'Nuovo post'}</h2>

          {form.pillar && (
            <div className={styles.pillarBanner}>
              <span>
                {PILLAR_BY_ID[form.pillar]?.icon} Collegato al pilastro <strong>{PILLAR_BY_ID[form.pillar]?.label || form.pillar}</strong>
                {form.race_id ? ` — ${form.race_id}` : ''}
              </span>
              <button type="button" className={styles.btnMini} onClick={unlinkFromRace}>✕ Scollega</button>
            </div>
          )}

          {form.media_url ? (
            <div className={styles.mediaAttached}>
              {form.media_url.match(/\.(mp4|mov|webm)(\?|$)/i) ? (
                <video src={form.media_url} className={styles.mediaAttachedThumb} muted />
              ) : (
                <img src={form.media_url} alt="" className={styles.mediaAttachedThumb} />
              )}
              <span className={styles.mediaAttachedLabel}>🖼️ Immagine allegata dalla Media Gallery</span>
              <button type="button" className={styles.btnMini} onClick={removeMedia}>✕ Rimuovi</button>
            </div>
          ) : (
            <div className={styles.mediaAttachedHint}>
              📎 Nessuna immagine collegata — scegline una dalla tab "Media Gallery" con "Usa nel post".
            </div>
          )}

          <div className={styles.aiRow}>
            <input
              type="text"
              className={styles.input}
              placeholder="Argomento per l'AI (es. anteprima gara Sebring 13/9)"
              value={aiTopic}
              onChange={e => setAiTopic(e.target.value)}
            />
            <select
              className={styles.select}
              value={aiProvider}
              onChange={e => setAiProvider(e.target.value)}
              title="Provider AI"
            >
              {AI_PROVIDERS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? '✨ Generazione…' : '✨ Genera con AI'}
            </button>
          </div>

          <textarea
            className={`${styles.textarea} ${styles.postTextarea}`}
            rows={14}
            value={form.content}
            onChange={e => update('content', e.target.value)}
            placeholder="Testo del post…"
          />

          <div className={styles.platformRow}>
            {PLATFORM_OPTIONS.map(p => (
              <label key={p.id} className={styles.platformChip}>
                <input
                  type="checkbox"
                  checked={form.platforms.includes(p.id)}
                  onChange={() => togglePlatform(p.id)}
                />
                <span>{p.icon} {p.label}</span>
              </label>
            ))}
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Data programmata</label>
              <input
                type="date"
                className={styles.input}
                value={form.scheduled_date}
                onChange={e => update('scheduled_date', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Link destinazione</label>
              <input
                type="text"
                className={styles.input}
                placeholder="/ue144, /roster, /joinus…"
                value={form.link_destination}
                onChange={e => update('link_destination', e.target.value)}
              />
            </div>
          </div>

          <div className={styles.actions}>
            {isEdit && (
              <button type="button" className={styles.btnSecondary} onClick={resetForm}>
                Annulla modifica
              </button>
            )}
            <button type="submit" className={styles.btnPrimary} disabled={isSaving}>
              {isSaving ? 'Salvataggio…' : (isEdit ? 'Salva modifiche' : '+ Salva bozza')}
            </button>
          </div>
        </div>
      </form>

      <h2 className={styles.sectionTitle}>Tutti i post ({posts.length})</h2>
      {postsQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {!postsQuery.isLoading && posts.length === 0 && (
        <div className={styles.empty}>Nessun post ancora creato.</div>
      )}
      {posts.length > 0 && (
        <div className={styles.postList}>
          {posts.map(p => (
            <PostRow
              key={p.post_id}
              post={p}
              onEdit={() => startEdit(p)}
              onDelete={() => handleDelete(p)}
              onStatusChange={(next) => handleStatusChange(p, next)}
              deleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostRow({ post, onEdit, onDelete, onStatusChange, deleting, readOnly }) {
  const platforms = post.platforms ? String(post.platforms).split(',').filter(Boolean) : [];
  const statusIdx = STATUS_FLOW.indexOf(post.status);
  const nextStatus = statusIdx >= 0 && statusIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[statusIdx + 1] : null;

  return (
    <div className={styles.postRow}>
      <div className={styles.postRowMain}>
        <div className={styles.postRowTop}>
          <span className={`${styles.statusBadge} ${styles['status_' + post.status]}`}>
            {STATUS_ICON[post.status] || '•'} {STATUS_LABEL[post.status] || post.status}
          </span>
          {platforms.map(p => (
            <span key={p} className={styles.platformBadge}>
              {PLATFORM_ICON[p] || '•'}
            </span>
          ))}
          {post.scheduled_date && <span className={styles.postDate}>{fmtDate(post.scheduled_date)}</span>}
        </div>
        <div className={styles.postContent}>{post.content}</div>
        {post.link_destination && (
          <div className={styles.postLink}>🔗 {post.link_destination}</div>
        )}
      </div>
      {!readOnly && (
        <div className={styles.postRowActions}>
          {nextStatus && (
            <button
              type="button"
              className={styles.btnMini}
              onClick={() => onStatusChange(nextStatus)}
              title={`Segna come ${STATUS_LABEL[nextStatus]}`}
            >
              {nextStatus === 'pubblicato' ? '✅ Segna pubblicato' : `${STATUS_ICON[nextStatus]} ${STATUS_LABEL[nextStatus]}`}
            </button>
          )}
          <button type="button" className={styles.btnEdit} onClick={onEdit} title="Modifica">✎</button>
          <button
            type="button"
            className={styles.btnDelete}
            onClick={onDelete}
            disabled={deleting}
            title="Elimina"
          >✕</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CALENDARIO — post raggruppati per data programmata
// ═══════════════════════════════════════════════════════════

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MONTH_LABEL_FMT = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });

// Griglia fissa 6 settimane (42 celle), lunedì-domenica, così l'altezza
// del calendario non "salta" cambiando mese.
function buildMonthGrid(monthCursor) {
  const first = startOfMonth(monthCursor);
  const jsDay = first.getDay(); // 0=Dom..6=Sab
  const offset = (jsDay + 6) % 7; // giorni da sottrarre per arrivare al lunedì
  const gridStart = addDays(first, -offset);
  const days = [];
  for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i));
  return days;
}

function pillarLinkDestination(race, pillarId) {
  if (pillarId === 'highlight') return '/joinus';
  if (pillarId === 'risultati') {
    return race.championship_id ? `/championships/${race.championship_id}` : `/race/${race.race_id}`;
  }
  return `/race/${race.race_id}`;
}

function pillarTopic(race, pillarId, dateLabel) {
  const name = race.race_name || race.race_id;
  switch (pillarId) {
    case 'anteprima': return `Anteprima gara ${name} (${race.sim}), in programma ${dateLabel}`;
    case 'iscrizioni': return `Ultimo richiamo iscrizioni per ${name}, chiusura imminente`;
    case 'live': return `Aggiornamento live durante ${name}`;
    case 'risultati': return `Risultati e podio di ${name}`;
    case 'highlight': return `Momento più bello di ${name} (sorpasso, incidente, onboard)`;
    default: return name;
  }
}

// Finestra di rilevanza: gare da 10 giorni fa a 45 giorni nel futuro —
// abbastanza per coprire tutti i pilastri (T-7...T+3) di ogni round
// senza riempire la vista con l'intera storia del team.
function useEditorialPlan(posts) {
  const racesQuery = useRaces();
  const races = racesQuery.data || [];

  const plan = useMemo(() => {
    const now = new Date();
    const windowStart = addDays(now, -10);
    const windowEnd = addDays(now, 45);

    return races
      .filter(r => {
        const d = r.date ? new Date(r.date) : null;
        return d && !isNaN(d.getTime()) && d >= windowStart && d <= windowEnd;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(race => {
        const raceDate = new Date(race.date);
        const pillars = PILLARS.map(pillar => {
          const pillarDate = addDays(raceDate, pillar.offsetDays);
          const dateStr = pillarDate.toISOString().slice(0, 10);
          const match = posts.find(p => p.race_id === race.race_id && p.pillar === pillar.id);
          return {
            ...pillar,
            date: dateStr,
            dateLabel: fmtDate(dateStr),
            post: match || null,
          };
        });
        return { race, pillars };
      });
  }, [races, posts]);

  return { plan, isLoading: racesQuery.isLoading, error: racesQuery.error };
}

function daysBetween(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function evergreenTopic(pillarId) {
  switch (pillarId) {
    case 'spotlight': return 'Pilot spotlight — presentazione di un pilota del roster';
    case 'dietro_quinte': return 'Dietro le quinte — setup, telemetria o lavoro di squadra';
    case 'milestone': return 'News/milestone squadra';
    case 'community': return 'Community engagement — sondaggio, Q&A o shoutout alla community';
    default: return '';
  }
}

function evergreenLinkDestination(pillarId) {
  if (pillarId === 'spotlight') return '/roster';
  return '';
}

// Stato dei pilastri evergreen: a differenza dei pilastri gara (legati a
// una data fissa), qui guardiamo l'ultimo post pubblicato/programmato per
// quella categoria e calcoliamo se è "in ritardo" rispetto alla cadenza.
function useEvergreenPlan(posts) {
  return useMemo(() => {
    const now = new Date();
    return EVERGREEN_PILLARS.map(pillar => {
      const matches = posts.filter(p => p.pillar === pillar.id && !p.race_id);
      const sorted = [...matches].sort((a, b) => {
        const da = String(a.scheduled_date || a.created_at || '');
        const db = String(b.scheduled_date || b.created_at || '');
        return db.localeCompare(da);
      });
      const last = sorted[0] || null;
      const lastDateStr = last ? (last.scheduled_date || last.created_at) : null;
      const lastDate = lastDateStr ? new Date(lastDateStr) : null;
      const daysSince = lastDate && !isNaN(lastDate.getTime()) ? daysBetween(lastDate, now) : null;
      const isDue = daysSince === null || daysSince >= pillar.cadenceDays;
      const daysUntilDue = daysSince === null ? 0 : Math.max(0, pillar.cadenceDays - daysSince);
      return { ...pillar, last, daysSince, isDue, daysUntilDue };
    });
  }, [posts]);
}

function EvergreenPlanView({ evergreenPlan, onCreate }) {
  return (
    <div className={styles.raceCard}>
      <div className={styles.raceCardHead}>
        <span className={styles.raceCardName}>Vita di squadra &amp; community</span>
        <span className={styles.raceCardMeta}>cadenza 14gg per categoria, non legata al calendario gare</span>
      </div>
      <div className={styles.pillarRow}>
        {evergreenPlan.map(item => (
          <div
            key={item.id}
            className={`${styles.pillarChip} ${item.isDue ? styles.pillarStatus_programmato : styles.pillarStatus_bozza}`}
            title={item.label}
          >
            <div className={styles.pillarChipTop}>
              <span>{item.icon}</span>
              <span className={styles.pillarChipLabel}>{item.label}</span>
            </div>
            <div className={styles.pillarChipDate}>
              {item.last
                ? `Ultimo: ${fmtDate(item.last.scheduled_date || item.last.created_at)}`
                : 'Mai creato'}
            </div>
            <div className={styles.pillarChipStatus}>
              {item.isDue
                ? (item.daysSince === null ? 'Tocca a te' : `In ritardo di ${item.daysSince - item.cadenceDays} gg`)
                : `Prossimo tra ${item.daysUntilDue} gg`}
            </div>
            <button type="button" className={styles.btnMini} onClick={() => onCreate(item)}>
              + Crea bozza
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditorialPlanView({ posts, onCreateFromSuggestion }) {
  const { plan, isLoading: racesLoading, error: racesError } = useEditorialPlan(posts);
  const evergreenPlan = useEvergreenPlan(posts);

  function handlePillarCreate(race, pillar) {
    onCreateFromSuggestion({
      race_id: race.race_id,
      pillar: pillar.id,
      scheduled_date: pillar.date,
      link_destination: pillarLinkDestination(race, pillar.id),
      platforms: pillar.id === 'highlight' ? ['instagram'] : ['facebook', 'instagram'],
      topic: pillarTopic(race, pillar.id, pillar.dateLabel),
    });
  }

  function handleEvergreenCreate(pillar) {
    onCreateFromSuggestion({
      race_id: '',
      pillar: pillar.id,
      scheduled_date: new Date().toISOString().slice(0, 10),
      link_destination: evergreenLinkDestination(pillar.id),
      platforms: ['facebook', 'instagram'],
      topic: evergreenTopic(pillar.id),
    });
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Piano editoriale</h2>
      <p className={styles.subtleHint}>
        Ogni gara nella finestra ±45 giorni genera automaticamente 5 slot di contenuto
        (anteprima, iscrizioni, live, risultati, highlight). A questi si affiancano 4
        categorie di vita di squadra e community, indipendenti dal calendario gare —
        così il piano non resta vuoto nei periodi senza eventi. Ogni slot mancante ha
        un bottone rapido per creare la bozza già precompilata.
      </p>

      <EvergreenPlanView evergreenPlan={evergreenPlan} onCreate={handleEvergreenCreate} />

      {racesLoading && <div className={styles.loading}>Caricamento gare…</div>}
      {racesError && <div className={styles.errorBox}>Errore gare: {racesError.message}</div>}
      {!racesLoading && plan.length === 0 && (
        <div className={styles.empty}>Nessuna gara nella finestra ±45 giorni. Torna a controllare più vicino alla prossima gara.</div>
      )}

      {plan.map(({ race, pillars }) => (
        <div key={race.race_id} className={styles.raceCard}>
          <div className={styles.raceCardHead}>
            <span className={styles.raceCardName}>{race.race_name}</span>
            <span className={styles.raceCardMeta}>{race.sim} · {fmtDate(race.date)}</span>
          </div>
          <div className={styles.pillarRow}>
            {pillars.map(pillar => (
              <div
                key={pillar.id}
                className={`${styles.pillarChip} ${pillar.post ? styles['pillarStatus_' + pillar.post.status] : styles.pillarMissing}`}
                title={`${pillar.label} — ${pillar.dateLabel}`}
              >
                <div className={styles.pillarChipTop}>
                  <span>{pillar.icon}</span>
                  <span className={styles.pillarChipLabel}>{pillar.label}</span>
                </div>
                <div className={styles.pillarChipDate}>{pillar.dateLabel}</div>
                {pillar.post ? (
                  <div className={styles.pillarChipStatus}>
                    {STATUS_ICON[pillar.post.status]} {STATUS_LABEL[pillar.post.status]}
                  </div>
                ) : (
                  <button type="button" className={styles.btnMini} onClick={() => handlePillarCreate(race, pillar)}>
                    + Crea bozza
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarView({ posts, postsQuery }) {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(null);

  const postsByDate = useMemo(() => {
    const map = {};
    posts.forEach(p => {
      if (!p.scheduled_date) return;
      const key = String(p.scheduled_date).slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    return map;
  }, [posts]);

  const withoutDate = useMemo(() => posts.filter(p => !p.scheduled_date), [posts]);

  const days = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const todayKey = dateKey(new Date());
  const currentMonth = monthCursor.getMonth();

  const monthTotals = useMemo(() => {
    const totals = { bozza: 0, programmato: 0, pubblicato: 0 };
    days.forEach(d => {
      if (d.getMonth() !== currentMonth) return;
      (postsByDate[dateKey(d)] || []).forEach(p => {
        if (totals[p.status] !== undefined) totals[p.status]++;
      });
    });
    return totals;
  }, [days, postsByDate, currentMonth]);

  function goToMonth(offset) {
    setMonthCursor(m => addMonths(m, offset));
    setSelectedDate(null);
  }

  function goToToday() {
    setMonthCursor(startOfMonth(new Date()));
    setSelectedDate(null);
  }

  const selectedPosts = selectedDate ? (postsByDate[selectedDate] || []) : [];

  return (
    <div className={styles.section}>
      <div className={styles.calendarHead}>
        <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Calendario</h2>
        <div className={styles.calendarNav}>
          <button type="button" className={styles.btnMini} onClick={() => goToMonth(-1)}>‹</button>
          <span className={styles.calendarMonthLabel}>{capitalize(MONTH_LABEL_FMT.format(monthCursor))}</span>
          <button type="button" className={styles.btnMini} onClick={() => goToMonth(1)}>›</button>
          <button type="button" className={styles.btnMini} onClick={goToToday}>Oggi</button>
        </div>
      </div>

      <div className={styles.calendarSummary}>
        <span className={styles.calendarSummaryItem}>{STATUS_ICON.bozza} {monthTotals.bozza} bozze</span>
        <span className={styles.calendarSummaryItem}>{STATUS_ICON.programmato} {monthTotals.programmato} programmati</span>
        <span className={styles.calendarSummaryItem}>{STATUS_ICON.pubblicato} {monthTotals.pubblicato} pubblicati</span>
      </div>

      {postsQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}

      <div className={styles.calendarGrid}>
        {WEEKDAY_LABELS.map(w => (
          <div key={w} className={styles.calendarWeekday}>{w}</div>
        ))}
        {days.map(d => {
          const key = dateKey(d);
          const dayPosts = postsByDate[key] || [];
          const inMonth = d.getMonth() === currentMonth;
          const isToday = key === todayKey;
          const isSelected = selectedDate === key;
          const counts = { bozza: 0, programmato: 0, pubblicato: 0 };
          dayPosts.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });

          return (
            <button
              type="button"
              key={key}
              className={[
                styles.calendarCell,
                !inMonth && styles.calendarCellMuted,
                isToday && styles.calendarCellToday,
                isSelected && styles.calendarCellSelected,
              ].filter(Boolean).join(' ')}
              onClick={() => dayPosts.length > 0 && setSelectedDate(isSelected ? null : key)}
              disabled={dayPosts.length === 0}
            >
              <span className={styles.calendarCellNum}>{d.getDate()}</span>
              {dayPosts.length > 0 && (
                <span className={styles.calendarCellBadges}>
                  {counts.programmato > 0 && (
                    <span className={`${styles.calendarBadge} ${styles.badgeProgrammato}`}>{counts.programmato}</span>
                  )}
                  {counts.pubblicato > 0 && (
                    <span className={`${styles.calendarBadge} ${styles.badgePubblicato}`}>{counts.pubblicato}</span>
                  )}
                  {counts.bozza > 0 && (
                    <span className={`${styles.calendarBadge} ${styles.badgeBozza}`}>{counts.bozza}</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && selectedPosts.length > 0 && (
        <div className={styles.calendarDetail}>
          <h3 className={styles.calendarDate}>📅 {fmtDate(selectedDate)}</h3>
          <div className={styles.postList}>
            {selectedPosts.map(p => <PostRow key={p.post_id} post={p} readOnly />)}
          </div>
        </div>
      )}

      {withoutDate.length > 0 && (
        <div className={styles.calendarGroup}>
          <h3 className={styles.calendarDate}>🗂️ Senza data</h3>
          <div className={styles.postList}>
            {withoutDate.map(p => <PostRow key={p.post_id} post={p} readOnly />)}
          </div>
        </div>
      )}

      {posts.length === 0 && (
        <div className={styles.empty}>Nessun post ancora creato. Crea un post dalla tab "Post".</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// METRICHE — tracking follower manuale
// ═══════════════════════════════════════════════════════════

const METRICS_PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: '📷' },
  { id: 'facebook', label: 'Facebook', icon: '📘' },
  { id: 'discord', label: 'Discord', icon: '💬' },
];

function MetricsView({ metrics, metricsQuery }) {
  const [platform, setPlatform] = useState('instagram');
  const [followers, setFollowers] = useState('');
  const [recordedDate, setRecordedDate] = useState('');
  const [error, setError] = useState('');
  const [discordInfo, setDiscordInfo] = useState(null);

  const addMutation = useAddSocialMetric();
  const discordStatsMutation = useDiscordStats();

  const grouped = useMemo(() => {
    const g = { instagram: [], facebook: [], discord: [] };
    metrics.forEach(m => { if (g[m.platform]) g[m.platform].push(m); });
    Object.keys(g).forEach(k => {
      g[k].sort((a, b) => String(b.recorded_date).localeCompare(String(a.recorded_date)));
    });
    return g;
  }, [metrics]);

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const n = Number(followers);
    if (!followers || n < 0) { setError('Numero non valido'); return; }

    addMutation.mutate(
      { platform, followers: n, recorded_date: recordedDate || undefined },
      {
        onSuccess: () => { setFollowers(''); setRecordedDate(''); setDiscordInfo(null); },
        onError: (err) => setError(err.message || 'Errore salvataggio'),
      }
    );
  }

  function handleFetchDiscord() {
    setError('');
    setDiscordInfo(null);
    discordStatsMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (data.member_count != null) setFollowers(String(data.member_count));
        setDiscordInfo(data);
      },
      onError: (err) => setError(err.message || 'Errore recupero dati Discord'),
    });
  }

  return (
    <div className={styles.section}>
      {error && <div className={styles.alertError}>❌ {error}</div>}

      <form onSubmit={handleSubmit} className={styles.formCard}>
        <h2 className={styles.sectionTitle}>Nuova rilevazione</h2>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Piattaforma</label>
            <select className={styles.select} value={platform} onChange={e => { setPlatform(e.target.value); setDiscordInfo(null); }}>
              {METRICS_PLATFORMS.map(p => (
                <option key={p.id} value={p.id}>{p.icon} {p.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{platform === 'discord' ? 'Membri' : 'Follower'}</label>
            <input
              type="number" min="0" className={styles.input}
              value={followers} onChange={e => setFollowers(e.target.value)}
              placeholder="es. 1250"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Data (default oggi)</label>
            <input
              type="date" className={styles.input}
              value={recordedDate} onChange={e => setRecordedDate(e.target.value)}
            />
          </div>
        </div>

        {platform === 'discord' && (
          <div className={styles.discordFetchRow}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleFetchDiscord}
              disabled={discordStatsMutation.isPending}
            >
              {discordStatsMutation.isPending ? '🔄 Recupero…' : '🔄 Aggiorna da Discord'}
            </button>
            {discordInfo && (
              <span className={styles.discordFetchHint}>
                {discordInfo.guild_name ? `${discordInfo.guild_name} — ` : ''}
                {discordInfo.member_count?.toLocaleString('it-IT')} membri
                {discordInfo.online_count != null ? `, ${discordInfo.online_count.toLocaleString('it-IT')} online` : ''} (dato reale, appena recuperato)
              </span>
            )}
          </div>
        )}

        <div className={styles.actions}>
          <button type="submit" className={styles.btnPrimary} disabled={addMutation.isPending}>
            {addMutation.isPending ? 'Salvataggio…' : '+ Registra'}
          </button>
        </div>
      </form>

      {metricsQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}

      {METRICS_PLATFORMS.map(p => (
        <div key={p.id} className={styles.section}>
          <h2 className={styles.sectionTitle}>{p.icon} {p.label} — storico</h2>
          {grouped[p.id].length === 0 && <div className={styles.empty}>Nessuna rilevazione.</div>}
          {grouped[p.id].length > 0 && (
            <div className={styles.table}>
              <div className={styles.tableHeaderRow}>
                <span>Data</span>
                <span>{p.id === 'discord' ? 'Membri' : 'Follower'}</span>
                <span>Variazione</span>
              </div>
              {grouped[p.id].map((m, i) => {
                const prev = grouped[p.id][i + 1];
                const delta = prev ? Number(m.followers) - Number(prev.followers) : null;
                return (
                  <div key={m.metric_id} className={styles.tableRow}>
                    <span>{fmtDate(m.recorded_date)}</span>
                    <span className={styles.cellTime}>{Number(m.followers).toLocaleString('it-IT')}</span>
                    <span>
                      {delta === null ? '—' : (
                        <span className={delta >= 0 ? styles.deltaUp : styles.deltaDown}>
                          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MEDIA GALLERY — libreria file (upload diretto su Vercel Blob)
// ═══════════════════════════════════════════════════════════

function isVideoUrl(url) {
  return /\.(mp4|mov|webm)(\?|$)/i.test(url || '');
}

function MediaGalleryView({ onUseInPost }) {
  const [search, setSearch] = useState('');
  const [pendingTags, setPendingTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const mediaQuery = useSocialMedia();
  const addMutation = useAddSocialMedia();
  const removeMutation = useRemoveSocialMedia();

  const media = mediaQuery.data || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return media;
    return media.filter(m =>
      String(m.filename || '').toLowerCase().includes(q) ||
      String(m.tags || '').toLowerCase().includes(q)
    );
  }, [media, search]);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setError('');
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Caricamento ${i + 1}/${files.length}: ${file.name}…`);
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/media-upload',
        });
        await addMutation.mutateAsync({
          url: blob.url,
          filename: file.name,
          media_type: file.type.startsWith('video') ? 'video' : 'image',
          tags: pendingTags.trim(),
        });
      }
      setPendingTags('');
    } catch (err) {
      setError(err.message || 'Errore durante il caricamento');
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  async function handleDelete(m) {
    const ok = window.confirm(`Eliminare "${m.filename || m.url}"? Non si può annullare.`);
    if (!ok) return;
    setError('');
    try {
      await fetch('/api/media-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: m.url }),
      });
    } catch {
      // Se la cancellazione del file su Blob fallisce, rimuoviamo comunque
      // il record: meglio un link morto raro che un file orfano bloccante.
    }
    removeMutation.mutate(m.media_id, {
      onError: (err) => setError(err.message || 'Errore eliminazione'),
    });
  }

  function handleCopyUrl(url) {
    if (navigator.clipboard) navigator.clipboard.writeText(url);
  }

  return (
    <div className={styles.section}>
      {error && <div className={styles.alertError}>❌ {error}</div>}

      <div
        className={`${styles.dropzone}${dragOver ? ' ' + styles.dropzoneActive : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/mp4,video/quicktime,video/webm"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <span>⏳ {uploadProgress || 'Caricamento…'}</span>
        ) : (
          <span>📤 Trascina qui foto/video, oppure clicca per scegliere i file</span>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>Tag per il prossimo upload (opzionale, es. "sebring, poster")</label>
        <input
          type="text"
          className={styles.input}
          value={pendingTags}
          onChange={(e) => setPendingTags(e.target.value)}
          placeholder="separati da virgola…"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>Cerca in libreria</label>
        <input
          type="text"
          className={styles.input}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="nome file o tag…"
        />
      </div>

      {mediaQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {mediaQuery.error && <div className={styles.errorBox}>Errore: {mediaQuery.error.message}</div>}
      {!mediaQuery.isLoading && filtered.length === 0 && (
        <div className={styles.empty}>
          {media.length === 0 ? 'Nessun file ancora caricato.' : 'Nessun risultato per questa ricerca.'}
        </div>
      )}

      {filtered.length > 0 && (
        <div className={styles.mediaGrid}>
          {filtered.map(m => (
            <div key={m.media_id} className={styles.mediaCard}>
              <div className={styles.mediaThumbWrap}>
                {isVideoUrl(m.url) ? (
                  <video src={m.url} className={styles.mediaThumb} muted controls />
                ) : (
                  <img src={m.url} alt={m.filename} className={styles.mediaThumb} loading="lazy" />
                )}
              </div>
              <div className={styles.mediaCardBody}>
                <div className={styles.mediaFilename} title={m.filename}>{m.filename || '—'}</div>
                {m.tags && (
                  <div className={styles.mediaTags}>
                    {String(m.tags).split(',').map(t => t.trim()).filter(Boolean).map(t => (
                      <span key={t} className={styles.mediaTag}>{t}</span>
                    ))}
                  </div>
                )}
                <div className={styles.mediaCardActions}>
                  <button type="button" className={styles.btnMini} onClick={() => onUseInPost(m)}>
                    ✨ Usa nel post
                  </button>
                  <button type="button" className={styles.btnMini} onClick={() => handleCopyUrl(m.url)}>
                    🔗 Copia URL
                  </button>
                  <button
                    type="button"
                    className={styles.btnDelete}
                    onClick={() => handleDelete(m)}
                    disabled={removeMutation.isPending}
                    title="Elimina"
                  >✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
