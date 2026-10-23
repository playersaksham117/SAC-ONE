// 'react-native' as the app's screens see it (see metro.config.js): everything from
// react-native, with Text / TextInput in CAPITALS.
const RN = require('react-native');
const { CapsText, CapsTextInput } = require('./CapsText');

module.exports = Object.create(RN, {
  Text: { value: CapsText, enumerable: true },
  TextInput: { value: CapsTextInput, enumerable: true },
});
