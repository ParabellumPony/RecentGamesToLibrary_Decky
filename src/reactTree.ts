import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

export type NativeElement = ReactElement<Record<string, any>>;

export function findElement(
  tree: ReactNode,
  predicate: (element: NativeElement) => boolean,
): NativeElement | undefined {
  const queue: ReactNode[] = [tree];
  const seen = new Set<unknown>();
  for (let index = 0; index < queue.length && index < 4000; index++) {
    const value = queue[index];
    if (!value || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) { queue.push(...value); continue; }
    if (!isValidElement<Record<string, any>>(value)) continue;
    if (predicate(value)) return value;
    queue.push(value.props.children);
  }
  return undefined;
}

export function mapElements(
  tree: ReactNode,
  transform: (element: NativeElement) => NativeElement | null,
  depth = 0,
): ReactNode {
  if (depth > 80) throw new Error("Unexpected native tree depth");
  if (Array.isArray(tree)) {
    const mapped = tree.map((child) => mapElements(child, transform, depth + 1));
    return mapped.every((child, index) => child === tree[index]) ? tree : mapped;
  }
  if (!isValidElement<Record<string, any>>(tree)) return tree;
  const node = transform(tree);
  if (!node) return null;
  if (!("children" in node.props)) return node;
  const children = mapElements(node.props.children, transform, depth + 1);
  return children === node.props.children ? node : cloneElement(node, { children });
}

export function isCarousel(element: NativeElement): boolean {
  return Array.isArray(element.props.games) && typeof element.props.onItemFocus === "function";
}

export function isBackground(element: NativeElement): boolean {
  return Array.isArray(element.props.games) && "refOnItemFocus" in element.props;
}
