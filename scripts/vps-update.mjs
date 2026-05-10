#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEFAULT_CONVERTER_BASE_URL = "https://api.wd-purple.com/sub";
const DEFAULT_HEADERS = {
  "User-Agent": "ClashParty/1.8.3 CFNetwork/1410.1 Darwin/22.6.0",
  "Accept": "*/*",
  "Accept-Language": "zh-CN,zh-Hans;q=0.9"
};

export async function runUpdate() {
  const workerBaseUrl = requiredEnv("WORKER_BASE_URL");
  const adminToken = requiredEnv("ADMIN_TOKEN");
  const sources = getConfiguredSources();

  if (sources.length === 0) {
    throw new Error("No subscription sources configured. Set SUB_URL_1, SUB_URL_2, or SUB_URL_3 in .env.");
  }

  const fetchedSources = await Promise.all(
    sources.map((source, index) => fetchSource(source, index))
  );

  const payload = {
    requested_at: new Date().toISOString(),
    sources: fetchedSources
  };

  const result = await postUpdateResult(workerBaseUrl, adminToken, payload);
  logUpdateSummary(result);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function getConfiguredSources() {
  return [1, 2, 3]
    .map((index) => {
      const sourceUrl = String(process.env[`SUB_URL_${index}`] || "").trim();
      if (!sourceUrl) return null;

      return {
        index: index - 1,
        sourceUrl,
        fallbackEnabled: String(process.env[`SUB_FALLBACK_${index}`] || "").trim().toLowerCase() === "true"
      };
    })
    .filter(Boolean);
}

async function fetchSource(source, position) {
  const { sourceUrl, index, fallbackEnabled } = source;
  const headers = getUpstreamRequestHeaders();

  const [direct, clash, shadowrocket] = await Promise.all([
    fetchText(sourceUrl, headers, `direct ${position + 1}`),
    fetchText(buildClashUrl(sourceUrl, position), headers, `clash ${position + 1}`),
    fetchText(buildShadowrocketUrl(sourceUrl, position), headers, `shadowrocket ${position + 1}`)
  ]);

  return {
    index,
    source_url: sourceUrl,
    fallback_enabled: fallbackEnabled,
    direct,
    clash,
    shadowrocket
  };
}

function getUpstreamRequestHeaders() {
  return {
    "User-Agent": String(process.env.UPSTREAM_USER_AGENT || DEFAULT_HEADERS["User-Agent"]).trim(),
    "Accept": String(process.env.UPSTREAM_ACCEPT || DEFAULT_HEADERS.Accept).trim(),
    "Accept-Language": String(process.env.UPSTREAM_ACCEPT_LANGUAGE || DEFAULT_HEADERS["Accept-Language"]).trim()
  };
}

function buildClashUrl(sourceUrl, index) {
  return isConvertedSubscriptionUrl(sourceUrl)
    ? convertExistingConverterUrl(sourceUrl, {
      target: "clash",
      emoji: "true",
      udp: "true",
      scv: "true",
      new_name: "true",
      filename: `sub-${index + 1}`
    })
    : buildConverterUrl(sourceUrl, {
      target: "clash",
      emoji: "true",
      udp: "true",
      scv: "true",
      new_name: "true",
      filename: `sub-${index + 1}`
    });
}

function buildShadowrocketUrl(sourceUrl, index) {
  return isConvertedSubscriptionUrl(sourceUrl)
    ? convertExistingConverterUrl(sourceUrl, {
      target: "shadowrocket",
      emoji: "true",
      udp: "true",
      scv: "true",
      new_name: "true",
      filename: `sub-${index + 1}`
    })
    : buildConverterUrl(sourceUrl, {
      target: "shadowrocket",
      emoji: "true",
      udp: "true",
      scv: "true",
      new_name: "true",
      filename: `sub-${index + 1}`
    });
}

function buildConverterUrl(sourceUrl, params) {
  const baseUrl = String(process.env.CONVERTER_BASE_URL || DEFAULT_CONVERTER_BASE_URL).trim();
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("url", sourceUrl);
  return url.toString();
}

function isConvertedSubscriptionUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    return url.searchParams.has("target") && url.searchParams.has("url");
  } catch {
    return false;
  }
}

function convertExistingConverterUrl(sourceUrl, params) {
  const url = new URL(sourceUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function fetchText(url, headers, label) {
  try {
    const resp = await fetch(url, {
      headers,
      redirect: "follow"
    });

    const text = await resp.text();
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        error: `${label} fetch failed\nstatus=${resp.status}\n${text.slice(0, 1000)}`
      };
    }

    return {
      ok: true,
      status: resp.status,
      subscription_userinfo: resp.headers.get("subscription-userinfo"),
      text
    };
  } catch (error) {
    return {
      ok: false,
      error: `${label} fetch failed\n${error.stack || error}`
    };
  }
}

async function postUpdateResult(workerBaseUrl, adminToken, payload) {
  const url = new URL("/update", workerBaseUrl);
  url.searchParams.set("token", adminToken);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`post update result failed\nstatus=${resp.status}\n${text.slice(0, 2000)}`);
  }

  return JSON.parse(text);
}

function logUpdateSummary(result) {
  const clashSources = Array.isArray(result?.clash_sources) ? result.clash_sources : [];
  if (clashSources.length === 0) return;

  for (const source of clashSources) {
    const sourceNo = Number(source.index) + 1;
    if (source.ok) {
      console.log(
        `[source ${sourceNo}] clash ok mode=${source.mode} status=${source.status} fallback=${source.used_fallback ? "yes" : "no"}`
      );
      continue;
    }

    const firstLine = String(source.error || "unknown error").split("\n")[0];
    console.log(`[source ${sourceNo}] clash failed ${firstLine}`);
  }

  const shadowrocketSources = Array.isArray(result?.shadowrocket_sources) ? result.shadowrocket_sources : [];
  for (const source of shadowrocketSources) {
    const sourceNo = Number(source.index) + 1;
    if (source.ok) {
      console.log(
        `[source ${sourceNo}] shadowrocket ok mode=${source.mode} status=${source.status} fallback=${source.used_fallback ? "yes" : "no"}`
      );
      continue;
    }

    const firstLine = String(source.error || "unknown error").split("\n")[0];
    console.log(`[source ${sourceNo}] shadowrocket failed ${firstLine}`);
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl && import.meta.url === entryUrl) {
  runUpdate().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
