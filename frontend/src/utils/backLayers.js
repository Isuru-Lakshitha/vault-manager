import { useEffect, useRef } from 'react';

// Things that the phone's Back button should close first (open modals,
// sheets, drawers), newest on top. Only used by the Android app.
const layers = [];

/** Register `onClose` as a Back-button layer while `active` is true. */
export function useBackLayer(active, onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    const entry = { close: () => ref.current?.() };
    layers.push(entry);
    return () => {
      const i = layers.lastIndexOf(entry);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [active]);
}

/** Close the newest open layer. Returns false when nothing was open. */
export function closeTopBackLayer() {
  const top = layers[layers.length - 1];
  if (!top) return false;
  top.close();
  return true;
}
