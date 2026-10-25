"use client"

import React from "react";
import {
  Toaster as ChakraToaster,
  Portal,
  Spinner,
  Stack,
  Toast,
  createToaster,
} from "@chakra-ui/react"

// Toasts sit 12px above the bottom chrome (tab bar + player, --chrome-bottom in
// houseStyle globalCss), never over it. The var is 0 when no bar is showing.
export const toastOffsets = {
  top: "1rem",
  left: "1rem",
  right: "1rem",
  bottom: "calc(var(--chrome-bottom, 0px) + 12px)",
};

export const toaster = createToaster({
  placement: "bottom-end",
  offsets: toastOffsets,
  pauseOnPageIdle: true,
})

export const Toaster = () => {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: "4" }}>
        {(toast) => (
          <Toast.Root width={{ md: "sm" }}>
            {toast.type === "loading" ? (
              <Spinner size="sm" color="accent.solid" />
            ) : (
              <Toast.Indicator />
            )}
            <Stack gap="1" flex="1" maxWidth="100%">
              {toast.title && <Toast.Title>{toast.title}</Toast.Title>}
              {toast.description && (
                <Toast.Description>{toast.description}</Toast.Description>
              )}
            </Stack>
            {toast.action && (
              <Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
            )}
            {toast.closable && <Toast.CloseTrigger />}
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  )
}
