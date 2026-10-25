import type { SystemStyleObject } from "@chakra-ui/react";

/**
 * Round transport buttons (mini player, Now playing). The one exception to the
 * hard-shadow rule: a circle with an offset square shadow reads as a glitch, so
 * these carry no shadow at all. Pressed is a dim and a shrink instead of the
 * solid button's shift-and-shrink-shadow.
 */
export const roundTransportButton: SystemStyleObject = {
  borderRadius: "full",
  boxShadow: "none",
  _hover: { boxShadow: "none" },
  _active: { boxShadow: "none", transform: "scale(0.96)", filter: "brightness(0.9)" },
};
