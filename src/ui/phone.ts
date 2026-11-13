import { useEffect, useState } from 'preact/hooks';

/** A phone or a tablet in portrait: a touch screen at most 900px wide (the docked sidebar leaves a phone-sized column). The page puts its secondary controls behind one ⋯ and its context behind one disclosure. */
export const PHONE = '(pointer: coarse) and (max-width: 900px)';

export const usePhone = (): boolean => {
  const [on, setOn] = useState(() => matchMedia(PHONE).matches);
  useEffect(() => {
    const m = matchMedia(PHONE);
    const change = () => setOn(m.matches);
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, []);
  return on;
};
