export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY neni nastaven' }),
    }
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid JSON' }),
    }
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms))

  const callAnthropic = async () => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: body.system,
        messages: body.messages,
      }),
    })
    return response
  }

  // Retry logika: az 3 pokusy, pri 429 ceka exponencially
  const MAX_RETRIES = 3
  const RETRY_DELAYS = [30000, 60000, 90000] // 30s, 60s, 90s

  let lastStatus = 500
  let lastData = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await callAnthropic()
      const text = await response.text()

      let data
      try { data = JSON.parse(text) } catch (e) {
        return {
          statusCode: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Invalid response', raw: text.slice(0, 300) }),
        }
      }

      lastStatus = response.status
      lastData = data

      // Uspech
      if (response.status === 200) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(data),
        }
      }

      // Rate limit — cekej a zkus znovu
      if (response.status === 429) {
        const retryAfter = response.headers?.get?.('retry-after')
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_DELAYS[attempt]
        if (attempt < MAX_RETRIES - 1) {
          await sleep(waitMs)
          continue
        }
      }

      // Jina chyba — nevratej se
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(data),
      }

    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAYS[attempt])
        continue
      }
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: err.message }),
      }
    }
  }

  // Vsechny pokusy selhaly
  return {
    statusCode: lastStatus,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(lastData || { error: 'Max retries exceeded' }),
  }
}
