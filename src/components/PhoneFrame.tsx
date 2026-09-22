import type { ReactNode } from "react";

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <div className="phone">{children}</div>
    </div>
  );
}

export function StatusBar({ light = false }: { light?: boolean }) {
  return (
    <div className="status-bar" style={light ? { color: "#fdf3e0" } : undefined}>
      <span>9:41</span>
      <span className="signal">●●●●  📶  🔋</span>
    </div>
  );
}
