/**
 * 步骤用途：
 * 通过 AdsPower Local API 按名称重建无头浏览器 profile，并输出启动后的 CDP endpoint。
 * 本步骤不识别页面状态、不访问产品 URL；每次执行都会停止并删除同名旧 profile。
 */
import {
  defineStep,
  output,
  stepResult,
  stringInput,
} from "@lwmacct/260729-ba-framework/step";
import type { StepRunResult } from "@lwmacct/260729-ba-framework/step";

const STEP_NAME = "adspower/create-browser";

const step = defineStep({
  id: STEP_NAME,
  type: "setup",
  title: "新建 AdsPower 浏览器",
  description: "通过 AdsPower Local API 重建同名无头浏览器，并输出 CDP endpoint。",
  tags: ["browser", "adspower"],
  inputs: {
    apiUrl: stringInput<true>({
      label: "AdsPower API URL",
      required: true,
      defaultValue: "http://127.0.0.1:50325",
      ui: { inputMode: "url" },
    }),
    apiKey: stringInput({
      label: "AdsPower API Key",
    }),
    browserGatewayUrl: stringInput({
      label: "Browser Gateway URL",
      description: "填写后 AdsPower API 请求会通过 Browser Gateway 转发；留空则直连。",
      ui: { inputMode: "url" },
    }),
    name: stringInput<true>({
      label: "浏览器名称",
      required: true,
      defaultValue: "single-use",
    }),
  },
  outputs: {
    endpoint: output({
      label: "CDP Endpoint",
      description: "AdsPower 启动后返回的 ws.puppeteer endpoint。",
      valueFormat: "cdp-endpoint",
      valueType: "string",
    }),
    profileId: output({ label: "Profile ID", valueType: "string" }),
    profileNo: output({ label: "Profile No", valueType: "string" }),
    browserGatewayUrl: output({
      label: "Browser Gateway URL",
      valueFormat: "url",
      valueType: "string",
    }),
    debugPort: output({ label: "Debug Port", valueType: "number" }),
    engine: output({ label: "Browser Engine", valueType: "string" }),
    removedProfileCount: output({
      label: "Removed Profile Count",
      valueType: "number",
    }),
  },
  run: ({ input, signal }) => runStep(input, signal),
});

export default step;

type AdsPowerApiResponse<T> = {
  code: number;
  data?: T;
  msg?: string;
};

type AdsPowerProfileRecord = {
  name?: string;
  profile_id: string;
};

type AdsPowerProfileListData = {
  list?: AdsPowerProfileRecord[];
};

type AdsPowerCreateProfileData = {
  profile_id: string;
  profile_no?: string | number;
};

type AdsPowerBrowserActiveData = {
  debug_port?: string | number;
  ws?: {
    puppeteer?: string;
  };
};

type CreateBrowserInput = {
  apiKey?: string;
  apiUrl: string;
  browserGatewayUrl?: string;
  name: string;
};

type AdsPowerRequestOptions = {
  body?: unknown;
  signal: AbortSignal;
};

type AdsPowerEmptyRequestOptions = AdsPowerRequestOptions & {
  allowEmptyData: true;
};

class AdsPowerStepError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = true,
  ) {
    super(message);
    this.name = "AdsPowerStepError";
  }
}

const defaultFingerprintConfig = {
  automatic_timezone: "1",
  browser_kernel_config: {
    type: "chrome",
    version: "ua_auto",
  },
  flash: "block",
  language: ["en-US", "en"],
  random_ua: {
    ua_browser: ["chrome"],
    ua_system_version: ["Windows 10"],
  },
  webrtc: "disabled",
};

const browserLaunchArgs = ["--disable-popup-blocking"];

function normalizeBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new AdsPowerStepError(
      "adspower-invalid-url",
      `Invalid AdsPower request URL: ${normalized}`,
      false,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AdsPowerStepError(
      "adspower-invalid-url",
      `AdsPower request URL must use HTTP or HTTPS: ${normalized}`,
      false,
    );
  }
  return normalized;
}

function normalizeOptionalBaseUrl(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalizeBaseUrl(normalized) : "";
}

function normalizeName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalString(value: string | number | undefined) {
  return value === undefined ? undefined : String(value);
}

function normalizeDebugPort(value: string | number | undefined) {
  if (value === undefined) return undefined;
  const port = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new AdsPowerStepError(
      "adspower-invalid-debug-port",
      `AdsPower returned an invalid debug port: ${String(value)}`,
      false,
    );
  }
  return port;
}

function resolveRequest(input: CreateBrowserInput, path: string) {
  const browserGatewayUrl = normalizeOptionalBaseUrl(input.browserGatewayUrl);
  const baseUrl = browserGatewayUrl || normalizeBaseUrl(input.apiUrl);
  const headers: Record<string, string> = {};
  if (browserGatewayUrl) {
    headers["X-Browser-Gateway-Upstream"] = normalizeBaseUrl(input.apiUrl);
  }
  return {
    browserGatewayUrl,
    headers,
    url: new URL(`${baseUrl}${path}`),
  };
}

function adsPowerRequest(
  input: CreateBrowserInput,
  path: string,
  options: AdsPowerEmptyRequestOptions,
): Promise<void>;
function adsPowerRequest<T>(
  input: CreateBrowserInput,
  path: string,
  options: AdsPowerRequestOptions,
): Promise<T>;
async function adsPowerRequest<T>(
  input: CreateBrowserInput,
  path: string,
  options: AdsPowerRequestOptions | AdsPowerEmptyRequestOptions,
): Promise<T | undefined> {
  const request = resolveRequest(input, path);
  if (input.apiKey?.trim()) {
    request.headers.Authorization = `Bearer ${input.apiKey.trim()}`;
  }
  request.headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(options.body ?? {}),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal.aborted) throw error;
    throw new AdsPowerStepError(
      "adspower-network-error",
      error instanceof Error ? error.message : "AdsPower API request failed.",
    );
  }

  const body = (await response.json().catch(() => null)) as AdsPowerApiResponse<T> | null;
  if (!response.ok) {
    throw new AdsPowerStepError(
      "adspower-http-error",
      body?.msg || `AdsPower API HTTP ${response.status}`,
    );
  }
  if (
    !body ||
    body.code !== 0 ||
    (body.data === undefined && !("allowEmptyData" in options))
  ) {
    throw new AdsPowerStepError(
      "adspower-api-error",
      body?.msg || "AdsPower API returned an invalid response.",
    );
  }
  return body.data;
}

function listProfiles(input: CreateBrowserInput, signal: AbortSignal) {
  return adsPowerRequest<AdsPowerProfileListData>(
    input,
    "/api/v2/browser-profile/list",
    {
      body: {
        limit: "2000",
        page: "1",
        sort_order: "desc",
        sort_type: "last_open_time",
      },
      signal,
    },
  );
}

function stopProfile(
  input: CreateBrowserInput,
  profileId: string,
  signal: AbortSignal,
) {
  return adsPowerRequest(
    input,
    "/api/v2/browser-profile/stop",
    { allowEmptyData: true, body: { profile_id: profileId }, signal },
  );
}

function deleteProfiles(
  input: CreateBrowserInput,
  profileIds: string[],
  signal: AbortSignal,
) {
  return adsPowerRequest(
    input,
    "/api/v2/browser-profile/delete",
    { allowEmptyData: true, body: { profile_id: profileIds }, signal },
  );
}

function createProfile(input: CreateBrowserInput, signal: AbortSignal) {
  return adsPowerRequest<AdsPowerCreateProfileData>(
    input,
    "/api/v2/browser-profile/create",
    {
      body: {
        fingerprint_config: defaultFingerprintConfig,
        group_id: "0",
        name: input.name,
        remark: "Managed by adspower/create-browser.",
        user_proxy_config: { proxy_soft: "no_proxy" },
      },
      signal,
    },
  );
}

function startProfile(
  input: CreateBrowserInput,
  profileId: string,
  signal: AbortSignal,
) {
  return adsPowerRequest<AdsPowerBrowserActiveData>(
    input,
    "/api/v2/browser-profile/start",
    {
      body: {
        headless: "1",
        launch_args: browserLaunchArgs,
        last_opened_tabs: "1",
        profile_id: profileId,
        proxy_detection: "1",
      },
      signal,
    },
  );
}

async function rebuildBrowser(input: CreateBrowserInput, signal: AbortSignal) {
  const profiles = await listProfiles(input, signal);
  const existingProfileIds = (profiles.list ?? [])
    .filter((profile) => normalizeName(profile.name) === input.name)
    .map((profile) => profile.profile_id);

  for (const profileId of existingProfileIds) {
    await stopProfile(input, profileId, signal).catch(() => undefined);
  }
  if (existingProfileIds.length > 0) {
    await deleteProfiles(input, existingProfileIds, signal);
  }

  const created = await createProfile(input, signal);
  const active = await startProfile(input, created.profile_id, signal);
  const endpoint = normalizeName(active.ws?.puppeteer);
  if (!endpoint) {
    throw new AdsPowerStepError(
      "adspower-endpoint-missing",
      "AdsPower did not return ws.puppeteer endpoint.",
    );
  }

  return {
    browserGatewayUrl: normalizeOptionalBaseUrl(input.browserGatewayUrl),
    debugPort: normalizeDebugPort(active.debug_port),
    endpoint,
    profileId: created.profile_id,
    profileNo: normalizeOptionalString(created.profile_no),
    removedProfileCount: existingProfileIds.length,
  };
}

async function runStep(
  input: CreateBrowserInput,
  signal: AbortSignal,
): Promise<StepRunResult> {
  try {
    const result = await rebuildBrowser(input, signal);
    return stepResult({
      endpoint: result.endpoint,
      engine: "chromium",
      browserGatewayUrl: result.browserGatewayUrl,
      profileId: result.profileId,
      removedProfileCount: result.removedProfileCount,
      ...(result.debugPort === undefined ? {} : { debugPort: result.debugPort }),
      ...(result.profileNo === undefined ? {} : { profileNo: result.profileNo }),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return stepResult({}, {
      status: "failed",
      error: {
        code: error instanceof AdsPowerStepError
          ? error.code
          : "adspower-create-browser-failed",
        message: error instanceof Error ? error.message : String(error),
        retryable: error instanceof AdsPowerStepError ? error.retryable : true,
      },
    });
  }
}
