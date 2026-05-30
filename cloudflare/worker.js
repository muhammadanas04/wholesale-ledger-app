export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const auth = request.headers.get('Authorization')
    const SECRET = env.SYNC_SECRET

    if (!SECRET) {
      return new Response('Server misconfigured — SYNC_SECRET not set', { status: 500 })
    }

    if (auth !== `Bearer ${SECRET}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    // ── GET /pull ────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/pull') {
      const since = url.searchParams.get('since') || '1970-01-01 00:00:00'
      const tables = ['customers', 'products', 'stock_purchases', 'sales', 'sale_items', 'payments']
      const results = {}

      for (const table of tables) {
        const { results: rows } = await env.DB.prepare(
          `SELECT * FROM ${table} WHERE updated_at > ?`
        ).bind(since).all()
        // Strip the 'synced' column — it's a local-only tracking field
        results[table] = rows.map(({ synced, ...rest }) => rest)
      }

      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── POST /push ───────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/push') {
      const data = await request.json()
      const tables = ['customers', 'products', 'stock_purchases', 'sales', 'sale_items', 'payments']

      try {
        for (const table of tables) {
          const rows = data[table] || []
          if (rows.length === 0) continue

          for (const row of rows) {
            const columns = Object.keys(row).filter(k => k !== 'synced')
            const placeholders = columns.map(() => '?').join(', ')
            const updates = columns.map(c => `${c} = EXCLUDED.${c}`).join(', ')

            await env.DB.prepare(`
              INSERT INTO ${table} (${columns.join(', ')})
              VALUES (${placeholders})
              ON CONFLICT(id) DO UPDATE SET ${updates}
              WHERE EXCLUDED.updated_at > ${table}.updated_at
            `).bind(...columns.map(c => row[c])).run()
          }
        }

        // Handle deletions sent by the app
        const deletes = data._deletes || []
        for (const entry of deletes) {
          const { table_name, row_id } = entry
          if (!tables.includes(table_name)) continue // safety guard
          await env.DB.prepare(`DELETE FROM ${table_name} WHERE id = ?`).bind(row_id).run()
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response('Not Found', { status: 404 })
  },
}
