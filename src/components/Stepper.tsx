interface Props {
  /** Step labels; the last one is the result ("Planning"). */
  steps: string[]
  current: number
  onJump: (i: number) => void
}

export function Stepper({ steps, current, onJump }: Props) {
  return (
    <nav className="stepper" aria-label="Étapes">
      {steps.map((label, i) => {
        const isLast = i === steps.length - 1
        const state = i === current ? 'active' : i < current ? 'done' : 'todo'
        return (
          <button
            key={i}
            type="button"
            className={`step ${state}`}
            onClick={() => onJump(i)}
            aria-current={i === current ? 'step' : undefined}
          >
            <span className="step-num">{isLast ? '🎭' : i < current ? '✓' : i + 1}</span>
            <span className="step-label">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
