export const CLASH_TEMPLATE = {
  port: 7890,
  "socks-port": 7891,
  "mixed-port": 7893,
  "allow-lan": true,
  mode: "rule",
  "log-level": "info",
  ipv6: false,
  "external-controller": "127.0.0.1:9090",

  dns: {
    enable: true,
    listen: "0.0.0.0:1053",
    ipv6: false,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    nameserver: [
      "https://223.5.5.5/dns-query",
      "https://1.12.12.12/dns-query"
    ],
    fallback: [
      "https://1.1.1.1/dns-query",
      "https://8.8.8.8/dns-query"
    ]
  },

  "proxy-groups": [
    {
      name: "节点选择",
      type: "select",
      proxies: ["自动选择", "DIRECT"]
    },
    {
      name: "自动选择",
      type: "url-test",
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
      proxies: []
    },
    {
      name: "苹果服务",
      type: "select",
      proxies: ["DIRECT", "节点选择"]
    },
    {
      name: "微软服务",
      type: "select",
      proxies: ["DIRECT", "节点选择"]
    },
    {
      name: "流媒体",
      type: "select",
      proxies: ["节点选择", "自动选择", "DIRECT"]
    },
    {
      name: "漏网之鱼",
      type: "select",
      proxies: ["节点选择", "DIRECT"]
    }
  ],

  "rule-providers": {
    acl4ssr_ban_ad: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/BanAD.list",
      path: "./ruleset/acl4ssr/ban_ad.yaml",
      interval: 86400
    },
    acl4ssr_ban_program_ad: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/BanProgramAD.list",
      path: "./ruleset/acl4ssr/ban_program_ad.yaml",
      interval: 86400
    },
    acl4ssr_ban_easylist_china: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/BanEasyListChina.list",
      path: "./ruleset/acl4ssr/ban_easylist_china.yaml",
      interval: 86400
    },
    acl4ssr_lan: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/LocalAreaNetwork.list",
      path: "./ruleset/acl4ssr/lan.yaml",
      interval: 86400
    },
    acl4ssr_download: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Download.list",
      path: "./ruleset/acl4ssr/download.yaml",
      interval: 86400
    },
    acl4ssr_china_domain: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ChinaDomain.list",
      path: "./ruleset/acl4ssr/china_domain.yaml",
      interval: 86400
    },
    acl4ssr_china_company_ip: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ChinaCompanyIp.list",
      path: "./ruleset/acl4ssr/china_company_ip.yaml",
      interval: 86400
    },
    acl4ssr_china_ip: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ChinaIp.list",
      path: "./ruleset/acl4ssr/china_ip.yaml",
      interval: 86400
    },
    acl4ssr_google_cn: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/GoogleCN.list",
      path: "./ruleset/acl4ssr/google_cn.yaml",
      interval: 86400
    },
    acl4ssr_apple: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Apple.list",
      path: "./ruleset/acl4ssr/apple.yaml",
      interval: 86400
    },
    acl4ssr_microsoft: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Microsoft.list",
      path: "./ruleset/acl4ssr/microsoft.yaml",
      interval: 86400
    },
    acl4ssr_onedrive: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/OneDrive.list",
      path: "./ruleset/acl4ssr/onedrive.yaml",
      interval: 86400
    },
    acl4ssr_china_media: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ChinaMedia.list",
      path: "./ruleset/acl4ssr/china_media.yaml",
      interval: 86400
    },
    acl4ssr_netflix: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Netflix.list",
      path: "./ruleset/acl4ssr/netflix.yaml",
      interval: 86400
    },
    acl4ssr_proxy_media: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ProxyMedia.list",
      path: "./ruleset/acl4ssr/proxy_media.yaml",
      interval: 86400
    },
    acl4ssr_telegram: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Telegram.list",
      path: "./ruleset/acl4ssr/telegram.yaml",
      interval: 86400
    },
    acl4ssr_proxy_lite: {
      type: "http",
      behavior: "classical",
      url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ProxyLite.list",
      path: "./ruleset/acl4ssr/proxy_lite.yaml",
      interval: 86400
    }
  },

  rules: [
    "RULE-SET,acl4ssr_ban_ad,REJECT",
    "RULE-SET,acl4ssr_ban_program_ad,REJECT",
    "RULE-SET,acl4ssr_ban_easylist_china,REJECT",
    "RULE-SET,acl4ssr_lan,DIRECT",
    "RULE-SET,acl4ssr_download,DIRECT",
    "RULE-SET,acl4ssr_china_domain,DIRECT",
    "RULE-SET,acl4ssr_china_company_ip,DIRECT",
    "RULE-SET,acl4ssr_china_ip,DIRECT",
    "RULE-SET,acl4ssr_google_cn,DIRECT",
    "RULE-SET,acl4ssr_apple,苹果服务",
    "RULE-SET,acl4ssr_microsoft,微软服务",
    "RULE-SET,acl4ssr_onedrive,微软服务",
    "RULE-SET,acl4ssr_china_media,DIRECT",
    "RULE-SET,acl4ssr_netflix,流媒体",
    "RULE-SET,acl4ssr_proxy_media,流媒体",
    "RULE-SET,acl4ssr_telegram,节点选择",
    "RULE-SET,acl4ssr_proxy_lite,节点选择",
    "GEOIP,LAN,DIRECT",
    "GEOIP,CN,DIRECT",
    "MATCH,漏网之鱼"
  ]
};
