import { forwardRef, type ComponentRef } from 'react';
import { Text, TextInput, type TextInputProps, type TextProps } from 'react-native';

/**
 * All text in CAPITALS (the ERP saves names and addresses in capitals too). metro.config.js
 * hands these to the app's screens in place of react-native's Text / TextInput.
 * A style with its own textTransform wins (e.g. textTransform: 'none').
 */
export const CapsText = forwardRef<ComponentRef<typeof Text>, TextProps>(function CapsText(props, ref) {
  return <Text ref={ref} {...props} style={[{ textTransform: 'uppercase' }, props.style]} />;
});

/** Typing in capitals, except emails, passwords / PINs and fields that set autoCapitalize. */
export const CapsTextInput = forwardRef<ComponentRef<typeof TextInput>, TextInputProps>(function CapsTextInput(props, ref) {
  const keepAsTyped = props.autoCapitalize !== undefined || props.secureTextEntry
    || props.keyboardType === 'email-address' || props.keyboardType === 'url';
  return <TextInput ref={ref} autoCapitalize={keepAsTyped ? props.autoCapitalize : 'characters'} {...props} />;
});
