import { createContext } from "react";

/**
 * True inside a track card's action slot, so the card's menu (`TrackActionsMenu`)
 * can take the card's trigger sizes and carry the rating there without every
 * caller passing a prop.
 */
export const TrackCardContext = createContext(false);
