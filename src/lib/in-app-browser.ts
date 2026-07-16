/**
 * 인앱 브라우저(웹뷰) 감지 유틸.
 *
 * Google OAuth는 카카오톡 등 앱 내장 웹뷰에서 차단된다(403 disallowed_useragent).
 * User-Agent로 대표적인 인앱 브라우저를 식별해, 로그인 화면에서 외부 브라우저로
 * 열도록 안내하는 데 사용한다.
 */

export type InAppBrowser =
  | 'kakaotalk'
  | 'line'
  | 'naver'
  | 'instagram'
  | 'facebook'
  | 'daum'
  | 'other'
  | null

/** UA 문자열에서 인앱 브라우저 종류를 반환한다. 일반 브라우저면 null. */
export function detectInAppBrowser(ua: string): InAppBrowser {
  if (!ua) return null
  const s = ua.toLowerCase()

  if (s.includes('kakaotalk')) return 'kakaotalk'
  if (s.includes('line/') || s.includes('line ')) return 'line'
  if (s.includes('naver') || s.includes('whale')) return 'naver'
  if (s.includes('instagram')) return 'instagram'
  if (s.includes('fban') || s.includes('fbav') || s.includes('fb_iab')) return 'facebook'
  if (s.includes('daumapps') || s.includes('daum/')) return 'daum'

  // 일반 안드로이드 웹뷰( "; wv)" )도 OAuth가 막힐 수 있으므로 other로 처리
  if (s.includes('; wv)')) return 'other'

  return null
}

/**
 * 인앱 브라우저에서 기본(외부) 브라우저로 현재 URL을 여는 딥링크를 반환한다.
 * 해당 인앱이 외부 열기 스킴을 지원하지 않으면 null (이 경우 주소 복사로 안내).
 */
export function buildExternalOpenUrl(browser: InAppBrowser, currentUrl: string): string | null {
  switch (browser) {
    case 'kakaotalk':
      return `kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}`
    case 'line':
      return currentUrl.includes('?')
        ? `${currentUrl}&openExternalBrowser=1`
        : `${currentUrl}?openExternalBrowser=1`
    default:
      return null
  }
}

export const IN_APP_BROWSER_LABEL: Record<NonNullable<InAppBrowser>, string> = {
  kakaotalk: '카카오톡',
  line: '라인',
  naver: '네이버 앱',
  instagram: '인스타그램',
  facebook: '페이스북',
  daum: '다음 앱',
  other: '인앱',
}
