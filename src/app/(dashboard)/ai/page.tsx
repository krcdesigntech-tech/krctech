import { redirect } from 'next/navigation'

// AI 어시스턴트 메뉴는 제거됨. 법령 Q&A는 관계법령(/legal)으로 통합.
export default function AIPage() {
  redirect('/legal')
}
