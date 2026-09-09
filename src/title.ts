import { cloneElement, isValidElement, type ReactNode } from "react";
import { findElement, isCarousel, mapElements } from "./reactTree.js";

export function replaceTitle(tree: ReactNode, title: string): ReactNode {
  const value = title.trim();
  if (!value) return tree;
  // Scope the heading to the same native section as the carousel. Do not
  // depend on the current Steam language or obfuscated CSS module names.
  const section = findElement(tree, (node) => Array.isArray(node.props.children) &&
    node.props.children.some((child: ReactNode) => isValidElement<Record<string, any>>(child) && isCarousel(child)) &&
    node.props.children.some((child: ReactNode) => findElement(child,
      (item) => item.type === "h2" || item.props.level === "2" || item.props.level === 2)));
  const heading = section && findElement(section, (node) =>
    node.type === "h2" || node.props.level === "2" || node.props.level === 2);
  if (!heading) return tree;
  const label = findElement(heading, (node) => typeof node.props.children === "string");
  return label ? mapElements(tree, (node) => node === label
    ? cloneElement(node, { children: value, style: { ...node.props.style,
      minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    } }) : node) : tree;
}
