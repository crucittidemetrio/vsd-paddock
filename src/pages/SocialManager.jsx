import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
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
} from '../hooks/useSocialManager';
import styles from './SocialManager.module.css';

const PLATFORM_OPTIONS = [
  { id: 'facebook', label: 'Facebook', icon: '📘' },
  { id: 'instagram', label: 'Instagram', icon: '📷' },
];

const STATUS_FLOW = ['bozza', 'programmato', 'pubblicato'];
const STATUS_LABEL = { bozza: 'Bozza', programmato: 'Programmato', pubblicato: 'Pubblicato' };
const STATUS_ICON = { bozza: '📝', programmato: '⏰', pubblicato: '✅' };

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'post', label: 'Post', icon: '✨' },
  { id: 'calendario', label: 'Calendario', icon: '📅' },
  { id: 'metriche', label: 'Metriche', icon: '📈' },
];

const EMPTY_FORM = {
  content: '',
  platforms: ['facebook', 'instagram'],
  scheduled_date: '',
  link_destination: '',
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

  const postsQuery = useSocialPosts();
  const metricsQuery = useSocialMetrics();

  const posts = postsQuery.data || [];
  const metrics = metricsQuery.data || [];

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
      </nav>

      <main className={styles.content}>
        {tab === 'dashboard' && (
          <DashboardHome posts={posts} metrics={metrics} postsQuery={postsQuery} metricsQuery={metricsQuery} />
        )}
        {tab === 'post' && <PostCreator posts={posts} postsQuery={postsQuery} />}
        {tab === 'calendario' && <CalendarView posts={posts} postsQuery={postsQuery} />}
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

function PostCreator({ posts, postsQuery }) {
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

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
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
              {p === 'instagram' ? '📷' : '📘'}
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

function CalendarView({ posts, postsQuery }) {
  const grouped = useMemo(() => {
    const withDate = posts.filter(p => p.scheduled_date);
    const withoutDate = posts.filter(p => !p.scheduled_date);
    const sorted = [...withDate].sort((a, b) => String(a.scheduled_date).localeCompare(String(b.scheduled_date)));
    const groups = {};
    sorted.forEach(p => {
      const key = p.scheduled_date;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return { groups, withoutDate };
  }, [posts]);

  const dates = Object.keys(grouped.groups);

  return (
    <div className={styles.section}>
      {postsQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}

      {dates.length === 0 && grouped.withoutDate.length === 0 && (
        <div className={styles.empty}>Nessun post programmato. Crea un post dalla tab "Post".</div>
      )}

      {dates.map(date => (
        <div key={date} className={styles.calendarGroup}>
          <h3 className={styles.calendarDate}>📅 {fmtDate(date)}</h3>
          <div className={styles.postList}>
            {grouped.groups[date].map(p => <PostRow key={p.post_id} post={p} readOnly />)}
          </div>
        </div>
      ))}

      {grouped.withoutDate.length > 0 && (
        <div className={styles.calendarGroup}>
          <h3 className={styles.calendarDate}>🗂️ Senza data</h3>
          <div className={styles.postList}>
            {grouped.withoutDate.map(p => <PostRow key={p.post_id} post={p} readOnly />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// METRICHE — tracking follower manuale
// ═══════════════════════════════════════════════════════════

function MetricsView({ metrics, metricsQuery }) {
  const [platform, setPlatform] = useState('instagram');
  const [followers, setFollowers] = useState('');
  const [recordedDate, setRecordedDate] = useState('');
  const [error, setError] = useState('');

  const addMutation = useAddSocialMetric();

  const grouped = useMemo(() => {
    const g = { instagram: [], facebook: [] };
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
    if (!followers || n < 0) { setError('Numero follower non valido'); return; }

    addMutation.mutate(
      { platform, followers: n, recorded_date: recordedDate || undefined },
      {
        onSuccess: () => { setFollowers(''); setRecordedDate(''); },
        onError: (err) => setError(err.message || 'Errore salvataggio'),
      }
    );
  }

  return (
    <div className={styles.section}>
      {error && <div className={styles.alertError}>❌ {error}</div>}

      <form onSubmit={handleSubmit} className={styles.formCard}>
        <h2 className={styles.sectionTitle}>Nuova rilevazione follower</h2>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Piattaforma</label>
            <select className={styles.select} value={platform} onChange={e => setPlatform(e.target.value)}>
              <option value="instagram">📷 Instagram</option>
              <option value="facebook">📘 Facebook</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Follower</label>
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
        <div className={styles.actions}>
          <button type="submit" className={styles.btnPrimary} disabled={addMutation.isPending}>
            {addMutation.isPending ? 'Salvataggio…' : '+ Registra'}
          </button>
        </div>
      </form>

      {metricsQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}

      {['instagram', 'facebook'].map(p => (
        <div key={p} className={styles.section}>
          <h2 className={styles.sectionTitle}>{p === 'instagram' ? '📷 Instagram' : '📘 Facebook'} — storico</h2>
          {grouped[p].length === 0 && <div className={styles.empty}>Nessuna rilevazione.</div>}
          {grouped[p].length > 0 && (
            <div className={styles.table}>
              <div className={styles.tableHeaderRow}>
                <span>Data</span>
                <span>Follower</span>
                <span>Variazione</span>
              </div>
              {grouped[p].map((m, i) => {
                const prev = grouped[p][i + 1];
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
