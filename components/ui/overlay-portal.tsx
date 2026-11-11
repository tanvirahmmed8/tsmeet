'use client';

import { createContext, useContext } from 'react';

// A fullscreen element is in the browser's top layer. Portals must remain
// inside that element rather than being mounted alongside it in document.body.
export const OverlayPortalContext = createContext<HTMLElement | undefined>(undefined);
export const useOverlayPortalContainer = () => useContext(OverlayPortalContext);
