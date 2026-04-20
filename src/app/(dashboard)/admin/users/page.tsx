'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

interface UserRow {
  id: string
  full_name: string | null
  email: string
  role: 'engineer' | 'manager' | 'admin'
  department: string | null
  avatar_url: string | null
  created_at: string
  last_login: string | null
}

const ROLE_COLORS: Record<string, string> = {
  engineer: 'bg-gray-100 text-gray-600',
  manager: 'bg-blue-100 text-blue-700',
  admin: 'bg-purple-100 text-purple-700',
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => setError('사용자 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleRoleChange(userId: string, role: 'engineer' | 'manager' | 'admin') {
    setUpdating(userId)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '권한 변경에 실패했습니다.')
        return
      }
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
    } catch {
      setError('권한 변경 중 오류가 발생했습니다.')
    } finally {
      setUpdating(null)
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return '없음'
    return new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="p-8 max-w-[1160px]">
      <div className="mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft size={14} />
          관리자 패널
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">사용자 관리</h1>
        <p className="text-sm text-gray-500 mt-1">전체 사용자 목록 및 권한 관리</p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 text-sm rounded-btn border border-red-200">
          {error}
        </div>
      )}

      <div className="bg-white rounded-card border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  사용자
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  부서
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  권한
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  마지막 로그인
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  가입일
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {user.avatar_url ? (
                        <Image
                          src={user.avatar_url}
                          alt={user.full_name ?? ''}
                          width={32}
                          height={32}
                          className="rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">
                            {(user.full_name ?? user.email)[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{user.full_name ?? '-'}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{user.department ?? '-'}</td>
                  <td className="px-5 py-4">
                    <div className="relative inline-block">
                      <select
                        value={user.role}
                        onChange={(e) =>
                          handleRoleChange(user.id, e.target.value as 'engineer' | 'manager' | 'admin')
                        }
                        disabled={updating === user.id}
                        className={`appearance-none pl-2.5 pr-7 py-1 text-xs font-medium rounded-full cursor-pointer border-0 focus:ring-2 focus:ring-primary/30 focus:outline-none ${ROLE_COLORS[user.role]}`}
                      >
                        <option value="engineer">일반</option>
                        <option value="manager">매니저</option>
                        <option value="admin">관리자</option>
                      </select>
                      <ChevronDown
                        size={12}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60"
                      />
                    </div>
                    {updating === user.id && (
                      <span className="ml-2 text-xs text-gray-400">변경 중...</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500">{formatDate(user.last_login)}</td>
                  <td className="px-5 py-4 text-sm text-gray-500">{formatDate(user.created_at)}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-gray-400">
                    사용자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
