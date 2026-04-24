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
const overviewActions = document.getElementById("overviewActions");
const interviewBoardPanel = document.getElementById("interviewBoardPanel");
const dashboardGrid = document.querySelector(".dashboard-grid");
const backButton = document.getElementById("backButton");
const refreshButton = document.getElementById("refreshButton");
const overviewView = document.getElementById("overviewView");
const interviewDetailView = document.getElementById("interviewDetailView");
const detailView = document.getElementById("detailView");
const regionalManagerView = document.getElementById("regionalManagerView");
const districtManagerView = document.getElementById("districtManagerView");
const specialistView = document.getElementById("specialistView");
const viewKicker = document.getElementById("viewKicker");
const viewTitle = document.getElementById("viewTitle");
const dataStatus = document.getElementById("dataStatus");
const sidebar = document.querySelector(".sidebar");
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
const interviewDetailHero = document.getElementById("interviewDetailHero");
const interviewDetailTitle = document.getElementById("interviewDetailTitle");
const interviewDetailList = document.getElementById("interviewDetailList");

let regionData = [];
let interviewBoards = [];
let activeInterviewBoardId = null;
let activeRegionKey = null;
let activeDistrictManagerKey = null;
let currentView = "overview";

backButton.addEventListener("click", () => {
  if (currentView === "interview-detail") {
    activeInterviewBoardId = null;
    renderOverview();
    return;
  }

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
    interviewBoards = payload.interviewBoards || [];
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

    if (currentView === "interview-detail" && activeInterviewBoardId) {
      showInterviewDetailPage(activeInterviewBoardId);
    } else if (activeRegionKey) {
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
  interviewDetailView.classList.remove("active");
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
  if (dashboardGrid) {
    dashboardGrid.classList.remove("overview-full");
  }
  if (sidebar) {
    sidebar.classList.remove("hidden");
  }
  const region = regionData.find((item) => item.key === regionKey);
  if (!region) {
    return;
  }

  viewKicker.textContent = T.detail;
  viewTitle.textContent = `${region.key}管理岗编制与空岗明细`;
  backButton.textContent = "返回总览";
  backButton.classList.remove("hidden");
  overviewView.classList.remove("active");
  interviewDetailView.classList.remove("active");
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
  if (dashboardGrid) {
    dashboardGrid.classList.remove("overview-full");
  }
  if (sidebar) {
    sidebar.classList.remove("hidden");
  }
  const region = regionData.find((item) => item.key === regionKey);
  if (!region) {
    return;
  }

  viewKicker.textContent = "大区经理子页";
  viewTitle.textContent = `${region.key}大区经理与负责区域`;
  backButton.textContent = "返回区域详情";
  backButton.classList.remove("hidden");
  overviewView.classList.remove("active");
  interviewDetailView.classList.remove("active");
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
  if (dashboardGrid) {
    dashboardGrid.classList.remove("overview-full");
  }
  if (sidebar) {
    sidebar.classList.remove("hidden");
  }
  const region = regionData.find((item) => item.key === regionKey);
  if (!region) {
    return;
  }

  viewKicker.textContent = "地区经理子页";
  viewTitle.textContent = `${region.key}地区经理与负责区域`;
  backButton.textContent = "返回区域详情";
  backButton.classList.remove("hidden");
  overviewView.classList.remove("active");
  interviewDetailView.classList.remove("active");
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
  if (dashboardGrid) {
    dashboardGrid.classList.remove("overview-full");
  }
  if (sidebar) {
    sidebar.classList.remove("hidden");
  }
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
  interviewDetailView.classList.remove("active");
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

function renderOverview() {
  currentView = "overview";
  if (dashboardGrid) {
    dashboardGrid.classList.add("overview-full");
  }
  if (sidebar) {
    sidebar.classList.add("hidden");
  }
  viewKicker.textContent = "总览视图";
  viewTitle.textContent = "创新药销售招聘可视化看板";
  backButton.textContent = "返回总览";
  backButton.classList.add("hidden");
  overviewView.classList.add("active");
  interviewDetailView.classList.remove("active");
  detailView.classList.remove("active");
  regionalManagerView.classList.remove("active");
  districtManagerView.classList.remove("active");
  specialistView.classList.remove("active");

  if (!regionData.length) {
    overviewHighlights.innerHTML = `<div class="empty-state">当前还没有加载到招聘数据。</div>`;
    regionGrid.innerHTML = "";
    insightList.innerHTML = `<div class="empty-state">请稍后重试，或检查数据源是否可用。</div>`;
    renderInterviewBoardPanel();
    if (overviewActions) {
      overviewActions.innerHTML = "";
    }
    return;
  }

  const totalHeadcount = regionData.reduce((sum, item) => sum + item.metrics.headcount, 0);
  const totalActive = regionData.reduce((sum, item) => sum + item.metrics.active, 0);
  const totalIncoming = regionData.reduce((sum, item) => sum + item.metrics.incoming, 0);
  const totalVacant = regionData.reduce((sum, item) => sum + item.metrics.vacant, 0);
  const totalManagerVacant = regionData.reduce(
    (sum, item) => sum + item.metrics.regionalManager.vacant + item.metrics.districtManager.vacant,
    0
  );
  const totalRepresentativeVacant = regionData.reduce((sum, item) => sum + item.metrics.representative.vacant, 0);
  const openPositionCount = regionData.reduce(
    (sum, item) => sum + item.positions.filter((position) => position.status !== T.done).length,
    0
  );
  const maxVacantRegion = [...regionData].sort((a, b) => b.metrics.vacant - a.metrics.vacant)[0];
  const maxDistrictGap = [...regionData].sort((a, b) => b.metrics.districtManager.vacant - a.metrics.districtManager.vacant)[0];

  overviewHighlights.innerHTML = [
    createHighlightCard("总编制", String(totalHeadcount), "含大区经理 / 地区经理 / 专员"),
    createHighlightCard("当前在岗", String(totalActive), `在岗率 ${computeReadiness(totalHeadcount, totalActive)}%`),
    createHighlightCard("空岗数", String(totalVacant), `管理岗缺口 ${totalManagerVacant}`),
    createHighlightCard("待入职", String(totalIncoming), "已发 Offer / 待到岗"),
    createHighlightCard("代表空岗", String(totalRepresentativeVacant), "直接影响终端覆盖"),
    createHighlightCard("在招岗位", String(openPositionCount), `${maxVacantRegion.key} 压力最大`)
  ].join("");

  renderInterviewBoardPanel();

  regionGrid.innerHTML = buildOverviewTable(regionData);

  regionGrid.querySelectorAll("[data-region-row]").forEach((button) => {
    button.addEventListener("click", () => showDetail(button.dataset.regionRow));
  });

  renderInsights(maxVacantRegion, maxDistrictGap);
  renderActionList();
}

function renderInsights(topOpenRegion, topDistrictGap) {
  const mostOpenPositions = [...regionData]
    .map((region) => ({ region: region.key, count: region.positions.filter((item) => item.status !== T.done).length }))
    .sort((a, b) => b.count - a.count)[0];
  const managerPressure = [...regionData]
    .map((region) => ({
      region: region.key,
      count: region.metrics.regionalManager.vacant + region.metrics.districtManager.vacant
    }))
    .sort((a, b) => b.count - a.count)[0];

  insightList.innerHTML = `
    <div class="insight-item tone-high">
      <span>最高优先级</span>
      <strong>${topOpenRegion.key}</strong>
      <p>当前空岗 ${topOpenRegion.metrics.vacant} 个，是四大区里最需要先处理的区域。</p>
    </div>
    <div class="insight-item tone-warm">
      <span>管理层缺口</span>
      <strong>${topDistrictGap.key}</strong>
      <p>地区经理空缺 ${topDistrictGap.metrics.districtManager.vacant} 个，管理半径承压最明显。</p>
    </div>
    <div class="insight-item tone-calm">
      <span>在招岗位</span>
      <strong>${mostOpenPositions.region}</strong>
      <p>当前在招 ${mostOpenPositions.count} 个岗位，需要重点盯推进节奏与转化。</p>
    </div>
    <div class="insight-item tone-neutral">
      <span>组织稳定度</span>
      <strong>${managerPressure.region}</strong>
      <p>大区经理与地区经理合计缺口 ${managerPressure.count} 个，建议同步看代理与兼管情况。</p>
    </div>
  `;
}

function renderActionList() {
  if (!overviewActions) {
    return;
  }

  const actions = [...regionData]
    .map((region) => ({
      key: region.key,
      openCount: region.positions.filter((item) => item.status !== T.done).length,
      managerGap: region.metrics.regionalManager.vacant + region.metrics.districtManager.vacant,
      vacant: region.metrics.vacant
    }))
    .sort((a, b) => (b.managerGap + b.openCount + b.vacant) - (a.managerGap + a.openCount + a.vacant))
    .slice(0, 4);

  overviewActions.innerHTML = actions
    .map((item, index) => `
      <button class="action-item" type="button" data-region-row="${item.key}">
        <div>
          <span>动作 ${index + 1}</span>
          <strong>${item.key}</strong>
          <p>空岗 ${item.vacant} 个，在招 ${item.openCount} 个，管理岗缺口 ${item.managerGap} 个</p>
        </div>
        <em>进入区域</em>
      </button>
    `)
    .join("");

  overviewActions.querySelectorAll("[data-region-row]").forEach((button) => {
    button.addEventListener("click", () => showDetail(button.dataset.regionRow));
  });
}

function renderInterviewBoardPanel() {
  if (!interviewBoardPanel) {
    return;
  }

  const total = interviewBoards.reduce((sum, board) => sum + Number(board.count || 0), 0);

  if (!interviewBoards.length) {
    interviewBoardPanel.innerHTML = `
      <div class="interview-board-head">
        <div>
          <p class="section-kicker">待面试安排</p>
          <h3>待面试人员看板</h3>
        </div>
      </div>
      <div class="empty-state">当前还没有读取到待面试表。</div>
    `;
    return;
  }

  interviewBoardPanel.innerHTML = `
    <div class="interview-board-head">
      <div>
        <p class="section-kicker">待面试安排</p>
        <h3>待面试人员看板</h3>
      </div>
      <div class="interview-board-total">
        <span>总待面试人数</span>
        <strong>${total}</strong>
      </div>
    </div>
    <div class="interview-board-grid">
      ${interviewBoards.map((board) => `
        <button class="interview-count-card${isPriorityInterviewBoard(board) ? " priority" : ""}" type="button" data-interview-id="${escapeHtml(board.id)}">
          <span>${escapeHtml(board.label)}</span>
          <strong>${board.count}</strong>
          <em>点击进入明细页</em>
        </button>
      `).join("")}
    </div>
  `;

  interviewBoardPanel.querySelectorAll("[data-interview-id]").forEach((button) => {
    button.addEventListener("click", () => {
      showInterviewDetailPage(button.dataset.interviewId);
    });
  });
}

function isPriorityInterviewBoard(board) {
  const name = `${board.name || ""}${board.label || ""}`;
  return name.includes("创新药销售核心待面");
}

function showInterviewDetailPage(boardId) {
  const board = interviewBoards.find((item) => item.id === boardId);
  if (!board) {
    return;
  }
  const estimate = calculateInterviewTimeEstimate(board.rows);

  activeInterviewBoardId = boardId;
  activeRegionKey = null;
  activeDistrictManagerKey = null;
  currentView = "interview-detail";
  if (dashboardGrid) {
    dashboardGrid.classList.remove("overview-full");
  }
  if (sidebar) {
    sidebar.classList.add("hidden");
  }

  viewKicker.textContent = "待面试明细";
  viewTitle.textContent = board.label;
  backButton.textContent = "返回总览";
  backButton.classList.remove("hidden");
  overviewView.classList.remove("active");
  interviewDetailView.classList.add("active");
  detailView.classList.remove("active");
  regionalManagerView.classList.remove("active");
  districtManagerView.classList.remove("active");
  specialistView.classList.remove("active");
  interviewDetailHero.className = "detail-hero single-panel";

  interviewDetailHero.innerHTML = `
    <div class="detail-aside interview-time-summary">
      <div class="interview-time-main">
        <p class="section-kicker">待面人数</p>
        <strong class="interview-time-number">${board.count}</strong>
        <span class="interview-time-label">预计总面试时长</span>
        <div class="interview-time-estimate">${formatInterviewDuration(estimate.totalMinutes)}</div>
      </div>
      <div class="interview-time-meta">
        <div class="interview-time-breakdown">
          <div class="interview-time-card">
            <span>专员 / 其他</span>
            <strong>${estimate.specialistCount}</strong>
            <em>10 分钟 / 人</em>
          </div>
          <div class="interview-time-card">
            <span>地区经理</span>
            <strong>${estimate.districtManagerCount}</strong>
            <em>20 分钟 / 人</em>
          </div>
          <div class="interview-time-card">
            <span>大区经理及以上</span>
            <strong>${estimate.regionalManagerCount}</strong>
            <em>30 分钟 / 人</em>
          </div>
        </div>
        <p class="interview-time-note">按当前实时人数估算连续完成全部面试所需时间，口径为：专员 10 分钟 / 人、地区经理 20 分钟 / 人、大区经理及以上 30 分钟 / 人。</p>
      </div>
    </div>
  `;
  interviewDetailTitle.textContent = `${board.label}明细`;
  interviewDetailList.innerHTML = renderInterviewDetailPageTable(board);
}

function renderInterviewDetailPageTable(board) {
  if (!board.rows.length) {
    return `<div class="empty-state">这张表当前没有明细数据。</div>`;
  }

  if (isSalesInterviewBoard(board)) {
    return renderSalesInterviewDetailGroups(board);
  }

  return renderInterviewCandidateRows(board.rows);
}

function renderSalesInterviewDetailGroups(board) {
  const groupedByRegion = groupRowsByValue(board.rows, (row) => getInterviewRowValue(row, ["区域", "区域/TA"]));

  return `
    <div class="interview-sales-groups">
      ${Array.from(groupedByRegion.entries()).map(([regionName, regionRows]) => {
        const locationGroups = Array.from(groupRowsByValue(regionRows, (row) => getInterviewRowValue(row, ["工作地点", "工作地"])).entries())
          .sort(([leftName], [rightName]) => leftName.localeCompare(rightName, "zh-CN"));
        const sortedRows = locationGroups.flatMap(([, locationRows]) => sortInterviewRowsByPosition(locationRows));
        return `
          <section class="interview-region-group">
            <div class="interview-region-head">
              <div>
                <p class="section-kicker">区域分组</p>
                <h4>${escapeHtml(regionName)}</h4>
              </div>
              <span>${regionRows.length} 人</span>
            </div>
            <div class="interview-location-summary">
              ${locationGroups.map(([locationName, locationRows]) => `<span>${escapeHtml(locationName)} ${locationRows.length}人</span>`).join("")}
            </div>
            ${renderInterviewCandidateRows(sortedRows)}
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderInterviewCandidateRows(rows) {
  return `
    <div class="interview-candidate-list">
      ${rows.map((row) => renderInterviewCandidateRow(row)).join("")}
    </div>
  `;
}

function renderInterviewCandidateRow(row) {
  const candidateName = getInterviewRowValue(row, ["人员姓名", "候选人姓名", "姓名"]);
  const age = getInterviewRowValue(row, ["年龄"]);
  const position = getInterviewRowValue(row, ["拟匹配职位", "匹配职位", "职位"]);
  const region = getInterviewRowValue(row, ["区域", "区域/TA"]);
  const area = getInterviewRowValue(row, ["大区"]);
  const location = getInterviewRowValue(row, ["工作地点", "工作地"]);
  const company = getInterviewRowValue(row, ["目前公司", "现公司", "公司"]);
  const source = getInterviewRowValue(row, ["简历来源", "来源"]);
  const market = getInterviewRowValue(row, ["拟定市场", "市场"]);
  const remark = getInterviewRowValue(row, ["备注"]);
  return `
    <article class="interview-candidate-row">
      <div class="interview-row-header">
        <div class="interview-row-identity">
          <strong class="interview-person-name">${escapeHtml(candidateName)}</strong>
          <span class="interview-position-title">${escapeHtml(position)}</span>
        </div>
        <div class="interview-row-badges">
          ${renderInterviewBadge("年龄", age)}
        </div>
      </div>
      <div class="interview-meta-chips">
        ${[
          renderInterviewChip("区域", region),
          renderInterviewChip("大区", area),
          renderInterviewChip("地点", location),
          renderInterviewChip("公司", company),
          renderInterviewChip("来源", source)
        ].join("")}
      </div>
      <div class="interview-note-grid">
        ${renderInterviewNoteCard("拟定市场", market)}
        ${renderInterviewNoteCard("备注", remark)}
      </div>
    </article>
  `;
}

function renderInterviewBadge(label, value) {
  return `<span class="interview-badge"><em>${escapeHtml(label)}</em>${escapeHtml(value || "-")}</span>`;
}

function renderInterviewChip(label, value) {
  return `<div class="interview-chip"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`;
}

function renderInterviewNoteCard(label, value) {
  return `<div class="interview-note-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`;
}

function isSalesInterviewBoard(board) {
  const name = `${board.name || ""}${board.label || ""}`;
  return name.includes("创新药销售核心待面") || name.includes("销售促进非核心待面");
}

function groupRowsByValue(rows, getter) {
  return rows.reduce((groups, row) => {
    const key = getter(row) || "未归类";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
    return groups;
  }, new Map());
}

function sortInterviewRowsByPosition(rows) {
  return [...rows].sort((left, right) => {
    const leftRank = getInterviewPositionRank(getInterviewRowValue(left, ["拟匹配职位", "匹配职位", "职位"]));
    const rightRank = getInterviewPositionRank(getInterviewRowValue(right, ["拟匹配职位", "匹配职位", "职位"]));
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return getInterviewRowValue(left, ["人员姓名", "候选人姓名", "姓名"])
      .localeCompare(getInterviewRowValue(right, ["人员姓名", "候选人姓名", "姓名"]), "zh-CN");
  });
}

function getInterviewPositionRank(position) {
  const text = String(position || "");
  if (text.includes("总监")) {
    return 1;
  }
  if (text.includes("大区经理") || text.includes("区域经理")) {
    return 2;
  }
  if (text.includes("地区经理")) {
    return 3;
  }
  if (text.includes("经理")) {
    return 4;
  }
  if (text.includes("高级")) {
    return 5;
  }
  if (text.includes("专员") || text.includes("促进员")) {
    return 6;
  }
  return 99;
}

function calculateInterviewTimeEstimate(rows) {
  const result = {
    totalMinutes: 0,
    specialistCount: 0,
    districtManagerCount: 0,
    regionalManagerCount: 0
  };

  rows.forEach((row) => {
    const position = getInterviewRowValue(row, ["拟匹配职位", "匹配职位", "职位"]);
    const bucket = getInterviewTimeBucket(position);
    result.totalMinutes += bucket.minutes;
    if (bucket.type === "regional") {
      result.regionalManagerCount += 1;
    } else if (bucket.type === "district") {
      result.districtManagerCount += 1;
    } else {
      result.specialistCount += 1;
    }
  });

  return result;
}

function getInterviewTimeBucket(position) {
  const text = String(position || "");
  if (text.includes("总监") || text.includes("大区经理") || text.includes("区域经理")) {
    return { type: "regional", minutes: 30 };
  }
  if (text.includes("地区经理") || text === "经理") {
    return { type: "district", minutes: 20 };
  }
  return { type: "specialist", minutes: 10 };
}

function formatInterviewDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) {
    return `${hours} 小时 ${minutes} 分`;
  }
  if (hours) {
    return `${hours} 小时`;
  }
  return `${minutes} 分钟`;
}

function getInterviewRowValue(row, keys) {
  for (const key of keys) {
    if (row[key]) {
      return row[key];
    }
  }
  return "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildOverviewTable(regions) {
  const rows = regions
    .map((region) => {
      const vacancyRate = computeReadiness(region.metrics.headcount, region.metrics.vacant);
      const staffedRate = computeReadiness(region.metrics.headcount, region.metrics.active + region.metrics.incoming);
      const managerGap = region.metrics.regionalManager.vacant + region.metrics.districtManager.vacant;
      const note = buildOverviewNote(region, managerGap);

      return `
        <button class="overview-row" type="button" data-region-row="${region.key}">
          <span class="overview-col region">${region.key}</span>
          <span class="overview-col">${region.metrics.headcount}</span>
          <span class="overview-col">${region.metrics.active}</span>
          <span class="overview-col">${region.metrics.vacant}</span>
          <span class="overview-col">${vacancyRate}%</span>
          <span class="overview-col">${managerGap}</span>
          <span class="overview-col note">${note}</span>
          <span class="overview-col progress">
            <span class="mini-progress-track"><span class="mini-progress-fill" style="width:${staffedRate}%"></span></span>
            <em>${staffedRate}%</em>
          </span>
        </button>
      `;
    })
    .join("");

  return `
    <div class="overview-table">
      <div class="overview-table-head">
        <span class="overview-col region">区域</span>
        <span class="overview-col">编制</span>
        <span class="overview-col">在岗</span>
        <span class="overview-col">空岗</span>
        <span class="overview-col">空岗率</span>
        <span class="overview-col">管理岗缺口</span>
        <span class="overview-col note">管理判断</span>
        <span class="overview-col progress">准备度</span>
      </div>
      <div class="overview-table-body">${rows}</div>
    </div>
  `;
}

function buildOverviewNote(region, managerGap) {
  if (region.metrics.vacant >= 100) {
    return "核心市场承压，建议优先补位";
  }
  if (managerGap >= 6) {
    return "管理层缺口较多，需同步看代理与兼管";
  }
  if (region.positions.filter((item) => item.status === T.offer || item.status === T.incoming).length >= 4) {
    return "已有储备，重点盯入职转化";
  }
  return "结构相对平稳，可持续跟进";
}
