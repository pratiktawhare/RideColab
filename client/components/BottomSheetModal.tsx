// ─────────────────────────────────────────────────────────────
// BottomSheetModal — themed wrapper around @gorhom/bottom-sheet
// 3 snap points: peek (80px) / half (50%) / full (90%)
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import BottomSheet, {
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useThemeStore } from '@/store/themeStore';

export interface BottomSheetModalRef {
  expand: () => void;
  collapse: () => void;
  close: () => void;
  snapToIndex: (index: number) => void;
}

interface BottomSheetModalProps {
  children: React.ReactNode;
  /** Override snap points. Defaults to [80, '50%', '90%'] */
  snapPoints?: (number | string)[];
  initialIndex?: number;
  onChange?: (index: number) => void;
  contentStyle?: ViewStyle;
}

export const BottomSheetModal = forwardRef<BottomSheetModalRef, BottomSheetModalProps>(
  function BottomSheetModal(
    {
      children,
      snapPoints = [80, '50%', '90%'],
      initialIndex = 0,
      onChange,
      contentStyle,
    },
    ref,
  ) {
    const { theme, scheme } = useThemeStore();
    const c = theme.colors;
    const sheetRef = useRef<BottomSheet>(null);

    useImperativeHandle(ref, () => ({
      expand: () => sheetRef.current?.expand(),
      collapse: () => sheetRef.current?.collapse(),
      close: () => sheetRef.current?.close(),
      snapToIndex: (i: number) => sheetRef.current?.snapToIndex(i),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={1}
          opacity={0.4}
        />
      ),
      [],
    );

    return (
      <BottomSheet
        ref={sheetRef}
        snapPoints={snapPoints}
        index={initialIndex}
        onChange={onChange}
        backdropComponent={renderBackdrop}
        backgroundStyle={[styles.bg, { backgroundColor: c.surface }]}
        handleIndicatorStyle={[styles.indicator, { backgroundColor: c.border }]}
        keyboardBehavior="fillParent"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetView style={[styles.content, contentStyle]}>
          {children}
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

// ─── Drag handle pill only (for static sheets) ────────────────
export function SheetHandle() {
  const { theme } = useThemeStore();
  return <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />;
}

const styles = StyleSheet.create({
  bg: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  indicator: { width: 40, height: 4, borderRadius: 2 },
  content: { flex: 1, paddingHorizontal: 20, paddingBottom: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginVertical: 8 },
});
