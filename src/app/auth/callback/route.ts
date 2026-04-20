import { createServerClient } from '@supabase/ssr'
import { type CookieOptions } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Vercel 프록시 뒤에서는 x-forwarded-host를 사용해야 올바른 도메인을 얻을 수 있음
  const forwardedHost = request.headers.get('x-forwarded-host')
  const redirectBase = forwardedHost ? `https://${forwardedHost}` : origin

  if (code) {
    // 미들웨어 패턴과 동일하게: response에 직접 쿠키를 설정해야 브라우저에 전달됨
    const response = NextResponse.redirect(`${redirectBase}${next}`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value)
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // 로그인 활동 기록
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action: 'login',
          metadata: {
            provider: user.app_metadata?.provider ?? 'google',
            email: user.email,
          },
        })
      }
      return response
    }
  }

  return NextResponse.redirect(`${redirectBase}/login?error=auth_callback_failed`)
}
