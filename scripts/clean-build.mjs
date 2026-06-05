import { rmSync } from 'node:fs'

for (const directory of ['dist', 'dist-test']) {
  rmSync(directory, { recursive: true, force: true })
}
