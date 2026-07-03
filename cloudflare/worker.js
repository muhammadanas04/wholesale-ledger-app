// ── Base64Url helper functions for JWT ──
function base64UrlEncode(str) {
  return btoa(str)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return atob(str);
}

// ── HS256 JWT sign helper using Web Crypto ──
async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const textToSign = `${encodedHeader}.${encodedPayload}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(textToSign)
  );

  const encodedSignature = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${textToSign}.${encodedSignature}`;
}

// ── HS256 JWT verify helper using Web Crypto ──
async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const textToSign = `${encodedHeader}.${encodedPayload}`;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigStr = base64UrlDecode(encodedSignature);
    const sigBuf = new Uint8Array(sigStr.split('').map(c => c.charCodeAt(0)));

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBuf,
      enc.encode(textToSign)
    );

    if (!isValid) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null;
    }

    return payload;
  } catch (e) {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const auth = request.headers.get('Authorization')
    const SECRET = env.SYNC_SECRET || env.SYNC_KEY

    if (!SECRET) {
      return new Response('Server misconfigured — SYNC_SECRET or SYNC_KEY not set', { status: 500 })
    }

    // Helper to check admin authorization
    const checkAdminAuth = () => {
      const matchSecret = env.SYNC_SECRET && auth === `Bearer ${env.SYNC_SECRET}`
      const matchKey = env.SYNC_KEY && auth === `Bearer ${env.SYNC_KEY}`
      if (!matchSecret && !matchKey) {
        return new Response('Unauthorized', { status: 401 })
      }
      return null
    }

    // Helper to check driver authorization (JWT Bearer token)
    const checkDriverAuth = async () => {
      const authHeader = request.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
          errorResponse: new Response(JSON.stringify({ ok: false, error: 'Unauthorized: Missing or invalid token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
      const token = authHeader.substring(7)

      // Driver JWTs MUST be verified against a dedicated JWT_SECRET — never the
      // admin SYNC_SECRET / SYNC_KEY, which belong to a separate trust domain.
      // Reusing the admin secret would let anyone holding it forge a valid
      // driver token. If JWT_SECRET is unset, fail closed (no silent fallback).
      if (!env.JWT_SECRET) {
        return {
          errorResponse: new Response(JSON.stringify({ ok: false, error: 'Server misconfigured — JWT_SECRET not set' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
      const payload = await verifyJWT(token, env.JWT_SECRET)

      if (!payload) {
        return {
          errorResponse: new Response(JSON.stringify({ ok: false, error: 'Unauthorized: Invalid or expired token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
      return { driverId: payload.driverId }
    }

    // Helper to enforce a 6-month maximum lookback on sync pulls
    const getClampedSince = (sinceParam) => {
      let since = sinceParam || '1970-01-01 00:00:00';
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      let parseStr = since;
      if (!parseStr.includes('T')) parseStr = parseStr.replace(' ', 'T');
      if (!parseStr.includes('Z')) parseStr += 'Z';
      
      const sinceDate = new Date(parseStr);
      if (isNaN(sinceDate.getTime()) || sinceDate < sixMonthsAgo) {
        return sixMonthsAgo.toISOString().replace('T', ' ').slice(0, 19);
      }
      return since;
    };

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

      const since = getClampedSince(url.searchParams.get('since'))
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
        const rulesRow = await env.DB.prepare("SELECT value, updated_at FROM _meta WHERE key = 'rounding_rules'").first()
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

      const since = getClampedSince(url.searchParams.get('since'))
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

    // 5b. GET /admin/expenses (Admin reads driver expenses)
    if (request.method === 'GET' && url.pathname === '/admin/expenses') {
      const authError = checkAdminAuth()
      if (authError) return authError

      try {
        const driverId = url.searchParams.get('driverId')
        let stmt = env.DB.prepare(`
          SELECT e.*, d.name AS driver_name
          FROM expenses e
          JOIN drivers d ON e.driver_id = d.id
          ${driverId ? 'WHERE e.driver_id = ?' : ''}
          ORDER BY e.created_at DESC
        `)
        
        if (driverId) {
          stmt = stmt.bind(driverId)
        }

        const { results } = await stmt.all()

        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // ── PUBLIC DRIVER ROUTES ──────────────────────────────────────────────────

    // 6. POST /driver/auth (Driver OTP Verification -> Returns JWT)
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
        `).bind(phone).first()

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

        // Generate custom JWT token for authentication (valid for 30 days).
        // Driver tokens are signed with JWT_SECRET only — distinct from the
        // admin SYNC_SECRET. Refuse to issue if JWT_SECRET is unset so we never
        // silently fall back to the admin secret.
        if (!env.JWT_SECRET) {
          return new Response(JSON.stringify({ ok: false, error: 'Server misconfigured — JWT_SECRET not set' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const tokenPayload = {
          driverId: driver.id,
          phone: driver.phone,
          exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
        }
        const token = await signJWT(tokenPayload, env.JWT_SECRET)

        return new Response(
          JSON.stringify({
            ok: true,
            driver_id: driver.id,
            name: driver.name,
            token: token
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

    // 7. GET /receipt/:filename (Proxy-serving private Backblaze B2 downloads)
    const matchReceiptView = url.pathname.match(/^\/receipt\/([^\/]+)$/)
    if (request.method === 'GET' && matchReceiptView) {
      try {
        const filename = matchReceiptView[1]

        if (!env.B2_APPLICATION_KEY_ID || !env.B2_APPLICATION_KEY || !env.B2_BUCKET_NAME) {
          return new Response('B2 Storage not configured on server', { status: 500 })
        }

        // 1. Authorize Account in Backblaze B2
        const b2AuthHeaders = new Headers()
        b2AuthHeaders.set('Authorization', 'Basic ' + btoa(env.B2_APPLICATION_KEY_ID + ':' + env.B2_APPLICATION_KEY))
        const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
          headers: b2AuthHeaders
        })
        if (!authRes.ok) {
          return new Response('Failed to authorize storage provider', { status: 500 })
        }
        const authData = await authRes.json()
        const { downloadUrl, authorizationToken } = authData

        // 2. Fetch the file securely from private bucket
        const fileRes = await fetch(`${downloadUrl}/file/${env.B2_BUCKET_NAME}/${filename}`, {
          headers: { 'Authorization': authorizationToken }
        })

        if (!fileRes.ok) {
          return new Response('Receipt photo not found', { status: 404 })
        }

        // 3. Return stream to the user
        return new Response(fileRes.body, {
          status: 200,
          headers: {
            'Content-Type': fileRes.headers.get('Content-Type') || 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000',
            'Access-Control-Allow-Origin': '*'
          }
        })
      } catch (err) {
        return new Response(err.message, { status: 500 })
      }
    }

    // ── SECURE DRIVER ROUTES (Require Driver JWT) ─────────────────────────────

    // 8. POST /driver/location (Driver logs location)
    if (request.method === 'POST' && url.pathname === '/driver/location') {
      try {
        const { driverId, errorResponse } = await checkDriverAuth()
        if (errorResponse) return errorResponse

        const { latitude, longitude } = await request.json()
        if (latitude === undefined || longitude === undefined) {
          return new Response(JSON.stringify({ ok: false, error: 'Missing required fields' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Reject non-numeric or out-of-range coordinates rather than persisting
        // junk (e.g. null, string, or a stale (0,0) GPS lock) to driver_locations.
        if (
          typeof latitude !== 'number' ||
          typeof longitude !== 'number' ||
          Number.isNaN(latitude) ||
          Number.isNaN(longitude) ||
          latitude < -90 || latitude > 90 ||
          longitude < -180 || longitude > 180
        ) {
          return new Response(JSON.stringify({ ok: false, error: 'Invalid coordinates' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const driver = await env.DB.prepare(`
          SELECT active FROM drivers WHERE id = ?
        `).bind(driverId).first()

        if (!driver || driver.active !== 1) {
          return new Response(JSON.stringify({ ok: false, error: 'Unauthorized driver' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Ensure there are no orphaned old rows for this driver (e.g. from before driverId was used as id)
        await env.DB.prepare(`
          DELETE FROM driver_locations WHERE driver_id = ? AND id != ?
        `).bind(driverId, driverId).run()

        // Insert or overwrite latest location
        await env.DB.prepare(`
          INSERT INTO driver_locations (id, driver_id, latitude, longitude, recorded_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            recorded_at = excluded.recorded_at
        `).bind(driverId, driverId, latitude, longitude, new Date().toISOString()).run()

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

    // 9. PATCH /delivery-item/:id/status (Driver completes a stop)
    const matchStatusRoute = url.pathname.match(/^\/delivery-item\/([^\/]+)\/status$/)
    if (request.method === 'PATCH' && matchStatusRoute) {
      try {
        const { driverId, errorResponse } = await checkDriverAuth()
        if (errorResponse) return errorResponse

        const itemId = matchStatusRoute[1]
        const { status } = await request.json()
        if (!status) {
          return new Response(JSON.stringify({ ok: false, error: 'Missing status value' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Validate item existence & ownership (Issue #7)
        const item = await env.DB.prepare(`
          SELECT di.delivery_id, d.driver_id
          FROM delivery_items di
          JOIN deliveries d ON di.delivery_id = d.id
          WHERE di.id = ?
        `).bind(itemId).first()

        if (!item) {
          return new Response(JSON.stringify({ ok: false, error: 'Delivery item not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (item.driver_id !== driverId) {
          return new Response(JSON.stringify({ ok: false, error: 'Forbidden: You do not own this delivery item' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const nowStr = new Date().toISOString()
        const deliveryId = item.delivery_id

        // Update item status
        await env.DB.prepare(`
          UPDATE delivery_items
          SET status = ?, updated_at = ?
          WHERE id = ?
        `).bind(status, nowStr, itemId).run()

        // Check if all items in this delivery batch are done or rejected
        const { results: pendingItems } = await env.DB.prepare(`
          SELECT id FROM delivery_items
          WHERE delivery_id = ? AND status = 'pending'
        `).bind(deliveryId).all()

        if (pendingItems.length === 0) {
          await env.DB.prepare(`
            UPDATE deliveries
            SET status = 'completed', updated_at = ?
            WHERE id = ?
          `).bind(nowStr, deliveryId).run()
        } else {
          await env.DB.prepare(`
            UPDATE deliveries
            SET status = 'in_progress', updated_at = ?
            WHERE id = ?
          `).bind(nowStr, deliveryId).run()
        }

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

    // 10. GET /driver/deliveries (Driver pulls their assigned deliveries - Optimized single query)
    if (request.method === 'GET' && url.pathname === '/driver/deliveries') {
      try {
        const { driverId, errorResponse } = await checkDriverAuth()
        if (errorResponse) return errorResponse

        // Fetch deliveries assigned to the driver
        const { results: deliveries } = await env.DB.prepare(`
          SELECT * FROM deliveries WHERE driver_id = ? ORDER BY created_at DESC
        `).bind(driverId).all()

        if (deliveries.length === 0) {
          return new Response(JSON.stringify({ deliveries: [] }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Fetch all delivery items for the assigned deliveries in ONE single query (Resolves Issue #19)
        const deliveryIds = deliveries.map(d => d.id)
        const placeholders = deliveryIds.map(() => '?').join(', ')

        const { results: allItems } = await env.DB.prepare(`
          SELECT di.*, c.name AS fallback_name, c.phone AS fallback_phone
          FROM delivery_items di
          LEFT JOIN customers c ON di.customer_id = c.id
          WHERE di.delivery_id IN (${placeholders})
          ORDER BY di.created_at ASC
        `).bind(...deliveryIds).all()

        // Group items in JS
        const itemsByDelivery = {}
        for (const item of allItems) {
          if (!itemsByDelivery[item.delivery_id]) {
            itemsByDelivery[item.delivery_id] = []
          }
          itemsByDelivery[item.delivery_id].push({
            ...item,
            customer_name: item.customer_name || item.fallback_name || 'Unknown Customer',
            customer_phone: item.customer_phone || item.fallback_phone || '',
            fallback_name: undefined,
            fallback_phone: undefined,
          })
        }

        const populatedDeliveries = deliveries.map(delivery => ({
          ...delivery,
          items: itemsByDelivery[delivery.id] || []
        }))

        return new Response(JSON.stringify({ deliveries: populatedDeliveries }), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // 11. PATCH /delivery-item/:id (Driver edits quantity / weight)
    const matchEditItemRoute = url.pathname.match(/^\/delivery-item\/([^\/]+)$/)
    if (request.method === 'PATCH' && matchEditItemRoute) {
      try {
        const { driverId, errorResponse } = await checkDriverAuth()
        if (errorResponse) return errorResponse

        const itemId = matchEditItemRoute[1]
        const { qty, weight } = await request.json()

        // Input validations (Issue #7)
        if (qty !== undefined && (typeof qty !== 'number' || qty <= 0 || !Number.isInteger(qty))) {
          return new Response(JSON.stringify({ ok: false, error: 'Quantity must be an integer greater than 0' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (weight !== undefined && (typeof weight !== 'number' || weight < 0)) {
          return new Response(JSON.stringify({ ok: false, error: 'Weight must be a positive number' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Validate item existence & ownership (Issue #7)
        const item = await env.DB.prepare(`
          SELECT di.id, d.driver_id
          FROM delivery_items di
          JOIN deliveries d ON di.delivery_id = d.id
          WHERE di.id = ?
        `).bind(itemId).first()

        if (!item) {
          return new Response(JSON.stringify({ ok: false, error: 'Delivery item not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (item.driver_id !== driverId) {
          return new Response(JSON.stringify({ ok: false, error: 'Forbidden: You do not own this delivery item' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const nowStr = new Date().toISOString()
        await env.DB.prepare(`
          UPDATE delivery_items
          SET qty = ?, weight = ?, updated_at = ?
          WHERE id = ?
        `).bind(qty, weight, nowStr, itemId).run()

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

    // 12. POST /driver/expense (Driver reports an expense receipt)
    if (request.method === 'POST' && url.pathname === '/driver/expense') {
      try {
        const { driverId, errorResponse } = await checkDriverAuth()
        if (errorResponse) return errorResponse

        const { category, amount, note, image_url } = await request.json()
        if (!category || amount === undefined || !image_url) {
          return new Response(JSON.stringify({ ok: false, error: 'Missing required fields' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const id = crypto.randomUUID()
        const nowStr = new Date().toISOString()

        await env.DB.prepare(`
          INSERT INTO expenses (id, driver_id, category, amount, note, image_url, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(id, driverId, category, amount, note, image_url, nowStr).run()

        return new Response(JSON.stringify({ ok: true, id }), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // 13. GET /driver/expenses (Driver pulls their reported expenses - Issue #18)
    if (request.method === 'GET' && url.pathname === '/driver/expenses') {
      try {
        const { driverId, errorResponse } = await checkDriverAuth()
        if (errorResponse) return errorResponse

        const { results } = await env.DB.prepare(`
          SELECT * FROM expenses WHERE driver_id = ? ORDER BY created_at DESC
        `).bind(driverId).all()

        return new Response(JSON.stringify({ expenses: results }), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // 14. POST /driver/upload-receipt (Proxies image uploads to private Backblaze B2 bucket)
    if (request.method === 'POST' && url.pathname === '/driver/upload-receipt') {
      try {
        const { driverId, errorResponse } = await checkDriverAuth()
        if (errorResponse) return errorResponse

        if (!env.B2_APPLICATION_KEY_ID || !env.B2_APPLICATION_KEY || !env.B2_BUCKET_ID || !env.B2_BUCKET_NAME) {
          return new Response(JSON.stringify({ ok: false, error: 'Backblaze B2 is not configured in Worker secrets' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Parse multipart body
        const formData = await request.formData()
        const file = formData.get('file')
        if (!file) {
          return new Response(JSON.stringify({ ok: false, error: 'No file provided' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const fileBytes = await file.arrayBuffer()

        // 1. Authorize B2 Account
        const b2AuthHeaders = new Headers()
        b2AuthHeaders.set('Authorization', 'Basic ' + btoa(env.B2_APPLICATION_KEY_ID + ':' + env.B2_APPLICATION_KEY))
        const b2AuthRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
          headers: b2AuthHeaders
        })
        if (!b2AuthRes.ok) {
          return new Response(JSON.stringify({ ok: false, error: 'B2 Auth failed: ' + await b2AuthRes.text() }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const b2AuthData = await b2AuthRes.json()
        const { apiUrl, authorizationToken } = b2AuthData

        // 2. Get Upload URL
        const uploadUrlRes = await fetch(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
          method: 'POST',
          headers: {
            'Authorization': authorizationToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ bucketId: env.B2_BUCKET_ID })
        })
        if (!uploadUrlRes.ok) {
          return new Response(JSON.stringify({ ok: false, error: 'B2 Get Upload URL failed: ' + await uploadUrlRes.text() }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const uploadUrlData = await uploadUrlRes.json()
        const { uploadUrl, authorizationToken: uploadAuthToken } = uploadUrlData

        // 3. Upload File bytes
        const filename = `${crypto.randomUUID()}.jpg`
        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': uploadAuthToken,
            'X-Bz-File-Name': encodeURIComponent(filename),
            'Content-Type': 'image/jpeg',
            'X-Bz-Content-Sha1': 'do_not_verify'
          },
          body: fileBytes
        })
        if (!uploadRes.ok) {
          return new Response(JSON.stringify({ ok: false, error: 'B2 File Upload failed: ' + await uploadRes.text() }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const publicUrl = `${url.origin}/receipt/${filename}`
        return new Response(JSON.stringify({ ok: true, url: publicUrl }), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // 15. GET /driver/customers (Driver pulls list of customers for autocomplete)
    if (request.method === 'GET' && url.pathname === '/driver/customers') {
      try {
        const { driverId, errorResponse } = await checkDriverAuth()
        if (errorResponse) return errorResponse

        const { results } = await env.DB.prepare(`
          SELECT id, name, address FROM customers
        `).all()

        return new Response(JSON.stringify({ customers: results }), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // 16. POST /driver/delivery-items (Driver creates a new delivery item/order)
    if (request.method === 'POST' && url.pathname === '/driver/delivery-items') {
      try {
        const { driverId, errorResponse } = await checkDriverAuth()
        if (errorResponse) return errorResponse

        const { customer_name, address, qty, weight } = await request.json()
        
        if (!customer_name || qty === undefined || weight === undefined) {
          return new Response(JSON.stringify({ ok: false, error: 'Missing required fields' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        let activeDelivery = await env.DB.prepare(`
          SELECT id FROM deliveries 
          WHERE driver_id = ? AND status != 'completed' 
          ORDER BY created_at DESC LIMIT 1
        `).bind(driverId).first()

        const nowStr = new Date().toISOString()
        
        if (!activeDelivery) {
          const newDeliveryId = crypto.randomUUID()
          await env.DB.prepare(`
            INSERT INTO deliveries (id, driver_id, status, created_at, updated_at)
            VALUES (?, ?, 'pending', ?, ?)
          `).bind(newDeliveryId, driverId, nowStr, nowStr).run()
          activeDelivery = { id: newDeliveryId }
        }

        const itemId = crypto.randomUUID()
        const stockAmount = qty.toString() 

        await env.DB.prepare(`
          INSERT INTO delivery_items (id, delivery_id, customer_name, address, qty, weight, stock_amount, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `).bind(itemId, activeDelivery.id, customer_name, address || '', qty, weight, stockAmount, nowStr, nowStr).run()

        return new Response(JSON.stringify({ ok: true, id: itemId }), {
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
