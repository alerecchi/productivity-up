/** True while any process in the group led by `pgid` is alive, even if the leader itself has exited. */
export function groupAlive(pgid: number) {
  try {
    process.kill(-pgid, 0)
    return true
  } catch {
    return false
  }
}

/** Sends SIGTERM to the whole group, waits up to `timeoutMs`, then SIGKILLs whatever is left. A gone group is fine. */
export async function stopProcessGroup(pgid: number, timeoutMs: number) {
  signalGroup(pgid, 'SIGTERM')
  const deadline = Date.now() + timeoutMs
  while (groupAlive(pgid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100))
  if (groupAlive(pgid)) signalGroup(pgid, 'SIGKILL')
}

function signalGroup(pgid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pgid, signal)
  } catch {
    // The group already exited.
  }
}
