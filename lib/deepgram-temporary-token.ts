const DEEPGRAM_GRANT_URL = 'https://api.deepgram.com/v1/auth/grant'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Requests a short-lived JWT from Deepgram's token grant endpoint.
 * @param apiKey Project API key (Member role or higher).
 * @returns The `access_token` string from the grant response.
 */
export async function getDeepgramTemporaryToken(apiKey: string): Promise<string> {
  const key = apiKey.trim()
  if (!key) {
    throw new Error('Deepgram API key is missing or empty.')
  }

  const res = await fetch(DEEPGRAM_GRANT_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new Error(`Deepgram auth grant failed: response was not valid JSON (HTTP ${res.status}).`)
  }

  if (!res.ok) {
    let suffix = ''
    if (isPlainObject(body)) {
      const msg =
        (typeof body.message === 'string' && body.message) ||
        (typeof body.err_msg === 'string' && body.err_msg) ||
        ''
      suffix = msg ? `: ${msg}` : `: ${JSON.stringify(body)}`
    } else if (typeof body === 'string') {
      suffix = `: ${body}`
    } else {
      suffix = `: ${JSON.stringify(body)}`
    }
    throw new Error(`Deepgram auth grant failed with HTTP ${res.status}${suffix}`)
  }

  if (!isPlainObject(body) || typeof body.access_token !== 'string') {
    throw new Error('Deepgram auth grant returned an invalid or missing access_token.')
  }

  const token = body.access_token.trim()
  if (!token) {
    throw new Error('Deepgram auth grant returned an invalid or missing access_token.')
  }

  return token
}
