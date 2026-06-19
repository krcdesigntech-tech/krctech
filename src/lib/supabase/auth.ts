import { cache } from 'react'
import { createClient } from './server'

/**
 * 한 요청(렌더) 안에서 getUser() / profile 조회를 중복 호출하지 않도록 React cache로 메모이즈한다.
 * 레이아웃과 페이지가 같은 요청에서 함께 렌더되므로 호출이 1회로 합쳐진다.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

export const getCurrentProfile = cache(async () => {
  const user = await getCurrentUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()
  return data
})
