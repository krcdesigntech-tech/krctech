import Image from 'next/image'

export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4 bg-cover bg-center"
      style={{ backgroundImage: "url('/images/login-bg.jpg')" }}
    >
      {/* 검은 오버레이 — 배경 사진을 은은하게 비춤 */}
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image
            src="/icons/brand-mark.png"
            alt=""
            aria-hidden="true"
            width={56}
            height={56}
            className="mx-auto mb-4 h-14 w-14 rounded-xl object-cover shadow-lg shadow-black/20"
            priority
          />
          <p className="text-[11px] font-medium text-white/70 tracking-wide mb-1">한국농어촌공사 기후대응처</p>
          <h1 className="text-2xl font-bold text-white">KRC 조사설계 법령 및 인허가 검토 가이드</h1>
        </div>
        {children}
      </div>
    </div>
  )
}
