import { useCallback, useRef } from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";

export interface UseVirtualListOptions {
  /** Total item count */
  count: number;
  /** Unique key for each item (used for stable measurement cache) */
  getItemKey: (index: number) => string;
  /** Estimated item height before measurement */
  estimateSize: () => number;
  /** Number of extra items to render beyond viewport */
  overscan?: number;
  /** Distance from bottom (px) within which we consider the user "near bottom" */
  nearBottomThreshold?: number;
}

export interface VirtualListRenderItem {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  containerRef: React.RefCallback<HTMLDivElement>;
  /** Whether the user is currently near the bottom */
  isNearBottomRef: React.MutableRefObject<boolean>;
  /** Call this on the scroll container's onScroll */
  handleScroll: () => void;
  /** Scroll to a specific index */
  scrollToIndex: (index: number, align?: "start" | "center" | "end") => void;
  /** Re-measure all items (e.g. after font size change) */
  remeasure: () => void;
}

export function useVirtualList({
  count,
  getItemKey,
  estimateSize,
  overscan = 6,
  nearBottomThreshold = 120,
}: UseVirtualListOptions): VirtualListRenderItem {
  const containerRef = useRef<HTMLDivElement>(null);

  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  }, []);
  const isNearBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= nearBottomThreshold;
  }, [nearBottomThreshold]);

  // TanStack Virtual returns imperative APIs not suitable for React Compiler memoization
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => containerRef.current,
    estimateSize,
    getItemKey,
    overscan,
  });

  const scrollToIndex = useCallback(
    (index: number, align?: "start" | "center" | "end") => {
      virtualizer.scrollToIndex(index, { align: align ?? "end" });
    },
    [virtualizer],
  );

  const remeasure = useCallback(() => {
    virtualizer.measure();
  }, [virtualizer]);

  return {
    virtualizer,
    containerRef: setContainerRef,
    isNearBottomRef,
    handleScroll,
    scrollToIndex,
    remeasure,
  };
}

// ---------------------------------------------------------------------------
// Convenience wrapper component — optional; pages can also use the hook directly.
// ---------------------------------------------------------------------------

interface VirtualListProps {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  containerRef: React.RefCallback<HTMLDivElement>;
  onScroll?: () => void;
  containerClassName?: string;
  /** Render a single item given its index. Return null to skip. */
  renderItem: (index: number) => React.ReactNode;
}

export function VirtualList({ virtualizer, containerRef, onScroll, containerClassName, renderItem }: VirtualListProps) {
  return (
    <div ref={containerRef} onScroll={onScroll} className={containerClassName} style={{ overflowAnchor: "none" }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
          overflowAnchor: "none",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const child = renderItem(virtualItem.index);
          if (!child) return null;
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
                overflowAnchor: "none",
              }}
            >
              {child}
            </div>
          );
        })}
      </div>
    </div>
  );
}
