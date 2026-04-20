'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, Lock, User, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.')
      setLoading(false)
      return
    }

    try {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, department },
        },
      })
      if (authError) {
        setError(authError.message)
        return
      }
      setSuccess(true)
    } catch {
      setError('회원가입 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <Card>
        <div className="text-center py-4">
          <div className="w-12 h-12 bg-status-success-light rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-status-success text-2xl">✓</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">이메일을 확인해 주세요</h2>
          <p className="text-sm text-gray-500">
            {email}로 확인 메일을 보냈습니다. 메일의 링크를 클릭하여 가입을 완료해 주세요.
          </p>
          <Link href="/login" className="block mt-6 text-primary font-medium hover:underline text-sm">
            로그인 페이지로 이동
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="text-xl font-bold text-gray-900 mb-6">회원가입</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="이름"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="홍길동"
          required
          icon={<User size={16} />}
        />
        <Input
          label="이메일"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          required
          icon={<Mail size={16} />}
        />
        <Input
          label="부서"
          type="text"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          placeholder="토목설계팀"
          icon={<Building2 size={16} />}
        />
        <Input
          label="비밀번호"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="8자 이상"
          required
          hint="영문, 숫자 포함 8자 이상"
          icon={<Lock size={16} />}
        />
        {error && (
          <p className="text-sm text-status-error bg-status-error-light px-3 py-2 rounded-btn">
            {error}
          </p>
        )}
        <Button type="submit" loading={loading} className="w-full">
          가입하기
        </Button>
      </form>
      <p className="text-center text-sm text-gray-500 mt-6">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="text-primary font-medium hover:underline">
          로그인
        </Link>
      </p>
    </Card>
  )
}
