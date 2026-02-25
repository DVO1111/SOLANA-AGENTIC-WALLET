import { useEffect, useRef, useState } from 'react'

/**
 * Swimming Solana Logo — follows the mouse with spring physics,
 * tilts in the direction of movement, and leaves ripple trails.
 * Inspired by "tilt your phone, the duck swims that way."
 */
export default function SwimmingSolana() {
  const containerRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLDivElement>(null)
  const pos = useRef({ x: 0, y: 0 })
  const target = useRef({ x: 0, y: 0 })
  const velocity = useRef({ x: 0, y: 0 })
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])
  const rippleId = useRef(0)
  const frameRef = useRef<number>(0)
  const lastRipple = useRef(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Initialize position to center
    const rect = container.getBoundingClientRect()
    pos.current = { x: rect.width / 2, y: rect.height / 2 }
    target.current = { ...pos.current }

    function handleMouseMove(e: MouseEvent) {
      const rect = container!.getBoundingClientRect()
      target.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }

    // Also handle when mouse leaves — logo drifts to center
    function handleMouseLeave() {
      const rect = container!.getBoundingClientRect()
      target.current = {
        x: rect.width / 2,
        y: rect.height / 2,
      }
    }

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseleave', handleMouseLeave)

    // Spring physics animation loop
    const SPRING = 0.015    // spring stiffness (lower = lazier follow)
    const DAMPING = 0.92    // velocity damping (higher = more glide)
    const MIN_SPEED = 0.01

    function animate() {
      // Spring force toward target
      const dx = target.current.x - pos.current.x
      const dy = target.current.y - pos.current.y

      velocity.current.x += dx * SPRING
      velocity.current.y += dy * SPRING

      // Apply damping
      velocity.current.x *= DAMPING
      velocity.current.y *= DAMPING

      // Update position
      pos.current.x += velocity.current.x
      pos.current.y += velocity.current.y

      // Calculate speed and rotation
      const speed = Math.sqrt(
        velocity.current.x ** 2 + velocity.current.y ** 2
      )
      const angle = Math.atan2(velocity.current.y, velocity.current.x) * (180 / Math.PI)

      // Apply transform to logo
      if (logoRef.current) {
        const tilt = Math.min(speed * 1.2, 25) // tilt based on speed, max 25deg
        const bobY = Math.sin(Date.now() / 400) * 3 // gentle bob
        const bobRotate = Math.sin(Date.now() / 600) * 2 // gentle sway
        const scale = 1 + Math.min(speed * 0.003, 0.08) // slight grow when moving

        logoRef.current.style.transform = [
          `translate(${pos.current.x}px, ${pos.current.y + bobY}px)`,
          `translate(-50%, -50%)`,
          `rotate(${speed > MIN_SPEED ? angle + 90 : bobRotate}deg)`,
          `scale(${scale})`,
          `skewX(${tilt * 0.15}deg)`,
        ].join(' ')

        // Glow intensity based on speed
        const glowOpacity = Math.min(0.15 + speed * 0.01, 0.6)
        logoRef.current.style.filter = `drop-shadow(0 0 ${8 + speed * 0.8}px rgba(139, 92, 246, ${glowOpacity}))`
      }

      // Spawn ripple if moving fast enough
      const now = Date.now()
      if (speed > 1.5 && now - lastRipple.current > 300) {
        lastRipple.current = now
        const id = ++rippleId.current
        setRipples((prev) => [...prev.slice(-5), { id, x: pos.current.x, y: pos.current.y }])
        // Remove ripple after animation
        setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.id !== id))
        }, 1200)
      }

      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
      cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return (
    <div className="swim-pond" ref={containerRef}>
      {/* Water surface lines */}
      <div className="swim-surface">
        <div className="swim-wave swim-wave-1" />
        <div className="swim-wave swim-wave-2" />
        <div className="swim-wave swim-wave-3" />
      </div>

      {/* Ripples */}
      {ripples.map((r) => (
        <div
          key={r.id}
          className="swim-ripple"
          style={{ left: r.x, top: r.y }}
        />
      ))}

      {/* The Solana logo */}
      <div className="swim-logo" ref={logoRef}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 397.7 311.7"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <linearGradient id="sol-a" x1="360.88" y1="351.46" x2="141.21" y2="-69.29" gradientTransform="matrix(1 0 0 -1 0 314)" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#00FFA3" />
            <stop offset="1" stopColor="#DC1FFF" />
          </linearGradient>
          <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" fill="url(#sol-a)" />
          <linearGradient id="sol-b" x1="264.83" y1="401.6" x2="45.16" y2="-19.15" gradientTransform="matrix(1 0 0 -1 0 314)" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#00FFA3" />
            <stop offset="1" stopColor="#DC1FFF" />
          </linearGradient>
          <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#sol-b)" />
          <linearGradient id="sol-c" x1="312.55" y1="376.69" x2="92.88" y2="-44.06" gradientTransform="matrix(1 0 0 -1 0 314)" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#00FFA3" />
            <stop offset="1" stopColor="#DC1FFF" />
          </linearGradient>
          <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#sol-c)" />
        </svg>
        {/* Wake trail */}
        <div className="swim-wake" />
      </div>

      {/* Label */}
      <div className="swim-label">
        Move your mouse — the logo follows
      </div>
    </div>
  )
}
