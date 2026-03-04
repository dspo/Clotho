interface ClothoLogoProps {
  size?: number;
  className?: string;
}

export function ClothoLogo({ size = 32, className }: ClothoLogoProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id="clothoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="96" fill="url(#clothoGrad)" />
      <path
        d="M320 148c-20-16-48-28-80-28-88 0-120 72-120 136s32 136 120 136c32 0 60-12 80-28"
        fill="none"
        stroke="white"
        strokeWidth="36"
        strokeLinecap="round"
      />
      <path
        d="M340 178c-22-20-54-34-92-34-72 0-104 56-104 112s32 112 104 112c38 0 70-14 92-34"
        fill="none"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path
        d="M356 210c-24-22-58-38-100-38-56 0-88 44-88 84s32 84 88 84c42 0 76-16 100-38"
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <circle cx="356" cy="256" r="16" fill="white" opacity="0.9" />
    </svg>
  );
}
