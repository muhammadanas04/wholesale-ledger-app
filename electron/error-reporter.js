// ── Fire-and-forget error reporter ──
// Sends errors to the independent error-reporter worker.
// NEVER throws, NEVER blocks the app. Triple-wrapped.

const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const { getMeta } = require('./db')

const REPORT_TIMEOUT_MS = 5000

function getConfig() {
  let url = (typeof getMeta === 'function' && getMeta('error_reporter_url')) || process.env.ERROR_REPORTER_URL
  let token = (typeof getMeta === 'function' && getMeta('error_reporter_token')) || process.env.ERROR_REPORTER_TOKEN

  if (!url || !token) {
    try {
      const envPath = path.join(__dirname, '..', '.env')
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n')
        for (const line of lines) {
          const parts = line.split('=')
          if (parts.length >= 2) {
            const k = parts[0].trim()
            const v = parts.slice(1).join('=').trim()
            if (k === 'ERROR_REPORTER_URL' && !url) url = v
            if (k === 'ERROR_REPORTER_TOKEN' && !token) token = v
          }
        }
      }
    } catch {}
  }
  return { url, token }
}

/**
 * Report an error to the error-reporter worker.
 * This function NEVER throws and NEVER blocks.
 *
 * @param {Object} opts
 * @param {Error|string} opts.error  - The error object or message string
 * @param {string}       opts.source - Where it happened: 'sync', 'ipc', 'uncaught', 'unhandled-rejection'
 * @param {string}       [opts.context] - Extra context (e.g. 'push step', 'customers:add')
 */
function reportError({ error, source, context }) {
  try {
    const { url, token } = getConfig()
    if (!url || !token) return // not configured, skip silently

    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : null

    let appVersion = null
    try { appVersion = app.getVersion() } catch {}

    const body = JSON.stringify({
      message,
      stack,
      source: source || 'unknown',
      context: context || null,
      appVersion,
      platform: process.platform,
    })

    // Fire and forget — use AbortController for timeout
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS)

    fetch(`${url}/report`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    })
      .catch(() => {}) // swallow — never let this fail anything
      .finally(() => clearTimeout(timer))
  } catch {
    // Outermost catch — if even building the payload fails, do nothing
  }
}

module.exports = { reportError }
