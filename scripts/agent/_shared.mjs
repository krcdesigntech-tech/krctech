/**
 * 에이전트 스크립트 공용 헬퍼: .env.local 로드, Supabase service client, 인자 파서, 락.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

export function loadEnv() {
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

export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  return createClient(url, key, { auth: { persistSession: false } })
}

export function args(argv = process.argv.slice(2)) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const k = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) out[k] = true
      else { out[k] = next; i++ }
    } else out._.push(a)
  }
  return out
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 야간 cron 중복 실행 방지. 획득 실패 시 false. */
export async function acquireLock(client, name, owner, ttlMin = 30) {
  const now = new Date()
  const expires = new Date(now.getTime() + ttlMin * 60000).toISOString()
  // 만료된 락 정리
  await client.from('agent_locks').delete().lt('expires_at', now.toISOString())
  const { error } = await client
    .from('agent_locks')
    .insert({ name, owner, expires_at: expires })
  return !error
}

export async function releaseLock(client, name) {
  await client.from('agent_locks').delete().eq('name', name)
}
