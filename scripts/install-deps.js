import { execSync } from 'child_process'

try {
  const output = execSync('cd /vercel/share/v0-project && pnpm install 2>&1', { encoding: 'utf8' })
  console.log(output)
} catch (e) {
  console.log('Error:', e.message)
  console.log('stdout:', e.stdout)
  console.log('stderr:', e.stderr)
}
