import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const publicDir = path.join(root, 'docs', 'public')

let commit = (process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '').trim()
if (!commit) {
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    commit = 'local'
  }
}

fs.mkdirSync(publicDir, { recursive: true })
fs.writeFileSync(
  path.join(publicDir, 'deploy-version.json'),
  `${JSON.stringify({ commit, deployedAt: new Date().toISOString() })}\n`,
  'utf8',
)

console.log(`[deploy-version] ${commit}`)
