export const MOBILE_NAV_CLEARANCE = "112px";
export const MOBILE_PLAYER_CLEARANCE = "252px";

export function getMobileBottomOverlayOffset(playlistLength: number) {
  return playlistLength > 0 ? MOBILE_PLAYER_CLEARANCE : MOBILE_NAV_CLEARANCE;
}
