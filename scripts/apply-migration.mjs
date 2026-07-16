/**
 * Supabase Management API(database/query)로 마이그레이션 .sql 파일을 적용한다.
 * DB 비밀번호 없이 액세스 토큰만으로 실행. (프로젝트가 ACTIVE 상태여야 함)
 *
 *   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... \
 *     node scripts/apply-migration.mjs supabase/migrations/00010_create_legal.sql [more.sql ...]
 *
 * .env.local 에서 토큰/ref 자동 로드.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = resolve(process.cwd(), f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}
loadEnv()

const TOK = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF
if (!TOK || !REF) throw new Error('SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF 필요')

const files = process.argv.slice(2)
if (!files.length) throw new Error('적용할 .sql 파일 경로를 인자로 주세요')

async function runSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, text }
}

for (const f of files) {
  const sql = readFileSync(resolve(f), 'utf8')
  process.stdout.write(`\n▶ ${f} ... `)
  const r = await runSql(sql)
  if (r.ok) {
    console.log('OK')
  } else {
    console.log(`FAIL [HTTP ${r.status}]`)
    console.log(r.text.slice(0, 500))
    process.exit(1)
  }
}
console.log('\n✅ 모든 마이그레이션 적용 완료')
