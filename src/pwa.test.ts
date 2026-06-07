import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const publicDir = join(process.cwd(), 'dist', 'public')

test('built app exposes installable PWA metadata', () => {
  const indexHtml = readFileSync(join(publicDir, 'index.html'), 'utf8')
  const manifest = JSON.parse(readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8')) as {
    name?: string
    short_name?: string
    display?: string
    start_url?: string
    scope?: string
    theme_color?: string
    background_color?: string
    icons?: Array<{ src: string; sizes: string; type: string; purpose?: string }>
  }

  assert.match(indexHtml, /<link rel="manifest" href="\/manifest\.webmanifest"/)
  assert.match(indexHtml, /<meta name="theme-color" content="#0f8b8d"/)
  assert.match(indexHtml, /<meta name="mobile-web-app-capable" content="yes"/)
  assert.match(indexHtml, /<meta name="apple-mobile-web-app-capable" content="yes"/)
  assert.equal(manifest.name, 'Workout')
  assert.equal(manifest.short_name, 'Workout')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.theme_color, '#0f8b8d')
  assert.equal(manifest.background_color, '#f5f7f8')
  assert.ok(manifest.icons?.some((icon) => icon.sizes === '192x192' && icon.purpose?.includes('maskable')))
  assert.ok(manifest.icons?.some((icon) => icon.sizes === '512x512' && icon.purpose?.includes('any')))
})

test('built app registers a service worker for app shell caching', () => {
  const indexHtml = readFileSync(join(publicDir, 'index.html'), 'utf8')
  const assets = readFileSync(join(publicDir, 'sw.js'), 'utf8')

  assert.match(indexHtml, /navigator\.serviceWorker\.register\('\/sw\.js'\)/)
  assert.match(assets, /const CACHE_NAME = 'workout-app-shell-/)
  assert.match(assets, /manifest\.webmanifest/)
  assert.match(assets, /\/api\/summary/)
})

test('built app includes required PWA icons', () => {
  assert.equal(existsSync(join(publicDir, 'icons', 'icon-192.svg')), true)
  assert.equal(existsSync(join(publicDir, 'icons', 'icon-512.svg')), true)
})
