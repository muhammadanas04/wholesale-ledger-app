// ── Wholesale Error Reporter — Independent Cloudflare Worker ──
// Completely separate from the main sync worker.
// Stores errors in KV, serves a simple dashboard.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// ── Auth ──
function checkAuth(request, env) {
  // Check bearer token
  const authHeader = request.headers.get('Authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    if (authHeader.slice(7) === env.ERROR_SECRET) return true
  }
  // Check query param
  const url = new URL(request.url)
  if (url.searchParams.get('token') === env.ERROR_SECRET) return true
  return false
}

// ── KV helpers ──
// Errors stored as: key = "err:{timestamp}:{random}", value = JSON
// Also maintain an index key "err_index" = JSON array of keys (newest first)

async function getIndex(kv) {
  const raw = await kv.get('err_index')
  return raw ? JSON.parse(raw) : []
}

async function setIndex(kv, index) {
  await kv.put('err_index', JSON.stringify(index))
}

async function storeError(kv, errorData) {
  const ts = Date.now()
  const id = `err:${ts}:${Math.random().toString(36).slice(2, 8)}`
  const entry = { id, ts, ...errorData }
  await kv.put(id, JSON.stringify(entry), { expirationTtl: 30 * 24 * 60 * 60 }) // 30 days

  const index = await getIndex(kv)
  index.unshift(id) // newest first
  // Cap at 500 entries
  if (index.length > 500) {
    const removed = index.splice(500)
    for (const key of removed) {
      await kv.delete(key)
    }
  }
  await setIndex(kv, index)
  return entry
}

async function getErrors(kv, limit = 100, offset = 0) {
  const index = await getIndex(kv)
  const slice = index.slice(offset, offset + limit)
  const errors = []
  for (const key of slice) {
    const raw = await kv.get(key)
    if (raw) {
      errors.push(JSON.parse(raw))
    }
  }
  return { errors, total: index.length }
}

async function deleteError(kv, id) {
  await kv.delete(id)
  const index = await getIndex(kv)
  const filtered = index.filter(k => k !== id)
  await setIndex(kv, filtered)
}

async function clearErrors(kv) {
  const index = await getIndex(kv)
  for (const key of index) {
    await kv.delete(key)
  }
  await setIndex(kv, [])
}

// ── Router ──
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const path = url.pathname

    // POST /report — receives errors from the Electron app
    if (request.method === 'POST' && path === '/report') {
      // Auth check
      if (!checkAuth(request, env)) {
        return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS })
      }
      try {
        const body = await request.json()
        const entry = await storeError(env.ERROR_LOGS, {
          message: body.message || 'Unknown error',
          stack: body.stack || null,
          source: body.source || 'unknown',
          context: body.context || null,
          appVersion: body.appVersion || null,
          platform: body.platform || null,
        })
        return new Response(JSON.stringify({ ok: true, id: entry.id }), {
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        })
      }
    }

    // Everything below requires auth
    if (!checkAuth(request, env)) {
      return new Response('Unauthorized — add ?token=YOUR_SECRET to the URL', {
        status: 401,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    // GET /errors — JSON API
    if (request.method === 'GET' && path === '/errors') {
      const limit = parseInt(url.searchParams.get('limit') || '100')
      const offset = parseInt(url.searchParams.get('offset') || '0')
      const { errors, total } = await getErrors(env.ERROR_LOGS, limit, offset)
      return new Response(JSON.stringify({ errors, total }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // DELETE /errors/:id
    if (request.method === 'DELETE' && path.startsWith('/errors/')) {
      const id = decodeURIComponent(path.slice(8))
      await deleteError(env.ERROR_LOGS, id)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // DELETE /errors — clear all
    if (request.method === 'DELETE' && path === '/errors') {
      await clearErrors(env.ERROR_LOGS)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // GET / — serve dashboard
    if (request.method === 'GET' && (path === '/' || path === '')) {
      const token = url.searchParams.get('token')
      return new Response(getDashboardHTML(token), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      })
    }

    return new Response('Not found', { status: 404 })
  },
}

// ── Dashboard HTML ──
function getDashboardHTML(token) {
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Error Log</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    background: #000;
    color: #ccc;
    font-size: 13px;
    line-height: 1.5;
  }
  .header {
    padding: 16px 20px;
    border-bottom: 1px solid #222;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .header h1 {
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    letter-spacing: 0.5px;
  }
  .header-right {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .count {
    color: #666;
    font-size: 12px;
  }
  .btn {
    background: none;
    border: 1px solid #333;
    color: #888;
    padding: 4px 10px;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .btn:hover { color: #fff; border-color: #555; }
  .btn-danger:hover { color: #ff4444; border-color: #ff4444; }
  .filters {
    padding: 10px 20px;
    border-bottom: 1px solid #111;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .filters input {
    background: #111;
    border: 1px solid #222;
    color: #ccc;
    padding: 4px 8px;
    font-family: inherit;
    font-size: 12px;
    width: 250px;
  }
  .filters input:focus { outline: none; border-color: #444; }
  .filter-btn {
    background: none;
    border: 1px solid #222;
    color: #555;
    padding: 3px 8px;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .filter-btn.active { color: #fff; border-color: #555; }
  .filter-btn:hover { color: #fff; }
  .errors { padding: 0; }
  .error-item {
    border-bottom: 1px solid #111;
    padding: 12px 20px;
    cursor: pointer;
  }
  .error-item:hover { background: #0a0a0a; }
  .error-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }
  .error-message {
    color: #fff;
    font-size: 13px;
    word-break: break-word;
    flex: 1;
  }
  .error-meta {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-shrink: 0;
  }
  .source-badge {
    font-size: 10px;
    padding: 1px 6px;
    border: 1px solid #333;
    color: #777;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .timestamp {
    color: #444;
    font-size: 11px;
    white-space: nowrap;
  }
  .error-details {
    display: none;
    margin-top: 10px;
    padding: 10px;
    background: #0a0a0a;
    border: 1px solid #181818;
    white-space: pre-wrap;
    word-break: break-all;
    color: #888;
    font-size: 12px;
    max-height: 300px;
    overflow-y: auto;
  }
  .error-item.expanded .error-details { display: block; }
  .error-actions {
    margin-top: 8px;
    display: none;
  }
  .error-item.expanded .error-actions { display: block; }
  .empty {
    padding: 60px 20px;
    text-align: center;
    color: #333;
    font-size: 14px;
  }
  .version-tag {
    font-size: 10px;
    color: #444;
  }
  .context-line {
    color: #555;
    font-size: 12px;
    margin-top: 4px;
  }
  .delete-single {
    background: none;
    border: 1px solid #222;
    color: #555;
    padding: 2px 8px;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .delete-single:hover { color: #ff4444; border-color: #ff4444; }
  .auto-refresh {
    color: #333;
    font-size: 11px;
  }
</style>
</head>
<body>
<div class="header">
  <h1>ERROR LOG</h1>
  <div class="header-right">
    <span class="count" id="count"></span>
    <span class="auto-refresh" id="refresh-status">auto-refresh: on</span>
    <button class="btn" onclick="loadErrors()">Refresh</button>
    <button class="btn btn-danger" onclick="clearAll()">Clear All</button>
  </div>
</div>
<div class="filters">
  <input type="text" id="search" placeholder="Search errors..." oninput="filterErrors()">
  <button class="filter-btn active" data-source="all" onclick="setFilter('all', this)">All</button>
  <button class="filter-btn" data-source="sync" onclick="setFilter('sync', this)">Sync</button>
  <button class="filter-btn" data-source="ipc" onclick="setFilter('ipc', this)">IPC</button>
  <button class="filter-btn" data-source="uncaught" onclick="setFilter('uncaught', this)">Uncaught</button>
  <button class="filter-btn" data-source="unhandled-rejection" onclick="setFilter('unhandled-rejection', this)">Rejection</button>
</div>
<div class="errors" id="errors"></div>

<script>
const TOKEN_PARAM = '${tokenParam}'
const API_BASE = ''
let allErrors = []
let currentFilter = 'all'
let refreshInterval = null

async function apiFetch(path, opts = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const url = API_BASE + path + (TOKEN_PARAM ? sep + TOKEN_PARAM.slice(1) : '')
  return fetch(url, opts)
}

async function loadErrors() {
  try {
    const res = await apiFetch('/errors?limit=200')
    const data = await res.json()
    allErrors = data.errors || []
    document.getElementById('count').textContent = data.total + ' errors'
    filterErrors()
  } catch (e) {
    document.getElementById('errors').innerHTML = '<div class="empty">Failed to load errors</div>'
  }
}

function filterErrors() {
  const search = document.getElementById('search').value.toLowerCase()
  let filtered = allErrors
  if (currentFilter !== 'all') {
    filtered = filtered.filter(e => e.source === currentFilter)
  }
  if (search) {
    filtered = filtered.filter(e =>
      (e.message || '').toLowerCase().includes(search) ||
      (e.stack || '').toLowerCase().includes(search) ||
      (e.context || '').toLowerCase().includes(search)
    )
  }
  renderErrors(filtered)
}

function setFilter(source, btn) {
  currentFilter = source
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  filterErrors()
}

function renderErrors(errors) {
  const container = document.getElementById('errors')
  if (errors.length === 0) {
    container.innerHTML = '<div class="empty">No errors</div>'
    return
  }
  container.innerHTML = errors.map(e => {
    const date = new Date(e.ts)
    const timeStr = date.toLocaleString()
    const details = []
    if (e.stack) details.push('Stack:\\n' + e.stack)
    if (e.context) details.push('Context: ' + e.context)
    if (e.platform) details.push('Platform: ' + e.platform)
    const detailStr = details.join('\\n\\n')
    return \`
      <div class="error-item" onclick="this.classList.toggle('expanded')">
        <div class="error-top">
          <span class="error-message">\${esc(e.message)}</span>
          <div class="error-meta">
            \${e.appVersion ? '<span class="version-tag">v' + esc(e.appVersion) + '</span>' : ''}
            <span class="source-badge">\${esc(e.source)}</span>
            <span class="timestamp">\${timeStr}</span>
          </div>
        </div>
        \${e.context ? '<div class="context-line">' + esc(e.context) + '</div>' : ''}
        <div class="error-details">\${esc(detailStr)}</div>
        <div class="error-actions">
          <button class="delete-single" onclick="event.stopPropagation(); deleteError('\${e.id}')">Delete</button>
        </div>
      </div>
    \`
  }).join('')
}

function esc(str) {
  if (!str) return ''
  const d = document.createElement('div')
  d.textContent = str
  return d.innerHTML
}

async function deleteError(id) {
  await apiFetch('/errors/' + encodeURIComponent(id), { method: 'DELETE' })
  loadErrors()
}

async function clearAll() {
  if (!confirm('Clear all errors?')) return
  await apiFetch('/errors', { method: 'DELETE' })
  loadErrors()
}

// Auto-refresh every 30s
loadErrors()
refreshInterval = setInterval(loadErrors, 30000)
</script>
</body>
</html>`
}
