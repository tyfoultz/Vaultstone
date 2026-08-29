import { useCallback, useState } from 'react';
import {
  Platform,
  type NativeSyntheticEvent,
  type TextInputChangeEventData,
  type TextInputContentSizeChangeEventData,
} from 'react-native';

export type AutoGrowOptions = {
  /** Floor for the computed height. The field never shrinks below this. */
  minHeight?: number;
  /**
   * The field's own `paddingVertical` (one side). Native's `contentSize`
   * measures text only, but RN's `height` is border-box — so the padding
   * has to be added back or the last line clips.
   */
  paddingY?: number;
  /**
   * The field's own `borderWidth`. Excluded from both native `contentSize`
   * and web `scrollHeight`, but included in the border-box `height`.
   */
  borderY?: number;
  /** Set false to freeze the height (caller drives sizing itself). */
  enabled?: boolean;
};

/**
 * Height management for an auto-growing multiline `TextInput`.
 *
 * Native reports true text height in `onContentSizeChange`, so that event
 * alone is enough.
 *
 * Web is the trap. react-native-web measures a multiline field with
 * `scrollHeight`, which never reports *less* than the height already
 * applied to the element. Feeding that straight back into `height` makes
 * the box ratchet upward by a line per keystroke and never shrink back —
 * on backspace too, since deleting a character doesn't reduce scrollHeight
 * below the applied height. So on web the `contentSize` measurement is
 * trusted only once (on mount, before any height is applied — that's what
 * sizes a field to its existing text) and every later measurement happens
 * in `onChange`, where the node is collapsed to `auto` to read its real
 * content height and then restored so React keeps owning the height.
 *
 * Spread the returned handlers onto the `TextInput` and apply `height`
 * last in the style array.
 */
export function useAutoGrow({
  minHeight = 0,
  paddingY = 0,
  borderY = 0,
  enabled = true,
}: AutoGrowOptions = {}) {
  const [height, setHeight] = useState<number | null>(null);

  const onContentSizeChange = useCallback(
    (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      if (!enabled) return;
      // See the note above — after the first web measurement, `onChange` owns it.
      if (Platform.OS === 'web' && height != null) return;
      const extra = Platform.OS === 'web' ? borderY * 2 : (paddingY + borderY) * 2;
      setHeight(Math.max(minHeight, e.nativeEvent.contentSize.height + extra));
    },
    [enabled, height, minHeight, paddingY, borderY],
  );

  const onChange = useCallback(
    (e: NativeSyntheticEvent<TextInputChangeEventData>) => {
      if (!enabled || Platform.OS !== 'web') return;
      const node = (e as unknown as { target?: HTMLTextAreaElement }).target;
      if (!node || typeof node.scrollHeight !== 'number') return;
      const prev = node.style.height;
      node.style.height = 'auto';
      const measured = node.scrollHeight;
      node.style.height = prev;
      setHeight(Math.max(minHeight, measured + borderY * 2));
    },
    [enabled, minHeight, borderY],
  );

  /** Drop the measurement so the next render re-sizes from scratch. */
  const reset = useCallback(() => setHeight(null), []);

  return { height: enabled ? height : null, onContentSizeChange, onChange, reset };
}
