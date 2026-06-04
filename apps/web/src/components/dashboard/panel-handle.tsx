"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Lets a card header render a drag handle supplied by its DashboardPanels
 * host, without the host having to clone the card element. DashboardPanels
 * wraps each panel in a `PanelHandleProvider` carrying that panel's grip;
 * `DashboardCard` / `TaskListToolbar` call `usePanelHandle()` and render it
 * (or nothing, when not hosted in a rearrangeable dashboard).
 */
const PanelHandleContext = createContext<ReactNode>(null);

export const PanelHandleProvider = PanelHandleContext.Provider;

export function usePanelHandle(): ReactNode {
  return useContext(PanelHandleContext);
}
