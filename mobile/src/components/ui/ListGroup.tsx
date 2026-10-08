import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';

/** iOS-style inset grouped list: one rounded surface, hairline dividers between rows. */
export function ListGroup({ children, className = '', inset = 16 }: { children: ReactNode; className?: string; inset?: number }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View className={`mx-4 overflow-hidden rounded-2xl bg-surface ${className}`}>
      {rows.map((row, i) => (
        <View key={row.key ?? i}>
          {i > 0 ? <View className="h-px bg-white/10" style={{ marginLeft: inset }} /> : null}
          {row}
        </View>
      ))}
    </View>
  );
}
