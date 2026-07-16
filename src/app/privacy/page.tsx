import Link from 'next/link'

export const metadata = {
  title: '개인정보 처리방침 | KRCTech DocAI',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/login" className="text-sm text-primary hover:underline">
          ← 로그인으로 돌아가기
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-gray-900">개인정보 처리방침</h1>
        <p className="mt-1 text-sm text-gray-500">최종 개정일: 2026년 6월 19일</p>

        <div className="mt-8 space-y-8 text-sm leading-7 text-gray-700">
          <section>
            <p>
              KRCTech(이하 &quot;회사&quot;)는 「개인정보 보호법」 등 관련 법령을 준수하며,
              이용자의 개인정보를 보호하기 위해 다음과 같은 처리방침을 둡니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">1. 수집하는 개인정보 항목</h2>
            <p>
              회사는 Google 계정을 통한 로그인 시 다음의 정보를 수집합니다. 이름, 이메일 주소,
              프로필 이미지(선택). 또한 서비스 이용 과정에서 접속 로그, 이용 기록 등이 자동으로
              생성·수집될 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">2. 개인정보의 수집 및 이용 목적</h2>
            <p>
              수집한 개인정보는 회원 식별 및 인증, 서비스 제공 및 운영, 문의 응대, 서비스 개선
              및 통계 분석의 목적으로만 이용됩니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">3. 개인정보의 보유 및 이용 기간</h2>
            <p>
              회사는 이용자의 개인정보를 회원 탈퇴 시까지 보유하며, 관계 법령에 따라 보존할
              필요가 있는 경우 해당 법령에서 정한 기간 동안 보관합니다. 보유 기간이 경과한
              개인정보는 지체 없이 파기합니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">4. 개인정보의 제3자 제공</h2>
            <p>
              회사는 이용자의 개인정보를 본 방침에서 명시한 범위를 초과하여 이용하거나 제3자에게
              제공하지 않습니다. 다만, 법령에 의거하거나 수사기관의 적법한 요청이 있는 경우는
              예외로 합니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">5. 이용자의 권리</h2>
            <p>
              이용자는 언제든지 본인의 개인정보를 조회·수정하거나 처리 정지 및 삭제를 요청할 수
              있습니다. 관련 요청은 아래의 문의처를 통해 접수할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">6. 개인정보 보호책임자</h2>
            <p>
              개인정보 처리에 관한 문의는 회사의 개인정보 보호책임자에게 연락하실 수 있습니다.
              이메일: privacy@krctech.co.kr
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
