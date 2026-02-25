import { useEffect, useRef, useCallback } from 'react'

/**
 * Scroll-driven reveal transitions — "SwiftUI scroll transitions" for React.
 * 
 * Applies data-scroll-reveal to children of the container ref.
 * Elements fade/slide/scale in as they enter the viewport,
 * with staggered delays for sibling groups.
 */
export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  const observe = useCallback(() => {
    const container = ref.current
    if (!container) return

    // Find all elements marked for scroll reveal
    const targets = container.querySelectorAll<HTMLElement>('[data-scroll]')
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement
            el.classList.add('scroll-visible')
            observer.unobserve(el)
          }
        })
      },
      {
        threshold: 0.08,
        rootMargin: '0px 0px -40px 0px',
      }
    )

    targets.forEach((el, i) => {
      // Auto-stagger based on sibling index
      const stagger = el.getAttribute('data-scroll-stagger')
      if (stagger !== null) {
        el.style.transitionDelay = `${i * 60}ms`
      }
      observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    // Small delay to let the DOM render
    const timer = setTimeout(observe, 50)
    return () => clearTimeout(timer)
  }, [observe])

  return ref
}

/**
 * Lightweight hook for a single element scroll reveal
 */
export function useScrollElement<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('scroll-visible')
          observer.unobserve(el)
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return ref
}
