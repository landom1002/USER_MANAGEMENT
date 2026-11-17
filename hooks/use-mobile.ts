import * as React from "react"

const MOBILE_BREAKPOINT = 768
// lg ของ Tailwind — ใช้กับหน้าที่สลับ layout ทั้งชุด (เช่น master-detail ที่ /c/admin/user-groups)
const DESKTOP_BREAKPOINT = 1024

/** undefined = ยังไม่รู้ (ก่อน effect รอบแรก / ตอน SSR)
 *  หน้าที่สลับ layout ทั้งชุดต้องเช็ค undefined ก่อนเรนเดอร์ ไม่งั้นจะเห็น layout ผิดกระพริบหนึ่งเฟรม */
export function useMediaQuery(query: string): boolean | undefined {
  const [matches, setMatches] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)

    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])

  return matches
}

/** ยุบ undefined เป็น false — ผู้เรียกเดิมทั้งหมดถือว่า "ยังไม่รู้ = ไม่ใช่มือถือ" อยู่แล้ว */
export function useIsMobile() {
  return !!useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
}

/** คง undefined ไว้ให้ผู้เรียกตัดสินใจเอง — ใช้ตอนที่เรนเดอร์ผิดฝั่งแล้วเสียของ (เช่น ยิง query ทิ้ง) */
export function useIsDesktop() {
  return useMediaQuery(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
}
