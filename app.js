const T = {
  north: "北区",
  east1: "东一区",
  east2: "东二区",
  east: "东区",
  south: "南区",
  west: "西区",
  rm: "大区经理",
  dm: "地区经理",
  done: "已完成",
  incoming: "待入职",
  offer: "Offer中",
  interviewing: "面试中",
  searching: "简历搜寻中",
  paused: "暂缓",
  overview: "总览视图",
  overviewTitle: "四大区编制空岗分布",
  detail: "区域详情",
  headcount: "总编制",
  active: "在岗",
  vacant: "待招",
  source: "来源",
  location: "工作地",
  owner: "负责人",
  channel: "渠道",
  onboard: "入职",
  candidate: "候选人",
  progress: "进展",
  remark: "备注",
  none: "暂无更多招聘备注。"
};

const REGION_GROUPS = [
  { key: T.east, titleClass: "top-east", description: "东一区 + 东二区合并视图", sourceRegions: [T.east1, T.east2] },
  { key: T.south, titleClass: "top-south", description: "南区编制与管理岗明细", sourceRegions: [T.south] },
  { key: T.west, titleClass: "top-west", description: "西区编制与管理岗明细", sourceRegions: [T.west] },
  { key: T.north, titleClass: "top-north", description: "北区编制与管理岗明细", sourceRegions: [T.north] }
];

const overviewHighlights = document.getElementById("overviewHighlights");
const regionGrid = document.getElementById("regionGrid");
const insightList = document.getElementById("insightList");
const backButton = document.getElementById("backButton");
const refreshButton = document.getElementById("refreshButton");
const overviewView = document.getElementById("overviewView");
const detailView = document.getElementById("detailView");
const regionalManagerView = document.getElementById("regionalManagerView");
const districtManagerView = document.getElementById("districtManagerView");
const specialistView = document.getElementById("specialistView");
const viewKicker = document.getElementById("viewKicker");
const viewTitle = document.getElementById("viewTitle");
const dataStatus = document.getElementById("dataStatus");
const detailHero = document.getElementById("detailHero");
const detailMetrics = document.getElementById("detailMetrics");
const detailStatusPills = document.getElementById("detailStatusPills");
const regionalManagerList = document.getElementById("regionalManagerList");
const regionalManagerHero = document.getElementById("regionalManagerHero");
const regionalManagerPageTitle = document.getElementById("regionalManagerPageTitle");
const regionalManagerPageRoster = document.getElementById("regionalManagerPageRoster");
const districtManagerHero = document.getElementById("districtManagerHero");
const districtManagerPageTitle = document.getElementById("districtManagerPageTitle");
const districtManagerPageRoster = document.getElementById("districtManagerPageRoster");
const districtManagerList = document.getElementById("districtManagerList");
const specialistHero = document.getElementById("specialistHero");
const specialistPageTitle = document.getElementById("specialistPageTitle");
const specialistPageList = document.getElementById("specialistPageList");

let regionData = [];
let activeRegionKey = null;
let activeDistrictManagerKey = null;
let currentView = "overview";

backButton.addEventListener("click", () => {
  if (currentView === "regional-manager") {
    showDetail(activeRegionKey);
    return;
  }

  if (currentView === "district-manager") {
    showDetail(activeRegionKey);
    return;
  }

  if (currentView === "specialist") {
    showDistrictManagerPage(activeRegionKey);
    return;
  }

  activeRegionKey = null;
  activeDistrictManagerKey = null;
  renderOverview();
});

refreshButton.addEventListener("click", () => {
  loadDashboardData(true);
});

loadDashboardData(false);
window.setInterval(() => {
  loadDashboardData(false, true);
}, 60000);

async function loadDashboardData(isManualRefresh, silent = false) {
  if (!silent) {
    setDataStatus(isManualRefresh ? "正在刷新最新 Excel 数据..." : "正在加载最新表格数据...");
  }

  refreshButton.disabled = true;

  try {
    const forceFlag = isManualRefresh ? "&force=1" : "";
    const response = await fetch(`/api/dashboard-data?_=${Date.now()}${forceFlag}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    regionData = REGION_GROUPS.map((group) =>
      buildRegionGroup(
        group,
        payload.summary,
        payload.positions,
        payload.roster || { regionalManagers: [], districtManagers: [] },
        payload.specialists || []
      )
    );
    setDataStatus(buildDataStatus(payload.meta));

    if (activeRegionKey) {
      if (currentView === "regional-manager") {
        showRegionalManagerPage(activeRegionKey);
      } else if (currentView === "district-manager") {
        showDistrictManagerPage(activeRegionKey);
      } else if (currentView === "specialist" && activeDistrictManagerKey) {
        showSpecialistPage(activeRegionKey, activeDistrictManagerKey);
      } else {
        showDetail(activeRegionKey);
      }
    } else {
      renderOverview();
    }
  } catch (error) {
    const message = `数据读取失败：${error.message || "未知错误"}。请确认本地服务和 Excel 文件仍然可用。`;
    setDataStatus(message);
    if (!regionData.length) {
      overviewHighlights.innerHTML = `<div class="empty-state">${message}</div>`;
      regionGrid.innerHTML = "";
      insightList.innerHTML = `<div class="empty-state">当前还没有可展示的数据。</div>`;
    }
  } finally {
    refreshButton.disabled = false;
  }
}

function buildRegionGroup(group, summary, positions, roster, specialists) {
  const metrics = group.sourceRegions.reduce((accumulator, regionName) => {
    const source = summary[regionName] || createEmptyMetrics();
    accumulator.headcount += source.headcount;
    accumulator.active += source.active;
    accumulator.incoming += source.incoming;
    accumulator.vacant += source.vacant;
    accumulator.regionalManager.planned += source.regionalManager.planned;
    accumulator.regionalManager.active += source.regionalManager.active;
    accumulator.regionalManager.incoming += source.regionalManager.incoming;
    accumulator.regionalManager.vacant += source.regionalManager.vacant;
    accumulator.districtManager.planned += source.districtManager.planned;
    accumulator.districtManager.active += source.districtManager.active;
    accumulator.districtManager.incoming += source.districtManager.incoming;
    accumulator.districtManager.vacant += source.districtManager.vacant;
    accumulator.representative.planned += source.representative.planned;
    accumulator.representative.active += source.representative.active;
    accumulator.representative.incoming += source.representative.incoming;
    accumulator.representative.vacant += source.representative.vacant;
    return accumulator;
  }, createEmptyMetrics());

  const groupPositions = positions
    .filter((item) => group.sourceRegions.includes(item.region))
    .sort((left, right) => statusRank(left.status) - statusRank(right.status) || String(left.title).localeCompare(String(right.title), "zh-CN"));

  const rosterRegionalManagers = (roster.regionalManagers || [])
    .filter((item) => group.sourceRegions.includes(item.topRegion))
    .sort((left, right) => String(left.areaName).localeCompare(String(right.areaName), "zh-CN"));

  const rosterDistrictManagers = (roster.districtManagers || [])
    .filter((item) => group.sourceRegions.includes(item.topRegion))
    .sort((left, right) => {
      if (left.areaName !== right.areaName) {
        return String(left.areaName).localeCompare(String(right.areaName), "zh-CN");
      }
      return String(left.title).localeCompare(String(right.title), "zh-CN");
    });

  const specialistAssignments = (specialists || [])
    .filter((item) => group.sourceRegions.includes(item.topRegion))
    .sort((left, right) => {
      if (left.areaName !== right.areaName) {
        return String(left.areaName).localeCompare(String(right.areaName), "zh-CN");
      }
      return String(left.territory).localeCompare(String(right.territory), "zh-CN");
    });

  const summaryMap = new Map();
  groupPositions.forEach((item) => summaryMap.set(item.status, (summaryMap.get(item.status) || 0) + 1));

  return {
    ...group,
    metrics,
    positions: groupPositions,
    rosterRegionalManagers,
    rosterDistrictManagers,
    specialistAssignments,
    statusSummary: Array.from(summaryMap.entries()).map(([status, count]) => ({ status, count }))
  };
}

function renderOverview() {
  currentView = "overview";
  viewKicker.textContent = T.overview;
  viewTitle.textContent = T.overviewTitle;
  backButton.textContent = "返回总览";
  backButton.classList.add("hidden");
  overviewView.classList.add("active");
  detailView.classList.remove("active");
  regionalManagerView.classList.remove("active");
  districtManagerView.classList.remove("active");
  specialistView.classList.remove("active");

  if (!regionData.length) {
    overviewHighlights.innerHTML = `<div class="empty-state">当前还没有加载到招聘数据。</div>`;
    regionGrid.innerHTML = "";
    insightList.innerHTML = `<div class="empty-state">请稍后重试，或检查 Excel 文件格式。</div>`;
    return;
  }

  const totalVacant = regionData.reduce((sum, item) => sum + item.metrics.vacant, 0);
  const maxVacantRegion = [...regionData].sort((a, b) => b.metrics.vacant - a.metrics.vacant)[0];
  const maxDistrictGap = [...regionData].sort((a, b) => b.metrics.districtManager.vacant - a.metrics.districtManager.vacant)[0];

  overviewHighlights.innerHTML = [
    createHighlightCard("总空岗数", String(totalVacant), "四大区待招总量"),
    createHighlightCard("压力最大区域", maxVacantRegion.key, `${T.vacant} ${maxVacantRegion.metrics.vacant} 人`),
    createHighlightCard("地区经理缺口最高", maxDistrictGap.key, `${T.dm}${T.vacant} ${maxDistrictGap.metrics.districtManager.vacant} 人`)
  ].join("");

  regionGrid.innerHTML = regionData
    .map((region) => {
      const fill = computeReadiness(region.metrics.headcount, region.metrics.active + region.metrics.incoming);
      return `<button class="region-card ${region.titleClass}" type="button" data-region="${region.key}"><div class="card-head"><div><div class="region-name">${region.key}</div><div class="region-subtitle">${region.description}</div></div><div class="vacancy-pill"><span>${T.vacant}</span><strong>${region.metrics.vacant}</strong></div></div><div class="ring-row"><div class="ring-card"><span>${T.headcount}</span><strong>${region.metrics.headcount}</strong></div><div class="ring-card"><span>${T.rm}${T.vacant}</span><strong>${region.metrics.regionalManager.vacant}</strong></div><div class="ring-card"><span>${T.dm}${T.vacant}</span><strong>${region.metrics.districtManager.vacant}</strong></div></div><div class="bar-track"><div class="bar-fill" style="width:${fill}%"></div></div><div class="card-bottom"><span>${T.active} ${region.metrics.active} / ${T.incoming} ${region.metrics.incoming}</span><span>点击查看明细</span></div></button>`;
    })
    .join("");

  regionGrid.querySelectorAll("[data-region]").forEach((button) => {
    button.addEventListener("click", () => showDetail(button.dataset.region));
  });

  renderInsights();
}

function renderInsights() {
  const sortedVacancy = [...regionData].sort((a, b) => b.metrics.vacant - a.metrics.vacant);
  const topOpenRegion = sortedVacancy[0];
  const mostOpenPositions = [...regionData]
    .map((region) => ({ region: region.key, count: region.positions.filter((item) => item.status !== T.done).length }))
    .sort((a, b) => b.count - a.count)[0];
  const eastRegion = regionData.find((item) => item.key === T.east);

  insightList.innerHTML = `<div class="insight-item"><span>空岗压力</span><strong>${topOpenRegion.key}</strong><p>最新汇总表显示该区域${T.vacant} ${topOpenRegion.metrics.vacant} 人，是当前四大区中缺口最大的区域。</p></div><div class="insight-item"><span>在招岗位数量</span><strong>${mostOpenPositions.count} 个</strong><p>${mostOpenPositions.region} 在管理岗明细中保留了最多的${T.rm}/${T.dm}过程记录。</p></div><div class="insight-item"><span>东区说明</span><strong>${eastRegion.metrics.vacant} 个空岗</strong><p>首页继续合并为东区，详情页会保留东一区、东二区标签，方便你追踪来源。</p></div>`;
}

function showDetail(regionKey) {
  activeRegionKey = regionKey;
  activeDistrictManagerKey = null;
  currentView = "detail";
  const region = regionData.find((item) => item.key === regionKey);
  if (!region) {
    return;
  }

  viewKicker.textContent = T.detail;
  viewTitle.textContent = `${region.key}管理岗编制与空岗明细`;
  backButton.textContent = "返回总览";
  backButton.classList.remove("hidden");
  overviewView.classList.remove("active");
  detailView.classList.add("active");
  regionalManagerView.classList.remove("active");
  districtManagerView.classList.remove("active");
  specialistView.classList.remove("active");

  const openPositions = region.positions.filter((item) => item.status !== T.done);
  const progressBars = [
    createRecruitmentProgressRow("大区", region.metrics.regionalManager),
    createRecruitmentProgressRow("地区", region.metrics.districtManager),
    createRecruitmentProgressRow("代表", region.metrics.representative)
  ].join("");

  detailHero.innerHTML = `<div class="detail-summary"><p class="section-kicker">区域概览</p><h3>${region.key}</h3><p>当前区域${T.headcount} ${region.metrics.headcount} 人，${T.active} ${region.metrics.active} 人，${T.incoming} ${region.metrics.incoming} 人，${T.vacant} ${region.metrics.vacant} 人。</p><div class="subregion-tags">${region.sourceRegions.map((name) => `<span>${name}</span>`).join("")}</div></div><div class="detail-aside recruitment-progress-panel"><p class="section-kicker">岗位准备度</p><div class="recruitment-progress-list">${progressBars}</div></div>`;

  detailMetrics.innerHTML = [
    createMetricCard(T.headcount, region.metrics.headcount, `${T.vacant} ${region.metrics.vacant}`),
    createMetricCard(T.rm, region.metrics.regionalManager.planned, `${T.vacant} ${region.metrics.regionalManager.vacant}`, "regional-manager-page"),
    createMetricCard(T.dm, region.metrics.districtManager.planned, `${T.vacant} ${region.metrics.districtManager.vacant}`, "district-manager-page"),
    createMetricCard(T.incoming, region.metrics.incoming, `${openPositions.length} 个过程岗位`)
  ].join("");

  detailMetrics.querySelectorAll("[data-action='regional-manager-page']").forEach((card) => {
    card.addEventListener("click", () => showRegionalManagerPage(region.key));
  });
  detailMetrics.querySelectorAll("[data-action='district-manager-page']").forEach((card) => {
    card.addEventListener("click", () => showDistrictManagerPage(region.key));
  });

  detailStatusPills.innerHTML = region.statusSummary.map((item) => `<div class="status-pill"><span>${item.status}</span><strong>${item.count}</strong></div>`).join("");
  districtManagerList.innerHTML = renderRoleCards(region.positions.filter((item) => item.level === T.dm));
  regionalManagerList.innerHTML = renderRoleCards(region.positions.filter((item) => item.level === T.rm));
}

function showRegionalManagerPage(regionKey) {
  activeRegionKey = regionKey;
  activeDistrictManagerKey = null;
  currentView = "regional-manager";
  const region = regionData.find((item) => item.key === regionKey);
  if (!region) {
    return;
  }

  viewKicker.textContent = "大区经理子页";
  viewTitle.textContent = `${region.key}大区经理与负责区域`;
  backButton.textContent = "返回区域详情";
  backButton.classList.remove("hidden");
  overviewView.classList.remove("active");
  detailView.classList.remove("active");
  regionalManagerView.classList.add("active");
  districtManagerView.classList.remove("active");
  specialistView.classList.remove("active");

  const configuredCount = region.rosterRegionalManagers.filter((item) => !item.isVacant).length;
  const vacantCount = region.rosterRegionalManagers.filter((item) => item.isVacant).length;
  const territoryCount = region.rosterRegionalManagers.reduce((sum, item) => sum + item.territories.length, 0);

  regionalManagerHero.innerHTML = `<div class="detail-summary"><p class="section-kicker">花名册概览</p><h3>${region.key}</h3><p>这里集中展示该区域的大区经理姓名、岗位状态以及负责地区，避免把花名册信息和招聘过程信息混在同一页。</p><div class="subregion-tags"><span>已配置 ${configuredCount}</span><span>待招 ${vacantCount}</span><span>覆盖地区 ${territoryCount}</span></div></div><div class="detail-aside"><p class="section-kicker">查看口径</p><strong>${region.rosterRegionalManagers.length}</strong><p>按花名册表中的“大区 / 大区经理 / 地区”字段自动归组生成。</p><div class="mini-progress"><div style="width:${computeReadiness(region.rosterRegionalManagers.length || 1, configuredCount)}%"></div></div></div>`;
  regionalManagerPageTitle.textContent = `${region.key}大区经理花名册`;
  regionalManagerPageRoster.innerHTML = renderRegionalManagerRoster(region.rosterRegionalManagers);
}

function showDistrictManagerPage(regionKey) {
  activeRegionKey = regionKey;
  activeDistrictManagerKey = null;
  currentView = "district-manager";
  const region = regionData.find((item) => item.key === regionKey);
  if (!region) {
    return;
  }

  viewKicker.textContent = "地区经理子页";
  viewTitle.textContent = `${region.key}地区经理与负责区域`;
  backButton.textContent = "返回区域详情";
  backButton.classList.remove("hidden");
  overviewView.classList.remove("active");
  detailView.classList.remove("active");
  regionalManagerView.classList.remove("active");
  districtManagerView.classList.add("active");
  specialistView.classList.remove("active");

  const configuredCount = region.rosterDistrictManagers.filter((item) => !item.isVacant).length;
  const vacantCount = region.rosterDistrictManagers.filter((item) => item.isVacant).length;
  const areaCount = new Set(region.rosterDistrictManagers.map((item) => item.areaName)).size;
  const areaProgressRows = buildAreaDistrictProgressRows(region.rosterDistrictManagers)
    .map((item) => createRecruitmentProgressRow(item.label, item.metric))
    .join("");

  districtManagerHero.innerHTML = `<div class="detail-summary"><p class="section-kicker">花名册概览</p><h3>${region.key}</h3><p>这里集中展示该区域的地区经理姓名、岗位状态、所属大区以及具体负责地区，让详情页继续保持只看招聘进展。</p><div class="subregion-tags"><span>已配置 ${configuredCount}</span><span>待招 ${vacantCount}</span><span>所属大区 ${areaCount}</span></div></div><div class="detail-aside recruitment-progress-panel"><p class="section-kicker">查看口径</p><div class="recruitment-progress-list">${areaProgressRows}</div></div>`;
  districtManagerPageTitle.textContent = `${region.key}地区经理花名册`;
  districtManagerPageRoster.innerHTML = renderDistrictManagerRoster(region.rosterDistrictManagers);
  districtManagerPageRoster.querySelectorAll("[data-district-key]").forEach((row) => {
    row.addEventListener("click", () => showSpecialistPage(region.key, row.dataset.districtKey));
  });
}

function showSpecialistPage(regionKey, districtKey) {
  activeRegionKey = regionKey;
  activeDistrictManagerKey = districtKey;
  currentView = "specialist";
  const region = regionData.find((item) => item.key === regionKey);
  if (!region) {
    return;
  }

  const districtManager = region.rosterDistrictManagers.find((item) => buildDistrictManagerKey(item) === districtKey);
  const specialistEntry = region.specialistAssignments.find((item) => item.key === districtKey);
  const specialistList = specialistEntry?.specialists || [];
  const hospitalCount = specialistList.reduce((sum, item) => sum + item.hospitals.length, 0);
  const vacantSpecialists = specialistList.filter((item) => item.isVacant).length;

  viewKicker.textContent = "专员子页";
  viewTitle.textContent = `${districtManager?.managerName || "待招"}负责专员与医院`;
  backButton.textContent = "返回地区经理页";
  backButton.classList.remove("hidden");
  overviewView.classList.remove("active");
  detailView.classList.remove("active");
  regionalManagerView.classList.remove("active");
  districtManagerView.classList.remove("active");
  specialistView.classList.add("active");

  specialistHero.innerHTML = `<div class="detail-summary"><p class="section-kicker">专员结构</p><h3>${districtManager?.title || specialistEntry?.territory || "未识别地区"}</h3><p>这里展示该地区经理名下的专员，以及每位专员当前负责的医院。空岗仍按“待招”统一显示，方便你从地区经理继续往下钻取专员层。</p><div class="subregion-tags"><span>${districtManager?.areaName || specialistEntry?.areaName || "未归类大区"}</span><span>地区经理 ${districtManager?.managerName || specialistEntry?.managerName || "待招"}</span></div></div><div class="detail-aside"><p class="section-kicker">查看口径</p><strong>${specialistList.length}</strong><p>按 Sheet4“专员”中的“地区经理 / 专员 / 医院”字段聚合去重生成，共覆盖医院 ${hospitalCount} 家。</p><div class="mini-progress"><div style="width:${computeReadiness(specialistList.length || 1, specialistList.length - vacantSpecialists)}%"></div></div></div>`;
  specialistPageTitle.textContent = `${districtManager?.managerName || "待招"}名下专员`;
  specialistPageList.innerHTML = renderSpecialistAssignments(specialistList);
}

function renderRegionalManagerRoster(items) {
  if (!items.length) {
    return `<div class="empty-state">花名册表里还没有该区域的大区经理信息。</div>`;
  }

  return items
    .map((item) => {
      const territories = item.territories.length
        ? item.territories.map((territory) => `<span>${territory}</span>`).join("")
        : `<span>暂无负责地区</span>`;
      const note = item.isVacant ? "当前该大区经理岗位为空岗，姓名统一按“待招”展示。" : `负责 ${item.territories.length} 个地区。`;

      return `<article class="roster-card"><h4>${item.areaName}</h4><div class="role-badges"><span class="badge">${item.level}</span><span class="badge ${item.isVacant ? "status-pending" : "status-done"}">${item.isVacant ? "待招" : "已配置"}</span></div><p class="roster-note"><strong>姓名：</strong><span class="roster-name">${item.managerName || "待招"}</span></p><div class="roster-territories">${territories}</div><p class="roster-note">${note}</p></article>`;
    })
    .join("");
}

function renderDistrictManagerRoster(items) {
  if (!items.length) {
    return `<div class="empty-state">花名册表里还没有该区域的地区经理信息。</div>`;
  }

  const grouped = new Map();
  items.forEach((item) => {
    const key = item.areaName || "未归类大区";
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  });

  return `<div class="district-list">${Array.from(grouped.entries())
    .map(([areaName, members]) => {
      const rows = members
        .map((item) => {
          const badge = item.isVacant ? `<span class="badge status-pending">待招</span>` : "";
          return `<button class="district-row district-row-button" type="button" data-district-key="${buildDistrictManagerKey(item)}"><div class="district-name"><span>${item.managerName || "待招"}</span>${badge}</div><div class="district-territory">${item.title}</div></button>`;
        })
        .join("");

      return `<section class="district-group"><div class="district-group-title"><h4>${areaName}</h4><span>${members.length} 个地区</span></div><div class="district-group-rows">${rows}</div></section>`;
    })
    .join("")}</div>`;
}

function renderSpecialistAssignments(items) {
  if (!items.length) {
    return `<div class="empty-state">这位地区经理名下还没有专员与医院的可展示数据。</div>`;
  }

  return items
    .map((item) => {
      const hospitals = item.hospitals.length
        ? item.hospitals.map((hospital) => `<span>${hospital}</span>`).join("")
        : `<span>待补充医院</span>`;
      return `<article class="specialist-card"><div class="specialist-head"><div class="district-name"><span>${item.name || "待招"}</span>${item.isVacant ? `<span class="badge status-pending">待招</span>` : ""}</div><div class="specialist-count">${item.hospitals.length} 家医院</div></div><div class="specialist-hospitals">${hospitals}</div></article>`;
    })
    .join("");
}

function renderRoleCards(items) {
  if (!items.length) {
    return `<div class="empty-state">该区域当前没有对应岗位明细。</div>`;
  }

  return items
    .map((item) => {
      const done = item.status === T.done;
      const metaBits = [
        item.region ? `${T.source} ${item.region}` : "",
        item.location ? `${T.location} ${item.location}` : "",
        item.owner ? `${T.owner} ${item.owner}` : "",
        item.channel ? `${T.channel} ${item.channel}` : "",
        item.onboardDate ? `${T.onboard} ${formatDate(item.onboardDate)}` : ""
      ].filter(Boolean);
      const detailBits = [
        item.name ? `${T.candidate}：${item.name}` : "",
        item.progress ? `${T.progress}：${item.progress}` : "",
        item.remark ? `${T.remark}：${item.remark}` : ""
      ].filter(Boolean);
      return `<article class="role-card"><div class="role-card-head"><div><h4>${item.title}</h4><div class="role-badges"><span class="badge ${done ? "status-done" : "status-pending"}">${item.status}</span><span class="badge">${item.level}</span></div></div><div class="role-meta">${metaBits.map((text) => `<span>${text}</span>`).join("")}</div></div><p class="role-progress">${detailBits.join("；") || T.none}</p></article>`;
    })
    .join("");
}

function createHighlightCard(label, value, note) {
  return `<div class="highlight-card"><span>${label}</span><strong>${value}</strong><span>${note}</span></div>`;
}

function createMetricCard(label, value, note, action = "") {
  const actionableClass = action ? " actionable" : "";
  const dataAction = action ? ` data-action="${action}"` : "";
  return `<div class="metric-card${actionableClass}"${dataAction}><span>${label}</span><strong>${value}</strong><em>${note}</em></div>`;
}

function buildDistrictManagerKey(item) {
  return [item.topRegion, item.areaName, item.title, item.rawManagerName].join("__");
}

function createEmptyMetrics() {
  return {
    headcount: 0,
    active: 0,
    incoming: 0,
    vacant: 0,
    regionalManager: { planned: 0, active: 0, incoming: 0, vacant: 0 },
    districtManager: { planned: 0, active: 0, incoming: 0, vacant: 0 },
    representative: { planned: 0, active: 0, incoming: 0, vacant: 0 }
  };
}

function createRecruitmentProgressRow(label, metric) {
  const percent = computeReadiness(metric.planned, metric.active);
  return `<div class="recruitment-progress-row"><div class="recruitment-progress-head"><strong>${label}</strong><span>${metric.active} / ${metric.planned}</span><em>${percent}%</em></div><div class="mini-progress recruitment-progress-track"><div style="width:${percent}%"></div></div></div>`;
}

function buildAreaDistrictProgressRows(items) {
  const grouped = new Map();

  items.forEach((item) => {
    const key = item.areaName || "未归类大区";
    if (!grouped.has(key)) {
      grouped.set(key, {
        label: key,
        metric: { planned: 0, active: 0 }
      });
    }
    const group = grouped.get(key);
    group.metric.planned += 1;
    if (!item.isVacant) {
      group.metric.active += 1;
    }
  });

  return Array.from(grouped.values()).sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
}

function statusRank(status) {
  const order = {
    [T.searching]: 1,
    [T.interviewing]: 2,
    [T.offer]: 3,
    [T.incoming]: 4,
    [T.done]: 5,
    [T.paused]: 6
  };
  return order[status] || 99;
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${year}.${month}.${day}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function buildDataStatus(meta) {
  const sourceTime = meta?.sourceUpdatedAt ? formatDateTime(meta.sourceUpdatedAt) : "未知时间";
  const fileName = meta?.sourceFile || "未识别文件";
  return `数据源：${fileName}，最近更新时间 ${sourceTime}`;
}

function setDataStatus(message) {
  dataStatus.textContent = message;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}.${month}.${day} ${hours}:${minutes}`;
}

function computeReadiness(headcount, staffedCount) {
  if (!headcount) {
    return 0;
  }
  return Math.min(100, Math.round((staffedCount / headcount) * 100));
}
