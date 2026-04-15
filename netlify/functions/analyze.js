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
  const tavilyKey = process.env.TAVILY_API_KEY

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

  // Extrahuj nazev firmy z user message pro Tavily search
  const userMessage = body.messages?.[0]?.content || ''
  const firmaMatch = userMessage.match(/Analyzuj firmu: ([^,]+)/)
  const firmaName = firmaMatch ? firmaMatch[1].trim() : ''

  // Tavily search - hledej aktualni info o firme
  let searchContext = ''
  if (tavilyKey && firmaName) {
    try {
      const searches = [
        `${firmaName} LinkedIn zaměstnanci 2025 2026`,
        `${firmaName} novinky zprávy 2025 2026`,
        `${firmaName} výsledky hospodaření restrukturalizace`,
      ]

      const searchResults = await Promise.all(
        searches.map(async (query) => {
          const resp = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: tavilyKey,
              query,
              search_depth: 'basic',
              max_results: 3,
              include_answer: false,
            }),
          })
          if (!resp.ok) return []
          const data = await resp.json()
          return data.results || []
        })
      )

      const allResults = searchResults.flat()
      if (allResults.length > 0) {
        searchContext = '\n\n## Aktualni data z webu (pouzij jako primarne zdroje):\n'
        allResults.forEach((r, i) => {
          searchContext += `\n[${i + 1}] Zdroj: ${r.url} (${new Date().toLocaleDateString('cs-CZ', { month: '2-digit', year: 'numeric' })})\nNadpis: ${r.title}\nObsah: ${r.content?.slice(0, 400)}\n`
        })
      }
    } catch (err) {
      searchContext = '\n\n## Poznamka: Web search selhal, analyzuj na zaklade dostupnych znalosti.\n'
    }
  }

  // Pridej search context do user message
  const enrichedMessages = [
    {
      role: 'user',
      content: userMessage + searchContext,
    },
  ]

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: body.max_tokens || 2000,
        system: body.system,
        messages: enrichedMessages,
      }),
    })

    const text = await response.text()

    let data
    try {
      data = JSON.parse(text)
    } catch (e) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Invalid response', raw: text.slice(0, 500) }),
      }
    }

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(data),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    }
  }
}
