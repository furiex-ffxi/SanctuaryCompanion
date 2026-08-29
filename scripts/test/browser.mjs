import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import fs from 'node:fs'
import puppeteer from 'puppeteer'

const host = '127.0.0.1'
const port = await new Promise((resolve, reject) => {
  const probe = net.createServer()
  probe.once('error', reject)
  probe.listen(0, host, () => {
    const address = probe.address()
    probe.close(() => resolve(address.port))
  })
})
const url = `http://${host}:${port}/`
const vitePath = path.resolve('node_modules/vite/bin/vite.js')
if (!fs.existsSync(path.resolve('dist/index.html'))) {
  throw new Error('Browser smoke test requires a production build. Run npm run build first.')
}
const server = spawn(process.execPath, [vitePath, 'preview', '--host', host, '--port', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, BROWSER_TEST: '1' },
})
const serverClosed = new Promise(resolve => server.once('close', resolve))

let serverOutput = ''
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString() })
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString() })

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited with code ${server.exitCode}\n${serverOutput}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Vite did not become ready at ${url}\n${serverOutput}`)
}

try {
  await waitForServer()
  const configuredExecutable = process.env.PUPPETEER_EXECUTABLE_PATH
  const knownExecutables = [
    configuredExecutable,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)
  let browser
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: knownExecutables.find(fs.existsSync),
    })
  } catch (error) {
    throw new Error(`${error.message}\nInstall Chrome with "npx puppeteer browsers install chrome" or set PUPPETEER_EXECUTABLE_PATH.`)
  }
  try {
    const page = await browser.newPage()
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') pageErrors.push(message.text())
    })
    page.on('requestfailed', request => pageErrors.push(`Request failed: ${request.url()} (${request.failure()?.errorText || 'unknown error'})`))

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    if (!response?.ok()) throw new Error(`Expected HTTP 2xx from ${url}, got ${response?.status()}`)
    await page.waitForSelector('#root > .app-container', { timeout: 10000 })
    if (pageErrors.length > 0) throw new Error(`Browser reported errors:\n${pageErrors.join('\n')}`)
  } finally {
    await browser.close()
  }
  console.log(`Browser smoke test passed: ${url}`)
} finally {
  if (server.pid && !server.killed) {
    if (process.platform === 'win32') {
      await new Promise(resolve => {
        const killer = spawn('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' })
        killer.once('close', resolve)
        killer.once('error', resolve)
      })
    } else {
      server.kill('SIGTERM')
    }
    await Promise.race([serverClosed, new Promise(resolve => setTimeout(resolve, 5000))])
  }
}
