import Link from 'next/link'

export const metadata = {
  title: '서비스 이용약관 | KRCTech DocAI',
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/login" className="text-sm text-primary hover:underline">
          ← 로그인으로 돌아가기
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-gray-900">서비스 이용약관</h1>
        <p className="mt-1 text-sm text-gray-500">최종 개정일: 2026년 6월 19일</p>

        <div className="mt-8 space-y-8 text-sm leading-7 text-gray-700">
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">제1조 (목적)</h2>
            <p>
              본 약관은 KRCTech(이하 &quot;회사&quot;)가 제공하는 토목설계 문서 AI
              플랫폼(이하 &quot;서비스&quot;)의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및
              책임사항, 기타 필요한 사항을 규정하는 것을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">제2조 (용어의 정의)</h2>
            <p>
              &quot;이용자&quot;란 본 약관에 따라 회사가 제공하는 서비스를 이용하는 회원을
              말합니다. &quot;콘텐츠&quot;란 이용자가 서비스에 업로드하거나 서비스를 통해
              생성·조회하는 문서, 도면, 텍스트 등 일체의 자료를 말합니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">제3조 (약관의 효력 및 변경)</h2>
            <p>
              본 약관은 서비스 화면에 게시하거나 기타의 방법으로 이용자에게 공지함으로써 효력이
              발생합니다. 회사는 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있으며,
              개정 시 적용일자 및 개정사유를 명시하여 사전에 공지합니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">제4조 (서비스의 제공)</h2>
            <p>
              회사는 이용자에게 토목설계 관련 문서의 검색, 분석, 질의응답 및 관련 AI 기능을
              제공합니다. 회사는 안정적인 서비스 제공을 위해 노력하나, 시스템 점검·교체 등
              운영상 필요한 경우 서비스의 전부 또는 일부를 일시 중단할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">제5조 (이용자의 의무)</h2>
            <p>
              이용자는 관계 법령, 본 약관의 규정 및 회사가 통지하는 사항을 준수하여야 하며,
              타인의 권리를 침해하거나 서비스의 정상적인 운영을 방해하는 행위를 하여서는 안 됩니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">제6조 (책임의 제한)</h2>
            <p>
              회사는 AI가 생성한 결과의 정확성·완전성을 보증하지 않으며, 이용자는 서비스가
              제공하는 정보를 참고 자료로 활용하여야 합니다. 최종적인 설계·행정 판단에 대한
              책임은 이용자에게 있습니다.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
