export function LogoMDK({ className = "h-[26px] w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 355" className={className} fill="#fe8001" aria-label="MDK">
      <path d="M0 0L178 177L355 0V355H297V145L178 262L0 83Z" />
      <path d="M418 0H540A172 177.5 0 0 1 540 355H418L476 296H540A112 118.5 0 0 0 540 59H476Z" />
      <path d="M940 0H1024L848 177.5L1024 355H940L764 177.5Z" />
    </svg>
  )
}

export function LogoMDKMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-label="MDK">
      <rect width="64" height="64" rx="14" fill="#fe8001" />
      <g transform="translate(14 14) scale(0.1014)" fill="#141414">
        <path d="M0 0L178 177L355 0V355H297V145L178 262L0 83Z" />
      </g>
    </svg>
  )
}
