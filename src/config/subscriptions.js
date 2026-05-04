export const SUBSCRIPTION_CONFIG = {
  converterBaseUrlEnv: "CONVERTER_BASE_URL",
  defaultConverterBaseUrl: "https://api.wd-purple.com/sub",

  clashConverterParams: {
    target: "clash",
    emoji: "true",
    udp: "true",
    scv: "true",
    new_name: "true"
  },

  shadowrocketConverterParams: {
    target: "shadowrocket",
    emoji: "true",
    udp: "true",
    scv: "true",
    new_name: "true"
  },

  requestHeaders: {
    "User-Agent": "clash.meta",
    "Accept": "*/*"
  }
};
