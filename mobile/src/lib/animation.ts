import { Platform } from 'react-native';

/** The native animated driver isn't available on web; fall back to JS there. */
export const USE_NATIVE_DRIVER = Platform.OS !== 'web';
