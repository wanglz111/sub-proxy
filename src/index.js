import YAML from "yaml";
import { CLASH_TEMPLATE } from "./config/clash-template.js";
import { SUBSCRIPTION_CONFIG } from "./config/subscriptions.js";

const OBJECTS = {
  clash: "sub/latest.clash.yaml",
  shadowrocket: "sub/latest.shadowrocket.txt",
  meta: "sub/latest.meta.json",
  historyPrefix: "sub/history/"
};

const TEXT_YAML = "text/yaml; charset=utf-8";
const TEXT_PLAIN = "text/plain; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/update") {
        requireAdmin(request, env);

        if (request.method === "GET") {
          return jsonResponse(buildExternalUpdateJob(env));
        }

        if (request.method === "POST") {
          const payload = await request.json();
          const result = await runExternalUpdate(env, payload);
          return jsonResponse(result);
        }

        return new Response("Method Not Allowed", {
          status: 405,
          headers: {
            Allow: "GET, POST"
          }
        });
      }

      if (url.pathname === "/clash" || url.pathname === "/sub") {
        requireSubscriptionAuth(request, env);
        return serveObject(env, OBJECTS.clash, TEXT_YAML);
      }

      if (url.pathname === "/shadowrocket") {
        requireSubscriptionAuth(request, env);
        return serveObject(env, OBJECTS.shadowrocket, TEXT_PLAIN);
      }

      if (url.pathname === "/meta") {
        requireAdmin(request, env);
        return serveObject(env, OBJECTS.meta, JSON_TYPE);
      }

      return new Response("Not Found", { status: 404 });
    } catch (err) {
      const status = err.status || 500;
      return new Response(status === 500 ? `Worker Exception:\n${err.stack || err}` : err.message, {
        status
      });
    }
  }
};

function buildExternalUpdateJob(env) {
  const upstreamUrls = getUpstreamUrls(env);
  if (upstreamUrls.length === 0) {
    throw httpError(400, "No upstream subscriptions configured. Set SUB_URLS.");
  }

  const converterBaseUrl = env[SUBSCRIPTION_CONFIG.converterBaseUrlEnv] ||
    SUBSCRIPTION_CONFIG.defaultConverterBaseUrl;

  return {
    ok: true,
    mode: "external-fetch",
    requested_at: new Date().toISOString(),
    upstream_count: upstreamUrls.length,
    request_headers: SUBSCRIPTION_CONFIG.requestHeaders,
    sources: upstreamUrls.map((subUrl, index) => ({
      index,
      source_url: subUrl,
      request_headers: SUBSCRIPTION_CONFIG.requestHeaders,
      direct_url: subUrl,
      clash_url: isConvertedSubscriptionUrl(subUrl) ? convertExistingConverterUrl(subUrl, {
        ...SUBSCRIPTION_CONFIG.clashConverterParams,
        filename: `sub-${index + 1}`
      }) : buildConverterUrl(converterBaseUrl, subUrl, {
        ...SUBSCRIPTION_CONFIG.clashConverterParams,
        filename: `sub-${index + 1}`
      }),
      shadowrocket_url: isConvertedSubscriptionUrl(subUrl) ? convertExistingConverterUrl(subUrl, {
        ...SUBSCRIPTION_CONFIG.shadowrocketConverterParams,
        filename: `sub-${index + 1}`
      }) : buildConverterUrl(converterBaseUrl, subUrl, {
        ...SUBSCRIPTION_CONFIG.shadowrocketConverterParams,
        filename: `sub-${index + 1}`
      })
    }))
  };
}

async function runExternalUpdate(env, payload) {
  const upstreamUrls = getUpstreamUrls(env);
  if (upstreamUrls.length === 0) {
    throw httpError(400, "No upstream subscriptions configured. Set SUB_URLS.");
  }

  const submittedSources = Array.isArray(payload?.sources) ? payload.sources : null;
  if (!submittedSources || submittedSources.length === 0) {
    throw httpError(400, "POST /update requires a JSON body with a non-empty sources array.");
  }

  const sourceMap = new Map();
  for (const entry of submittedSources) {
    if (typeof entry?.index !== "number" || !Number.isInteger(entry.index)) {
      throw httpError(400, "Each submitted source must include an integer index.");
    }
    sourceMap.set(entry.index, entry);
  }

  const processedSources = upstreamUrls.map((subUrl, index) =>
    processExternalSource(index, subUrl, sourceMap.get(index))
  );

  const clashResults = processedSources.map((source) => source.clashResult);
  const shadowrocketResults = processedSources.map((source) => source.shadowrocketResult);
  const successfulClashResults = clashResults.filter((result) => result.ok).map((result) => result.value);
  const successfulShadowrocketResults = shadowrocketResults.filter((result) => result.ok).map((result) => result.value);
  const proxies = uniqueProxiesByName(successfulClashResults.flatMap((result) => result.proxies));

  if (proxies.length === 0) {
    throw httpError(502, `External updater returned no Clash proxies.\n${formatResultErrors(clashResults)}`);
  }

  const clashYaml = buildClashYaml(proxies);
  const convertedShadowrocketText = mergeShadowrocketText(successfulShadowrocketResults.map((result) => result.text));
  const shadowrocketText = convertedShadowrocketText || buildShadowrocketTextFromProxies(proxies);
  const subscriptionUserinfo = mergeSubscriptionUserinfo(
    successfulClashResults.map((result) => result.subscriptionUserinfo).filter(Boolean)
  );

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  await archiveExisting(env, now);

  await env.SUB_BUCKET.put(OBJECTS.clash, clashYaml, {
    httpMetadata: { contentType: TEXT_YAML }
  });
  await env.SUB_BUCKET.put(OBJECTS.shadowrocket, shadowrocketText, {
    httpMetadata: { contentType: TEXT_PLAIN }
  });
  await env.SUB_BUCKET.put(OBJECTS.meta, JSON.stringify({
    updated_at: new Date().toISOString(),
    update_mode: "external-fetch",
    updater_requested_at: payload?.requested_at || null,
    upstream_count: upstreamUrls.length,
    proxy_count: proxies.length,
    subscription_userinfo: subscriptionUserinfo,
    clash_sources: clashResults.map(publicSourceMeta),
    shadowrocket_sources: shadowrocketResults.map(publicShadowrocketMeta)
  }, null, 2), {
    httpMetadata: { contentType: JSON_TYPE }
  });

  return {
    ok: true,
    updated_at: now,
    update_mode: "external-fetch",
    upstream_count: upstreamUrls.length,
    proxy_count: proxies.length
  };
}

function processExternalSource(index, subUrl, submittedSource) {
  if (!submittedSource) {
    return {
      clashResult: {
        ok: false,
        index,
        error: `source ${index + 1} missing from submitted update payload`
      },
      shadowrocketResult: {
        ok: false,
        index,
        error: `source ${index + 1} missing from submitted update payload`
      }
    };
  }

  if (submittedSource.source_url && submittedSource.source_url !== subUrl) {
    return {
      clashResult: {
        ok: false,
        index,
        error: `source ${index + 1} URL mismatch`
      },
      shadowrocketResult: {
        ok: false,
        index,
        error: `source ${index + 1} URL mismatch`
      }
    };
  }

  const direct = normalizeFetchedPayload(submittedSource.direct);
  const clash = normalizeFetchedPayload(submittedSource.clash);
  const shadowrocket = normalizeFetchedPayload(submittedSource.shadowrocket);

  const directProxies = direct?.ok ? parseClashProxies(direct.text) : [];
  if (direct?.ok && directProxies.length > 0) {
    return {
      clashResult: {
        ok: true,
        value: {
          index,
          status: direct.status,
          mode: "direct",
          subscriptionUserinfo: direct.subscriptionUserinfo,
          proxies: directProxies
        }
      },
      shadowrocketResult: buildShadowrocketResult(index, shadowrocket)
    };
  }

  if (clash?.ok) {
    const proxies = parseClashProxies(clash.text);
    if (proxies.length > 0) {
      return {
        clashResult: {
          ok: true,
          value: {
            index,
            status: clash.status,
            mode: "converter",
            subscriptionUserinfo: clash.subscriptionUserinfo,
            proxies
          }
        },
        shadowrocketResult: buildShadowrocketResult(index, shadowrocket)
      };
    }
  }

  return {
    clashResult: {
      ok: false,
      index,
      error: formatExternalClashError(index, direct, clash)
    },
    shadowrocketResult: buildShadowrocketResult(index, shadowrocket)
  };
}

function buildShadowrocketResult(index, shadowrocket) {
  if (!shadowrocket?.ok) {
    return {
      ok: false,
      index,
      error: shadowrocket?.error || `Shadowrocket upstream ${index + 1} returned no data.`
    };
  }

  return {
    ok: true,
    value: {
      index,
      status: shadowrocket.status,
      mode: "converter",
      subscriptionUserinfo: shadowrocket.subscriptionUserinfo,
      text: shadowrocket.text
    }
  };
}

function normalizeFetchedPayload(value) {
  if (!value || typeof value !== "object") return null;

  if (typeof value.ok !== "boolean") {
    throw httpError(400, "Each submitted fetch result must include an ok boolean.");
  }

  if (value.ok) {
    if (typeof value.text !== "string") {
      throw httpError(400, "Successful submitted fetch results must include text.");
    }

    return {
      ok: true,
      status: Number.isFinite(Number(value.status)) ? Number(value.status) : 200,
      subscriptionUserinfo: value.subscription_userinfo || value.subscriptionUserinfo || null,
      text: value.text
    };
  }

  return {
    ok: false,
    status: Number.isFinite(Number(value.status)) ? Number(value.status) : null,
    error: value.error ? String(value.error) : "fetch failed"
  };
}

function formatExternalClashError(index, direct, clash) {
  const parts = [`Clash upstream ${index + 1} returned no proxies.`];

  if (direct) {
    parts.push(direct.ok
      ? `direct status=${direct.status}, parsed_proxies=0`
      : `direct failed: ${direct.error}`);
  } else {
    parts.push("direct missing");
  }

  if (clash) {
    parts.push(clash.ok
      ? `converter status=${clash.status}, parsed_proxies=0`
      : `converter failed: ${clash.error}`);
  } else {
    parts.push("converter missing");
  }

  return parts.join("\n");
}

function buildConverterUrl(baseUrl, subUrl, params) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("url", subUrl);
  return url.toString();
}

function isConvertedSubscriptionUrl(subUrl) {
  try {
    const url = new URL(subUrl);
    return url.searchParams.has("target") && url.searchParams.has("url");
  } catch {
    return false;
  }
}

function convertExistingConverterUrl(subUrl, params) {
  const url = new URL(subUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function parseClashProxies(text) {
  try {
    const doc = YAML.parse(text);
    return Array.isArray(doc?.proxies) ? doc.proxies : [];
  } catch {
    return [];
  }
}

function buildClashYaml(proxies) {
  const config = structuredClone(CLASH_TEMPLATE);
  config.proxies = proxies;

  const proxyNames = proxies.map((proxy) => proxy.name).filter(Boolean);
  for (const group of config["proxy-groups"] || []) {
    if (Array.isArray(group.proxies) && group.proxies.length === 0) {
      group.proxies = proxyNames;
    }
  }

  return YAML.stringify(config, {
    lineWidth: 0,
    singleQuote: false
  });
}

function uniqueProxiesByName(proxies) {
  const seen = new Map();

  for (const proxy of proxies) {
    if (!isUsableProxy(proxy)) continue;
    let name = String(proxy.name);
    const originalName = name;
    let suffix = 2;

    while (seen.has(name)) {
      name = `${originalName} ${suffix}`;
      suffix += 1;
    }

    seen.set(name, {
      ...proxy,
      name
    });
  }

  return [...seen.values()];
}

function isUsableProxy(proxy) {
  if (!proxy || typeof proxy !== "object" || !proxy.name) return false;
  if (proxy.server === "127.0.0.1" && Number(proxy.port) === 1) return false;
  if (isNoticeProxyName(String(proxy.name))) return false;
  return true;
}

function isNoticeProxyName(name) {
  return [
    "当前Clash客户端不支持",
    "不支持本机场协议",
    "请更换",
    "推荐客户端",
    "官网教程",
    "Win客户端",
    "Mac客户端",
    "安卓客户端",
    "Android客户端",
    "iOS客户端",
    "该软件不支持新节点",
    "官网：",
    "剩余流量",
    "距离下次重置",
    "套餐到期"
  ].some((keyword) => name.includes(keyword));
}

function mergeShadowrocketText(texts) {
  const lines = [];
  const seen = new Set();

  for (const text of texts) {
    for (const line of decodeMaybeBase64(text).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || seen.has(trimmed)) continue;
      seen.add(trimmed);
      lines.push(trimmed);
    }
  }

  return btoa(lines.join("\n"));
}

function buildShadowrocketTextFromProxies(proxies) {
  const lines = proxies.map(proxyToSubscriptionUri).filter(Boolean);
  return lines.length > 0 ? base64Encode(lines.join("\n")) : "";
}

function proxyToSubscriptionUri(proxy) {
  switch (proxy.type) {
    case "ss":
      return ssUri(proxy);
    case "vmess":
      return vmessUri(proxy);
    case "vless":
      return vlessUri(proxy);
    case "trojan":
      return trojanUri(proxy);
    default:
      return null;
  }
}

function ssUri(proxy) {
  if (!proxy.cipher || !proxy.password || !proxy.server || !proxy.port) return null;
  const userinfo = base64UrlEncode(`${proxy.cipher}:${proxy.password}`);
  return `ss://${userinfo}@${proxy.server}:${proxy.port}#${encodeURIComponent(proxy.name)}`;
}

function vmessUri(proxy) {
  if (!proxy.uuid || !proxy.server || !proxy.port) return null;

  return `vmess://${base64Encode(JSON.stringify({
    v: "2",
    ps: proxy.name,
    add: proxy.server,
    port: String(proxy.port),
    id: proxy.uuid,
    aid: String(proxy.alterId || 0),
    scy: proxy.cipher || "auto",
    net: proxy.network || "tcp",
    type: "none",
    host: proxy["ws-opts"]?.headers?.Host || proxy.servername || "",
    path: proxy["ws-opts"]?.path || "",
    tls: proxy.tls ? "tls" : "",
    sni: proxy.servername || ""
  }))}`;
}

function vlessUri(proxy) {
  if (!proxy.uuid || !proxy.server || !proxy.port) return null;

  const params = new URLSearchParams();
  params.set("encryption", "none");
  params.set("type", proxy.network || "tcp");

  if (proxy.tls) {
    params.set("security", proxy["reality-opts"] ? "reality" : "tls");
  }

  if (proxy.servername) params.set("sni", proxy.servername);
  if (proxy.flow) params.set("flow", proxy.flow);
  if (proxy["client-fingerprint"]) params.set("fp", proxy["client-fingerprint"]);
  if (proxy["reality-opts"]?.["public-key"]) params.set("pbk", proxy["reality-opts"]["public-key"]);
  if (proxy["reality-opts"]?.["short-id"]) params.set("sid", proxy["reality-opts"]["short-id"]);

  return `vless://${proxy.uuid}@${proxy.server}:${proxy.port}?${params.toString()}#${encodeURIComponent(proxy.name)}`;
}

function trojanUri(proxy) {
  if (!proxy.password || !proxy.server || !proxy.port) return null;

  const params = new URLSearchParams();
  params.set("type", proxy.network || "tcp");
  params.set("security", proxy.tls === false ? "none" : "tls");
  if (proxy.servername) params.set("sni", proxy.servername);
  if (proxy["skip-cert-verify"]) params.set("allowInsecure", "1");

  return `trojan://${encodeURIComponent(proxy.password)}@${proxy.server}:${proxy.port}?${params.toString()}#${encodeURIComponent(proxy.name)}`;
}

function base64Encode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64UrlEncode(value) {
  return base64Encode(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function mergeSubscriptionUserinfo(values) {
  const parsedValues = values.map(parseSubscriptionUserinfo).filter(Boolean);
  if (parsedValues.length === 0) return null;

  const merged = {
    upload: 0,
    download: 0,
    total: 0,
    expire: null
  };

  for (const value of parsedValues) {
    merged.upload += value.upload || 0;
    merged.download += value.download || 0;
    merged.total += value.total || 0;

    if (value.expire) {
      merged.expire = merged.expire ? Math.min(merged.expire, value.expire) : value.expire;
    }
  }

  const parts = [
    `upload=${merged.upload}`,
    `download=${merged.download}`,
    `total=${merged.total}`
  ];

  if (merged.expire) {
    parts.push(`expire=${merged.expire}`);
  }

  return parts.join("; ");
}

function parseSubscriptionUserinfo(value) {
  const result = {};

  for (const part of String(value).split(";")) {
    const [rawKey, rawValue] = part.split("=");
    if (!rawKey || !rawValue) continue;

    const key = rawKey.trim();
    const number = Number(rawValue.trim());
    if (!Number.isFinite(number)) continue;

    result[key] = number;
  }

  if (!("upload" in result) && !("download" in result) && !("total" in result)) {
    return null;
  }

  return result;
}

function formatResultErrors(results) {
  return results
    .filter((result) => !result.ok)
    .map((result) => `source ${result.index + 1}: ${result.error}`)
    .join("\n");
}

function decodeMaybeBase64(text) {
  const trimmed = text.trim();
  if (!trimmed) return "";

  try {
    const decoded = atob(trimmed);
    if (/^(ss|ssr|vmess|vless|trojan|hysteria2?):\/\//m.test(decoded)) {
      return decoded;
    }
  } catch {
    // Plain text subscription.
  }

  return text;
}

async function archiveExisting(env, now) {
  await archiveObject(env, OBJECTS.clash, `${OBJECTS.historyPrefix}${now}.clash.yaml`, TEXT_YAML);
  await archiveObject(env, OBJECTS.shadowrocket, `${OBJECTS.historyPrefix}${now}.shadowrocket.txt`, TEXT_PLAIN);
  await archiveObject(env, OBJECTS.meta, `${OBJECTS.historyPrefix}${now}.meta.json`, JSON_TYPE);
}

async function archiveObject(env, fromKey, toKey, contentType) {
  const oldObj = await env.SUB_BUCKET.get(fromKey);
  if (!oldObj) return;

  await env.SUB_BUCKET.put(toKey, oldObj.body, {
    httpMetadata: { contentType }
  });
}

async function serveObject(env, key, contentType) {
  const obj = await env.SUB_BUCKET.get(key);
  if (!obj) {
    return new Response("Subscription not initialized. Run the VPS updater first.", { status: 404 });
  }

  const headers = {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  };

  if (key !== OBJECTS.meta) {
    const metaObj = await env.SUB_BUCKET.get(OBJECTS.meta);
    if (metaObj) {
      const meta = JSON.parse(await metaObj.text());
      if (meta.subscription_userinfo) {
        headers["subscription-userinfo"] = meta.subscription_userinfo;
      }
    }
  }

  return new Response(obj.body, { headers });
}

function getUpstreamUrls(env) {
  return String(env.SUB_URLS || "")
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function requireAdmin(request, env) {
  if (isAuthorized(request, env)) return;
  throw httpError(401, "Unauthorized");
}

function requireSubscriptionAuth(request, env) {
  if (String(env.REQUIRE_SUB_TOKEN || "true").toLowerCase() !== "true") return;
  if (isAuthorized(request, env, ["ACCESS_TOKEN", "ADMIN_TOKEN"])) return;
  throw httpError(401, "Unauthorized");
}

function isAuthorized(request, env, tokenNames = ["ADMIN_TOKEN"]) {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  const auth = request.headers.get("Authorization") || "";

  return tokenNames.some((tokenName) => {
    const token = env[tokenName];
    return token && (queryToken === token || auth === `Bearer ${token}`);
  });
}

function publicSourceMeta(result) {
  if (!result.ok) {
    return {
      ok: false,
      index: result.index,
      error: result.error
    };
  }

  return {
    ok: true,
    index: result.value.index,
    status: result.value.status,
    mode: result.value.mode,
    has_subscription_userinfo: Boolean(result.value.subscriptionUserinfo)
  };
}

function publicShadowrocketMeta(result) {
  if (!result.ok) {
    return {
      ok: false,
      index: result.index,
      error: result.error
    };
  }

  return {
    ok: true,
    index: result.value.index,
    status: result.value.status,
    mode: result.value.mode,
    has_subscription_userinfo: Boolean(result.value.subscriptionUserinfo)
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "Content-Type": JSON_TYPE,
      "Cache-Control": "no-store"
    }
  });
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
