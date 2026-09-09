import { createElement, isValidElement, type ReactNode } from "react";
import type { RoutePatch, RouterHook } from "@decky/api";
import { findElement } from "./reactTree.js";
import { ReplacementBoundary } from "./Replacement.js";
import type { LibraryStore } from "./store.js";
import type { AfterPatch, PatchHandle } from "./types.js";

const HOME = "/library/home";

export function installHomePatch(router: RouterHook, afterPatch: AfterPatch, store: LibraryStore): () => void {
  let disposed = false;
  const patches: PatchHandle[] = [];
  const patched = new WeakMap<object, Set<string>>();
  const roots = new WeakMap<object, (props: any) => ReactNode>();

  function patch(object: unknown, property: string, transform: (result: any) => ReactNode): void {
    if (disposed) return;
    if (!object || (typeof object !== "object" && typeof object !== "function") ||
        typeof (object as Record<string, unknown>)[property] !== "function") {
      store.report("unsupported", { code: "homeStructure" });
      return;
    }
    let keys = patched.get(object);
    if (keys?.has(property)) return;
    if (!keys) { keys = new Set(); patched.set(object, keys); }
    try {
      const handle = afterPatch(object, property, (_args, result) => {
        if (disposed || !result) return result;
        try { return transform(result); }
        catch (error) {
          store.report("unsupported", { code: "unexpected", detail: String(error) });
          return result;
        }
      });
      patches.push(handle);
      keys.add(property);
    } catch (error) { store.report("unsupported", { code: "unexpected", detail: String(error) }); }
  }

  // Decky's route child -> memoized Home -> memoized RecentGames. Matching
  // named props avoids depending on minified function names or CSS hashes.
  const routePatch: RoutePatch = (props) => {
    if (disposed || !isValidElement(props.children)) return props;
    const originalType = props.children.type;
    if (typeof originalType !== "function") {
      store.report("unsupported", { code: "routeType" });
      return props;
    }
    const inspectRoot = (outer: any): ReactNode => {
      patch(outer.type, "type", (home) => {
        const recents = findElement(home, (element) =>
          "autoFocus" in element.props && "showBackground" in element.props,
        );
        if (recents) {
          patch(recents.type, "type", (tree) => createElement(ReplacementBoundary, { tree, store }));
        } else {
          store.report("unsupported", { code: "recentsMissing" });
        }
        return home;
      });
      return outer;
    };
    let root = roots.get(originalType);
    if (!root) {
      // Decky supplies a transparent `(props) => createElement(oType, props)`
      // function here (research/decky-router-hook.tsx). It can be a NEW
      // function on every route render. Keep this owned wrapper collectible;
      // only shared native memo objects need persistent PatchHandles.
      const render = originalType as (props: any) => ReactNode;
      root = (props) => {
        const outer = render(props);
        if (disposed || !outer) return outer;
        try { return inspectRoot(outer); }
        catch (error) { store.report("unsupported", { code: "unexpected", detail: String(error) }); return outer; }
      };
      roots.set(originalType, root);
    }
    // The input React element may be frozen; copy it without touching Steam.
    return { ...props, children: { ...props.children, type: root } as typeof props.children };
  };

  let installed: RoutePatch | undefined;
  try { installed = router.addPatch(HOME, routePatch); }
  catch (error) { store.report("unsupported", { code: "unexpected", detail: String(error) }); }

  return () => {
    if (disposed) return;
    disposed = true;
    if (installed) {
      try { router.removePatch(HOME, installed); }
      catch (error) { console.warn("[RecentGamesToLibrary] Removing route patch:", error); }
    }
    for (const handle of patches.reverse()) {
      try { handle.unpatch(); }
      catch (error) { console.warn("[RecentGamesToLibrary] Restoring native component:", error); }
    }
    patches.length = 0;
  };
}
