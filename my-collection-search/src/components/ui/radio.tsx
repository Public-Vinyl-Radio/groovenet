import { RadioGroup as ChakraRadioGroup } from "@chakra-ui/react";
import * as React from "react";

export interface RadioGroupProps extends ChakraRadioGroup.RootProps {
  children: React.ReactNode;
}

export const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  function RadioGroup(props, ref) {
    const { children, ...rest } = props;
    return (
      <ChakraRadioGroup.Root ref={ref} {...rest}>
        {children}
      </ChakraRadioGroup.Root>
    );
  },
);

export interface RadioProps extends ChakraRadioGroup.ItemProps {
  children: React.ReactNode;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(function Radio(props, ref) {
  const { children, ...rest } = props;
  return (
    <ChakraRadioGroup.Item ref={ref} {...rest}>
      <ChakraRadioGroup.ItemHiddenInput />
      <ChakraRadioGroup.ItemControl />
      <ChakraRadioGroup.ItemText>{children}</ChakraRadioGroup.ItemText>
    </ChakraRadioGroup.Item>
  );
});
