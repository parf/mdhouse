/** Inline 16px icons — no icon font, no sprite, no extra request. */

interface Props {
  size?: number;
}

const svg = (path: preact.ComponentChildren, { size = 16 }: Props = {}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {path}
  </svg>
);

export const IconPanel = (p: Props) =>
  svg(
    <>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <line x1="6" y1="2.75" x2="6" y2="13.25" />
    </>,
    p,
  );

export const IconPanelWide = (p: Props) =>
  svg(
    <>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <line x1="9" y1="2.75" x2="9" y2="13.25" />
    </>,
    p,
  );

export const IconPanelOff = (p: Props) => svg(<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />, p);

export const IconChevron = ({ open, ...p }: Props & { open?: boolean }) =>
  svg(<polyline points={open ? '3,6 8,11 13,6' : '6,3 11,8 6,13'} />, p);

export const IconDoc = (p: Props) =>
  svg(
    <>
      <path d="M9 1.75H4.25A1.5 1.5 0 0 0 2.75 3.25v9.5a1.5 1.5 0 0 0 1.5 1.5h7.5a1.5 1.5 0 0 0 1.5-1.5V5.75z" />
      <polyline points="9,1.75 9,5.75 13.25,5.75" />
    </>,
    p,
  );

export const IconFolder = (p: Props) =>
  svg(<path d="M1.75 4.25A1.5 1.5 0 0 1 3.25 2.75h2.6l1.4 1.6h5.5a1.5 1.5 0 0 1 1.5 1.5v6.4a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5z" />, p);

export const IconSearch = (p: Props) =>
  svg(
    <>
      <circle cx="7" cy="7" r="4.25" />
      <line x1="10.2" y1="10.2" x2="13.5" y2="13.5" />
    </>,
    p,
  );

export const IconStar = ({ filled, ...p }: Props & { filled?: boolean }) => (
  <svg
    width={p.size ?? 16}
    height={p.size ?? 16}
    viewBox="0 0 16 16"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M8 1.9l1.85 3.9 4.15.6-3 3 .71 4.25L8 11.65 4.29 13.65 5 9.4l-3-3 4.15-.6z" />
  </svg>
);

export const IconMute = (p: Props) =>
  svg(
    <>
      <path d="M8.5 3.2 5.4 5.8H2.9v4.4h2.5l3.1 2.6z" />
      <line x1="11" y1="6.2" x2="13.6" y2="9.8" />
      <line x1="13.6" y1="6.2" x2="11" y2="9.8" />
    </>,
    p,
  );

export const IconEyeOff = (p: Props) =>
  svg(
    <>
      <path d="M6.1 6.2A2.2 2.2 0 0 0 8 9.9c.5 0 1-.17 1.4-.46" />
      <path d="M2 8s2.4-3.6 6-3.6c1 0 1.9.28 2.7.7M14 8s-.9 1.35-2.35 2.4" />
      <line x1="2.6" y1="2.6" x2="13.4" y2="13.4" />
    </>,
    p,
  );

export const IconClock = (p: Props) =>
  svg(
    <>
      <circle cx="8" cy="8" r="5.6" />
      <polyline points="8,4.6 8,8 10.4,9.4" />
    </>,
    p,
  );

export const IconGit = (p: Props) =>
  svg(
    <>
      <circle cx="4.4" cy="4" r="1.8" />
      <circle cx="4.4" cy="12" r="1.8" />
      <circle cx="11.6" cy="8" r="1.8" />
      <path d="M4.4 5.8v4.4M6.2 4h2.1a1.5 1.5 0 0 1 1.5 1.5v1" />
    </>,
    p,
  );

export const IconUser = (p: Props) =>
  svg(
    <>
      <circle cx="8" cy="5.25" r="2.75" />
      <path d="M2.75 13.75c0-2.5 2.35-4 5.25-4s5.25 1.5 5.25 4" />
    </>,
    p,
  );

export const IconX = (p: Props) =>
  svg(
    <>
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </>,
    p,
  );

export const IconLink = (p: Props) =>
  svg(
    <>
      <path d="M6.8 9.2a2.6 2.6 0 0 0 3.85.3l1.9-1.9a2.6 2.6 0 0 0-3.7-3.7l-1.1 1.1" />
      <path d="M9.2 6.8a2.6 2.6 0 0 0-3.85-.3l-1.9 1.9a2.6 2.6 0 0 0 3.7 3.7l1.1-1.1" />
    </>,
    p,
  );
