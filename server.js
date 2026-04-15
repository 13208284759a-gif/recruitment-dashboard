const http = require("http");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const HOST = "127.0.0.1";
const PORT = 3210;
const ROOT_DIR = __dirname;

const SUMMARY_SHEET = "创新药销售招聘汇总";
const MANAGEMENT_SHEET = "创新药销售管理岗";
const ROSTER_SHEET = "花名册表";
const SPECIALIST_SHEET = "专员";
const FEISHU_TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
const FEISHU_API_BASE = "https://open.feishu.cn/open-apis/bitable/v1";

const FEISHU_CONFIG = {
  appId: process.env.FEISHU_APP_ID || "",
  appSecret: process.env.FEISHU_APP_SECRET || "",
  appToken: process.env.FEISHU_BITABLE_APP_TOKEN || "",
  viewId: process.env.FEISHU_BITABLE_VIEW_ID || ""
};
const FEISHU_SPECIALIST_CACHE_TTL_MS = 3 * 60 * 1000;
const FEISHU_TABLE_NAMES = {
  summary: "创新药销售招聘汇总",
  management: "创新药销售管理岗",
  roster: "花名册表",
  specialist: "专员"
};
let feishuDashboardCache = {
  expiresAt: 0,
  payload: null,
  pending: null
};

const VALID_REGIONS = new Set(["北区", "东一区", "东二区", "南区", "西区"]);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

http
  .createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (requestUrl.pathname === "/api/dashboard-data") {
      void handleDashboardData(requestUrl, response);
      return;
    }

    serveStaticFile(requestUrl.pathname, response);
  })
  .listen(PORT, HOST, () => {
    console.log(`Dashboard server running at http://${HOST}:${PORT}`);
  })
  .on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Please close the existing server or change the port.`);
      process.exit(1);
    }

    throw error;
  });

async function handleDashboardData(requestUrl, response) {
  try {
    const workbookFile = findWorkbookFile();
    const workbook = XLSX.readFile(workbookFile.fullPath, { cellDates: false });
    const forceRefresh = requestUrl.searchParams.get("force") === "1";

    const dashboardPayload = await loadDashboardPayload(workbook, { forceRefresh });

    writeJson(response, 200, {
      meta: {
        sourceFile: dashboardPayload.meta?.sourceFile || workbookFile.name,
        sourceUpdatedAt: workbookFile.updatedAt,
        generatedAt: new Date().toISOString(),
        summarySource: dashboardPayload.meta?.summarySource || "excel",
        positionsSource: dashboardPayload.meta?.positionsSource || "excel",
        rosterSource: dashboardPayload.meta?.rosterSource || "excel",
        specialistSource: dashboardPayload.meta?.specialistSource || "excel",
        fallbackReason: dashboardPayload.meta?.fallbackReason || ""
      },
      summary: dashboardPayload.summary,
      positions: dashboardPayload.positions,
      roster: dashboardPayload.roster,
      specialists: dashboardPayload.specialists
    });
  } catch (error) {
    writeJson(response, 500, {
      error: error.message
    });
  }
}

async function loadDashboardPayload(workbook, options = {}) {
  const { forceRefresh = false } = options;
  const excelPayload = {
    summary: parseSummarySheet(workbook.Sheets[SUMMARY_SHEET]),
    positions: parseManagementSheet(workbook.Sheets[MANAGEMENT_SHEET]),
    roster: parseRosterSheet(workbook.Sheets[ROSTER_SHEET]),
    specialists: parseSpecialistSheet(workbook.Sheets[SPECIALIST_SHEET]),
    meta: {
      sourceFile: "本地 Excel",
      summarySource: "excel",
      positionsSource: "excel",
      rosterSource: "excel",
      specialistSource: "excel",
      fallbackReason: ""
    }
  };

  if (!isFeishuConfigured()) {
    return excelPayload;
  }

  try {
    const feishuPayload = await fetchFeishuDashboardPayload({ forceRefresh });
    return {
      ...feishuPayload,
      meta: {
        sourceFile: "飞书多维表格",
        summarySource: "feishu",
        positionsSource: "feishu",
        rosterSource: "feishu",
        specialistSource: "feishu",
        fallbackReason: ""
      }
    };
  } catch (error) {
    return {
      ...excelPayload,
      meta: {
        ...excelPayload.meta,
        sourceFile: "本地 Excel（飞书回退）",
        summarySource: "excel-fallback",
        positionsSource: "excel-fallback",
        rosterSource: "excel-fallback",
        specialistSource: "excel-fallback",
        fallbackReason: error.message
      }
    };
  }
}

function serveStaticFile(requestPath, response) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const normalizedPath = path.normalize(safePath).replace(/^([.][.][/\\])+/, "");
  const fullPath = path.join(ROOT_DIR, normalizedPath);

  if (!fullPath.startsWith(ROOT_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not Found" : "Internal Server Error");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(fullPath).toLowerCase()] || "application/octet-stream"
    });
    response.end(data);
  });
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function findWorkbookFile() {
  const candidates = fs
    .readdirSync(ROOT_DIR)
    .filter((name) => name.toLowerCase().endsWith(".xlsx"))
    .filter((name) => !name.startsWith("~$"))
    .filter((name) => name.includes("招聘汇报表格汇总"))
    .map((name) => {
      const fullPath = path.join(ROOT_DIR, name);
      const stats = fs.statSync(fullPath);
      return {
        name,
        fullPath,
        updatedAt: stats.mtime.toISOString(),
        mtimeMs: stats.mtimeMs
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (!candidates.length) {
    throw new Error("未找到招聘汇报表格汇总的 Excel 文件。");
  }

  return candidates[0];
}

function parseSummarySheet(sheet) {
  if (!sheet) {
    throw new Error(`缺少工作表：${SUMMARY_SHEET}`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null
  });

  const regionRows = rows.slice(3).filter((row) => VALID_REGIONS.has(toText(row[0])));
  const summary = {};

  for (const row of regionRows) {
    const regionName = toText(row[0]);
    summary[regionName] = {
      headcount: toNumber(row[1]),
      active: toNumber(row[2]),
      incoming: toNumber(row[3]),
      vacant: toNumber(row[4]),
      regionalManager: {
        planned: toNumber(row[11]),
        active: toNumber(row[12]),
        incoming: toNumber(row[13]),
        vacant: toNumber(row[14])
      },
      districtManager: {
        planned: toNumber(row[16]),
        active: toNumber(row[17]),
        incoming: toNumber(row[18]),
        vacant: toNumber(row[19])
      },
      representative: {
        planned: toNumber(row[21]),
        active: toNumber(row[22]),
        incoming: toNumber(row[23]),
        vacant: toNumber(row[24])
      }
    };
  }

  return summary;
}

function parseManagementSheet(sheet) {
  if (!sheet) {
    throw new Error(`缺少工作表：${MANAGEMENT_SHEET}`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null
  });

  const headers = rows[1].map((value) => toText(value));
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  const dataRows = rows.slice(2).filter((row) => row.some((value) => value !== null && value !== ""));

  return dataRows
    .map((row) => ({
      id: toNumber(row[headerIndex["序号"]]),
      department: toText(row[headerIndex["部门"]]),
      level: normalizeLevel(toText(row[headerIndex["岗位职级"]])),
      title: toText(row[headerIndex["岗位"]]),
      status: normalizeStatus(toText(row[headerIndex["岗位状态"]])),
      region: toText(row[headerIndex["区域"]]),
      location: toText(row[headerIndex["工作地"]]),
      owner: toText(row[headerIndex["招聘负责人"]]),
      name: toText(row[headerIndex["姓名"]]),
      onboardDate: toDateString(row[headerIndex["入职时间"]]),
      progress: toText(row[headerIndex["招聘进展（4.6-4.10）"]]),
      channel: toText(row[headerIndex["招聘渠道"]]),
      remark: toText(row[headerIndex["备注"]])
    }))
    .filter((row) => row.department === "创新药销售部")
    .filter((row) => row.level === "大区经理" || row.level === "地区经理");
}

function parseRosterSheet(sheet) {
  if (!sheet) {
    return {
      regionalManagers: [],
      districtManagers: []
    };
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null
  });

  const headers = rows[2].map((value) => toText(value));
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  const dataRows = rows.slice(3).filter((row) => VALID_REGIONS.has(toText(row[headerIndex["区域"]])));
  const managerMap = new Map();
  const districtManagerMap = new Map();

  for (const row of dataRows) {
    const topRegion = toText(row[headerIndex["区域"]]);
    const areaName = toText(row[headerIndex["大区"]]);
    const rawManagerName = toText(row[headerIndex["大区经理"]]);
    const territory = toText(row[headerIndex["地区"]]);
    const rawDistrictManagerName = toText(row[headerIndex["地区经理"]]);

    if (!topRegion || !areaName) {
      continue;
    }

    const mapKey = `${topRegion}__${areaName}__${rawManagerName}`;
    if (!managerMap.has(mapKey)) {
      managerMap.set(mapKey, {
        topRegion,
        areaName,
        managerName: normalizeRosterName(rawManagerName),
        rawManagerName,
        level: "大区经理",
        territories: [],
        isVacant: rawManagerName.includes("待招")
      });
    }

    const manager = managerMap.get(mapKey);
    if (territory && !manager.territories.includes(territory)) {
      manager.territories.push(territory);
    }

    if (territory) {
      const districtKey = `${topRegion}__${areaName}__${territory}__${rawDistrictManagerName}`;
      if (!districtManagerMap.has(districtKey)) {
        districtManagerMap.set(districtKey, {
          topRegion,
          areaName,
          title: territory,
          managerName: normalizeRosterName(rawDistrictManagerName),
          rawManagerName: rawDistrictManagerName,
          level: "地区经理",
          territories: [territory],
          isVacant: rawDistrictManagerName.includes("待招")
        });
      }
    }
  }

  return {
    regionalManagers: Array.from(managerMap.values()).sort((left, right) => {
      if (left.topRegion !== right.topRegion) {
        return left.topRegion.localeCompare(right.topRegion, "zh-CN");
      }
      return left.areaName.localeCompare(right.areaName, "zh-CN");
    }),
    districtManagers: Array.from(districtManagerMap.values()).sort((left, right) => {
      if (left.topRegion !== right.topRegion) {
        return left.topRegion.localeCompare(right.topRegion, "zh-CN");
      }
      if (left.areaName !== right.areaName) {
        return left.areaName.localeCompare(right.areaName, "zh-CN");
      }
      return left.title.localeCompare(right.title, "zh-CN");
    })
  };
}

function parseSpecialistSheet(sheet) {
  if (!sheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null
  });

  if (rows.length < 3) {
    return [];
  }

  const headers = rows[1].map((value) => toText(value));
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  const requiredHeaders = ["区域", "大区", "地区", "地区经理", "专员", "医院"];

  if (requiredHeaders.some((header) => headerIndex[header] === undefined)) {
    return [];
  }

  const entries = rows
    .slice(2)
    .filter((row) => row.some((value) => value !== null && value !== ""))
    .map((row) => ({
      区域: toText(row[headerIndex["区域"]]),
      大区: toText(row[headerIndex["大区"]]),
      地区: toText(row[headerIndex["地区"]]),
      地区经理: toText(row[headerIndex["地区经理"]]),
      专员: toText(row[headerIndex["专员"]]),
      医院: toText(row[headerIndex["医院"]])
    }));

  return buildSpecialistAssignments(entries);
}

function parseFeishuSpecialistRecords(records) {
  const entries = records.map((record) => ({
    区域: toText(record.fields?.["区域"]),
    大区: toText(record.fields?.["大区"]),
    地区: toText(record.fields?.["地区"]),
    地区经理: toText(record.fields?.["地区经理"]),
    专员: toText(record.fields?.["专员"]),
    医院: toText(record.fields?.["医院"])
  }));

  return buildSpecialistAssignments(entries);
}

function parseFeishuSummaryRecords(records) {
  const summary = {};

  records.forEach((record) => {
    const fields = record.fields || {};
    const regionName = toText(fields["列1"]);
    if (!VALID_REGIONS.has(regionName)) {
      return;
    }

    summary[regionName] = {
      headcount: toNumber(fields["全国"]),
      active: toNumber(fields["全国（4）"]),
      incoming: toNumber(fields["全国（3）"]),
      vacant: toNumber(fields["全国（2）"]),
      regionalManager: {
        planned: toNumber(fields["大区（2）"]),
        active: toNumber(fields["大区（1）"]),
        incoming: toNumber(fields["大区"]),
        vacant: toNumber(fields["大区（4）"])
      },
      districtManager: {
        planned: toNumber(fields["地区（1）"]),
        active: toNumber(fields["地区"]),
        incoming: toNumber(fields["地区（4）"]),
        vacant: toNumber(fields["地区（3）"])
      },
      representative: {
        planned: toNumber(fields["专员"]),
        active: toNumber(fields["专员（4）"]),
        incoming: toNumber(fields["专员（3）"]),
        vacant: toNumber(fields["专员（2）"])
      }
    };
  });

  return summary;
}

function parseFeishuManagementRecords(records) {
  return records
    .map((record) => {
      const fields = record.fields || {};
      return {
        id: toNumber(fields["序号"]),
        department: toText(fields["部门"]),
        level: normalizeLevel(toText(fields["岗位职级"])),
        title: toText(fields["岗位"]),
        status: normalizeStatus(toText(fields["岗位状态"])),
        region: toText(fields["区域"]),
        location: toText(fields["工作地"]),
        owner: toText(fields["招聘负责人"]),
        name: toText(fields["姓名"]),
        onboardDate: toDateString(fields["入职时间"]),
        progress: toText(fields["招聘进展（4.6-4.10）"]),
        channel: toText(fields["招聘渠道"]),
        remark: toText(fields["备注"])
      };
    })
    .filter((row) => row.department === "创新药销售部")
    .filter((row) => row.level === "大区经理" || row.level === "地区经理");
}

function parseFeishuRosterRecords(records) {
  const managerMap = new Map();
  const districtManagerMap = new Map();

  records.forEach((record) => {
    const fields = record.fields || {};
    const topRegion = toText(fields["列1"]);
    const areaName = toText(fields["粉色部分无需填写，公式自动计算"]);
    const rawManagerName = toText(fields["列3"]);
    const territory = toText(fields["列4"]);
    const rawDistrictManagerName = toText(fields["列5"]);

    if (!VALID_REGIONS.has(topRegion) || !areaName) {
      return;
    }

    const mapKey = `${topRegion}__${areaName}__${rawManagerName}`;
    if (!managerMap.has(mapKey)) {
      managerMap.set(mapKey, {
        topRegion,
        areaName,
        managerName: normalizeRosterName(rawManagerName),
        rawManagerName,
        level: "大区经理",
        territories: [],
        isVacant: rawManagerName.includes("待招")
      });
    }

    const manager = managerMap.get(mapKey);
    if (territory && !manager.territories.includes(territory)) {
      manager.territories.push(territory);
    }

    if (territory) {
      const districtKey = `${topRegion}__${areaName}__${territory}__${rawDistrictManagerName}`;
      if (!districtManagerMap.has(districtKey)) {
        districtManagerMap.set(districtKey, {
          topRegion,
          areaName,
          title: territory,
          managerName: normalizeRosterName(rawDistrictManagerName),
          rawManagerName: rawDistrictManagerName,
          level: "地区经理",
          territories: [territory],
          isVacant: rawDistrictManagerName.includes("待招")
        });
      }
    }
  });

  return {
    regionalManagers: Array.from(managerMap.values()).sort((left, right) => {
      if (left.topRegion !== right.topRegion) {
        return left.topRegion.localeCompare(right.topRegion, "zh-CN");
      }
      return left.areaName.localeCompare(right.areaName, "zh-CN");
    }),
    districtManagers: Array.from(districtManagerMap.values()).sort((left, right) => {
      if (left.topRegion !== right.topRegion) {
        return left.topRegion.localeCompare(right.topRegion, "zh-CN");
      }
      if (left.areaName !== right.areaName) {
        return left.areaName.localeCompare(right.areaName, "zh-CN");
      }
      return left.title.localeCompare(right.title, "zh-CN");
    })
  };
}

function buildSpecialistAssignments(entries) {
  const districtMap = new Map();

  for (const entry of entries) {
    const topRegion = toText(entry["区域"]);
    const areaName = toText(entry["大区"]);
    const territory = toText(entry["地区"]);
    const rawDistrictManagerName = toText(entry["地区经理"]);
    const rawSpecialistName = toText(entry["专员"]);
    const hospital = toText(entry["医院"]);

    if (!VALID_REGIONS.has(topRegion) || !areaName || !territory) {
      continue;
    }

    const districtKey = `${topRegion}__${areaName}__${territory}__${rawDistrictManagerName}`;
    if (!districtMap.has(districtKey)) {
      districtMap.set(districtKey, {
        key: districtKey,
        topRegion,
        areaName,
        territory,
        managerName: normalizeRosterName(rawDistrictManagerName),
        rawManagerName: rawDistrictManagerName,
        isVacant: rawDistrictManagerName.includes("待招"),
        specialists: new Map()
      });
    }

    const districtEntry = districtMap.get(districtKey);
    const specialistName = normalizeRosterName(rawSpecialistName);
    const specialistKey = rawSpecialistName || "待招";

    if (!districtEntry.specialists.has(specialistKey)) {
      districtEntry.specialists.set(specialistKey, {
        name: specialistName,
        rawName: rawSpecialistName,
        isVacant: !rawSpecialistName || rawSpecialistName.includes("待招"),
        hospitals: new Set()
      });
    }

    if (hospital) {
      districtEntry.specialists.get(specialistKey).hospitals.add(hospital);
    }
  }

  return Array.from(districtMap.values())
    .map((item) => ({
      key: item.key,
      topRegion: item.topRegion,
      areaName: item.areaName,
      territory: item.territory,
      managerName: item.managerName,
      rawManagerName: item.rawManagerName,
      isVacant: item.isVacant,
      specialists: Array.from(item.specialists.values())
        .map((specialist) => ({
          name: specialist.name,
          rawName: specialist.rawName,
          isVacant: specialist.isVacant,
          hospitals: Array.from(specialist.hospitals).sort((left, right) => left.localeCompare(right, "zh-CN"))
        }))
        .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
    }))
    .sort((left, right) => {
      if (left.topRegion !== right.topRegion) {
        return left.topRegion.localeCompare(right.topRegion, "zh-CN");
      }
      if (left.areaName !== right.areaName) {
        return left.areaName.localeCompare(right.areaName, "zh-CN");
      }
      return left.territory.localeCompare(right.territory, "zh-CN");
    });
}

function isFeishuConfigured() {
  return Boolean(
    FEISHU_CONFIG.appId &&
      FEISHU_CONFIG.appSecret &&
      FEISHU_CONFIG.appToken
  );
}

async function fetchFeishuDashboardPayload(options = {}) {
  const { forceRefresh = false } = options;
  const now = Date.now();
  if (!forceRefresh && feishuDashboardCache.payload && feishuDashboardCache.expiresAt > now) {
    return feishuDashboardCache.payload;
  }

  if (!forceRefresh && feishuDashboardCache.pending) {
    return feishuDashboardCache.pending;
  }

  feishuDashboardCache.pending = fetchFeishuDashboardPayloadUncached();

  try {
    const payload = await feishuDashboardCache.pending;
    feishuDashboardCache = {
      expiresAt: Date.now() + FEISHU_SPECIALIST_CACHE_TTL_MS,
      payload,
      pending: null
    };
    return payload;
  } catch (error) {
    feishuDashboardCache.pending = null;
    throw error;
  }
}

async function fetchFeishuDashboardPayloadUncached() {
  const tenantAccessToken = await fetchFeishuTenantAccessToken();
  const headers = {
    Authorization: `Bearer ${tenantAccessToken}`
  };
  const tableMap = await fetchFeishuTableMap(headers);
  const [summaryRecords, managementRecords, rosterRecords, specialistRecords] = await Promise.all([
    fetchFeishuTableRecords(tableMap.summary, headers),
    fetchFeishuTableRecords(tableMap.management, headers),
    fetchFeishuTableRecords(tableMap.roster, headers),
    fetchFeishuTableRecords(tableMap.specialist, headers, FEISHU_CONFIG.viewId)
  ]);

  return {
    summary: parseFeishuSummaryRecords(summaryRecords),
    positions: parseFeishuManagementRecords(managementRecords),
    roster: parseFeishuRosterRecords(rosterRecords),
    specialists: parseFeishuSpecialistRecords(specialistRecords)
  };
}

async function fetchFeishuTableMap(headers) {
  const payload = await requestFeishuJson(`${FEISHU_API_BASE}/apps/${FEISHU_CONFIG.appToken}/tables?page_size=100`, {
    headers
  });
  const tableMap = {};

  (payload.data?.items || []).forEach((item) => {
    if (item.name === FEISHU_TABLE_NAMES.summary) {
      tableMap.summary = item.table_id;
    }
    if (item.name === FEISHU_TABLE_NAMES.management) {
      tableMap.management = item.table_id;
    }
    if (item.name === FEISHU_TABLE_NAMES.roster) {
      tableMap.roster = item.table_id;
    }
    if (item.name === FEISHU_TABLE_NAMES.specialist) {
      tableMap.specialist = item.table_id;
    }
  });

  const missing = Object.entries(tableMap).length < 4
    ? Object.values(FEISHU_TABLE_NAMES).filter((name) => !Object.values(tableMap).includes(name))
    : [];

  if (!tableMap.summary || !tableMap.management || !tableMap.roster || !tableMap.specialist) {
    throw new Error("飞书多维表格缺少招聘看板需要的工作表。");
  }

  return tableMap;
}

async function fetchFeishuTableRecords(tableId, headers, viewId = "") {
  const items = [];
  let pageToken = "";
  let hasMore = true;

  while (hasMore) {
    const url = new URL(`${FEISHU_API_BASE}/apps/${FEISHU_CONFIG.appToken}/tables/${tableId}/records`);
    url.searchParams.set("page_size", "500");
    if (viewId) {
      url.searchParams.set("view_id", viewId);
    }
    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    let payload;
    try {
      payload = await requestFeishuJson(url.toString(), { headers });
    } catch (error) {
      if (viewId && error.message === "WrongViewId") {
        return fetchFeishuTableRecords(tableId, headers);
      }
      throw error;
    }
    items.push(...(payload.data?.items || []));
    hasMore = Boolean(payload.data?.has_more);
    pageToken = payload.data?.page_token || "";
  }

  return items;
}

async function fetchFeishuTenantAccessToken() {
  const payload = await requestFeishuJson(FEISHU_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      app_id: FEISHU_CONFIG.appId,
      app_secret: FEISHU_CONFIG.appSecret
    })
  });

  if (!payload.tenant_access_token) {
    throw new Error("未能获取飞书 tenant_access_token。");
  }

  return payload.tenant_access_token;
}

async function requestFeishuJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.msg || `飞书接口请求失败：HTTP ${response.status}`);
  }

  return payload;
}

function normalizeLevel(value) {
  if (value.includes("大区经理")) {
    return "大区经理";
  }
  if (value.includes("地区经理")) {
    return "地区经理";
  }
  return value;
}

function normalizeStatus(value) {
  const map = {
    已完成: "已完成",
    待入职: "待入职",
    Offer中: "Offer中",
    面试中: "面试中",
    简历搜寻中: "简历搜寻中",
    暂缓: "暂缓"
  };
  return map[value] || value || "未知";
}

function normalizeRosterName(value) {
  if (!value) {
    return "待招";
  }
  if (value.includes("待招")) {
    return "待招";
  }
  return value;
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function toDateString(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) {
      return "";
    }
    const year = String(parsed.y);
    const month = String(parsed.m).padStart(2, "0");
    const day = String(parsed.d).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const text = toText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  return "";
}
