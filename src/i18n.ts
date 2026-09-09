import type { PluginError, SteamHost } from "./types.js";

export type Locale = "en" | "ru";

export function localeFor(language: unknown): Locale {
  if (typeof language !== "string") return "en";
  const normalized = language.trim().toLowerCase().replace(/_/g, "-");
  return normalized === "russian" || normalized === "ru" || normalized.startsWith("ru-") ? "ru" : "en";
}

export function fallbackLocale(host: SteamHost): Locale {
  try { return localeFor(host.navigator?.language); } catch { return "en"; }
}

export async function detectLocale(host: SteamHost): Promise<Locale> {
  try {
    // Steam returns names such as "english" and "russian", not always BCP 47.
    const language = await host.SteamClient?.Settings?.GetCurrentLanguage?.();
    if (typeof language === "string" && language.trim()) return localeFor(language);
  } catch { /* Native API may not be available while Steam starts. */ }
  return fallbackLocale(host);
}

const en = {
  enabledLabel: "Installed games on Home",
  unlimitedLabel: "Unlimited Home page",
  sortLabel: "Order",
  alphabetical: "Alphabetical",
  collections: "By collection",
  lastPlayed: "Last played on this device",
  shortcutsLabel: "Show non-Steam games",
  titleLabel: "Carousel title",
  disabled: "Disabled",
  loading: "Waiting for the Steam library…",
  unsupported: "Unable to apply the replacement. Disable the plugin and restart Steam.",
  openHome: "Open the Steam Home screen",
  shown: (count: number, total: number) => `On Home: ${count} of ${total} games`,
  unknown: (count: number) => `Installation status unknown: ${count}. These games are not shown.`,
  refresh: "Refresh list",
  technicalDetails: "Technical details",
  errors: {
    homeStructure: "Steam's Home component structure has changed.",
    routeType: "Steam's Home route is no longer a supported component.",
    recentsMissing: "The Recent Games component was not found on Home.",
    carouselMissing: "The native carousel was not found in the Home component.",
    nativeRender: "The native carousel could not display the replacement list.",
    unexpected: "An error occurred while connecting to the Steam Home screen.",
  } satisfies Record<PluginError["code"], string>,
};

const ru: typeof en = {
  enabledLabel: "Установленные игры на главной",
  unlimitedLabel: "Неограниченная главная страница",
  sortLabel: "Порядок",
  alphabetical: "По алфавиту",
  collections: "По коллекциям",
  lastPlayed: "По запуску на этом устройстве",
  shortcutsLabel: "Отображать сторонние игры",
  titleLabel: "Заголовок карусели",
  disabled: "Выключен",
  loading: "Ожидание библиотеки Steam…",
  unsupported: "Не удалось применить подмену. Отключите плагин и перезапустите Steam.",
  openHome: "Откройте главный экран Steam",
  shown: (count, total) => `На главной: ${count} из ${total} игр`,
  unknown: (count) => `Состояние установки неизвестно: ${count}. Эти игры не показаны.`,
  refresh: "Обновить список",
  technicalDetails: "Технические сведения",
  errors: {
    homeStructure: "Структура главного экрана Steam изменилась.",
    routeType: "Маршрут главного экрана Steam больше не поддерживается.",
    recentsMissing: "Компонент недавних игр не найден на главном экране.",
    carouselMissing: "Штатная карусель не найдена на главном экране.",
    nativeRender: "Штатная карусель не смогла отобразить новый список игр.",
    unexpected: "Произошла ошибка при подключении к главному экрану Steam.",
  },
};

export const translations = { en, ru };
