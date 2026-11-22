/**
 * Browser test for the Downhill prototype (Chromium via Playwright).
 *
 *   node e2e/play.mjs [url]     (default http://localhost:4173)
 *
 * Checks: the preview plays and can be skipped; horizontal drags move the
 * start line on touch (emulated iPhone) and mouse; LAUNCH runs the rider
 * hands-off (input during the run changes nothing); one line per route
 * finishes; Retry is immediate and keeps the line; layout has no overflow;
 * no console errors.
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium, devices } = require('playwright')
const base = (process.argv[2] || 'http://localhost:4173').replace(/\/$/, '')
const out = new URL('./out/', import.meta.url).pathname
mkdirSync(out, { recursive: true })

let failures = 0
const fail = (m) => {
  failures++
  console.log(`  FAIL ${m}`)
}
const ok = (m) => console.log(`  ok   ${m}`)

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })

async function open(profile, query = '') {
  const ctx = await browser.newContext(profile)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`${base}/?test=1${query}`)
  await page.waitForFunction(() => window.__downhill)
  return { ctx, page, errors, cdp: await ctx.newCDPSession(page) }
}

async function setLine(page, target) {
  // Jump close, then finish with real keyboard steps (0.1 and 0.02 units).
  await page.evaluate((t) => window.__downhill.setLine(Math.round(t) === t ? t + 0.2 : t + 0.1), target)
  for (let i = 0; i < 40; i++) {
    const cur = await page.evaluate(() => window.__downhill.line())
    const diff = target - cur
    if (Math.abs(diff) < 0.005) return
    const big = Math.abs(diff) >= 0.1
    await page.keyboard.press(`${big ? '' : 'Shift+'}${diff > 0 ? 'ArrowRight' : 'ArrowLeft'}`)
  }
}

async function runLine(page, x) {
  await setLine(page, x)
  await page.click('#dh-launch')
  await page.waitForFunction(() => window.__downhill.phase() === 'done', null, { timeout: 120000, polling: 100 })
  return page.evaluate(() => window.__downhill.outcome())
}

// 1. iPhone: preview, touch positioning, hands-off, a finish, immediate retry.
{
  console.log('\niphone-13 (touch)')
  const { ctx, page, errors, cdp } = await open({ ...devices['iPhone 13'] })
  await page.evaluate(() => window.__downhill.speed(6))
  if ((await page.evaluate(() => window.__downhill.phase())) === 'preview') ok('course preview plays on first visit')
  else fail('no preview on first visit')
  await page.click('#dh-skip')
  if ((await page.evaluate(() => window.__downhill.phase())) === 'aim') ok('preview can be skipped')
  else fail('skip did not end the preview')

  const before = await page.evaluate(() => window.__downhill.line())
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
  await touch('touchStart', 120, 500)
  for (let i = 1; i <= 10; i++) await touch('touchMove', 120 + i * 10, 500)
  await touch('touchEnd')
  const after = await page.evaluate(() => window.__downhill.line())
  if (after - before > 1) ok(`touch drag right moves the line (${before} → ${after})`)
  else fail(`touch drag did not move the line (${before} → ${after})`)
  const noScroll = await page.evaluate(() => window.scrollY === 0 && document.documentElement.scrollWidth <= window.innerWidth)
  if (noScroll) ok('no page scroll or horizontal overflow while dragging')
  else fail('page scrolled or overflowed')

  await setLine(page, 0.8)
  await page.click('#dh-launch')
  await page.waitForFunction(() => window.__downhill.phase() === 'run')
  // Hands-off: dragging during the run must not change the line or the run.
  const lineDuring = await page.evaluate(() => window.__downhill.line())
  await touch('touchStart', 100, 400)
  for (let i = 1; i <= 8; i++) await touch('touchMove', 100 + i * 20, 400)
  await touch('touchEnd')
  await page.keyboard.press('ArrowLeft')
  const lineAfter = await page.evaluate(() => window.__downhill.line())
  if (lineAfter === lineDuring) ok('input after launch is ignored')
  else fail('input changed the line during a run')
  await page.waitForFunction(() => window.__downhill.phase() === 'done', null, { timeout: 120000 })
  const outcome = await page.evaluate(() => window.__downhill.outcome())
  if (outcome === 'finish') ok('centre line (+0.8) finishes')
  else fail(`centre line ended in ${outcome}`)
  await page.screenshot({ path: `${out}downhill-iphone-finish.png` })

  // Retry switches straight back to aiming in the same click handler (no transition to wait for).
  await page.tap('#dh-retry')
  const phase = await page.evaluate(() => window.__downhill.phase())
  const kept = await page.evaluate(() => window.__downhill.line())
  if (phase === 'aim' && Math.abs(kept - 0.8) < 0.005) ok('retry is immediate and keeps the line')
  else fail(`retry: phase ${phase}, line ${kept}`)

  const layout = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect()
    const launch = r('dh-launch')
    return { launchH: launch.height, inView: launch.bottom <= window.innerHeight && launch.top >= 0, overflow: document.documentElement.scrollWidth > window.innerWidth }
  })
  if (layout.launchH >= 44 && layout.inView && !layout.overflow) ok('launch button is large and on screen')
  else fail(`layout ${JSON.stringify(layout)}`)
  await page.screenshot({ path: `${out}downhill-iphone-aim.png` })
  if (errors.length) fail(`console errors: ${errors.join(' | ')}`)
  else ok('no console errors')
  await ctx.close()
}

// 2. Desktop: mouse positioning, and the left and right routes.
{
  console.log('\ndesktop (mouse)')
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } }, '&nopreview=1')
  await page.evaluate(() => window.__downhill.speed(6))
  const before = await page.evaluate(() => window.__downhill.line())
  await page.mouse.move(700, 450)
  await page.mouse.down()
  await page.mouse.move(500, 450, { steps: 10 })
  await page.mouse.up()
  const after = await page.evaluate(() => window.__downhill.line())
  if (before - after > 1) ok(`mouse drag left moves the line (${before} → ${after})`)
  else fail(`mouse drag did not move the line (${before} → ${after})`)

  for (const [name, x] of [
    ['left (bank)', -6.3],
    ['right (kicker)', 5.2],
  ]) {
    const o = await runLine(page, x)
    if (o === 'finish') ok(`${name} line ${x} finishes`)
    else fail(`${name} line ${x} ended in ${o}`)
    await page.click('#dh-retry')
  }
  const o = await runLine(page, -2)
  if (o === 'gap') ok('line −2.0 misses the table and drops into the gap')
  else fail(`line −2 ended in ${o}`)
  await page.screenshot({ path: `${out}downhill-desktop-crash.png` })
  const s = (await page.evaluate(() => window.__downhill.store())).records.gravity
  if (s.runs === 3 && s.history.length === 3) ok('runs and line history are saved')
  else fail(`store ${JSON.stringify(s)}`)
  if (errors.length) fail(`console errors: ${errors.join(' | ')}`)
  else ok('no console errors')
  await ctx.close()
}

// 3. Landscape phone layout.
{
  console.log('\niphone-13 landscape')
  const { ctx, page, errors } = await open({ ...devices['iPhone 13 landscape'] }, '&nopreview=1')
  await page.waitForTimeout(800)
  const layout = await page.evaluate(() => {
    const ids = ['dh-launch', 'dh-sound', 'dh-line']
    return ids.map((id) => {
      const r = document.getElementById(id).getBoundingClientRect()
      return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight
    })
  })
  if (layout.every(Boolean)) ok('controls fit in landscape')
  else fail(`landscape controls off screen: ${layout}`)
  await page.screenshot({ path: `${out}downhill-landscape.png` })
  if (errors.length) fail(`console errors: ${errors.join(' | ')}`)
  await ctx.close()
}

// 4. The hills: locked until the one before is finished; Next hill opens the next; a save from
//    before the hills existed still loads.
{
  console.log('\nthe hills (iphone-13)')
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  // A record saved by the one-hill version of the game.
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('downhill', JSON.stringify({ line: 0.8, runs: 5, finishes: 0, best: null, history: [{ x: -2, ok: false }], sound: true, previewed: true }))
      sessionStorage.setItem('seeded', '1')
    }
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`${base}/?test=1`)
  await page.waitForFunction(() => window.__downhill)
  await page.evaluate(() => window.__downhill.speed(6))
  const g = await page.evaluate(() => ({ phase: window.__downhill.phase(), line: window.__downhill.line(), s: window.__downhill.store().records.gravity }))
  if (g.phase === 'aim' && g.line === 0.8 && g.s.runs === 5 && g.s.history.length === 1) ok('an existing save loads: line, runs and history kept, no repeat preview')
  else fail(`old save: ${JSON.stringify(g)}`)
  const run = await page.evaluate(() => document.getElementById('dh-run').textContent)
  if (run === 'Run 6') ok('run count carries on from the old save')
  else fail(`run label ${run}`)

  await page.tap('#dh-next')
  const locked = await page.evaluate(() => ({ hill: window.__downhill.hill(), disabled: document.getElementById('dh-launch').disabled, label: document.getElementById('dh-launch').textContent, hint: document.getElementById('dh-hint').textContent }))
  if (locked.hill === 'rollers' && locked.disabled && locked.label === 'Locked' && /Finish Gravity Hill/.test(locked.hint)) ok('Roller Hill can be looked at but is locked until Gravity Hill is finished')
  else fail(`locked hill: ${JSON.stringify(locked)}`)
  await page.screenshot({ path: `${out}downhill-locked.png` })
  await page.tap('#dh-prev')

  // Nudge buttons step the line by 0.02.
  await page.tap('#dh-right')
  const nudged = await page.evaluate(() => [window.__downhill.line(), document.getElementById('dh-line').textContent])
  if (Math.abs(nudged[0] - 0.82) < 0.001 && nudged[1] === '+0.82') ok('the nudge button steps the line by 0.02 and shows two decimals')
  else fail(`nudge: ${nudged}`)
  await page.tap('#dh-left')

  await page.tap('#dh-launch')
  await page.waitForFunction(() => window.__downhill.phase() === 'run')
  const hud = await page.evaluate(() => getComputedStyle(document.getElementById('dh-hud')).display !== 'none' && getComputedStyle(document.getElementById('dh-ff')).display !== 'none')
  if (hud) ok('during a run: the section, speed and progress readout and the speed button show')
  else fail('run readout hidden')
  await page.tap('#dh-ff')
  const ffLabel = await page.evaluate(() => document.getElementById('dh-ff-label').textContent)
  if (ffLabel === '2×') ok('playback speed steps to 2×')
  else fail(`ff label ${ffLabel}`)
  await page.waitForFunction(() => window.__downhill.phase() === 'done', null, { timeout: 120000 })
  const result = await page.evaluate(() => ({
    outcome: window.__downhill.outcome(),
    next: !document.getElementById('dh-nexthill').hidden,
    where: document.getElementById('dh-report-where').textContent,
    detail: document.getElementById('dh-result-detail').textContent,
  }))
  if (result.outcome === 'finish' && result.next && /Roller Hill is open/.test(result.detail)) ok('finishing Gravity Hill opens Roller Hill')
  else fail(`finish: ${JSON.stringify(result)}`)

  await page.tap('#dh-replay')
  const replaying = await page.evaluate(() => window.__downhill.phase())
  await page.waitForFunction(() => window.__downhill.phase() === 'done', null, { timeout: 120000 })
  const afterReplay = await page.evaluate(() => window.__downhill.store().records.gravity.runs)
  if (replaying === 'run' && afterReplay === 6) ok('watch again replays the run without counting it')
  else fail(`replay: ${replaying}, runs ${afterReplay}`)

  await page.tap('#dh-nexthill')
  const onHill2 = await page.evaluate(() => ({ hill: window.__downhill.hill(), phase: window.__downhill.phase() }))
  if (onHill2.hill === 'rollers' && onHill2.phase === 'preview') ok('Next hill moves to Roller Hill and surveys it first')
  else fail(`next hill: ${JSON.stringify(onHill2)}`)
  await page.tap('#dh-skip')
  await page.evaluate(() => window.__downhill.speed(8))
  const o = await runLine(page, 1.5)
  if (o === 'finish') ok('Roller Hill: line +1.5 finishes')
  else fail(`Roller Hill line 1.5 ended in ${o}`)
  await page.screenshot({ path: `${out}downhill-hill2-finish.png` })
  await page.tap('#dh-retry')
  const crash = await runLine(page, 3.8)
  const where = await page.evaluate(() => document.getElementById('dh-report-where').textContent)
  if (crash !== 'finish' && /Stopped at .+ \d+% of the way down/.test(where)) ok(`a crash reports where it happened (${where})`)
  else fail(`crash report: ${crash} ${where}`)
  await page.screenshot({ path: `${out}downhill-hill2-crash.png` })

  await page.reload()
  await page.waitForFunction(() => window.__downhill)
  const back = await page.evaluate(() => ({ hill: window.__downhill.hill(), s: window.__downhill.store() }))
  if (back.hill === 'rollers' && back.s.records.rollers.runs === 2 && back.s.records.gravity.finishes === 1) ok('after a reload: back on Roller Hill with both hills remembered')
  else fail(`reload: ${JSON.stringify(back)}`)
  if (errors.length) fail(`console errors: ${errors.join(' | ')}`)
  else ok('no console errors')
  await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} failure(s)` : '\nall passed')
process.exit(failures ? 1 : 0)
