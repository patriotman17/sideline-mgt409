import { useEffect, useRef, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform, type KeyboardEvent, type View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bottom padding that keeps a chat composer above the keyboard, for screens
 * presented as sheets (`presentation: 'modal'`).
 *
 * Why not KeyboardAvoidingView: it compares its parent-relative layout with the
 * keyboard's screen position, so inside an iOS sheet it under-corrects and the
 * input stays hidden. Measuring with `measureInWindow` is also unreliable inside
 * native sheets, so on iOS we use only layout-independent facts: a sheet always
 * reaches the bottom of the screen, and the wrapper (inside a SafeAreaView with a
 * bottom edge) ends one safe-area inset above it — so the overlap is
 * `keyboard height - bottom inset`.
 *
 * On Android the stack "modal" is full screen and measuring works; if the window
 * was already resized for the keyboard, the measured overlap is simply 0.
 *
 * The wrapper using `ref` must sit inside a SafeAreaView with the bottom edge and
 * apply `paddingBottom: overlap` to itself.
 */
export function useKeyboardOverlap() {
  const ref = useRef<View>(null);
  const [overlap, setOverlap] = useState(0);
  const { bottom: bottomInset } = useSafeAreaInsets();

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const animate = (e?: KeyboardEvent) => {
      if (Platform.OS === 'ios') {
        LayoutAnimation.configureNext({
          duration: e?.duration || 250,
          update: { type: LayoutAnimation.Types.keyboard },
        });
      }
    };

    const onShow = (e: KeyboardEvent) => {
      if (Platform.OS === 'ios') {
        const next = Math.max(0, Math.round(e.endCoordinates.height - bottomInset));
        if (__DEV__) console.log(`[keyboard] ios height=${e.endCoordinates.height} inset=${bottomInset} -> pad ${next}`);
        animate(e);
        setOverlap(next);
        return;
      }
      ref.current?.measureInWindow((_x, y, _w, height) => {
        const next = Math.max(0, Math.round(y + height - e.endCoordinates.screenY));
        if (__DEV__) console.log(`[keyboard] android bottom=${y + height} kbTop=${e.endCoordinates.screenY} -> pad ${next}`);
        setOverlap(next);
      });
    };
    const onHide = (e: KeyboardEvent) => {
      animate(e);
      setOverlap(0);
    };

    const subs = [Keyboard.addListener(showEvent, onShow), Keyboard.addListener(hideEvent, onHide)];
    return () => subs.forEach((s) => s.remove());
  }, [bottomInset]);

  return { ref, overlap };
}
