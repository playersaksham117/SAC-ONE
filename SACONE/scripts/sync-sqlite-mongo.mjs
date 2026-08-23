/**
 * Full pipeline: SQLite master → JSON → MongoDB
 */
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, script)], {
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${script} exited with ${code}`))
    })
  })
}

async function main() {
  await run('build-sqlite-master.mjs')
  await run('sqlite-to-json.mjs')
  await run('json-to-mongo.mjs')
  console.log('[sync] SQLite → JSON → MongoDB complete')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
