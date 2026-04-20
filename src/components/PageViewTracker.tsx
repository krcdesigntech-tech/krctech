'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function PageViewTracker() {
  const pathname = usePathname()
  const lastTracked = useRef<string>('')

  useEffect(() => {
    if (lastTracked.current === pathname) return
    lastTracked.current = pathname

    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('activity_logs').insert({
        user_id: user.id,
        action: 'page_view',
        metadata: { path: pathname },
      })
    })
  }, [pathname])

  return null
}
