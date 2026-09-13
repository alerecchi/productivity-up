export function requireDirectPostgresUrl(value, variableName) {
  let parsedUrl
  try {
    parsedUrl = new URL(value)
  } catch {
    throw new Error(`${variableName} is not a valid URL.`)
  }

  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new Error(`${variableName} must use the postgres or postgresql protocol.`)
  }
  if (parsedUrl.hostname.includes('-pooler')) {
    throw new Error(`${variableName} must use a direct, non-pooler host.`)
  }

  return parsedUrl
}

export function sharePostgresHost(firstUrl, secondUrl) {
  return firstUrl.hostname === secondUrl.hostname
}
