#!/usr/bin/env node

export async function runUpdate() {
  const workerBaseUrl = requiredEnv("WORKER_BASE_URL");
  const adminToken = requiredEnv("ADMIN_TOKEN");
  const job = await fetchUpdateJob();
  const sources = await Promise.all(job.sources.map(fetchSource));

  const payload = {
    requested_at: job.requested_at,
    sources
  };

  const result = await postUpdateResult(payload);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function fetchUpdateJob() {
  const workerBaseUrl = requiredEnv("WORKER_BASE_URL");
  const adminToken = requiredEnv("ADMIN_TOKEN");
  const url = new URL("/update", workerBaseUrl);
  url.searchParams.set("token", adminToken);

  const resp = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`fetch update job failed\nstatus=${resp.status}\n${text.slice(0, 1000)}`);
  }

  const job = JSON.parse(text);
  if (!Array.isArray(job?.sources) || job.sources.length === 0) {
    throw new Error("update job did not include any sources");
  }

  return job;
}

async function fetchSource(source) {
  const headers = source.request_headers || {};

  const [direct, clash, shadowrocket] = await Promise.all([
    fetchText(source.direct_url, headers, `direct ${source.index + 1}`),
    fetchText(source.clash_url, headers, `clash ${source.index + 1}`),
    fetchText(source.shadowrocket_url, headers, `shadowrocket ${source.index + 1}`)
  ]);

  return {
    index: source.index,
    source_url: source.source_url,
    direct,
    clash,
    shadowrocket
  };
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

async function postUpdateResult(payload) {
  const workerBaseUrl = requiredEnv("WORKER_BASE_URL");
  const adminToken = requiredEnv("ADMIN_TOKEN");
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
import { pathToFileURL } from "node:url";
