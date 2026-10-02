import { createContext } from "react";

export type NavTab = "explore" | "activity" | "league" | "profile";

// Where each bottom-nav tab goes, set once by the app so every screen's nav works without passing handlers down.
export type NavHandlers = Partial<Record<NavTab, () => void>>;
export const NavContext = createContext<NavHandlers>({});
