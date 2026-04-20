'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'
  const hasError = searchParams.get('error') === 'auth_callback_failed'

  const [loading, setLoading] = useState(false)

  const supabase = createClient()

  async function handleGoogleLogin() {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    })
    // Page redirects to Google — loading state stays true
  }

  return (
    <Card>
      <h2 className="text-xl font-bold text-gray-900 mb-2">로그인</h2>
      <p className="text-sm text-gray-500 mb-8">
        KRCTech DocAI에 오신 것을 환영합니다.
        <br />Google 계정으로 로그인하세요.
      </p>

      {hasError && (
        <p className="text-sm text-status-error bg-status-error-light px-3 py-2 rounded-btn mb-4">
          로그인 중 오류가 발생했습니다. 다시 시도해 주세요.
        </p>
      )}

      <Button
        type="button"
        onClick={handleGoogleLogin}
        loading={loading}
        className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:border-gray-400"
      >
        {!loading && <GoogleIcon />}
        Google로 로그인
      </Button>

      <p className="text-center text-xs text-gray-400 mt-6">
        로그인 시 서비스 이용약관 및 개인정보 처리방침에 동의하는 것으로 간주합니다.
      </p>
    </Card>
  )
}
