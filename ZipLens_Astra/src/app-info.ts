import appConfig from "../src-tauri/tauri.conf.json";

// The bundled app and every visible version label use the same release metadata.
export const APP_NAME = appConfig.productName;
export const APP_VERSION = appConfig.version;
export const APP_DISPLAY_NAME = `${APP_NAME} ${APP_VERSION}`;
