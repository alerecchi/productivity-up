/** Returns only a send record emitted for the specified HTTP request. */
export function findAuthEmailSendRecord(output, requestId) {
  for (const eventJson of completeJsonObjects(output)) {
    const event = parseJson(eventJson)
    if (!event || !Array.isArray(event.logs)) continue

    for (const log of event.logs) {
      for (const message of log.message ?? []) {
        const record = typeof message === 'string' ? parseJson(message) : message
        if (record?.operation === 'auth_email.send' && record.requestId === requestId) {
          return record
        }
      }
    }
  }
}

function* completeJsonObjects(output) {
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < output.length; index += 1) {
    const char = output[index]
    if (start < 0) {
      if (char === '{') {
        start = index
        depth = 1
      }
      continue
    }

    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
    } else if (char === '"') inString = true
    else if (char === '{' || char === '[') depth += 1
    else if (char === '}' || char === ']') {
      depth -= 1
      if (depth === 0) {
        yield output.slice(start, index + 1)
        start = -1
      }
    }
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}
