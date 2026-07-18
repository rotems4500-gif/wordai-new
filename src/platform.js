// Desktop = Tauri shell (desktopShim.js installs window.desktopApp only under __TAURI_INTERNALS__).
export const isDesktopApp = () => typeof window !== 'undefined' && Boolean(window.desktopApp);
