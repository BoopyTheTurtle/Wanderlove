import type { ReactNode } from "react";

export function PhoneFrame({ theme, children }: { theme?: string; children: ReactNode }) {
  return (
    <div className="app-shell">
      <div className={theme ? `phone theme-${theme}` : "phone"}>{children}</div>
    </div>
  );
}

export function StatusBar({ light = false }: { light?: boolean }) {
  return (
    <div className={`status-bar ${light ? "light" : ""}`}>
      <span>9:41</span>
      <svg width="56" height="12" viewBox="0 0 56 12" aria-hidden="true" fill="currentColor">
        <rect x="0" y="8" width="3" height="4" rx="1" />
        <rect x="5" y="6" width="3" height="6" rx="1" />
        <rect x="10" y="3" width="3" height="9" rx="1" />
        <rect x="15" y="0" width="3" height="12" rx="1" />
        <path d="M27 11.5 23.5 8a5 5 0 0 1 7 0zM21.6 6.1a7.7 7.7 0 0 1 10.8 0l1.2-1.2a9.4 9.4 0 0 0-13.2 0z" />
        <rect x="37.5" y="1" width="16" height="10" rx="2.5" fill="none" stroke="currentColor" />
        <rect x="39.5" y="3" width="12" height="6" rx="1" />
        <rect x="54.5" y="4" width="1.5" height="4" rx=".7" />
      </svg>
    </div>
  );
}

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 22s-8-6-8-12a8 8 0 0 1 16 0c0 6-8 12-8 12Z" />
        <path
          d="M12 13.6s-3.4-2.1-3.4-4.3c0-1.8 2.3-2.5 3.4-.9 1.1-1.6 3.4-.9 3.4.9 0 2.2-3.4 4.3-3.4 4.3z"
          fill="#fff"
        />
      </svg>
    </span>
  );
}
