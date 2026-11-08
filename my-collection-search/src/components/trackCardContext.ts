import { createContext } from "react";

/**
 * True inside a track card's action slot, so the card's menu (`TrackActionsMenu`)
 * can take the card's trigger sizes and carry the rating there without every
 * caller passing a prop.
 */
export const TrackCardContext = createContext(false);

/**
 * True inside a dense track row's action slot: the menu takes the quiet ghost
 * trigger the cards use (with a 44px hit area), not an outlined key.
 */
export const TrackRowContext = createContext(false);
