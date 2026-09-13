import { useCallback, useEffect, useRef, type ReactNode } from 'react'

interface DialogProps {
  /** Text for the visible heading, which also names the dialog. */
  readonly title: string
  /** id of the element describing the dialog, wired to `aria-describedby`. */
  readonly describedById?: string
  /** What the close button announces, e.g. "Close details for src". */
  readonly closeLabel: string
  readonly onClose: () => void
  readonly className?: string
  readonly children: ReactNode
}

/** Everything that can hold keyboard focus inside the dialog. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * The modal shell both dialogs are built on.
 *
 * Written once rather than per dialog: a focus trap has enough edge cases that
 * two copies would be two sets of bugs, and a dialog that traps focus incorrectly
 * is worse for a keyboard user than one that does not trap at all.
 *
 * What it guarantees:
 * - `role="dialog"` + `aria-modal="true"`, so assistive technology treats the
 *   page behind it as inert.
 * - Named by its own heading via `aria-labelledby`, and optionally described by
 *   its summary via `aria-describedby`.
 * - Focus moves inside on open and returns to whatever was focused before on
 *   close — otherwise focus falls back to the top of the page and a keyboard user
 *   loses their place in the tree.
 * - Tab and Shift+Tab wrap within the dialog rather than escaping to the page.
 * - Escape closes. Clicking the backdrop closes. Clicking inside does not.
 *
 * It is deliberately NOT a live region: the dialog announces itself by taking
 * focus and carrying dialog semantics, and the application already has exactly
 * one `aria-live` region elsewhere.
 */
export default function Dialog({
  title,
  describedById,
  closeLabel,
  onClose,
  className,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef<Element | null>(null)

  // Keep the latest onClose without re-running the mount effect, so opening does
  // not re-steal focus every time the parent re-renders.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    // Remember where focus came from, then move it into the dialog.
    returnFocusRef.current = document.activeElement
    closeButtonRef.current?.focus()

    return () => {
      const previous = returnFocusRef.current
      // Only restore if that element is still in the document — a rescan can
      // remove the tree row the user came from.
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus()
      }
    }
  }, [])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCloseRef.current()
      return
    }

    if (event.key !== 'Tab') return

    const panel = panelRef.current
    if (!panel) return

    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    )
    if (focusable.length === 0) {
      // Nothing to move to: keep focus where it is rather than letting Tab
      // escape to the page behind the dialog.
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return

    const active = document.activeElement

    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    } else if (!panel.contains(active)) {
      // Focus somehow drifted outside; pull it back in.
      event.preventDefault()
      first.focus()
    }
  }, [])

  return (
    <div
      className="dialog-overlay"
      // Backdrop closes; clicks inside the panel never reach this handler
      // because the target is then the panel, not the overlay.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current()
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className={className ? `dialog ${className}` : 'dialog'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        {...(describedById ? { 'aria-describedby': describedById } : {})}
        ref={panelRef}
      >
        <div className="dialog__header">
          <h2 className="dialog__title" id="dialog-title">
            {title}
          </h2>
          <button
            type="button"
            className="dialog__close"
            ref={closeButtonRef}
            onClick={() => onCloseRef.current()}
            aria-label={closeLabel}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
