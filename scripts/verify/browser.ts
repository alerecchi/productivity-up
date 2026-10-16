// Step-by-step browser for exploring an instance: one Chromium stays open between commands, and each
// `pnpm verify browser <action>` connects to it over CDP, acts, reports, and disconnects.
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { chromium } from '@playwright/test'
import type { BrowserContext, Locator, Page } from '@playwright/test'

import { stopProcessGroup } from './processes'

export type BrowserOptions = {
  exact: boolean
  headed: boolean
  key?: string
  label?: string
  name?: string
  nth?: string
  role?: string
  selector?: string
  text?: string
  user: string
  value?: string
}

type BrowserInstance = {
  baseUrl: string
  evidenceRoot: string
  instanceDir: string
  /** Saved session for a seed user, or undefined for `none`. */
  sessionFile: (user: string) => string | undefined
}

type BrowserState = { cdpPort: number; evidenceDir: string; pid: number; shots: number }

type AriaRole = Parameters<Page['getByRole']>[0]

export const browserActions = ['open', 'goto', 'click', 'fill', 'press', 'snapshot', 'screenshot', 'close'] as const

/** Resolves once React has hydrated the current document; SSR markup clicked before that submits forms natively. */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => Object.keys(document.body).some((key) => key.startsWith('__reactFiber$')))
}

export async function runBrowserAction(
  instance: BrowserInstance,
  action: string,
  argument: string | undefined,
  options: BrowserOptions,
) {
  const stateFile = path.join(instance.instanceDir, 'browser.json')

  if (action === 'open') {
    if (existsSync(stateFile)) throw new Error('A browser is already open. Run `pnpm verify browser close` first.')
    await openBrowser(instance, stateFile, options)
  }
  if (action === 'close') {
    await closeBrowser(instance.instanceDir)
    console.log('Browser closed.')
    return
  }
  if (!(browserActions as ReadonlyArray<string>).includes(action)) {
    throw new Error(`Unknown browser action ${action}; use ${browserActions.join('|')}.`)
  }
  if (!existsSync(stateFile)) throw new Error('No browser open. Run `pnpm verify browser open` first.')
  const state = JSON.parse(readFileSync(stateFile, 'utf8')) as BrowserState

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${state.cdpPort}`)
  const context = browser.contexts()[0]
  const page = context.pages()[0] ?? (await context.newPage())
  const transcript = path.join(state.evidenceDir, 'transcript.log')
  const record = (line: string) => {
    appendFileSync(transcript, `[${new Date().toISOString()}] ${line}\n`)
    console.log(line)
  }
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      record(`browser ${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => record(`page error: ${error.message}`))
  page.on('response', (response) => {
    if (response.status() >= 400) record(`http ${response.status()} ${response.request().method()} ${response.url()}`)
  })

  try {
    record(`> ${[action, argument, describeTarget(options)].filter(Boolean).join(' ')}`)
    switch (action) {
      case 'open':
        await page.goto(new URL(options.user === 'none' ? '/login' : '/board', instance.baseUrl).href)
        break
      case 'goto':
        if (!argument) throw new Error('Usage: pnpm verify browser goto <path>')
        await page.goto(new URL(argument, instance.baseUrl).href)
        break
      case 'click':
        await locate(page, options).click()
        break
      case 'fill':
        if (options.value === undefined) throw new Error('fill needs --value')
        await locate(page, options).fill(options.value)
        break
      case 'press':
        if (!options.key) throw new Error('press needs --key, e.g. --key Escape')
        await page.keyboard.press(options.key)
        break
      case 'snapshot': {
        const snapshot = await page.locator('body').ariaSnapshot()
        state.shots += 1
        const file = path.join(state.evidenceDir, `${String(state.shots).padStart(2, '0')}-snapshot.aria.yml`)
        writeFileSync(file, snapshot)
        console.log(snapshot)
        record(`aria snapshot ${file}`)
        break
      }
      case 'screenshot': {
        state.shots += 1
        const file = path.join(
          state.evidenceDir,
          `${String(state.shots).padStart(2, '0')}-${argument ?? 'screenshot'}.png`,
        )
        await page.screenshot({ fullPage: true, path: file })
        record(`screenshot ${file}`)
        break
      }
    }
    await settle(page)
    record(`url ${page.url()}`)
  } finally {
    writeFileSync(stateFile, JSON.stringify(state, null, 2))
    // Disconnects only; the browser and its page stay open for the next command.
    await browser.close()
  }
}

/** Stops the browser `open` started for this instance, if any, and waits for it to exit before deleting its profile. */
export async function closeBrowser(instanceDir: string) {
  const stateFile = path.join(instanceDir, 'browser.json')
  if (!existsSync(stateFile)) return
  const state = JSON.parse(readFileSync(stateFile, 'utf8')) as BrowserState
  await stopProcessGroup(state.pid, 5000)
  rmSync(stateFile, { force: true })
  rmSync(path.join(instanceDir, 'browser-profile'), { force: true, recursive: true })
}

async function openBrowser(instance: BrowserInstance, stateFile: string, options: BrowserOptions) {
  const sessionFile = options.user === 'none' ? undefined : instance.sessionFile(options.user)
  const profileDir = path.join(instance.instanceDir, 'browser-profile')
  // A leftover profile could hold a stale DevToolsActivePort from a crashed browser.
  rmSync(profileDir, { force: true, recursive: true })
  const evidenceDir = path.join(instance.evidenceRoot, `${timestamp()}-browser`)
  mkdirSync(evidenceDir, { recursive: true })

  const chrome = spawn(
    chromium.executablePath(),
    [
      ...(options.headed ? [] : ['--headless=new']),
      // Port 0: Chromium picks a free port and writes it to DevToolsActivePort, so we never attach to a foreign browser.
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--window-size=1440,900',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { detached: true, stdio: 'ignore' },
  )
  if (chrome.pid === undefined) throw new Error('Chromium could not be started')
  chrome.unref()
  const state: BrowserState = { cdpPort: 0, evidenceDir, pid: chrome.pid, shots: 0 }
  writeFileSync(stateFile, JSON.stringify(state, null, 2))

  const activePortFile = path.join(profileDir, 'DevToolsActivePort')
  const deadline = Date.now() + 15_000
  while (
    !state.cdpPort ||
    !(await fetch(`http://127.0.0.1:${state.cdpPort}/json/version`).catch(() => undefined))?.ok
  ) {
    if (Date.now() > deadline) {
      await closeBrowser(instance.instanceDir)
      throw new Error('Chromium did not open its debugging port')
    }
    if (existsSync(activePortFile)) state.cdpPort = Number(readFileSync(activePortFile, 'utf8').split('\n')[0])
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  writeFileSync(stateFile, JSON.stringify(state, null, 2))
  const { cdpPort } = state

  if (sessionFile) {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
    const { cookies } = JSON.parse(readFileSync(sessionFile, 'utf8')) as {
      cookies: Parameters<BrowserContext['addCookies']>[0]
    }
    await browser.contexts()[0].addCookies(cookies)
    await browser.close()
  }
  console.log(`Evidence: ${evidenceDir}`)
}

function locate(page: Page, options: BrowserOptions): Locator {
  const exact = options.exact
  let locator: Locator
  if (options.role) {
    locator = page.getByRole(options.role as AriaRole, options.name ? { exact, name: options.name } : {})
  } else if (options.label) {
    locator = page.getByLabel(options.label, { exact })
  } else if (options.text) {
    locator = page.getByText(options.text, { exact })
  } else if (options.selector) {
    locator = page.locator(options.selector)
  } else {
    throw new Error('Pick a target: --role <role> [--name <name>], --label, --text, or --selector')
  }
  return options.nth === undefined ? locator : locator.nth(Number(options.nth))
}

/** Lets the action's navigation, hydration, and requests finish so the next command sees the result. */
async function settle(page: Page) {
  await page.waitForLoadState('load')
  await waitForHydration(page).catch(() => undefined)
  await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => undefined)
}

function describeTarget(options: BrowserOptions) {
  return Object.entries({
    key: options.key,
    label: options.label,
    name: options.name,
    nth: options.nth,
    role: options.role,
    selector: options.selector,
    text: options.text,
    value: options.value,
  })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `--${key} ${JSON.stringify(value)}`)
    .join(' ')
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')
}
