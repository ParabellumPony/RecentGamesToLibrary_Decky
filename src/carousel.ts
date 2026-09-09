import { cloneElement, isValidElement, type ReactNode } from "react";
import { isCarousel, type NativeElement } from "./reactTree.js";

import { collectionCarousel } from "./collectionCarousel.js";

export const CAROUSEL_LIMIT = 20;
export const CAROUSEL_OVERSCAN = 6;

export function carouselGames(ids: readonly number[], unlimited: boolean): readonly number[] {
  return unlimited || ids.length <= CAROUSEL_LIMIT ? ids : ids.slice(0, CAROUSEL_LIMIT);
}

const adapters = new WeakMap<object, (props: Record<string, any>) => ReactNode>();

export function windowCarousel(element: NativeElement, onIndexFocus?: (index: number) => void): NativeElement {
  const nativeType = element.type;
  // Steam's RecentGames carousel wrapper is a plain function which supplies
  // overscan = games.length to BasicGameCarousel. Setting overscan on its INPUT
  // is ignored, so adjust its OUTPUT. Keep any unfamiliar component untouched.
  if (typeof nativeType !== "function" || nativeType.prototype?.isReactComponent) return element;
  let adapter = adapters.get(nativeType);
  if (!adapter) {
    const render = nativeType as (props: Record<string, any>) => ReactNode;
    adapter = ({ rgtlIndexFocus, ...props }) => {
      const result = render(props);
      if (!isValidElement<Record<string, any>>(result) || !isCarousel(result)) {
        return result;
      }
      // Steam's own virtualizer keeps the visible/focused column in view.
      // This only bounds the extra columns mounted on either side; the full
      // game array, keys, focus callbacks and native layout remain intact.
      const bounded = Number.isFinite(result.props.overscan) && result.props.overscan > CAROUSEL_OVERSCAN
        ? cloneElement(result, { overscan: CAROUSEL_OVERSCAN }) : result;
      return rgtlIndexFocus ? collectionCarousel(bounded, rgtlIndexFocus) : bounded;
    };
    adapters.set(nativeType, adapter);
  }
  // Owned, stable React type: no shared Steam function is patched and no
  // global cleanup is needed. The original type returns when disabled.
  return { ...(onIndexFocus ? cloneElement(element, { rgtlIndexFocus: onIndexFocus }) : element), type: adapter };
}
