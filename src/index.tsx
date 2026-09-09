import { definePlugin, routerHook } from "@decky/api";
import { afterPatch, ButtonItem, DropdownItem, PanelSection, PanelSectionRow, TextField, ToggleField } from "@decky/ui";
import { useSyncExternalStore } from "react";
import { installHomePatch } from "./homePatch.js";
import { LibraryStore } from "./store.js";
import type { SteamHost } from "./types.js";
import { CAROUSEL_LIMIT } from "./carousel.js";
import { translations } from "./i18n.js";
import { useLocale } from "./useLocale.js";

function Content({ store }: { store: LibraryStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const locale = useLocale(globalThis as unknown as SteamHost);
  const text = translations[locale];
  const shown = state.settings.unlimitedCarousel ? state.ids.length : Math.min(CAROUSEL_LIMIT, state.ids.length);
  const status = !state.settings.enabled ? text.disabled
    : state.state === "loading" ? text.loading
    : state.state === "unsupported" || state.patchState === "unsupported"
      ? text.unsupported
    : state.patchState === "waiting" ? text.openHome
    : text.shown(shown, state.ids.length);

  return (
    <PanelSection title="Recent Games To Library">
      <PanelSectionRow>
        <ToggleField label={text.enabledLabel} checked={state.settings.enabled}
          onChange={(enabled) => store.configure({ enabled })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField label={text.unlimitedLabel} checked={state.settings.unlimitedCarousel}
          onChange={(unlimitedCarousel) => store.configure({ unlimitedCarousel })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <DropdownItem label={text.sortLabel} selectedOption={state.settings.sort}
          rgOptions={[
            { data: "alphabetical", label: text.alphabetical },
            { data: "last-played", label: text.lastPlayed },
            { data: "collections", label: text.collections },
          ]}
          onChange={(option) => store.configure({ sort: option.data })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField label={text.shortcutsLabel} checked={state.settings.includeShortcuts}
          onChange={(includeShortcuts) => store.configure({ includeShortcuts })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <TextField label={text.titleLabel} value={state.settings.customTitle}
          bShowClearAction
          onChange={(event) => store.configure({ customTitle: event.target.value })} />
      </PanelSectionRow>
      <PanelSectionRow><div role="status">{status}</div></PanelSectionRow>
      {state.unknown > 0 && <PanelSectionRow>
        <div>{text.unknown(state.unknown)}</div>
      </PanelSectionRow>}
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={store.refresh}>{text.refresh}</ButtonItem>
      </PanelSectionRow>
      {state.error && <PanelSectionRow>
        <div>{text.errors[state.error.code]}</div>
        {state.error.detail && <div>{text.technicalDetails}: {state.error.detail}</div>}
      </PanelSectionRow>}
    </PanelSection>
  );
}

export default definePlugin(() => {
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* session-only settings */ }
  const store = new LibraryStore(() => globalThis as unknown as SteamHost, storage);
  const uninstall = installHomePatch(routerHook, afterPatch, store);
  store.start();
  return {
    name: "Recent Games To Library",
    titleView: <div>Recent Games To Library</div>,
    content: <Content store={store} />,
    icon: <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"
      aria-hidden="true">
      <path d="M12 2 1 11h3v9a2 2 0 0 0 2 2h4v-7h4v7h4a2 2 0 0 0 2-2v-9h3L12 2Z" />
    </svg>,
    onDismount() { store.dispose(); uninstall(); },
  };
});
