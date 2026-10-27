import { Children, forwardRef, type ComponentRef, type ReactNode } from 'react';
import { Platform, Text, TextInput, type TextInputProps, type TextProps } from 'react-native';

/** SAC-POS web runs on counter PCs and tablets: "this phone" in messages reads "this device". */
const DEVICE_WORDS: [RegExp, string][] = [
  [/\b(this|the) phone(’s|'s)?\b/gi, 'this device$2'],
  [/\bphone(’s|'s) (secure storage|camera)/gi, 'device$1 $2'],
];
const deviceWording = (children: ReactNode): ReactNode => (
  Platform.OS !== 'web' ? children : Children.map(children, (c) => (
    typeof c === 'string' ? DEVICE_WORDS.reduce((t, [re, to]) => t.replace(re, to), c) : c
  ))
);

/**
 * All text in CAPITALS (the ERP saves names and addresses in capitals too). metro.config.js
 * hands these to the app's screens in place of react-native's Text / TextInput.
 * A style with its own textTransform wins (e.g. textTransform: 'none').
 */
export const CapsText = forwardRef<ComponentRef<typeof Text>, TextProps>(function CapsText(props, ref) {
  return <Text ref={ref} {...props} style={[{ textTransform: 'uppercase' }, props.style]}>{deviceWording(props.children)}</Text>;
});

/** Typing in capitals, except emails, passwords / PINs and fields that set autoCapitalize. */
export const CapsTextInput = forwardRef<ComponentRef<typeof TextInput>, TextInputProps>(function CapsTextInput(props, ref) {
  const keepAsTyped = props.autoCapitalize !== undefined || props.secureTextEntry
    || props.keyboardType === 'email-address' || props.keyboardType === 'url';
  return <TextInput ref={ref} autoCapitalize={keepAsTyped ? props.autoCapitalize : 'characters'} {...props} />;
});
