import { palettes } from "./index";
import { customPaletteId, type AppearancePaletteId, type CustomPalette } from "./custom";

export interface GroundColours {
  light: string;
  dark: string;
}

/** The page ground of the active palette in each mode: what `theme-color` paints behind the iOS status bar. */
export function paletteGround(
  palette: AppearancePaletteId,
  customPalette: CustomPalette | null,
): GroundColours {
  if (palette === customPaletteId && customPalette) {
    return { light: customPalette.light.ground, dark: customPalette.dark.ground };
  }
  const preset = palettes[palette === customPaletteId ? "sleeve" : palette];
  return { light: preset.light["--gn-ground"], dark: preset.dark["--gn-ground"] };
}
