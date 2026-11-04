import type { IconProps } from ".";

export function PlugIcon(props: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M9 3v4.5M15 3v4.5M6.5 7.5h11v3.25a5.5 5.5 0 01-5.5 5.5v0a5.5 5.5 0 01-5.5-5.5V7.5zM12 16.25V21" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
