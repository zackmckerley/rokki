"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Controls a DashboardPanels host injects into each panel's card header,
 * so the card can render the host's chrome (drag grip, maximize/restore
 * toggle) without the host cloning the card element. Outside a
 * rearrangeable dashboard the context is null and the cards fall back to
 * their own defaults (no grip; the expand button is a plain link).
 */
export interface PanelControls {
  /** Drag grip for reordering / moving the panel. */
  handle: ReactNode;
  /** Maximize / restore toggle (replaces the card's expand link). */
  maximize: ReactNode;
  /** Minimize button — sends the panel to the rail's Modules list. */
  minimize: ReactNode;
}

const PanelControlsContext = createContext<PanelControls | null>(null);

export const PanelControlsProvider = PanelControlsContext.Provider;

export function usePanelHandle(): ReactNode {
  return useContext(PanelControlsContext)?.handle ?? null;
}

export function usePanelMaximize(): ReactNode {
  return useContext(PanelControlsContext)?.maximize ?? null;
}

export function usePanelMinimize(): ReactNode {
  return useContext(PanelControlsContext)?.minimize ?? null;
}
