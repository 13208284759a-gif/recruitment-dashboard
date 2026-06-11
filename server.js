const http = require("http");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const PORT = Number(process.env.PORT || 3210);
const HOST = process.env.RENDER ? "0.0.0.0" : "127.0.0.1";
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
  summary: "区域编制数据",
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
    const forceRefresh = requestUrl.searchParams.get("force") === "1";
    const dashboardPayload = await loadDashboardPayload({ forceRefresh });
    const sourceFile = dashboardPayload.meta?.sourceFile || "未知数据源";
    const sourceUpdatedAt = dashboardPayload.meta?.sourceUpdatedAt || new Date().toISOString();

    writeJson(response, 200, {
      meta: {
        sourceFile,
        sourceUpdatedAt,
        generatedAt: new Date().toISOString(),
        summarySource: "feishu",
        positionsSource: "feishu",
        rosterSource: "feishu",
        specialistSource: "feishu",
        fallbackReason: ""
      },
      summary: dashboardPayload.summary,
      positions: dashboardPayload.positions,
      roster: dashboardPayload.roster,
      specialists: dashboardPayload.specialists,
      interviewBoards: dashboardPayload.interviewBoards || []
    });
  } catch (error) {
    writeJson(response, 500, {
      error: error.message
    });
  }
}

async function loadDashboardPayload(options = {}) {
  const { forceRefresh = false } = options;

  if (!isFeishuConfigured()) {
    throw new Error("未配置飞书应用参数，请使用飞书版启动脚本或在部署平台配置飞书环境变量");
  }

  const feishuPayload = await fetchFeishuDashboardPayload({ forceRefresh });
  return {
    ...feishuPayload,
    meta: {
      sourceFile: "飞书多维表格",
      sourceUpdatedAt: new Date().toISOString(),
      summarySource: "feishu",
      positionsSource: "feishu",
      rosterSource: "feishu",
      specialistSource: "feishu",
      fallbackReason: ""
    }
  };
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
      医院: toText(row[headerIndex["医院"]]),
      入职时间: toDateString(row[headerIndex["入职时间"]])
    }));

  return buildSpecialistAssignments(entries);
}

function getFeishuFieldValue(source, keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
  }
  return "";
}

function getFeishuFieldKeys(records) {
  const seen = new Set();
  const keys = [];

  records.forEach((record) => {
    Object.keys(record.fields || {}).forEach((key) => {
      if (key === "SourceID" || seen.has(key)) {
        return;
      }
      seen.add(key);
      keys.push(key);
    });
  });

  return keys;
}

function mapFeishuRecordsByHeader(records, requiredLabels) {
  const keys = getFeishuFieldKeys(records);
  const headerIndex = records.findIndex((record) => {
    const values = keys.map((key) => toText(record.fields?.[key]));
    return requiredLabels.every((label) => values.includes(label));
  });

  if (headerIndex < 0) {
    return [];
  }

  const headerRecord = records[headerIndex];
  const headers = keys
    .map((key) => ({
      key,
      label: toText(headerRecord.fields?.[key])
    }))
    .filter((item) => item.label && !item.label.startsWith("未命名"));

  return records
    .slice(headerIndex + 1)
    .map((record) => {
      const row = {};
      headers.forEach((header) => {
        const value = toText(record.fields?.[header.key]);
        if (!(header.label in row) || !row[header.label]) {
          row[header.label] = value;
        }
      });
      return row;
    })
    .filter((row) => Object.values(row).some((value) => toText(value)));
}

function inferManagementStatus(row) {
  const directStatus = toText(getFeishuFieldValue(row, ["岗位状态", "状态"]));
  if (directStatus) {
    return normalizeStatus(directStatus);
  }

  const progress = toText(getFeishuFieldValue(row, ["招聘进展（4.20-4.24）", "招聘进展（4.6-4.10）", "招聘进展"]));
  const name = toText(getFeishuFieldValue(row, ["姓名"]));
  const onboardDate = toText(getFeishuFieldValue(row, ["入职时间"]));
  const combinedText = `${name} ${progress} ${onboardDate}`;

  if (combinedText.includes("待入职")) {
    return "待入职";
  }
  if (/offer/i.test(combinedText) || combinedText.includes("谈薪") || combinedText.includes("审批")) {
    return "Offer中";
  }
  if (combinedText.includes("面试")) {
    return "面试中";
  }
  if (combinedText.includes("入职") && !combinedText.includes("待入职")) {
    return "已完成";
  }
  if (name && onboardDate) {
    return "已完成";
  }

  return "简历搜寻中";
}

function parseFeishuSpecialistRecords(records) {
  const mappedRows = mapFeishuRecordsByHeader(records, ["区域", "大区", "地区", "地区经理", "专员", "医院"]);
  if (mappedRows.length) {
    const entries = mappedRows.map((row) => ({
      区域: toText(row["区域"]),
      大区: toText(row["大区"]),
      地区: toText(row["地区"]),
      地区经理: toText(row["地区经理"]),
      专员: toText(row["专员"]),
      医院: toText(row["医院"]),
      入职时间: toDateString(getFeishuFieldValue(row, ["入职时间", "到岗时间", "入职日期", "onboardDate", "joinDate"]))
    }));

    return buildSpecialistAssignments(entries);
  }

  const entries = records.map((record) => ({
    区域: toText(record.fields?.["区域"]),
    大区: toText(record.fields?.["大区"]),
    地区: toText(record.fields?.["地区"]),
    地区经理: toText(record.fields?.["地区经理"]),
    专员: toText(record.fields?.["专员"]),
    医院: toText(record.fields?.["医院"]),
    入职时间: toDateString(getFeishuFieldValue(record.fields, ["入职时间", "到岗时间", "入职日期", "onboardDate", "joinDate"]))
  }));

  return buildSpecialistAssignments(entries);
}

function parseFeishuSummaryRecords(records) {
  const summary = {};

  records.forEach((record) => {
    const fields = record.fields || {};
    const regionName = toText(getFeishuFieldValue(fields, ["区域", "列1", "未命名"]));
    if (!VALID_REGIONS.has(regionName)) {
      return;
    }

    summary[regionName] = {
      headcount: toNumber(getFeishuFieldValue(fields, ["总编制", "全国"])),
      active: toNumber(getFeishuFieldValue(fields, ["在岗", "全国（4）", "全国_1"])),
      incoming: toNumber(getFeishuFieldValue(fields, ["待入职", "全国（3）", "全国_2"])),
      vacant: toNumber(getFeishuFieldValue(fields, ["待招", "全国（2）", "全国_3"])),
      regionalManager: {
        planned: toNumber(getFeishuFieldValue(fields, ["大区-总编制", "大区总编制", "大区", "大区（4）"])),
        active: toNumber(getFeishuFieldValue(fields, ["大区-在岗", "大区在岗", "大区_1", "大区（3）"])),
        incoming: toNumber(getFeishuFieldValue(fields, ["大区-待入职", "大区待入职", "大区_2"])),
        vacant: toNumber(getFeishuFieldValue(fields, ["大区-待招", "大区待招", "大区_3", "大区（2）"]))
      },
      districtManager: {
        planned: toNumber(getFeishuFieldValue(fields, ["地区-总编制", "地区总编制", "地区", "地区（4）"])),
        active: toNumber(getFeishuFieldValue(fields, ["地区-在岗", "地区在岗", "地区_1"])),
        incoming: toNumber(getFeishuFieldValue(fields, ["地区-待入职", "地区待入职", "地区_2", "地区（3）"])),
        vacant: toNumber(getFeishuFieldValue(fields, ["地区-待招", "地区待招", "地区_3", "地区（2）"]))
      },
      representative: {
        planned: toNumber(getFeishuFieldValue(fields, ["专员-总编制", "专员总编制", "专员"])),
        active: toNumber(getFeishuFieldValue(fields, ["专员-在岗", "专员在岗", "专员_1", "专员（4）"])),
        incoming: toNumber(getFeishuFieldValue(fields, ["专员-待入职", "专员待入职", "专员_2", "专员（3）"])),
        vacant: toNumber(getFeishuFieldValue(fields, ["专员-待招", "专员待招", "专员_3", "专员（2）"]))
      }
    };
  });

  if (Object.keys(summary).length) {
    return summary;
  }

  records.forEach((record) => {
    const fields = record.fields || {};
    const regionName = toText(fields["区域"] ?? fields["列1"]);
    if (!VALID_REGIONS.has(regionName)) {
      return;
    }

    summary[regionName] = {
      headcount: toNumber(fields["总编制"] ?? fields["全国"]),
      active: toNumber(fields["在岗"] ?? fields["全国（4）"]),
      incoming: toNumber(fields["待入职"] ?? fields["全国（3）"]),
      vacant: toNumber(fields["待招"] ?? fields["全国（2）"]),
      regionalManager: {
        planned: toNumber(fields["大区-总编制"] ?? fields["大区（2）"]),
        active: toNumber(fields["大区-在岗"] ?? fields["大区（1）"]),
        incoming: toNumber(fields["大区-待入职"] ?? fields["大区"]),
        vacant: toNumber(fields["大区-待招"] ?? fields["大区（4）"])
      },
      districtManager: {
        planned: toNumber(fields["地区-总编制"] ?? fields["地区（1）"]),
        active: toNumber(fields["地区-在岗"] ?? fields["地区"]),
        incoming: toNumber(fields["地区-待入职"] ?? fields["地区（4）"]),
        vacant: toNumber(fields["地区-待招"] ?? fields["地区（3）"])
      },
      representative: {
        planned: toNumber(fields["专员-总编制"] ?? fields["专员"]),
        active: toNumber(fields["专员-在岗"] ?? fields["专员（4）"]),
        incoming: toNumber(fields["专员-待入职"] ?? fields["专员（3）"]),
        vacant: toNumber(fields["专员-待招"] ?? fields["专员（2）"])
      }
    };
  });

  return summary;
}

function parseFeishuManagementRecords(records) {
  const mappedRows = mapFeishuRecordsByHeader(records, ["序号", "部门", "岗位职级", "岗位", "区域", "工作地"]);
  if (mappedRows.length) {
    return mappedRows
      .map((row) => ({
        id: toNumber(row["序号"]),
        department: toText(row["部门"]),
        level: normalizeLevel(toText(row["岗位职级"])),
        title: toText(row["岗位"]),
        status: inferManagementStatus(row),
        region: toText(row["区域"]),
        location: toText(row["工作地"]),
        owner: toText(row["招聘负责人"]),
        name: toText(row["姓名"]),
        onboardDate: toDateString(row["入职时间"]),
        progress: toText(getFeishuFieldValue(row, ["招聘进展（4.20-4.24）", "招聘进展（4.6-4.10）", "招聘进展"])),
        channel: toText(row["招聘渠道"]),
        remark: toText(row["备注"])
      }))
      .filter((row) => row.department === "创新药销售部")
      .filter((row) => row.level === "大区经理" || row.level === "地区经理");
  }

  return records
    .map((record) => {
      const fields = record.fields || {};
      const departmentOrLevel = toText(fields["部门"]);
      const isShiftedManagementTable = departmentOrLevel === "大区经理" || departmentOrLevel === "地区经理";

      if (isShiftedManagementTable) {
        return {
          id: toNumber(fields["序号"]),
          department: "创新药销售部",
          level: normalizeLevel(departmentOrLevel),
          title: toText(fields["岗位职级"]),
          status: normalizeStatus(toText(fields["岗位"])),
          region: toText(fields["岗位状态"]),
          location: toText(fields["区域"]),
          owner: toText(fields["工作地"]),
          name: toText(fields["招聘负责人"]),
          onboardDate: toDateString(fields["姓名"]),
          progress: toText(fields["入职时间"]),
          channel: toText(fields["招聘进展"]),
          remark: toText(fields["招聘渠道"] ?? fields["备注"])
        };
      }

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
        progress: toText(fields["招聘进展（4.6-4.10）"] ?? fields["招聘进展"]),
        channel: toText(fields["招聘渠道"]),
        remark: toText(fields["备注"])
      };
    })
    .filter((row) => row.department === "创新药销售部")
    .filter((row) => row.level === "大区经理" || row.level === "地区经理");
}

function parseFeishuRosterRecords(records) {
  const mappedRows = mapFeishuRecordsByHeader(records, ["区域", "大区", "大区经理", "地区", "地区经理"]);
  if (mappedRows.length) {
    const managerMap = new Map();
    const districtManagerMap = new Map();

    mappedRows.forEach((row) => {
      const topRegion = toText(row["区域"]);
      const areaName = toText(row["大区"]);
      const rawManagerName = toText(row["大区经理"]);
      const territory = toText(row["地区"]);
      const rawDistrictManagerName = toText(row["地区经理"]);

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

  const managerMap = new Map();
  const districtManagerMap = new Map();

  records.forEach((record) => {
    const fields = record.fields || {};
    const topRegion = toText(fields["区域"] ?? fields["列1"]);
    const areaName = toText(fields["大区"] ?? fields["粉色部分无需填写，公式自动计算"]);
    const rawManagerName = toText(fields["大区经理"] ?? fields["列3"]);
    const territory = toText(fields["地区"] ?? fields["列4"]);
    const rawDistrictManagerName = toText(fields["地区经理"] ?? fields["列5"]);

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
    const onboardDate = toDateString(getFeishuFieldValue(entry, ["入职时间", "到岗时间", "入职日期", "onboardDate", "joinDate"]));

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
        onboardDate,
        hospitals: new Set()
      });
    } else if (onboardDate && !districtEntry.specialists.get(specialistKey).onboardDate) {
      districtEntry.specialists.get(specialistKey).onboardDate = onboardDate;
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
          onboardDate: specialist.onboardDate,
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
  const [summaryRecords, managementRecords, rosterRecords, specialistRecords, interviewBoards] = await Promise.all([
    fetchFeishuTableRecords(tableMap.summary, headers),
    fetchFeishuTableRecords(tableMap.management, headers),
    fetchFeishuTableRecords(tableMap.roster, headers),
    fetchFeishuTableRecords(tableMap.specialist, headers),
    fetchFeishuInterviewBoards(tableMap.interviewTables || [], headers)
  ]);

  return {
    summary: parseFeishuSummaryRecords(summaryRecords),
    positions: parseFeishuManagementRecords(managementRecords),
    roster: parseFeishuRosterRecords(rosterRecords),
    specialists: parseFeishuSpecialistRecords(specialistRecords),
    interviewBoards
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

  tableMap.interviewTables = (payload.data?.items || [])
    .filter((item) => toText(item.name).endsWith("待面"))
    .map((item) => ({
      name: item.name,
      tableId: item.table_id
    }));

  const missing = Object.entries(tableMap).length < 4
    ? Object.values(FEISHU_TABLE_NAMES).filter((name) => !Object.values(tableMap).includes(name))
    : [];

  if (!tableMap.summary || !tableMap.management || !tableMap.roster || !tableMap.specialist) {
    throw new Error("飞书多维表格缺少招聘看板需要的工作表。");
  }

  return tableMap;
}

async function fetchFeishuInterviewBoards(interviewTables, headers) {
  const boards = await Promise.all(
    interviewTables.map(async (table) => {
      const records = await fetchFeishuTableRecords(table.tableId, headers);
      return parseFeishuInterviewBoard(table, records);
    })
  );

  return boards;
}

function parseFeishuInterviewBoard(table, records) {
  const orderedKeys = getInterviewOrderedKeys(records);
  const headerIndex = records.findIndex((record) => {
    const values = orderedKeys.map((key) => toText(record.fields?.[key]));
    return values.includes("姓名") || values.includes("候选人姓名") || values.includes("序号");
  });
  const headerRecord = headerIndex >= 0 ? records[headerIndex] : null;
  const headers = orderedKeys
    .map((key) => ({
      key,
      label: toText(headerRecord?.fields?.[key]) || simplifyInterviewFieldName(key)
    }))
    .filter((item) => item.label && !item.label.startsWith("未命名"));

  const detailRecords = records.slice(headerIndex >= 0 ? headerIndex + 1 : 0);
  const rows = detailRecords
    .map((record) => {
      const row = {};
      headers.forEach((header) => {
        row[header.label] = toText(record.fields?.[header.key]);
      });
      return row;
    })
    .filter((row) => Object.values(row).some(Boolean))
    .filter((row) => {
      const firstValue = Object.values(row).find(Boolean);
      return firstValue !== "序号";
    });

  const firstCount = getInterviewDeclaredCount(records, orderedKeys, headerIndex);

  return {
    id: table.tableId,
    name: table.name,
    label: normalizeInterviewBoardName(table.name),
    count: Number.isFinite(firstCount) ? firstCount : rows.length,
    headers: headers.map((header) => header.label),
    rows
  };
}

function getInterviewOrderedKeys(records) {
  const keys = new Set();
  records.forEach((record) => {
    Object.keys(record.fields || {}).forEach((key) => {
      if (key !== "SourceID" && !key.startsWith("未命名")) {
        keys.add(key);
      }
    });
  });

  return Array.from(keys).sort((left, right) => {
    const leftIndex = getInterviewFieldIndex(left);
    const rightIndex = getInterviewFieldIndex(right);
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    return left.localeCompare(right, "zh-CN");
  });
}

function getInterviewFieldIndex(fieldName) {
  const match = fieldName.match(/_(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function simplifyInterviewFieldName(fieldName) {
  return fieldName.replace(/_\d+$/, "");
}

function getInterviewDeclaredCount(records, orderedKeys, headerIndex) {
  const countRecords = records.slice(0, headerIndex >= 0 ? headerIndex : 1);
  for (const record of countRecords) {
    for (const key of orderedKeys) {
      const value = toText(record.fields?.[key]);
      if (/^\d+$/.test(value)) {
        return Number(value);
      }
    }
  }
  return NaN;
}

function normalizeInterviewBoardName(name) {
  const map = {
    "创新药销售核心待面": "创新药销售核心待面人数",
    "临床促进核心待面": "临床促进核心待面人数",
    "销售促进非核心待面": "销售促进非核心待面人数",
    "医学市场待面": "医学市场待面人数",
    "商务准入政务待面": "商务准入政务待面人数",
    "职能待面": "职能待面人数",
    "特药待面": "特药待面人数",
    "朱总待面": "朱总待面人数"
  };
  return map[name] || `${name}人数`;
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

async function requestFeishuJson(url, options, attempt = 1) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok || payload.code !== 0) {
    const message = payload.msg || `Feishu request failed: HTTP ${response.status}`;
    if (attempt < 5 && message.includes("Data not ready")) {
      await delay(1500 * attempt);
      return requestFeishuJson(url, options, attempt + 1);
    }
    throw new Error(payload.msg || `飞书接口请求失败：HTTP ${response.status}`);
  }

  return payload;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    if (value > 100000000000) {
      const timestampDate = new Date(value);
      if (!Number.isNaN(timestampDate.getTime())) {
        const year = String(timestampDate.getFullYear());
        const month = String(timestampDate.getMonth() + 1).padStart(2, "0");
        const day = String(timestampDate.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    }

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

  const normalizedDate = text.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (normalizedDate) {
    const [, year, month, day] = normalizedDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return "";
}
