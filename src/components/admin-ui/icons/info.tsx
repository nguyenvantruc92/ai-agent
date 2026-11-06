import type { IconProps } from ".";

/** Circle with an exclamation mark: "more information". */
export function InfoIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="9.25" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </svg>
  );
}
