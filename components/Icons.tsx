import type { SVGProps } from 'react';

/**
 * One stroke weight, one corner style, currentColor throughout — so icons
 * inherit the palette instead of fighting it.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
    </Svg>
  );
}

export function MicOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 5.5A3 3 0 0 1 15 5.5v4" />
      <path d="M15 13a3 3 0 0 1-4.5 2.6" />
      <path d="M5.5 11a6.5 6.5 0 0 0 10 5.5" />
      <path d="M18.5 11a6.5 6.5 0 0 1-.4 2.2" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
      <path d="M3.5 3.5l17 17" />
    </Svg>
  );
}

export function HandIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V14" />
      <path d="M8 11V9a1.5 1.5 0 0 0-3 0v4.5a7.5 7.5 0 0 0 7.5 7.5H13a4 4 0 0 0 4-4" />
    </Svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function PeopleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.4a3.2 3.2 0 0 1 0 5.2" />
      <path d="M17.5 14.6a5.5 5.5 0 0 1 3 4.9" />
    </Svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 12.5c0 4-3.8 7-8.5 7a9.7 9.7 0 0 1-2.7-.4L4.5 21l1.2-3.4A6.9 6.9 0 0 1 3.5 12.5c0-4 3.8-7 8.5-7s8.5 3 8.5 7Z" />
    </Svg>
  );
}

export function LeaveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 8.5V5.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6.5a2 2 0 0 0 2-2v-3" />
      <path d="M9.5 12h11" />
      <path d="M17.5 8.5 21 12l-3.5 3.5" />
    </Svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </Svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12h15" />
      <path d="M13.5 6.5 20 12l-6.5 5.5" />
    </Svg>
  );
}

export function RemoveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M4 20a6 6 0 0 1 10.5-4" />
      <path d="M15 17.5h6" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </Svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 11.5 20 4l-7.5 16-2-6.5-6.5-2Z" />
    </Svg>
  );
}

export function SpinnerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
    </Svg>
  );
}

/** The wordmark glyph: a carrier wave breaking out of a dish. */
export function AirwaveMark(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.9}>
      <path d="M4 15.5c0-4.7 3.6-8.5 8-8.5s8 3.8 8 8.5" />
      <path d="M8 15.5c0-2.4 1.8-4.3 4-4.3s4 1.9 4 4.3" />
      <path d="M12 15.5v4.5" />
      <path d="M9 20h6" />
      <path d="M12 3.5v1.8" />
    </Svg>
  );
}
