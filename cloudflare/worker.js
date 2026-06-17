export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const auth = request.headers.get('Authorization')
    const SECRET = env.SYNC_SECRET

    if (!SECRET) {
      return new Response('Server misconfigured — SYNC_SECRET not set', { status: 500 })
    }

    // Helper to check admin authorization
    const checkAdminAuth = () => {
      if (auth !== `Bearer ${SECRET}`) {
        return new Response('Unauthorized', { status: 401 })
      }
      return null
    }

    // ── ADMIN ROUTES (Require SYNC_SECRET) ──────────────────────────────────

    // 1. GET /pull (Core Business)
    if (request.method === 'GET' && url.pathname === '/pull') {
      const authError = checkAdminAuth()
      if (authError) return authError

      // Cleanup tmp_records older than 15 days from D1
      try {
        await env.DB.prepare(
          "DELETE FROM tmp_records WHERE date < date('now', '-15 days')"
        ).run();
      } catch (e) {
        console.error('tmp_records D1 cleanup error:', e);
      }

      const since = url.searchParams.get('since') || '1970-01-01 00:00:00'
      const tables = ['customers', 'products', 'stock_purchases', 'sales', 'sale_items', 'payments', 'other_expenses', 'tmp_records']
      const results = {}

      for (const table of tables) {
        const { results: rows } = await env.DB.prepare(
          `SELECT * FROM ${table} WHERE updated_at > ?`
        ).bind(since).all()
        // Strip the 'synced' column — it's a local-only tracking field
        results[table] = rows.map(({ synced, ...rest }) => rest)
      }

      // Fetch dynamic settings from _meta
      let roundingRules = null
      let roundingRulesUpdatedAt = null
      try {
        const rulesRow = await env.DB.prepare("SELECT value, updated_at FROM _meta WHERE key = 'rounding_rules'").get()
        if (rulesRow) {
          roundingRules = rulesRow.value
          roundingRulesUpdatedAt = rulesRow.updated_at
        }
      } catch (e) {
        // Table may not exist yet or be empty, ignore safely
      }

      results['_settings'] = {
        rounding_rules: roundingRules,
        rounding_rules_updated_at: roundingRulesUpdatedAt
      }

      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. POST /push (Core Business)
    if (request.method === 'POST' && url.pathname === '/push') {
      const authError = checkAdminAuth()
      if (authError) return authError

      const data = await request.json()
      const tables = ['customers', 'products', 'stock_purchases', 'sales', 'sale_items', 'payments', 'other_expenses', 'tmp_records']

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

        // Handle settings push
        const settings = data._settings
        if (settings && settings.rounding_rules && settings.rounding_rules_updated_at) {
          try {
            await env.DB.prepare(`
              INSERT INTO _meta (key, value, updated_at)
              VALUES ('rounding_rules', ?, ?)
              ON CONFLICT(key) DO UPDATE SET
                value = CASE WHEN excluded.updated_at > _meta.updated_at OR _meta.updated_at IS NULL THEN excluded.value ELSE _meta.value END,
                updated_at = CASE WHEN excluded.updated_at > _meta.updated_at OR _meta.updated_at IS NULL THEN excluded.updated_at ELSE _meta.updated_at END
            `).bind(settings.rounding_rules, settings.rounding_rules_updated_at).run()
          } catch (e) {
            console.error('Settings sync push error:', e)
          }
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

    // 3. GET /pull/delivery (Delivery module pull)
    if (request.method === 'GET' && url.pathname === '/pull/delivery') {
      const authError = checkAdminAuth()
      if (authError) return authError

      const since = url.searchParams.get('since') || '1970-01-01 00:00:00'
      const tables = ['drivers', 'deliveries', 'delivery_items']
      const results = {}

      for (const table of tables) {
        const { results: rows } = await env.DB.prepare(
          `SELECT * FROM ${table} WHERE updated_at > ?`
        ).bind(since).all()
        results[table] = rows.map(({ synced, ...rest }) => rest)
      }

      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 4. POST /push/delivery (Delivery module push)
    if (request.method === 'POST' && url.pathname === '/push/delivery') {
      const authError = checkAdminAuth()
      if (authError) return authError

      const data = await request.json()
      const tables = ['drivers', 'deliveries', 'delivery_items']

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

    // 5. GET /driver/locations (Admin reads active tracking pins)
    if (request.method === 'GET' && url.pathname === '/driver/locations') {
      const authError = checkAdminAuth()
      if (authError) return authError

      try {
        const { results } = await env.DB.prepare(`
          SELECT dl.driver_id, d.name AS driver_name, d.phone, dl.latitude, dl.longitude, dl.recorded_at
          FROM driver_locations dl
          JOIN drivers d ON dl.driver_id = d.id
          WHERE d.active = 1
        `).all()

        return new Response(JSON.stringify({ locations: results }), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // ── DRIVER APP ROUTES (Do NOT require SYNC_SECRET) ──────────────────────

    // 6. POST /driver/auth (Driver OTP Verification)
    if (request.method === 'POST' && url.pathname === '/driver/auth') {
      try {
        const { phone, otp } = await request.json()
        if (!phone || !otp) {
          return new Response(JSON.stringify({ ok: false, error: 'Missing required fields' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const driver = await env.DB.prepare(`
          SELECT * FROM drivers WHERE phone = ? AND active = 1
        `).bind(phone).get()

        if (!driver) {
          return new Response(JSON.stringify({ ok: false, error: 'Driver account not found or inactive' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (driver.otp_used === 1) {
          return new Response(JSON.stringify({ ok: false, error: 'OTP has already been used' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (driver.otp !== otp) {
          return new Response(JSON.stringify({ ok: false, error: 'Invalid OTP' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // OTP is correct and unused -> mark consumed
        await env.DB.prepare(`
          UPDATE drivers
          SET otp_used = 1, updated_at = ?
          WHERE id = ?
        `).bind(new Date().toISOString(), driver.id).run()

        return new Response(
          JSON.stringify({
            ok: true,
            driver_id: driver.id,
            name: driver.name,
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        )
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // 7. POST /driver/location (Driver logs location)
    if (request.method === 'POST' && url.pathname === '/driver/location') {
      try {
        const { driver_id, latitude, longitude } = await request.json()
        if (!driver_id || latitude === undefined || longitude === undefined) {
          return new Response(JSON.stringify({ ok: false, error: 'Missing required fields' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const driver = await env.DB.prepare(`
          SELECT active FROM drivers WHERE id = ?
        `).bind(driver_id).get()

        if (!driver || driver.active !== 1) {
          return new Response(JSON.stringify({ ok: false, error: 'Unauthorized driver' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Insert or overwrite the latest location per driver ID
        await env.DB.prepare(`
          INSERT INTO driver_locations (id, driver_id, latitude, longitude, recorded_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            recorded_at = excluded.recorded_at
        `).bind(driver_id, driver_id, latitude, longitude, new Date().toISOString()).run()

        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // 8. PATCH /delivery-item/:id/status (Driver completes a stop)
    const matchStatusRoute = url.pathname.match(/^\/delivery-item\/([^\/]+)\/status$/)
    if (request.method === 'PATCH' && matchStatusRoute) {
      try {
        const itemId = matchStatusRoute[1]
        const { status } = await request.json()
        if (!status) {
          return new Response(JSON.stringify({ ok: false, error: 'Missing status value' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        await env.DB.prepare(`
          UPDATE delivery_items
          SET status = ?, updated_at = ?
          WHERE id = ?
        `).bind(status, new Date().toISOString(), itemId).run()

        return new Response(JSON.stringify({ ok: true }), {
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
