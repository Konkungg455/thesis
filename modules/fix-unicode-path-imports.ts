import { defineNuxtModule, addImports, addServerImports } from '@nuxt/kit'
import { globby } from 'globby'
import { findExports } from 'mlly'
import { readFileSync } from 'node:fs'
import { resolve } from 'pathe'

type ImportEntry = { name: string; from: string }

function collectExports(files: string[]): ImportEntry[] {
  const entries: ImportEntry[] = []
  for (const file of files) {
    let code = ''
    try {
      code = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const exp of findExports(code)) {
      for (const name of exp.names || (exp.name ? [exp.name] : [])) {
        if (!name || name === 'default') continue
        entries.push({ name, from: resolve(file) })
      }
    }
  }
  return entries
}

/**
 * Workaround: on Windows, absolute paths with non-ASCII characters (e.g. Thai
 * folder names) make unimport/globby return 0 matches, so Nuxt/Nitro never
 * auto-register app composables or server utils. Scan with relative patterns.
 */
export default defineNuxtModule({
  meta: {
    name: 'fix-unicode-path-imports',
  },
  async setup(_options, nuxt) {
    const rootDir = nuxt.options.rootDir
    const globOpts = { cwd: rootDir, absolute: true as const }

    const appFiles = await globby(
      [
        'app/composables/*.{ts,js,mjs,mts,cjs,cts}',
        'app/utils/*.{ts,js,mjs,mts,cjs,cts}',
      ],
      globOpts,
    )
    for (const entry of collectExports(appFiles)) {
      addImports(entry)
    }

    const serverFiles = await globby(
      ['server/utils/**/*.{ts,js,mjs,mts,cjs,cts}'],
      globOpts,
    )
    const serverImports = collectExports(serverFiles)
    if (serverImports.length) {
      addServerImports(serverImports)
    }
  },
})
