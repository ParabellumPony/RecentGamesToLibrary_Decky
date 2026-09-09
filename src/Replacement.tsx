import {
  Component, cloneElement, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore,
  type ReactNode,
} from "react";
import { findElement, isBackground, isCarousel, mapElements } from "./reactTree.js";
import type { LibraryStore } from "./store.js";
import { carouselGames, windowCarousel } from "./carousel.js";
import { replaceTitle } from "./title.js";

export class ReplacementBoundary extends Component<{
  tree: ReactNode; store: LibraryStore;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(error: Error): void {
    this.props.store.report("unsupported", { code: "nativeRender", detail: error.message });
  }
  render(): ReactNode {
    return this.state.failed ? this.props.tree : <Replacement {...this.props} />;
  }
}

export function replaceGames(
  tree: ReactNode,
  ids: readonly number[],
  onFocus: (...args: any[]) => unknown,
  onIndexFocus?: (index: number) => void,
): ReactNode {
  return mapElements(tree, (element) => {
    if (isCarousel(element)) {
      return windowCarousel(cloneElement(element, { games: ids, onItemFocus: onFocus,
        // Steam turns the featured card off when SteamVR leads the raw list.
        // Our game-only catalog excludes that tool, so use the native game layout.
        showFeaturedItem: true,
      }), onIndexFocus);
    }
    if (isBackground(element)) {
      // Steam's background owns a selected-app useState. Unmount it for an
      // empty library so deleted games cannot linger behind the home UI.
      return ids.length ? cloneElement(element, { games: ids }) : null;
    }
    return element;
  });
}

export function Replacement({ tree, store }: { tree: ReactNode; store: LibraryStore }): ReactNode {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const visibleIds = useMemo(() => carouselGames(snapshot.ids, snapshot.settings.unlimitedCarousel),
    [snapshot.ids, snapshot.settings.unlimitedCarousel]);
  const holder = findElement(tree, isCarousel);
  const originalFocus = useRef(holder?.props.onItemFocus);
  originalFocus.current = holder?.props.onItemFocus;
  const focused = useRef<number | undefined>(undefined);
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const onIndexFocus = useCallback((index: number) => setSelectedIndex(index), []);
  const wasReplacing = useRef(false);
  const replacing = snapshot.settings.enabled && snapshot.state === "ready" && !!holder;
  const onFocus = useCallback((...args: any[]) => {
    // Native Steam passes an appid, not an app overview.
    focused.current = typeof args[0] === "number" ? args[0] : args[0]?.appid;
    setSelected(focused.current);
    return originalFocus.current?.(...args);
  }, []);

  useEffect(() => {
    if (!holder) {
      if (snapshot.settings.enabled && snapshot.state === "ready" && visibleIds.length) {
        store.report("unsupported", { code: "carouselMissing" });
      }
      return;
    }
    store.report("active");
    const ids: readonly number[] = replacing ? visibleIds : holder.props.games;
    const modeChanged = wasReplacing.current !== replacing;
    wasReplacing.current = replacing;
    if (!modeChanged && focused.current !== undefined && ids.includes(focused.current)) return;
    const next = ids[0];
    focused.current = next;
    setSelected(next);
    setSelectedIndex(0);
    // Child effects have already installed Steam's background focus callback.
    // Updating it also keeps the native Current Game heading in sync.
    const background = findElement(tree, isBackground);
    if (next !== undefined && typeof background?.props.refOnItemFocus?.current === "function") {
      originalFocus.current?.(next);
    }
  }, [replacing, visibleIds, holder?.props.games, snapshot.settings.enabled, snapshot.state, store]);

  if (!replacing) return tree;
  const active = selected !== undefined && visibleIds.includes(selected) ? selected : visibleIds[0];
  const result = replaceGames(tree, visibleIds, onFocus,
    snapshot.settings.sort === "collections" ? onIndexFocus : undefined);
  const index = visibleIds[selectedIndex] === active ? selectedIndex : visibleIds.indexOf(active!);
  const title = snapshot.settings.customTitle.trim() ||
    (snapshot.settings.sort === "collections" && active !== undefined ? snapshot.collectionNames[index] : "");
  return title ? replaceTitle(result, title) : result;
}
