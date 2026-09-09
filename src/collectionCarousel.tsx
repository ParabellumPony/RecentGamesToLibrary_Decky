import { cloneElement, isValidElement, type ReactNode } from "react";
import { mapElements, type NativeElement } from "./reactTree.js";

const adapters = new WeakMap<object, (props: Record<string, any>) => ReactNode>();

// Steam normally uses appid as the virtualized column key. Collection mode
// permits repeated games, so each occurrence needs its own key and focus index.
// Width, artwork, scrolling and the Go To Library item remain native.
export function collectionCarousel(element: NativeElement, onIndexFocus: (index: number) => void): NativeElement {
  const type = element.type as any;
  const render = type?.$$typeof === Symbol.for("react.memo") ? type.type : type;
  if (typeof render !== "function" || render.prototype?.isReactComponent) {
    throw new Error("Unsupported Steam collection carousel component");
  }
  let adapter = adapters.get(type);
  if (!adapter) {
    adapter = ({ rgtlIndexFocus, ...props }) => {
      const tree = render(props);
      if (!props.games.length) return tree;
      let found = false;
      const result = mapElements(tree, (grid) => {
        const { fnGetId, fnItemRenderer, fnGetColumnWidth } = grid.props;
        if (typeof fnGetId !== "function" || typeof fnItemRenderer !== "function" ||
            typeof fnGetColumnWidth !== "function") return grid;
        found = true;
        return cloneElement(grid, {
          fnGetId: (index: number) => index < props.games.length
            ? `rgtl:${index}:${fnGetId(index)}` : fnGetId(index),
          fnItemRenderer: (index: number, ...args: any[]) => {
            const card = fnItemRenderer(index, ...args);
            if (index >= props.games.length) return card;
            if (!isValidElement<Record<string, any>>(card) || typeof card.props.onItemFocus !== "function") {
              throw new Error("Unsupported Steam collection carousel card");
            }
            return cloneElement(card, { onItemFocus: (...focusArgs: any[]) => {
              rgtlIndexFocus(index);
              return card.props.onItemFocus(...focusArgs);
            } });
          },
        });
      });
      if (!found) throw new Error("Steam collection carousel grid was not found");
      return result;
    };
    adapters.set(type, adapter);
  }
  return { ...cloneElement(element, { rgtlIndexFocus: onIndexFocus }), type: adapter };
}
