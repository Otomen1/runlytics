import { useEffect } from 'react';

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Traps Tab/Shift+Tab focus inside containerRef while active.
// Restores focus to the previously focused element on cleanup.
export function useFocusTrap(containerRef, active = true) {
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const container = containerRef.current;
    const prev = document.activeElement;

    const getFocusable = () => [...container.querySelectorAll(FOCUSABLE)].filter(el => !el.closest('[aria-hidden="true"]'));

    // Move focus into the modal on open
    const items = getFocusable();
    if (items.length) items[0].focus();

    const handleKeyDown = e => {
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last  = items[items.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [active, containerRef]);
}
