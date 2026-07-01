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
const roleLevelOverview = document.getElementById("roleLevelOverview");
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
const headerPressureNote = document.getElementById("headerPressureNote");
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
let candidateSearchTimer = null;
let candidateWorkbenchState = createCandidateWorkbenchState();
let regionOverviewState = createRegionOverviewState();
let districtDetailState = createDistrictDetailState();
let specialistCoverageState = createSpecialistCoverageState();
let pendingDistrictAreaFocus = null;
let activeSubareaName = null;

function createCandidateWorkbenchState(boardId = null) {
  return {
    boardId,
    search: "",
    region: "all",
    territory: "all",
    position: "all",
    status: "all",
    priority: "all",
    sort: "waiting-desc",
    quickFilter: "all",
    page: 1,
    pageSize: 10,
    selectedCandidateId: null,
    drawerOpen: false,
    actionMessage: ""
  };
}

function createRegionOverviewState() {
  return {
    filter: "all",
    sort: "vacancy-rate"
  };
}

function createDistrictDetailState() {
  return {
    managerStatus: "all",
    pressure: "all",
    vacancyBand: "all",
    sort: "vacancy-rate"
  };
}

function createSpecialistCoverageState() {
  return {
    tab: "seats",
    status: "all",
    risk: "all",
    sort: "risk"
  };
}

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
    showDistrictManagerPage(activeRegionKey, activeSubareaName);
    return;
  }

  activeRegionKey = null;
  activeDistrictManagerKey = null;
  activeSubareaName = null;
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
    setDataStatus(isManualRefresh ? "正在刷新最新飞书数据..." : "正在加载飞书多维表格数据...");
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

    if (currentView === "overview") {
      renderOverview();
    } else if (currentView === "interview-detail" && activeInterviewBoardId) {
      showInterviewDetailPage(activeInterviewBoardId);
    } else if (activeRegionKey) {
      if (currentView === "regional-manager") {
        showRegionalManagerPage(activeRegionKey);
      } else if (currentView === "district-manager") {
        showDistrictManagerPage(activeRegionKey, activeSubareaName);
      } else if (currentView === "specialist" && activeDistrictManagerKey) {
        showSpecialistPage(activeRegionKey, activeDistrictManagerKey);
      } else {
        showDetail(activeRegionKey);
      }
    } else {
      renderOverview();
    }
  } catch (error) {
    const message = `飞书数据读取失败：${error.message || "未知错误"}。请确认飞书应用权限、表格授权和网络连接正常。`;
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
  activeInterviewBoardId = null;
  activeRegionKey = null;
  activeDistrictManagerKey = null;
  activeSubareaName = null;
  pendingDistrictAreaFocus = null;
  document.body.classList.remove("candidate-workbench-active");
  if (dashboardGrid) {
    dashboardGrid.classList.remove("candidate-mode");
  }
  interviewDetailView.classList.remove("candidate-workbench-view");
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
    insightList.innerHTML = `<div class="empty-state">请稍后重试，或检查飞书多维表格是否可用。</div>`;
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
  const shouldResetRegionFilters = currentView === "overview" || activeRegionKey !== regionKey;
  activeRegionKey = regionKey;
  activeDistrictManagerKey = null;
  activeSubareaName = null;
  if (shouldResetRegionFilters) {
    regionOverviewState = createRegionOverviewState();
  }
  currentView = "detail";
  document.body.classList.remove("candidate-workbench-active");
  if (dashboardGrid) {
    dashboardGrid.classList.add("overview-full");
  }
  if (sidebar) {
    sidebar.classList.add("hidden");
  }
  const region = regionData.find((item) => item.key === regionKey);
  if (!region) {
    return;
  }

  viewKicker.textContent = `${T.detail} / ${region.key}`;
  viewTitle.textContent = `${region.key}子区管理总览`;
  backButton.textContent = "返回总览";
  backButton.classList.remove("hidden");
  overviewView.classList.remove("active");
  interviewDetailView.classList.remove("active");
  detailView.classList.add("active");
  regionalManagerView.classList.remove("active");
  districtManagerView.classList.remove("active");
  specialistView.classList.remove("active");

  detailHero.className = "region-command-view";
  detailMetrics.classList.add("hidden");
  detailStatusPills.closest(".status-panel")?.classList.add("hidden");
  regionalManagerList.closest(".role-section")?.classList.add("hidden");
  districtManagerList.closest(".role-section")?.classList.add("hidden");

  detailHero.innerHTML = renderRegionCommandOverview(region);
  bindRegionCommandOverviewEvents(region);
}

function renderRegionCommandOverview(region) {
  const subareas = buildRegionSubareaRows(region);
  const filteredSubareas = filterRegionSubareas(subareas);
  const sortedSubareas = sortRegionSubareas(filteredSubareas);
  const pressureCounts = countSubareaPressure(subareas);
  const topVacancies = [...subareas]
    .sort((left, right) => right.vacancyRate - left.vacancyRate || right.vacant - left.vacant)
    .slice(0, 3);
  const totalDistrictSeats = subareas.reduce((sum, item) => sum + item.totalSeats, 0);
  const pressureSortedSubareas = [...subareas]
    .sort((left, right) => right.vacancyRate - left.vacancyRate || right.vacant - left.vacant);
  const highFocus = pressureSortedSubareas
    .filter((item) => item.pressure.tone === "high")
    .slice(0, 4)
    .map((item) => item.name);
  const mediumFocus = pressureSortedSubareas
    .filter((item) => item.pressure.tone === "medium")
    .slice(0, 4)
    .map((item) => item.name);
  const focusNote = pressureCounts.high > 0
    ? `<strong>重点关注：</strong>${escapeHtml(highFocus.join("、"))}`
    : (mediumFocus.length
      ? `<strong>当前暂无高压子区，</strong>建议持续关注中压子区：${escapeHtml(mediumFocus.join("、"))}`
      : `<strong>当前暂无高压子区，</strong>子区整体压力较平稳。`);
  const vacancyRate = computeReadiness(region.metrics.headcount, region.metrics.vacant);
  const activeRate = computeReadiness(region.metrics.headcount, region.metrics.active);
  const incomingRate = computeReadiness(region.metrics.headcount, region.metrics.incoming);

  return `
    <div class="region-command-nav">
      <button class="region-home-button" type="button" data-region-home>返回总览</button>
    </div>

    <section class="region-command-kpis" aria-label="${region.key}概览指标">
      ${renderRegionKpiCard("总编制", region.metrics.headcount, `地区经理席位 ${totalDistrictSeats}`, "briefcase")}
      ${renderRegionKpiCard("在岗", region.metrics.active, `占编制 ${activeRate}%`, "users", "healthy")}
      ${renderRegionKpiCard("空岗", region.metrics.vacant, `占编制 ${vacancyRate}%`, "search", "risk")}
      ${renderRegionKpiCard("待入职", region.metrics.incoming, `占编制 ${incomingRate}%`, "clock", "warm")}
      ${renderRegionKpiCard("空岗率", `${vacancyRate}%`, "实时口径", "chart", "risk strong")}
      <article class="region-pressure-card">
        <div class="region-pressure-head">
          <div>
            <p class="section-kicker">压力分布洞察</p>
            <h3>子区压力分层</h3>
          </div>
          <span aria-hidden="true">${getDashboardIcon("chart")}</span>
        </div>
        <div class="region-pressure-buckets">
          ${renderPressureBucket("高压子区", pressureCounts.high, "high")}
          ${renderPressureBucket("中压子区", pressureCounts.medium, "medium")}
          ${renderPressureBucket("平稳子区", pressureCounts.stable, "stable")}
        </div>
        <p class="region-focus-note">${focusNote}</p>
      </article>
    </section>

    <section class="region-top-vacancy-card">
      <div class="region-section-heading">
        <div>
          <p class="section-kicker">空岗率 TOP3</p>
          <h3>空岗率 TOP3（地区经理席位）</h3>
        </div>
        <button class="region-link-button" type="button" data-subarea-filter="all">查看全部 ></button>
      </div>
      <div class="top-vacancy-grid">
        ${topVacancies.map((item, index) => renderTopVacancyCard(item, index + 1)).join("") || `<div class="empty-state">暂无子区空岗数据。</div>`}
      </div>
    </section>

    <section class="region-subarea-panel">
      <div class="subarea-toolbar">
        <div class="subarea-tabs" aria-label="子区筛选">
          ${renderSubareaTab("all", `全部（${subareas.length}）`)}
          ${renderSubareaTab("high", `高压（${pressureCounts.high}）`)}
          ${renderSubareaTab("medium", `中压（${pressureCounts.medium}）`)}
          ${renderSubareaTab("stable", `平稳（${pressureCounts.stable}）`)}
          ${renderSubareaTab("dm-vacant", `有地区经理缺口（${pressureCounts.withVacancy}）`)}
        </div>
        <label class="subarea-sort">
          <span>排序</span>
          <select data-subarea-sort aria-label="子区排序">
            ${renderSortOption("vacancy-rate", "按空岗率排序")}
            ${renderSortOption("vacant", "按空岗人数排序")}
            ${renderSortOption("incoming", "按待入职排序")}
            ${renderSortOption("name", "按子区名称排序")}
          </select>
        </label>
      </div>
      <div class="region-section-heading subarea-list-heading">
        <div>
          <p class="section-kicker">子区清单</p>
          <h3>子区管理总览</h3>
        </div>
        <span>筛选结果 ${sortedSubareas.length} 个子区</span>
      </div>
      <div class="subarea-list">
        <div class="subarea-list-head" aria-hidden="true">
          <span>子区名称 / 大区经理</span>
          <span>地区经理配置（覆盖率）</span>
          <span>编制 / 在岗 / 空岗</span>
          <span>在岗率</span>
          <span>当前压力</span>
          <span>操作</span>
        </div>
        ${sortedSubareas.map((item) => renderSubareaRow(item)).join("") || `<div class="empty-state">当前筛选下没有匹配的子区。</div>`}
      </div>
      <p class="region-command-tip">提示：点击“查看明细”会进入地区经理二级页，并定位到对应子区。</p>
    </section>
  `;
}

function renderRegionKpiCard(label, value, note, icon, tone = "") {
  return `
    <article class="region-kpi-card ${tone ? `tone-${tone}` : ""}">
      <span class="region-kpi-icon" aria-hidden="true">${getDashboardIcon(icon)}</span>
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${note}</p>
    </article>
  `;
}

function renderPressureBucket(label, value, tone) {
  return `<div class="pressure-bucket tone-${tone}"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderTopVacancyCard(item, rank) {
  return `
    <article class="top-vacancy-card tone-${item.pressure.tone}">
      <span class="top-rank">${rank}</span>
      <div class="top-vacancy-main">
        <strong>${escapeHtml(item.name)}</strong>
        <p>空缺 ${item.vacant} / 编制 ${item.totalSeats || "暂无"}</p>
        <div class="subarea-progress"><span style="width:${item.vacancyRate}%"></span></div>
      </div>
      <b>${item.vacancyRate}%</b>
    </article>
  `;
}

function renderSubareaTab(value, label) {
  const active = regionOverviewState.filter === value ? "active" : "";
  return `<button class="subarea-tab ${active}" type="button" data-subarea-filter="${value}">${label}</button>`;
}

function renderSortOption(value, label) {
  const selected = regionOverviewState.sort === value ? "selected" : "";
  return `<option value="${value}" ${selected}>${label}</option>`;
}

function renderSubareaRow(item) {
  return `
    <article class="subarea-row tone-${item.pressure.tone}">
      <div class="subarea-identity">
        <span class="pressure-dot"></span>
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <p>${escapeHtml(item.regionalManagerName)}</p>
        </div>
      </div>
      <div class="subarea-config">
        <div class="subarea-config-copy">
          <strong>地区经理：${item.totalSeats || "暂无"} 席</strong>
          <div class="subarea-mini-stats">
            <span class="is-active">到位 ${item.active}</span>
            <span class="is-vacant">空缺 ${item.vacant}</span>
            <span>待入职 ${item.incoming}</span>
          </div>
        </div>
        <div class="coverage-ring" style="--coverage:${item.coverageRate}%">
          <strong>${item.coverageRate}%</strong>
          <span>覆盖率</span>
        </div>
      </div>
      <div class="subarea-seat-count">编 ${item.totalSeats || "-"} / 在 ${item.active} / 空 ${item.vacant}</div>
      <div class="subarea-vacancy-rate">
        <strong>${item.coverageRate}%</strong>
        <div class="subarea-progress"><span style="width:${item.coverageRate}%"></span></div>
      </div>
      <div><span class="pressure-pill tone-${item.pressure.tone}">${item.pressure.label}</span></div>
      <button class="subarea-detail-button" type="button" data-subarea-detail="${escapeHtml(item.name)}">查看明细</button>
    </article>
  `;
}

function buildRegionSubareaRows(region) {
  const areas = new Map();

  region.rosterRegionalManagers.forEach((item) => {
    const name = item.areaName || "未归类子区";
    if (!areas.has(name)) {
      areas.set(name, createSubareaDraft(name));
    }
    areas.get(name).regionalManager = item;
  });

  region.rosterDistrictManagers.forEach((item) => {
    const name = item.areaName || "未归类子区";
    if (!areas.has(name)) {
      areas.set(name, createSubareaDraft(name));
    }
    areas.get(name).districtManagers.push(item);
  });

  return Array.from(areas.values()).map((draft) => normalizeSubareaRow(region, draft));
}

function createSubareaDraft(name) {
  return {
    name,
    regionalManager: null,
    districtManagers: []
  };
}

function normalizeSubareaRow(region, draft) {
  const districtTitles = new Set(draft.districtManagers.map((item) => item.title));
  const incoming = region.positions.filter((item) =>
    item.level === T.dm &&
    item.status === T.incoming &&
    districtTitles.has(item.title)
  ).length;
  const rawVacant = draft.districtManagers.filter((item) => item.isVacant).length;
  const totalSeats = draft.districtManagers.length;
  const active = draft.districtManagers.filter((item) => !item.isVacant).length;
  const vacant = Math.max(0, rawVacant - incoming);
  const coverageRate = computeReadiness(totalSeats, active);
  const vacancyRate = computeReadiness(totalSeats, vacant);
  const regionalManagerName = draft.regionalManager?.isVacant
    ? "人员空缺"
    : (draft.regionalManager?.managerName || "人员空缺");
  const pressure = getSubareaPressure(vacancyRate);

  return {
    name: draft.name,
    regionalManagerName,
    totalSeats,
    active,
    vacant,
    incoming,
    coverageRate,
    vacancyRate,
    pressure
  };
}

function getSubareaPressure(vacancyRate) {
  if (vacancyRate >= 40) {
    return { label: "高压", tone: "high" };
  }
  if (vacancyRate >= 20) {
    return { label: "中压", tone: "medium" };
  }
  return { label: "平稳", tone: "stable" };
}

function countSubareaPressure(subareas) {
  return subareas.reduce((result, item) => {
    result[item.pressure.tone] += 1;
    if (item.vacant > 0) {
      result.withVacancy += 1;
    }
    return result;
  }, { high: 0, medium: 0, stable: 0, withVacancy: 0 });
}

function filterRegionSubareas(subareas) {
  return subareas.filter((item) => {
    if (regionOverviewState.filter === "all") {
      return true;
    }
    if (regionOverviewState.filter === "dm-vacant") {
      return item.vacant > 0;
    }
    return item.pressure.tone === regionOverviewState.filter;
  });
}

function sortRegionSubareas(subareas) {
  return [...subareas].sort((left, right) => {
    if (regionOverviewState.sort === "vacant") {
      return right.vacant - left.vacant || right.vacancyRate - left.vacancyRate;
    }
    if (regionOverviewState.sort === "incoming") {
      return right.incoming - left.incoming || right.vacancyRate - left.vacancyRate;
    }
    if (regionOverviewState.sort === "name") {
      return left.name.localeCompare(right.name, "zh-CN");
    }
    return right.vacancyRate - left.vacancyRate || right.vacant - left.vacant;
  });
}

function bindRegionCommandOverviewEvents(region) {
  const homeButton = detailHero.querySelector("[data-region-home]");
  if (homeButton) {
    homeButton.addEventListener("click", renderOverview);
  }

  detailHero.querySelectorAll("[data-subarea-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      regionOverviewState.filter = button.dataset.subareaFilter;
      showDetail(region.key);
    });
  });

  const sortSelect = detailHero.querySelector("[data-subarea-sort]");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      regionOverviewState.sort = sortSelect.value;
      showDetail(region.key);
    });
  }

  detailHero.querySelectorAll("[data-subarea-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      activeSubareaName = button.dataset.subareaDetail;
      pendingDistrictAreaFocus = activeSubareaName;
      showDistrictManagerPage(region.key, activeSubareaName);
    });
  });
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

function showDistrictManagerPage(regionKey, subareaName = activeSubareaName || pendingDistrictAreaFocus) {
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

  const resolvedSubareaName = resolveSubareaName(region, subareaName);
  if (resolvedSubareaName) {
    activeSubareaName = resolvedSubareaName;
    renderDistrictSubareaDetailPage(region, resolvedSubareaName);
    pendingDistrictAreaFocus = null;
    return;
  }

  activeSubareaName = null;
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

  districtManagerHero.className = "detail-hero";
  districtManagerHero.innerHTML = `<div class="detail-summary"><p class="section-kicker">花名册概览</p><h3>${region.key}</h3><p>这里集中展示该区域的地区经理姓名、岗位状态、所属大区以及具体负责地区，让详情页继续保持只看招聘进展。</p><div class="subregion-tags"><span>已配置 ${configuredCount}</span><span>待招 ${vacantCount}</span><span>所属大区 ${areaCount}</span></div></div><div class="detail-aside recruitment-progress-panel"><p class="section-kicker">查看口径</p><div class="recruitment-progress-list">${areaProgressRows}</div></div>`;
  districtManagerPageTitle.textContent = `${region.key}地区经理花名册`;
  districtManagerPageTitle.closest(".panel-heading")?.querySelector(".section-kicker") && (districtManagerPageTitle.closest(".panel-heading").querySelector(".section-kicker").textContent = "花名册");
  districtManagerPageRoster.className = "roster-grid";
  districtManagerPageRoster.innerHTML = renderDistrictManagerRoster(region.rosterDistrictManagers);
  districtManagerPageRoster.querySelectorAll("[data-district-key]").forEach((row) => {
    row.addEventListener("click", () => showSpecialistPage(region.key, row.dataset.districtKey));
  });

  if (pendingDistrictAreaFocus) {
    const focusedArea = Array.from(districtManagerPageRoster.querySelectorAll("[data-area-name]"))
      .find((section) => section.dataset.areaName === pendingDistrictAreaFocus);
    if (focusedArea) {
      focusedArea.classList.add("district-group-focused");
      window.setTimeout(() => focusedArea.scrollIntoView({ block: "start", behavior: "smooth" }), 120);
    }
    pendingDistrictAreaFocus = null;
  }
}

function renderDistrictSubareaDetailPage(region, subareaName) {
  document.body.classList.remove("candidate-workbench-active");
  if (dashboardGrid) {
    dashboardGrid.classList.add("overview-full");
  }
  if (sidebar) {
    sidebar.classList.add("hidden");
  }

  const allRows = normalizeDistrictDetailData(region, subareaName);
  const filteredRows = sortDistrictDetailRows(filterDistrictDetailRows(allRows));
  const summary = buildDistrictDetailSummary(allRows);

  viewKicker.textContent = `区域详情 / ${region.key} / ${subareaName}`;
  viewTitle.textContent = `${subareaName}｜地区经理与代表编制明细`;
  backButton.textContent = `返回${region.key}子区总览`;
  backButton.classList.remove("hidden");
  overviewView.classList.remove("active");
  interviewDetailView.classList.remove("active");
  detailView.classList.remove("active");
  regionalManagerView.classList.remove("active");
  districtManagerView.classList.add("active");
  specialistView.classList.remove("active");

  districtManagerHero.className = "district-detail-dashboard";
  districtManagerHero.innerHTML = renderDistrictDetailOverview(region, subareaName, allRows, summary);
  districtManagerPageTitle.textContent = "地区清单明细";
  const headingKicker = districtManagerPageTitle.closest(".panel-heading")?.querySelector(".section-kicker");
  if (headingKicker) {
    headingKicker.textContent = "地区清单";
  }
  districtManagerPageRoster.className = "district-detail-table-shell";
  districtManagerPageRoster.innerHTML = renderDistrictDetailTable(filteredRows, allRows.length);
  bindDistrictDetailEvents(region, subareaName);
}

function resolveSubareaName(region, subareaName) {
  const target = String(subareaName || "").trim();
  if (!target) {
    return "";
  }

  const names = [
    ...region.rosterRegionalManagers.map((item) => item.areaName),
    ...region.rosterDistrictManagers.map((item) => item.areaName),
    ...region.specialistAssignments.map((item) => item.areaName)
  ].filter(Boolean);
  const uniqueNames = [...new Set(names)];
  return uniqueNames.find((name) => name === target)
    || uniqueNames.find((name) => normalizeLooseText(name) === normalizeLooseText(target))
    || target;
}

function normalizeLooseText(value) {
  return String(value || "").replace(/\s+/g, "").replace(/[（）()]/g, "");
}

function normalizeDistrictDetailData(region, subareaName) {
  const assignmentMap = new Map();
  region.specialistAssignments
    .filter((item) => item.areaName === subareaName)
    .forEach((assignment) => {
      const districtKey = buildSpecialistDistrictMergeKey(assignment);
      const existing = assignmentMap.get(districtKey);
      assignmentMap.set(
        districtKey,
        existing ? mergeSpecialistAssignments(existing, assignment) : assignment
      );
    });

  const specialistRows = Array.from(assignmentMap.values())
    .map((assignment, index) => normalizeDistrictDetailRow(region, subareaName, null, assignment, index))
    .sort((left, right) => left.districtName.localeCompare(right.districtName, "zh-CN"));

  const specialistDistrictKeys = new Set(specialistRows.map((item) => normalizeLooseText(item.districtName)));
  const rosterRows = region.rosterDistrictManagers
    .filter((item) => item.areaName === subareaName)
    .filter((item) => !specialistDistrictKeys.has(normalizeLooseText(item.title)))
    .map((manager, index) => normalizeDistrictDetailRow(region, subareaName, manager, null, index));

  return [...specialistRows, ...rosterRows]
    .sort((left, right) => left.districtName.localeCompare(right.districtName, "zh-CN"));
}

function buildSpecialistDistrictMergeKey(assignment) {
  return [
    normalizeLooseText(assignment?.topRegion),
    normalizeLooseText(assignment?.areaName),
    normalizeLooseText(assignment?.territory)
  ].join("__");
}

function mergeSpecialistAssignments(left, right) {
  const primary = chooseSpecialistAssignmentPrimary(left, right);
  const secondary = primary === left ? right : left;
  const specialists = mergeSpecialistRows(secondary?.specialists || [], primary?.specialists || []);

  return {
    ...primary,
    isVacant: Boolean(primary?.isVacant) && Boolean(secondary?.isVacant),
    managerName: !primary?.isVacant ? primary?.managerName : (secondary?.managerName || primary?.managerName),
    rawManagerName: !primary?.isVacant ? primary?.rawManagerName : (secondary?.rawManagerName || primary?.rawManagerName),
    specialists
  };
}

function chooseSpecialistAssignmentPrimary(left, right) {
  if (Boolean(left?.isVacant) !== Boolean(right?.isVacant)) {
    return left?.isVacant ? right : left;
  }
  const leftCount = left?.specialists?.length || 0;
  const rightCount = right?.specialists?.length || 0;
  return rightCount > leftCount ? right : left;
}

function mergeSpecialistRows(...groups) {
  const specialistMap = new Map();
  groups.flat().forEach((specialist) => {
    const key = normalizeLooseText(specialist?.rawName || specialist?.name) || `vacant-${specialistMap.size}`;
    if (!specialistMap.has(key)) {
      specialistMap.set(key, {
        ...specialist,
        hospitals: uniqueTextArray(specialist?.hospitals || [])
      });
      return;
    }

    const existing = specialistMap.get(key);
    specialistMap.set(key, {
      ...existing,
      isVacant: Boolean(existing.isVacant) && Boolean(specialist?.isVacant),
      onboardDate: existing.onboardDate || specialist?.onboardDate,
      hospitals: uniqueTextArray([...(existing.hospitals || []), ...(specialist?.hospitals || [])])
    });
  });

  return Array.from(specialistMap.values())
    .sort((left, right) => (left.name || left.rawName || "").localeCompare(right.name || right.rawName || "", "zh-CN"));
}

function normalizeDistrictDetailRow(region, subareaName, manager, specialistEntry, index) {
  const key = manager ? buildDistrictManagerKey(manager) : (specialistEntry?.key || `${subareaName}-${index}`);
  const districtName = manager?.title || specialistEntry?.territory || "未识别地区";
  const managerName = manager?.isVacant || specialistEntry?.isVacant
    ? "人员空缺"
    : (manager?.managerName || specialistEntry?.managerName || "人员空缺");
  const managerPosition = manager ? findDistrictManagerPosition(region, manager) : null;
  const managerStatus = getDistrictManagerStatus(manager, managerPosition, specialistEntry);
  const specialists = specialistEntry?.specialists || [];
  const hasRepData = specialists.length > 0;
  const repHeadcount = hasRepData ? specialists.length : null;
  const repOnboard = hasRepData ? specialists.filter((item) => !item.isVacant).length : null;
  const repVacancy = hasRepData ? specialists.filter((item) => item.isVacant).length : null;
  const pendingOnboard = countDistrictPendingOnboard(region, manager);
  const pendingInterview = countDistrictPendingInterview(region, subareaName, manager || specialistEntry);
  const vacancyRate = hasRepData ? computeReadiness(repHeadcount, repVacancy) : null;
  const onboardRate = hasRepData ? computeReadiness(repHeadcount, repOnboard) : null;
  const pressure = getDistrictRepPressure(vacancyRate);

  return {
    key,
    regionKey: region.key,
    sourceRegion: manager?.topRegion || specialistEntry?.topRegion || "",
    subareaName,
    districtName,
    managerName,
    managerStatus,
    repHeadcount,
    repOnboard,
    repVacancy,
    pendingOnboard,
    pendingInterview,
    vacancyRate,
    onboardRate,
    pressure
  };
}

function findSpecialistAssignmentForManager(region, manager) {
  const key = buildDistrictManagerKey(manager);
  return region.specialistAssignments.find((item) => item.key === key)
    || region.specialistAssignments.find((item) =>
      item.areaName === manager.areaName
      && normalizeLooseText(item.territory) === normalizeLooseText(manager.title)
      && normalizeLooseText(item.rawManagerName || item.managerName) === normalizeLooseText(manager.rawManagerName || manager.managerName)
    )
    || region.specialistAssignments.find((item) =>
      item.areaName === manager.areaName
      && normalizeLooseText(item.territory) === normalizeLooseText(manager.title)
    );
}

function findDistrictManagerPosition(region, manager) {
  return region.positions.find((item) =>
    item.level === T.dm
    && item.region === manager.topRegion
    && normalizeLooseText(item.title) === normalizeLooseText(manager.title)
  );
}

function getDistrictManagerStatus(manager, position, specialistEntry) {
  const statusText = normalizeLooseText([
    manager?.managerName,
    manager?.rawManagerName,
    manager?.status,
    manager?.remark,
    specialistEntry?.managerName,
    specialistEntry?.rawManagerName,
    specialistEntry?.status,
    position?.status,
    position?.progress,
    position?.remark
  ].filter(Boolean).join(" "));
  const managerText = normalizeLooseText(manager?.managerName || manager?.rawManagerName || specialistEntry?.managerName || specialistEntry?.rawManagerName || "");
  const vacant = manager?.isVacant || specialistEntry?.isVacant || /^(|待招|人员空缺|暂无|未配置|空缺|-|——)$/.test(managerText);

  if (statusText.includes("待入职") || position?.status === T.incoming) {
    return { label: "待入职", tone: "pending" };
  }
  if (statusText.includes("招聘中") || statusText.includes("在招") || statusText.includes("面试中") || statusText.includes("Offer中")) {
    return { label: "招聘中", tone: "warning" };
  }
  if (!manager && specialistEntry && !specialistEntry.isVacant) {
    return { label: "已到位", tone: "success" };
  }
  if (vacant || !manager) {
    return { label: "空缺", tone: "danger" };
  }
  if (position && position.status !== T.done && position.status) {
    return { label: "招聘中", tone: "warning" };
  }
  return { label: "已到位", tone: "success" };
}

function countDistrictPendingOnboard(region, manager) {
  if (!manager) {
    return 0;
  }
  return region.positions.filter((item) =>
    item.level === T.dm
    && item.status === T.incoming
    && item.region === manager.topRegion
    && normalizeLooseText(item.title) === normalizeLooseText(manager.title)
  ).length;
}

function countDistrictPendingInterview(region, subareaName, managerLike) {
  const candidates = interviewBoards.flatMap((board) =>
    (board.rows || []).map((row, index) => normalizeCandidate(row, index, board.id))
  );
  return candidates.filter((candidate) => matchesDistrictCandidate(region, subareaName, managerLike, candidate)).length;
}

function matchesDistrictCandidate(region, subareaName, managerLike, candidate) {
  const candidateRegion = String(candidate.region || "");
  const regionMatches = region.sourceRegions.includes(candidateRegion)
    || candidateRegion === region.key
    || (region.key === T.east && candidateRegion.startsWith("东"));
  if (!regionMatches) {
    return false;
  }

  const text = normalizeLooseText([
    candidate.territory,
    candidate.city,
    candidate.market,
    candidate.position,
    candidate.notes
  ].filter(Boolean).join(" "));
  const districtTokens = getDistrictMatchTokens(managerLike?.title || managerLike?.territory || "");
  const subareaTokens = getDistrictMatchTokens(subareaName);
  const validDistrictTokens = districtTokens.filter((token) => token.length >= 2);
  if (validDistrictTokens.length) {
    return validDistrictTokens.some((token) => text.includes(token));
  }
  return subareaTokens.some((token) => token.length >= 2 && text.includes(token));
}

function getDistrictMatchTokens(value) {
  const normalized = normalizeLooseText(value);
  const withoutSuffix = normalized.replace(/地区|大区|区域|片区/g, "");
  const tokens = [normalized, withoutSuffix];
  if (withoutSuffix.length > 2) {
    tokens.push(withoutSuffix.slice(0, 2));
  }
  return [...new Set(tokens.filter(Boolean))];
}

function getDistrictRepPressure(vacancyRate) {
  if (vacancyRate === null || vacancyRate === undefined) {
    return { label: "暂无数据", tone: "neutral" };
  }
  if (vacancyRate >= 40) {
    return { label: "高压", tone: "high" };
  }
  if (vacancyRate >= 20) {
    return { label: "中压", tone: "medium" };
  }
  return { label: "平稳", tone: "stable" };
}

function buildDistrictDetailSummary(rows) {
  const districtCount = rows.length;
  const managerSeats = districtCount;
  const managerActive = rows.filter((item) => item.managerStatus.label === "已到位").length;
  const managerIncoming = rows.filter((item) => item.managerStatus.label === "待入职").length;
  const managerVacant = rows.filter((item) => ["空缺", "招聘中"].includes(item.managerStatus.label)).length;
  const repRows = rows.filter((item) => item.repHeadcount !== null);
  const repHeadcount = repRows.reduce((sum, item) => sum + Number(item.repHeadcount || 0), 0);
  const repOnboard = repRows.reduce((sum, item) => sum + Number(item.repOnboard || 0), 0);
  const repVacancy = repRows.reduce((sum, item) => sum + Number(item.repVacancy || 0), 0);
  const pendingOnboard = rows.reduce((sum, item) => sum + Number(item.pendingOnboard || 0), 0);
  const pendingInterview = rows.reduce((sum, item) => sum + Number(item.pendingInterview || 0), 0);
  const vacancyRate = repHeadcount ? computeReadiness(repHeadcount, repVacancy) : null;
  const onboardRate = repHeadcount ? computeReadiness(repHeadcount, repOnboard) : null;
  const pressureCounts = rows.reduce((result, item) => {
    result[item.pressure.tone] = (result[item.pressure.tone] || 0) + 1;
    return result;
  }, { high: 0, medium: 0, stable: 0, neutral: 0 });

  return {
    districtCount,
    managerSeats,
    managerActive,
    managerIncoming,
    managerVacant,
    repHeadcount,
    repOnboard,
    repVacancy,
    pendingOnboard,
    pendingInterview,
    vacancyRate,
    onboardRate,
    pressureCounts
  };
}

function renderDistrictDetailOverview(region, subareaName, rows, summary) {
  const topRows = [...rows]
    .filter((item) => item.repHeadcount)
    .sort((left, right) => (right.vacancyRate || 0) - (left.vacancyRate || 0) || (right.repVacancy || 0) - (left.repVacancy || 0))
    .slice(0, 3);
  const highPressureNames = rows
    .filter((item) => item.pressure.tone === "high")
    .map((item) => item.districtName);
  const mediumPressureNames = rows
    .filter((item) => item.pressure.tone === "medium")
    .map((item) => item.districtName);
  const topFocusNames = topRows.map((item) => item.districtName).filter(Boolean).slice(0, 3);
  const allHighPressure = rows.length > 0 && highPressureNames.length === rows.length;
  const focusText = allHighPressure
    ? `当前所有地区均处于高压状态，建议优先补齐在岗率最低的地区代表岗位。${topFocusNames.length ? `建议优先关注：${topFocusNames.join("、")}。` : ""}`
    : (highPressureNames.length
      ? `建议优先关注：${(topFocusNames.length ? topFocusNames : highPressureNames.slice(0, 3)).join("、")}。`
      : (mediumPressureNames.length ? `当前暂无高压地区，建议持续关注中压地区：${mediumPressureNames.slice(0, 3).join("、")}。` : "当前地区代表配置整体平稳。"));

  return `
    <section class="district-detail-titlebar">
      <div>
        <p class="section-kicker">区域详情 / ${escapeHtml(region.key)} / ${escapeHtml(subareaName)}</p>
        <h3>${escapeHtml(subareaName)}｜地区经理与代表编制明细</h3>
      </div>
      <button class="district-inline-back" type="button" data-district-detail-back>← 返回${escapeHtml(region.key)}子区总览</button>
    </section>

    <section class="district-detail-kpis" aria-label="${escapeHtml(subareaName)}概览指标">
      ${renderDistrictDetailKpi("地区数", summary.districtCount, "个地区", "briefcase")}
      ${renderDistrictDetailKpi("地区经理席位", summary.managerSeats, "席", "users")}
      ${renderDistrictDetailKpi("地区经理到位", summary.managerActive, `占比 ${computeReadiness(summary.managerSeats, summary.managerActive)}%`, "people", "healthy")}
      ${renderDistrictDetailKpi("地区经理空缺", summary.managerVacant, `占比 ${computeReadiness(summary.managerSeats, summary.managerVacant)}%`, "search", "risk")}
      ${renderDistrictDetailKpi("代表总编制", formatNullableNumber(summary.repHeadcount), "人", "briefcase")}
      ${renderDistrictDetailKpi("代表在岗", formatNullableNumber(summary.repOnboard), `占比 ${formatNullablePercent(computeRate(summary.repHeadcount, summary.repOnboard))}`, "users", "healthy")}
      ${renderDistrictDetailKpi("代表空岗", formatNullableNumber(summary.repVacancy), "待补齐岗位", "search", "risk")}
      ${renderDistrictDetailKpi("待入职", summary.pendingOnboard, `占比 ${formatNullablePercent(computeRate(summary.repHeadcount, summary.pendingOnboard))}`, "clock", "warm")}
      ${renderDistrictDetailKpi("代表在岗率", formatNullablePercent(summary.onboardRate), "实时口径", "chart", summary.onboardRate !== null && summary.onboardRate < 60 ? "risk strong" : "healthy")}
    </section>

    <section class="district-detail-insight-grid">
      <article class="district-insight-card">
        <div class="region-section-heading">
          <div>
            <p class="section-kicker">代表空岗 TOP3</p>
            <h3>代表空岗最严重地区</h3>
          </div>
          <button class="region-link-button" type="button" data-district-filter-reset>查看全部 ></button>
        </div>
        <div class="district-top-list">
          ${topRows.map((item, index) => renderDistrictTopRow(item, index + 1)).join("") || `<div class="empty-state">当前子区暂无代表编制数据。</div>`}
        </div>
      </article>

      <article class="district-insight-card">
        <div class="region-section-heading">
          <div>
            <p class="section-kicker">压力分布洞察</p>
            <h3>地区压力分层</h3>
          </div>
          <span class="district-insight-icon">${getDashboardIcon("chart")}</span>
        </div>
        <div class="district-pressure-strip">
          ${renderPressureBucket("高压地区", summary.pressureCounts.high || 0, "high")}
          ${renderPressureBucket("中压地区", summary.pressureCounts.medium || 0, "medium")}
          ${renderPressureBucket("平稳地区", summary.pressureCounts.stable || 0, "stable")}
        </div>
        <p class="region-focus-note"><strong>本周管理建议：</strong>${escapeHtml(focusText)}</p>
      </article>

      <article class="district-alert-card">
        <div>
          <p class="section-kicker">关键提醒</p>
          <h3>需要盯住的事项</h3>
        </div>
        <div class="district-alert-list">
          ${renderDistrictAlert("地区经理空缺", `${summary.managerVacant} 个地区经理岗位缺口`, "risk")}
          ${renderDistrictAlert("高压地区", allHighPressure ? `当前所有地区均高压，优先关注：${topFocusNames.join("、") || "TOP3地区"}` : `${summary.pressureCounts.high || 0} 个地区代表在岗率 <= 60%`, "warm")}
          ${renderDistrictAlert("待入职待跟进", `${summary.pendingOnboard} 人即将入职，请及时跟进`, "blue")}
        </div>
      </article>
    </section>

    ${renderDistrictDetailFilters()}
  `;
}

function renderDistrictDetailKpi(label, value, note, icon, tone = "") {
  return `
    <article class="district-kpi-card ${tone ? `tone-${tone}` : ""}">
      <span class="region-kpi-icon" aria-hidden="true">${getDashboardIcon(icon)}</span>
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${note}</p>
    </article>
  `;
}

function renderDistrictTopRow(item, rank) {
  return `
    <div class="district-top-row tone-${item.pressure.tone}">
      <span class="top-rank">${rank}</span>
      <div>
        <strong>${escapeHtml(item.districtName)}</strong>
        <p>空岗 ${formatNullableNumber(item.repVacancy)} / 编制 ${formatNullableNumber(item.repHeadcount)}</p>
      </div>
      <div class="district-rate-cell">
        <b>在岗率 ${formatNullablePercent(item.onboardRate)}</b>
        <div class="subarea-progress"><span style="width:${getRateWidth(item.onboardRate)}%"></span></div>
      </div>
    </div>
  `;
}

function renderDistrictAlert(title, text, tone) {
  return `<div class="district-alert-item tone-${tone}"><strong>${title}</strong><span>${text}</span></div>`;
}

function renderDistrictDetailFilters() {
  return `
    <section class="district-filter-panel">
      <div class="district-filter-head">
        <div>
          <p class="section-kicker">快速筛选</p>
          <h3>按状态与压力聚焦地区</h3>
        </div>
        <button class="candidate-clear-button" type="button" data-district-filter-reset>重置筛选</button>
      </div>
      <div class="district-filter-grid">
        ${renderDistrictFilterSelect("managerStatus", "地区经理状态", [
          ["all", "全部"],
          ["已到位", "已到位"],
          ["招聘中", "招聘中"],
          ["空缺", "空缺"],
          ["待入职", "待入职"]
        ])}
        ${renderDistrictFilterSelect("pressure", "当前压力", [
          ["all", "全部"],
          ["high", "高压"],
          ["medium", "中压"],
          ["stable", "平稳"]
        ])}
        ${renderDistrictFilterSelect("vacancyBand", "代表在岗率", [
          ["all", "全部"],
          ["high", "<=60%"],
          ["medium", "61%-79%"],
          ["stable", ">=80%"]
        ])}
        ${renderDistrictFilterSelect("sort", "排序", [
          ["vacancy-rate", "按代表在岗率排序"],
          ["vacancy-count", "按代表空岗人数排序"],
          ["name", "按地区名称排序"],
          ["manager-status", "按地区经理状态排序"]
        ])}
      </div>
    </section>
  `;
}

function renderDistrictFilterSelect(key, label, options) {
  return `
    <label class="candidate-filter-select district-filter-select">
      <span>${label}</span>
      <select data-district-filter="${key}">
        ${options.map(([value, text]) => `<option value="${value}" ${districtDetailState[key] === value ? "selected" : ""}>${text}</option>`).join("")}
      </select>
    </label>
  `;
}

function filterDistrictDetailRows(rows) {
  return rows.filter((item) => {
    if (districtDetailState.managerStatus !== "all" && item.managerStatus.label !== districtDetailState.managerStatus) {
      return false;
    }
    if (districtDetailState.pressure !== "all" && item.pressure.tone !== districtDetailState.pressure) {
      return false;
    }
    if (districtDetailState.vacancyBand !== "all" && item.pressure.tone !== districtDetailState.vacancyBand) {
      return false;
    }
    return true;
  });
}

function sortDistrictDetailRows(rows) {
  return [...rows].sort((left, right) => {
    if (districtDetailState.sort === "vacancy-count") {
      return (right.repVacancy || 0) - (left.repVacancy || 0) || (right.vacancyRate || 0) - (left.vacancyRate || 0);
    }
    if (districtDetailState.sort === "name") {
      return left.districtName.localeCompare(right.districtName, "zh-CN");
    }
    if (districtDetailState.sort === "manager-status") {
      const rank = { "空缺": 4, "招聘中": 3, "待入职": 2, "已到位": 1 };
      return (rank[right.managerStatus.label] || 0) - (rank[left.managerStatus.label] || 0);
    }
    return compareNullableNumber(left.onboardRate, right.onboardRate, false) || (right.repVacancy || 0) - (left.repVacancy || 0);
  });
}

function renderDistrictDetailTable(rows, totalCount) {
  if (!rows.length) {
    return `<div class="candidate-empty-state">${candidateIcon("search")}<strong>没有匹配的地区</strong><span>请调整筛选条件后重试。</span></div>`;
  }

  return `
    <div class="district-table-meta">共 ${totalCount} 个地区，当前显示 ${rows.length} 个</div>
    <div class="district-detail-table">
      <div class="district-detail-table-head">
        <span>地区名称</span>
        <span>地区经理</span>
        <span>地区经理状态</span>
        <span>代表配置（编制 / 在岗 / 空岗 / 待入职 / 待面试）</span>
        <span>代表在岗率</span>
        <span>当前压力</span>
        <span>操作</span>
      </div>
      <div class="district-detail-table-body">
        ${rows.map((item) => renderDistrictDetailRow(item)).join("")}
      </div>
    </div>
  `;
}

function renderDistrictDetailRow(item) {
  return `
    <article class="district-detail-row tone-${item.pressure.tone}">
      <div class="district-detail-name">
        <span class="pressure-dot"></span>
        <div>
          <strong>${escapeHtml(item.districtName)}</strong>
          <p>子区：${escapeHtml(item.subareaName)}</p>
        </div>
      </div>
      <div class="district-manager-name">${escapeHtml(item.managerName)}</div>
      <div>${renderManagerStatusBadge(item.managerStatus)}</div>
      <div class="rep-stat-grid">
        ${renderRepStat("编制", item.repHeadcount, "blue")}
        ${renderRepStat("在岗", item.repOnboard, "green")}
        ${renderRepStat("空岗", item.repVacancy, "red")}
        ${renderRepStat("待入职", item.pendingOnboard, "orange")}
        ${renderRepStat("待面试", item.pendingInterview, "purple")}
      </div>
      <div class="district-rate-cell">
        <b>${formatNullablePercent(item.onboardRate)}</b>
        <div class="subarea-progress"><span style="width:${getRateWidth(item.onboardRate)}%"></span></div>
      </div>
      <div>${renderDistrictPressureBadge(item.pressure)}</div>
      <button class="district-job-button" type="button" data-region-key="${escapeHtml(item.regionKey)}" data-subarea-name="${escapeHtml(item.subareaName)}" data-district-name="${escapeHtml(item.districtName)}" data-district-key="${escapeHtml(item.key)}">查看岗位</button>
    </article>
  `;
}

function renderRepStat(label, value, tone) {
  return `<span class="rep-stat tone-${tone}"><small>${label}</small><strong>${formatNullableNumber(value)}</strong></span>`;
}

function renderManagerStatusBadge(status) {
  return `<span class="manager-status-badge tone-${status.tone}">${escapeHtml(status.label)}</span>`;
}

function renderDistrictPressureBadge(pressure) {
  return `<span class="pressure-pill tone-${pressure.tone}">${escapeHtml(pressure.label)}</span>`;
}

function bindDistrictDetailEvents(region, subareaName) {
  districtManagerHero.querySelectorAll("[data-district-detail-back]").forEach((button) => {
    button.addEventListener("click", () => {
      showDetail(region.key);
    });
  });

  districtManagerHero.querySelectorAll("[data-district-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      districtDetailState[select.dataset.districtFilter] = select.value;
      showDistrictManagerPage(region.key, subareaName);
    });
  });

  districtManagerHero.querySelectorAll("[data-district-filter-reset]").forEach((button) => {
    button.addEventListener("click", () => {
      districtDetailState = createDistrictDetailState();
      showDistrictManagerPage(region.key, subareaName);
    });
  });

  districtManagerPageRoster.querySelectorAll("[data-district-key]").forEach((button) => {
    button.addEventListener("click", () => {
      activeSubareaName = button.dataset.subareaName || subareaName;
      showSpecialistPage(button.dataset.regionKey || region.key, button.dataset.districtKey);
    });
  });
}

function formatNullableNumber(value) {
  return value === null || value === undefined ? "暂无" : value;
}

function computeRate(total, value) {
  if (!total && total !== 0) {
    return null;
  }
  if (!total) {
    return null;
  }
  return computeReadiness(total, value || 0);
}

function formatNullablePercent(value) {
  return value === null || value === undefined ? "暂无" : `${value}%`;
}

function getRateWidth(value) {
  return value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
}

function showSpecialistPage(regionKey, districtKey) {
  const previousDistrictKey = activeDistrictManagerKey;
  activeRegionKey = regionKey;
  activeDistrictManagerKey = districtKey;
  currentView = "specialist";
  document.body.classList.remove("candidate-workbench-active");
  if (dashboardGrid) {
    dashboardGrid.classList.add("overview-full");
  }
  if (sidebar) {
    sidebar.classList.add("hidden");
  }
  const region = regionData.find((item) => item.key === regionKey);
  if (!region) {
    return;
  }

  const districtManager = region.rosterDistrictManagers.find((item) => buildDistrictManagerKey(item) === districtKey);
  const specialistEntry = region.specialistAssignments.find((item) => item.key === districtKey);
  const subareaName = districtManager?.areaName || specialistEntry?.areaName || activeSubareaName || "";
  activeSubareaName = subareaName;
  if (previousDistrictKey !== districtKey) {
    specialistCoverageState = createSpecialistCoverageState();
  }
  const context = buildSpecialistCoverageContext(region, districtManager, specialistEntry, districtKey);
  const seats = buildRepSeatRows(context);
  const hospitals = buildHospitalCoverageRows(seats);
  const candidates = context.candidates;
  const summary = buildRepCoverageSummary(seats, hospitals, candidates);

  viewKicker.textContent = "专员子页";
  viewTitle.textContent = `${context.districtName}｜${context.managerName && !context.managerVacant ? `${context.managerName}团队与医院覆盖` : "代表岗位与医院覆盖"}`;
  backButton.textContent = "返回地区经理页";
  backButton.classList.remove("hidden");
  overviewView.classList.remove("active");
  interviewDetailView.classList.remove("active");
  detailView.classList.remove("active");
  regionalManagerView.classList.remove("active");
  districtManagerView.classList.remove("active");
  specialistView.classList.add("active");

  specialistHero.className = "rep-coverage-dashboard";
  specialistHero.innerHTML = renderSpecialistCoverageOverview(context, summary, seats, hospitals);
  specialistPageTitle.textContent = "岗位清单明细";
  const headingKicker = specialistPageTitle.closest(".panel-heading")?.querySelector(".section-kicker");
  if (headingKicker) {
    headingKicker.textContent = "地区经理团队";
  }
  specialistPageList.className = "rep-coverage-shell";
  specialistPageList.innerHTML = renderSpecialistCoverageWorkspace(context, seats, hospitals, candidates);
  bindSpecialistCoverageEvents(context);
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

      return `<section class="district-group" data-area-name="${escapeHtml(areaName)}"><div class="district-group-title"><h4>${areaName}</h4><span>${members.length} 个地区</span></div><div class="district-group-rows">${rows}</div></section>`;
    })
    .join("")}</div>`;
}

function buildSpecialistCoverageContext(region, districtManager, specialistEntry, districtKey) {
  const subareaName = districtManager?.areaName || specialistEntry?.areaName || activeSubareaName || "未归类子区";
  const districtName = districtManager?.title || specialistEntry?.territory || "未识别地区";
  const rawManagerName = districtManager?.rawManagerName || specialistEntry?.rawManagerName || districtManager?.managerName || specialistEntry?.managerName || "";
  const managerName = districtManager?.managerName || specialistEntry?.managerName || "";
  const managerVacant = districtManager?.isVacant || specialistEntry?.isVacant || /^(|待招|人员空缺|暂无|未配置|空缺|-|——)$/.test(normalizeLooseText(rawManagerName || managerName));
  const candidates = getDistrictInterviewCandidates(region, subareaName, { title: districtName, territory: districtName });

  return {
    region,
    regionKey: region.key,
    districtKey,
    sourceRegion: districtManager?.topRegion || specialistEntry?.topRegion || "",
    subareaName,
    districtName,
    managerName: managerVacant ? "" : managerName,
    managerDisplayName: managerVacant ? "人员空缺" : (managerName || "暂无数据"),
    managerVacant,
    specialistEntry,
    specialists: specialistEntry?.specialists || [],
    candidates
  };
}

function getDistrictInterviewCandidates(region, subareaName, managerLike) {
  const candidates = interviewBoards.flatMap((board) =>
    (board.rows || []).map((row, index) => normalizeCandidate(row, index, board.id))
  );
  return candidates.filter((candidate) => matchesDistrictCandidate(region, subareaName, managerLike, candidate));
}

function buildRepSeatRows(context) {
  return context.specialists.map((item, index) => normalizeRepSeat(item, index, context));
}

function normalizeRepSeat(item, index, context) {
  const status = getRepSeatStatus(item);
  const hospitals = uniqueTextArray(item.hospitals || []);
  const joinDate = status.label === "已到位" ? findRepJoinDate(item, context, hospitals) : null;
  const matchedCandidates = context.candidates.filter((candidate) => matchesCandidateToRepSeat(candidate, item, hospitals));
  const hospitalCount = hospitals.length;
  const risk = getRepSeatRisk(status, hospitalCount, matchedCandidates.length);
  const repName = status.label === "空缺" ? "暂无" : (item.name || item.rawName || "暂无数据");

  return {
    id: `${context.districtKey || context.districtName}-${index}-${item.rawName || item.name || "vacant"}`,
    index,
    seatName: `岗位 ${index + 1}`,
    repName,
    rawName: item.rawName || item.name || "",
    status,
    joinDate,
    joinDateText: joinDate ? formatDateShort(joinDate) : "暂无数据",
    tenureText: joinDate ? formatTenure(joinDate) : "暂无数据",
    tenureTag: getTenureTag(joinDate),
    hospitals,
    hospitalCount,
    pendingInterviewCount: matchedCandidates.length,
    candidates: matchedCandidates,
    risk
  };
}

function findRepJoinDate(item, context, hospitals = []) {
  const directDate = parseDateValue(getSpecialistField(item, ["入职时间", "到岗时间", "入职日期", "onboardDate", "joinDate"]));
  if (directDate) {
    return directDate;
  }

  const repKey = normalizeLooseText(item?.rawName || item?.name);
  if (!repKey || /待招|待聘|人员空缺|暂无|未配置|空缺/.test(repKey)) {
    return null;
  }

  const districtKey = normalizeLooseText(context?.districtName);
  const subareaKey = normalizeLooseText(context?.subareaName);
  const hospitalKeys = new Set((hospitals || []).map((hospital) => normalizeLooseText(hospital)).filter(Boolean));
  const matches = [];

  (context?.region?.specialistAssignments || []).forEach((assignment) => {
    const assignmentDistrictKey = normalizeLooseText(assignment.territory);
    const assignmentSubareaKey = normalizeLooseText(assignment.areaName);
    (assignment.specialists || []).forEach((specialist) => {
      const specialistKey = normalizeLooseText(specialist.rawName || specialist.name);
      if (!specialistKey || specialistKey !== repKey) {
        return;
      }

      const candidateDate = parseDateValue(getSpecialistField(specialist, ["入职时间", "到岗时间", "入职日期", "onboardDate", "joinDate"]));
      if (!candidateDate) {
        return;
      }

      const specialistHospitalKeys = new Set((specialist.hospitals || []).map((hospital) => normalizeLooseText(hospital)).filter(Boolean));
      const hospitalHit = [...hospitalKeys].some((key) => specialistHospitalKeys.has(key));
      const score =
        (assignmentDistrictKey && assignmentDistrictKey === districtKey ? 4 : 0)
        + (assignmentSubareaKey && assignmentSubareaKey === subareaKey ? 2 : 0)
        + (hospitalHit ? 1 : 0);

      matches.push({ date: candidateDate, score });
    });
  });

  return matches.sort((left, right) => right.score - left.score)[0]?.date || null;
}

function getSpecialistField(item, aliases) {
  for (const alias of aliases) {
    const value = item?.[alias] ?? item?.raw?.[alias];
    if (value !== undefined && value !== null && String(value).trim()) {
      return value;
    }
  }
  return "";
}

function getRepSeatStatus(item) {
  const text = normalizeLooseText([
    item?.name,
    item?.rawName,
    item?.status,
    item?.progress,
    getSpecialistField(item, ["入职时间", "到岗时间", "入职日期", "onboardDate", "joinDate"])
  ].filter(Boolean).join(" "));
  const isVacantName = !text || item?.isVacant || /待招|待聘|人员空缺|暂无|未配置|空缺/.test(text);

  if (text.includes("待入职")) {
    return { label: "待入职", tone: "pending" };
  }
  if (text.includes("招聘中") || text.includes("在招") || text.includes("面试中") || text.includes("Offer中")) {
    return { label: "招聘中", tone: "warning" };
  }
  if (isVacantName) {
    return { label: "空缺", tone: "danger" };
  }
  return { label: "已到位", tone: "success" };
}

function getRepSeatRisk(status, hospitalCount, pendingInterviewCount) {
  if (status.label === "空缺") {
    return pendingInterviewCount > 0
      ? { label: "中风险", tone: "medium" }
      : { label: "高风险", tone: "high" };
  }
  if (status.label === "招聘中") {
    return { label: "中风险", tone: "medium" };
  }
  if (status.label === "待入职") {
    return { label: "待到岗", tone: "pending" };
  }
  return { label: "稳定", tone: "stable" };
}

function matchesCandidateToRepSeat(candidate, specialist, hospitals) {
  const text = normalizeLooseText([
    candidate.name,
    candidate.position,
    candidate.territory,
    candidate.city,
    candidate.market,
    candidate.notes,
    candidate.company
  ].filter(Boolean).join(" "));
  const nameTokens = getDistrictMatchTokens(specialist?.rawName || specialist?.name || "").filter((token) => token.length >= 2);
  const hospitalTokens = hospitals.flatMap((hospital) => getDistrictMatchTokens(hospital)).filter((token) => token.length >= 2);
  const tokens = [...new Set([...nameTokens, ...hospitalTokens])];
  return tokens.some((token) => text.includes(token));
}

function buildHospitalCoverageRows(seats) {
  const hospitalMap = new Map();
  seats.forEach((seat) => {
    seat.hospitals.forEach((hospital) => {
      const key = normalizeLooseText(hospital) || hospital;
      const current = hospitalMap.get(key);
      const next = normalizeHospitalCoverageRow(hospital, seat);
      if (!current || getHospitalCoverageRank(next.coverageStatus) > getHospitalCoverageRank(current.coverageStatus)) {
        hospitalMap.set(key, next);
      } else if (current) {
        current.relatedSeats.push(seat.seatName);
        current.pendingInterviewCount += seat.pendingInterviewCount;
      }
    });
  });
  return Array.from(hospitalMap.values()).sort((left, right) =>
    getHospitalRiskRank(right.risk.tone) - getHospitalRiskRank(left.risk.tone)
    || right.pendingInterviewCount - left.pendingInterviewCount
    || left.hospitalName.localeCompare(right.hospitalName, "zh-CN")
  );
}

function normalizeHospitalCoverageRow(hospitalName, seat) {
  const coverageStatus = seat.status.label === "已到位"
    ? { label: "已覆盖", tone: "success" }
    : (seat.status.label === "待入职" || seat.status.label === "招聘中"
      ? { label: "待覆盖", tone: "warning" }
      : { label: "未覆盖", tone: "danger" });
  const risk = coverageStatus.label === "已覆盖"
    ? { label: "稳定", tone: "stable" }
    : (seat.pendingInterviewCount > 0 ? { label: "待跟进", tone: "medium" } : { label: "高风险", tone: "high" });

  return {
    id: `${seat.id}-${hospitalName}`,
    hospitalName,
    priority: inferHospitalPriority(hospitalName),
    currentRep: coverageStatus.label === "已覆盖" ? seat.repName : "暂无正式代表",
    coverageStatus,
    relatedSeats: [seat.seatName],
    pendingInterviewCount: seat.pendingInterviewCount,
    risk
  };
}

function inferHospitalPriority(hospitalName) {
  const text = String(hospitalName || "");
  if (/省|大学|肿瘤|人民|附属|一院|第一/.test(text)) {
    return "重点";
  }
  return "常规";
}

function getHospitalCoverageRank(status) {
  const rank = { "已覆盖": 3, "待覆盖": 2, "未覆盖": 1 };
  return rank[status.label] || 0;
}

function getHospitalRiskRank(tone) {
  const rank = { high: 3, medium: 2, stable: 1 };
  return rank[tone] || 0;
}

function buildRepCoverageSummary(seats, hospitals, candidates) {
  const onboardSeats = seats.filter((seat) => seat.status.label === "已到位");
  const validTenureDays = onboardSeats
    .filter((seat) => seat.joinDate)
    .map((seat) => Math.max(0, Math.floor((Date.now() - seat.joinDate.getTime()) / 86400000)));
  const averageTenureDays = validTenureDays.length
    ? Math.round(validTenureDays.reduce((sum, days) => sum + days, 0) / validTenureDays.length)
    : null;
  const riskCounts = seats.reduce((result, seat) => {
    result[seat.risk.tone] = (result[seat.risk.tone] || 0) + 1;
    return result;
  }, { high: 0, medium: 0, pending: 0, stable: 0 });

  return {
    seatCount: seats.length,
    onboardCount: onboardSeats.length,
    vacantCount: seats.filter((seat) => seat.status.label === "空缺" || seat.status.label === "招聘中").length,
    incomingCount: seats.filter((seat) => seat.status.label === "待入职").length,
    pendingInterviewCount: candidates.length,
    hospitalCount: hospitals.length,
    coveredHospitalCount: hospitals.filter((hospital) => hospital.coverageStatus.label === "已覆盖").length,
    uncoveredHospitalCount: hospitals.filter((hospital) => hospital.coverageStatus.label !== "已覆盖").length,
    hospitalCoverageRate: computeRate(hospitals.length, hospitals.filter((hospital) => hospital.coverageStatus.label === "已覆盖").length),
    averageTenureText: averageTenureDays === null ? "暂无数据" : formatDurationDays(averageTenureDays),
    riskCounts
  };
}

function renderSpecialistCoverageOverview(context, summary, seats, hospitals) {
  const topHospitals = hospitals
    .filter((hospital) => hospital.coverageStatus.label !== "已覆盖")
    .sort((left, right) =>
      getHospitalRiskRank(right.risk.tone) - getHospitalRiskRank(left.risk.tone)
      || right.pendingInterviewCount - left.pendingInterviewCount
      || left.hospitalName.localeCompare(right.hospitalName, "zh-CN")
    )
    .slice(0, 3);
  const highRiskSeats = seats.filter((seat) => seat.risk.tone === "high");
  const mediumRiskSeats = seats.filter((seat) => seat.risk.tone === "medium");
  const pendingSeats = seats.filter((seat) => seat.risk.tone === "pending");
  const focusHospitals = topHospitals.map((item) => item.hospitalName).slice(0, 2);
  const watchItems = [
    summary.vacantCount ? `当前 ${summary.vacantCount} 个代表席位未满编` : "",
    summary.uncoveredHospitalCount ? `${summary.uncoveredHospitalCount} 家医院暂无正式覆盖` : "",
    focusHospitals.length ? `优先补位：${focusHospitals.join("、")}` : "当前医院覆盖暂无突出异常"
  ].filter(Boolean);

  return `
    <section class="rep-coverage-titlebar">
      <div>
        <p class="section-kicker">区域详情 / ${escapeHtml(context.subareaName)} / ${escapeHtml(context.districtName)}</p>
        <h3>${escapeHtml(context.districtName)}｜${escapeHtml(context.managerName && !context.managerVacant ? `${context.managerName}团队与医院覆盖` : "代表岗位与医院覆盖")}</h3>
      </div>
      <button class="district-inline-back" type="button" data-specialist-back>← 返回地区经理页</button>
    </section>

    <section class="rep-coverage-kpis" aria-label="${escapeHtml(context.districtName)}代表团队指标">
      ${renderRepCoverageKpi("代表编制", summary.seatCount, "个席位", "briefcase")}
      ${renderRepCoverageKpi("已到位", summary.onboardCount, "个席位", "people", "healthy")}
      ${renderRepCoverageKpi("空缺", summary.vacantCount, "个席位", "users", "risk")}
      ${renderRepCoverageKpi("待入职", summary.incomingCount, "个席位", "clock", "pending")}
      ${renderRepCoverageKpi("待面试", summary.pendingInterviewCount, "个候选人", "search", "pending")}
      ${renderRepCoverageKpi("医院总数", summary.hospitalCount, `已覆盖 ${summary.coveredHospitalCount} / 覆盖率 ${formatNullablePercent(summary.hospitalCoverageRate)}`, "briefcase")}
      ${renderRepCoverageKpi("未覆盖医院", summary.uncoveredHospitalCount, "家医院", "chart", summary.uncoveredHospitalCount ? "risk" : "healthy")}
      ${renderRepCoverageKpi("团队平均司龄", summary.averageTenureText, summary.averageTenureText === "暂无数据" ? "—" : "已到位人员", "timer")}
    </section>

    <section class="rep-coverage-insights">
      <article class="rep-insight-card">
        <div class="region-section-heading">
          <div>
            <p class="section-kicker">空缺岗位影响医院 TOP3</p>
            <h3>空缺岗位影响医院 TOP3</h3>
          </div>
        </div>
        <div class="rep-top-list">
          ${topHospitals.map((item, index) => renderRepHospitalTopItem(item, index + 1)).join("") || `<div class="empty-state">当前暂无未覆盖医院。</div>`}
        </div>
      </article>

      <article class="rep-insight-card">
        <div class="region-section-heading">
          <div>
            <p class="section-kicker">压力分布洞察</p>
            <h3>岗位风险分层</h3>
          </div>
          <span class="district-insight-icon">${getDashboardIcon("chart")}</span>
        </div>
        <div class="district-pressure-strip">
          ${renderPressureBucket("高风险岗位", highRiskSeats.length, "high")}
          ${renderPressureBucket("中风险岗位", mediumRiskSeats.length, "medium")}
          ${renderPressureBucket("待到岗岗位", pendingSeats.length, "pending")}
          ${renderPressureBucket("稳定岗位", summary.riskCounts.stable || 0, "stable")}
        </div>
        <p class="region-focus-note"><strong>管理建议：</strong>${escapeHtml(buildRepCoverageSuggestion(highRiskSeats, mediumRiskSeats, pendingSeats, topHospitals))}</p>
      </article>

      <article class="district-alert-card">
        <div>
          <p class="section-kicker">关键提醒</p>
          <h3>需要盯住的事项</h3>
        </div>
        <div class="district-alert-list">
          ${watchItems.map((item, index) => renderDistrictAlert(index === 0 ? "席位状态" : index === 1 ? "医院覆盖" : "优先动作", item, index === 2 ? "blue" : "risk")).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderRepCoverageKpi(label, value, note, icon, tone = "") {
  return `
    <article class="district-kpi-card rep-kpi-card ${tone ? `tone-${tone}` : ""}">
      <span class="region-kpi-icon" aria-hidden="true">${getDashboardIcon(icon)}</span>
      <span>${label}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(note)}</p>
    </article>
  `;
}

function renderRepHospitalTopItem(item, rank) {
  const width = item.risk.tone === "high" ? 88 : item.risk.tone === "medium" ? 64 : 38;
  return `
    <div class="rep-hospital-top tone-${item.risk.tone}">
      <span class="top-rank">${rank}</span>
      <div>
        <strong>${escapeHtml(item.hospitalName)}</strong>
        <p>${escapeHtml(item.coverageStatus.label)} · 待面试 ${item.pendingInterviewCount}</p>
      </div>
      <div class="subarea-progress"><span style="width:${width}%"></span></div>
    </div>
  `;
}

function buildRepCoverageSuggestion(highRiskSeats, mediumRiskSeats, pendingSeats, topHospitals) {
  if (highRiskSeats.length) {
    const hospitals = topHospitals.map((item) => item.hospitalName).slice(0, 2);
    return hospitals.length
      ? `优先补齐高风险席位，重点解决 ${hospitals.join("、")} 的医院覆盖。`
      : "优先补齐高风险代表席位，避免医院长期无人覆盖。";
  }
  if (mediumRiskSeats.length) {
    return "优先推进空缺且已有候选人的席位，尽快确认面试安排。";
  }
  if (pendingSeats.length) {
    return "优先跟进待入职席位，确认到岗时间和医院交接安排。";
  }
  return "当前团队覆盖相对稳定，保持例行跟进即可。";
}

function renderSpecialistCoverageWorkspace(context, seats, hospitals, candidates) {
  const filteredSeats = filterAndSortRepSeats(seats);
  const filteredHospitals = filterAndSortHospitalRows(hospitals);
  const recruitmentRows = buildRecruitmentProgressRows(candidates, seats);
  return `
    <section class="rep-workbench-toolbar">
      <div class="rep-tabs" role="tablist" aria-label="代表团队视图">
        ${renderRepTab("seats", "岗位视图")}
        ${renderRepTab("hospitals", "医院视图")}
        ${renderRepTab("recruitment", "招聘推进")}
      </div>
      <div class="rep-filter-row">
        ${renderSpecialistFilterSelect("status", "岗位状态", [
          ["all", "全部"],
          ["已到位", "已到位"],
          ["空缺", "空缺"],
          ["招聘中", "招聘中"],
          ["待入职", "待入职"]
        ])}
        ${renderSpecialistFilterSelect("risk", "风险等级", [
          ["all", "全部"],
          ["high", "高风险"],
          ["medium", "中风险"],
          ["pending", "待到岗"],
          ["stable", "稳定"]
        ])}
        ${renderSpecialistFilterSelect("sort", "排序", [
          ["risk", "风险等级"],
          ["hospital-count", "医院数"],
          ["pending", "待面试人数"],
          ["status", "岗位状态"]
        ])}
      </div>
    </section>
    <section class="rep-table-card">
      ${specialistCoverageState.tab === "hospitals"
        ? renderHospitalCoverageTable(filteredHospitals)
        : specialistCoverageState.tab === "recruitment"
          ? renderRecruitmentProgressTable(recruitmentRows, context)
          : renderRepSeatTable(filteredSeats)}
    </section>
    <p class="rep-coverage-tip">提示：默认查看“岗位视图”，可切换到“医院视图”确认覆盖缺口，或在“招聘推进”查看候选人跟进。</p>
  `;
}

function renderRepTab(value, label) {
  return `<button class="${specialistCoverageState.tab === value ? "active" : ""}" type="button" data-specialist-tab="${value}">${label}</button>`;
}

function renderSpecialistFilterSelect(key, label, options) {
  return `
    <label class="candidate-filter-select rep-filter-select">
      <span>${label}</span>
      <select data-specialist-filter="${key}">
        ${options.map(([value, text]) => `<option value="${value}" ${specialistCoverageState[key] === value ? "selected" : ""}>${text}</option>`).join("")}
      </select>
    </label>
  `;
}

function filterAndSortRepSeats(seats) {
  return seats
    .filter((seat) => {
      if (specialistCoverageState.status !== "all" && seat.status.label !== specialistCoverageState.status) {
        return false;
      }
      if (specialistCoverageState.risk !== "all" && seat.risk.tone !== specialistCoverageState.risk) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      if (specialistCoverageState.sort === "hospital-count") {
        return right.hospitalCount - left.hospitalCount || left.index - right.index;
      }
      if (specialistCoverageState.sort === "pending") {
        return right.pendingInterviewCount - left.pendingInterviewCount || getRepRiskRank(right.risk.tone) - getRepRiskRank(left.risk.tone);
      }
      if (specialistCoverageState.sort === "status") {
        return getRepStatusRank(right.status.label) - getRepStatusRank(left.status.label) || left.index - right.index;
      }
      return getRepRiskRank(right.risk.tone) - getRepRiskRank(left.risk.tone) || right.pendingInterviewCount - left.pendingInterviewCount || left.index - right.index;
    });
}

function filterAndSortHospitalRows(hospitals) {
  return hospitals
    .filter((hospital) => specialistCoverageState.risk === "all" || hospital.risk.tone === specialistCoverageState.risk)
    .sort((left, right) => getHospitalRiskRank(right.risk.tone) - getHospitalRiskRank(left.risk.tone) || right.pendingInterviewCount - left.pendingInterviewCount);
}

function getRepRiskRank(tone) {
  const rank = { high: 4, medium: 3, pending: 2, stable: 1 };
  return rank[tone] || 0;
}

function getRepStatusRank(label) {
  const rank = { "空缺": 4, "招聘中": 3, "待入职": 2, "已到位": 1 };
  return rank[label] || 0;
}

function renderRepSeatTable(seats) {
  if (!seats.length) {
    return `<div class="candidate-empty-state">${candidateIcon("search")}<strong>没有匹配的岗位</strong><span>请调整筛选条件后重试。</span></div>`;
  }
  return `
    <div class="rep-table-meta">共 ${seats.length} 个岗位席位</div>
    <div class="rep-seat-table">
      <div class="rep-seat-head">
        <span>岗位席位</span>
        <span>状态</span>
        <span>当前专员</span>
        <span>入职时间 / 在岗时长</span>
        <span>负责医院</span>
        <span>医院数</span>
        <span>待面试</span>
        <span>风险</span>
        <span>操作</span>
      </div>
      ${seats.map((seat) => renderRepSeatRow(seat)).join("")}
    </div>
  `;
}

function renderRepSeatRow(seat) {
  const hospitalPreview = seat.hospitals.length
    ? seat.hospitals.slice(0, 3).map((hospital) => `<span>${escapeHtml(hospital)}</span>`).join("") + (seat.hospitals.length > 3 ? `<b>+${seat.hospitals.length - 3}</b>` : "")
    : `<em>暂无负责医院</em>`;
  return `
    <article class="rep-seat-row tone-${seat.risk.tone}">
      <div class="rep-seat-name"><strong>${escapeHtml(seat.seatName)}</strong><small>${escapeHtml(seat.rawName || "席位待维护")}</small></div>
      <div>${renderRepStatusBadge(seat.status)}</div>
      <div class="rep-person-name">${escapeHtml(seat.repName)}</div>
      <div class="rep-tenure-cell">
        <strong>${escapeHtml(seat.joinDateText)}</strong>
        <span>${escapeHtml(seat.tenureText)}</span>
        ${renderTenureTag(seat.tenureTag)}
      </div>
      <div class="rep-hospital-chips">${hospitalPreview}</div>
      <div class="rep-number-cell">${seat.hospitalCount}</div>
      <div class="rep-number-cell">${seat.pendingInterviewCount}</div>
      <div>${renderRepRiskBadge(seat.risk)}</div>
      <button class="district-job-button" type="button" data-rep-action>${escapeHtml(getRepSeatActionLabel(seat))}</button>
    </article>
  `;
}

function getRepSeatActionLabel(seat) {
  if (seat.status.label === "空缺") {
    return seat.pendingInterviewCount > 0 ? "查看候选人" : "推进招聘";
  }
  if (seat.status.label === "已到位") {
    return "查看专员";
  }
  if (seat.status.label === "待入职") {
    return "跟进入职";
  }
  if (seat.status.label === "招聘中") {
    return "查看候选人";
  }
  return "查看详情";
}

function renderHospitalCoverageTable(hospitals) {
  if (!hospitals.length) {
    return `<div class="candidate-empty-state">${candidateIcon("search")}<strong>暂无医院覆盖数据</strong><span>请确认专员表中是否维护医院字段。</span></div>`;
  }
  return `
    <div class="rep-table-meta">共 ${hospitals.length} 家医院</div>
    <div class="rep-hospital-table">
      <div class="rep-hospital-head">
        <span>医院名称</span>
        <span>重点级别</span>
        <span>当前负责专员</span>
        <span>覆盖状态</span>
        <span>对应岗位</span>
        <span>待面试</span>
        <span>风险</span>
        <span>操作</span>
      </div>
      ${hospitals.map((hospital) => `
        <article class="rep-hospital-row tone-${hospital.risk.tone}">
          <div><strong>${escapeHtml(hospital.hospitalName)}</strong></div>
          <span>${escapeHtml(hospital.priority)}</span>
          <span>${escapeHtml(hospital.currentRep)}</span>
          <div>${renderRepStatusBadge(hospital.coverageStatus)}</div>
          <span>${escapeHtml(hospital.relatedSeats.join("、"))}</span>
          <span>${hospital.pendingInterviewCount}</span>
          <div>${renderRepRiskBadge(hospital.risk)}</div>
          <button class="district-job-button" type="button" data-rep-action>查看岗位</button>
        </article>
      `).join("")}
    </div>
  `;
}

function buildRecruitmentProgressRows(candidates, seats) {
  return candidates.map((candidate) => {
    const matchedSeat = seats.find((seat) => matchesCandidateToRepSeat(candidate, { name: seat.repName, rawName: seat.rawName }, seat.hospitals));
    return {
      candidate,
      seatName: matchedSeat?.seatName || candidate.position || "暂无数据",
      hospitals: matchedSeat?.hospitals || [],
      nextAction: buildRecruitmentNextAction(candidate)
    };
  }).sort((left, right) => compareNullableNumber(left.candidate.waitingMinutes, right.candidate.waitingMinutes, true));
}

function renderRecruitmentProgressTable(rows, context) {
  if (!rows.length) {
    return `<div class="candidate-empty-state">${candidateIcon("search")}<strong>暂无招聘推进候选人</strong><span>${escapeHtml(context.districtName)}当前没有匹配的待面试记录。</span></div>`;
  }
  return `
    <div class="rep-table-meta">共 ${rows.length} 名候选人</div>
    <div class="rep-recruit-table">
      <div class="rep-recruit-head">
        <span>对应岗位</span>
        <span>影响医院</span>
        <span>候选人</span>
        <span>当前阶段</span>
        <span>推荐时间</span>
        <span>等待时长</span>
        <span>下一步动作</span>
        <span>负责人</span>
        <span>操作</span>
      </div>
      ${rows.map(({ candidate, seatName, hospitals, nextAction }) => `
        <article class="rep-recruit-row">
          <span>${escapeHtml(seatName)}</span>
          <span>${escapeHtml(hospitals.slice(0, 2).join("、") || candidate.market || "暂无数据")}</span>
          <div><strong>${escapeHtml(candidate.name)}</strong><small>${escapeHtml(candidate.company || "公司暂无数据")}</small></div>
          <div>${renderCandidateStatusBadge(candidate.status)}</div>
          <span>${escapeHtml(candidate.recommendTime || "暂无数据")}</span>
          <span class="candidate-waiting ${candidate.waitingLevel}">${escapeHtml(candidate.waitingTimeText)}</span>
          <span>${escapeHtml(nextAction)}</span>
          <span>${escapeHtml(candidate.recruiter || candidate.recommender || "暂无数据")}</span>
          <button class="district-job-button" type="button" data-rep-action>查看候选人</button>
        </article>
      `).join("")}
    </div>
  `;
}

function buildRecruitmentNextAction(candidate) {
  if (candidate.waitingLevel === "danger") {
    return "立即确认面试安排";
  }
  if (candidate.priority === "高") {
    return "优先协调业务面试";
  }
  if (!isCandidateBooked(candidate.status)) {
    return "补充预约时间";
  }
  return "按计划跟进";
}

function renderRepStatusBadge(status) {
  return `<span class="manager-status-badge tone-${status.tone}">${escapeHtml(status.label)}</span>`;
}

function renderRepRiskBadge(risk) {
  return `<span class="pressure-pill tone-${risk.tone}">${escapeHtml(risk.label)}</span>`;
}

function renderTenureTag(tag) {
  const tone = tag === "稳定" ? "stable" : tag === "观察期" ? "medium" : tag === "新人" ? "pending" : "neutral";
  return `<i class="tenure-tag tone-${tone}">${escapeHtml(tag)}</i>`;
}

function bindSpecialistCoverageEvents(context) {
  specialistHero.querySelectorAll("[data-specialist-back]").forEach((button) => {
    button.addEventListener("click", () => {
      showDistrictManagerPage(context.regionKey, context.subareaName);
    });
  });

  specialistPageList.querySelectorAll("[data-specialist-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      specialistCoverageState.tab = button.dataset.specialistTab;
      showSpecialistPage(context.regionKey, context.districtKey);
    });
  });

  specialistPageList.querySelectorAll("[data-specialist-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      specialistCoverageState[select.dataset.specialistFilter] = select.value;
      showSpecialistPage(context.regionKey, context.districtKey);
    });
  });
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    if (value > 25569 && value < 60000) {
      const excelDate = new Date(Math.round((value - 25569) * 86400 * 1000));
      return Number.isNaN(excelDate.getTime()) ? null : excelDate;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const normalized = String(value)
    .trim()
    .replace(/\//g, "-")
    .replace(/[年月]/g, "-")
    .replace(/日/g, "")
    .replace("T", " ")
    .replace(/\.\d+Z?$/, "");
  const directDate = new Date(normalized.includes(" ") ? normalized.replace(" ", "T") : normalized);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate;
  }
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (!match) {
    return null;
  }
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateShort(date) {
  if (!date) {
    return "暂无数据";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTenure(date) {
  if (!date) {
    return "暂无数据";
  }
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  return formatDurationDays(days);
}

function formatDurationDays(days) {
  if (days < 30) {
    return `${days || 1}天`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}个月`;
  }
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return `${years}年${remainingMonths ? `${remainingMonths}个月` : ""}`;
}

function getTenureTag(date) {
  if (!date) {
    return "未知";
  }
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  if (days < 90) {
    return "新人";
  }
  if (days < 180) {
    return "观察期";
  }
  return "稳定";
}

function uniqueTextArray(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
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

function createCompactKpiCard(label, value, note, icon, tone = "") {
  return `
    <article class="compact-kpi-card${tone ? ` tone-${tone}` : ""}">
      <div class="compact-kpi-icon" aria-hidden="true">${getDashboardIcon(icon)}</div>
      <div class="compact-kpi-copy">
        <span>${label}</span>
        <strong>${value}</strong>
        <p>${note}</p>
      </div>
    </article>
  `;
}

function getDashboardIcon(name) {
  const icons = {
    people: '<svg viewBox="0 0 24 24"><path d="M16 20v-1.7c0-2.2-1.8-4-4-4H6c-2.2 0-4 1.8-4 4V20"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-1.7c0-1.8-1.2-3.4-3-3.9M16 3.2a4 4 0 0 1 0 7.7"/></svg>',
    users: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
    briefcase: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/></svg>'
  };
  return icons[name] || icons.briefcase;
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
  return sourceTime;
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

const ROLE_FIELD_ALIASES = ["岗位层级", "岗位", "职位", "职务", "拟匹配职位", "role", "position", "level", "title"];
const NAME_FIELD_ALIASES = [
  "员工ID",
  "人员ID",
  "姓名",
  "人员姓名",
  "候选人姓名",
  "专员姓名",
  "代表姓名",
  "大区经理",
  "地区经理",
  "name",
  "employeeName",
  "managerName",
  "rawManagerName",
  "rawName"
];
const STATUS_FIELD_ALIASES = ["状态", "当前状态", "在岗状态", "岗位状态", "人员状态", "status"];
const PLACEHOLDER_NAME_PATTERN = /^(?:-|--|待招|空缺|人员空缺|暂无|未配置|待定|无)$/;
const INACTIVE_STATUS_PATTERN = /空缺|待招|待入职|招聘中|离职|暂无|人员空缺|未配置/i;
const ACTIVE_STATUS_PATTERN = /在岗|已到位|已配置|正常|active/i;

function getCompatibleValue(record, aliases) {
  if (!record || typeof record !== "object") {
    return "";
  }
  for (const key of aliases) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function normalizeRoleLevel(record) {
  const roleText = [
    getCompatibleValue(record, ROLE_FIELD_ALIASES),
    record?.role,
    record?.level,
    record?.title,
    record?.position,
    record?.jobTitle
  ].filter(Boolean).join(" ");

  if (/总监|销售总监|区域总监|大区总监/.test(roleText)) {
    return "director";
  }
  if (/大区经理|大区负责人/.test(roleText)) {
    return "regionalManager";
  }
  if (/地区经理|地区负责人/.test(roleText)) {
    return "districtManager";
  }
  if (/医学信息沟通专员|销售代表|核心专员|代表|专员/.test(roleText)) {
    return "representative";
  }
  return "";
}

function getPersonName(record) {
  const name = getCompatibleValue(record, NAME_FIELD_ALIASES);
  return name || String(record?.name || record?.rawName || record?.managerName || record?.rawManagerName || "").trim();
}

function isPlaceholderPersonName(value) {
  return !value || PLACEHOLDER_NAME_PATTERN.test(String(value).trim());
}

function isActiveEmployee(record) {
  const name = getPersonName(record);
  const statusText = [
    getCompatibleValue(record, STATUS_FIELD_ALIASES),
    record?.status,
    record?.currentStatus,
    record?.rawStatus,
    name
  ].filter(Boolean).join(" ");

  if (isPlaceholderPersonName(name) || INACTIVE_STATUS_PATTERN.test(statusText)) {
    return false;
  }
  if (ACTIVE_STATUS_PATTERN.test(statusText)) {
    return true;
  }
  if (record?.isVacant === false) {
    return true;
  }
  const activeFlag = getCompatibleValue(record, ["是否在岗", "是否到位"]);
  return /是|已到位|在岗|true/i.test(activeFlag);
}

function getPersonKey(record, roleLevel, fallbackIndex = 0) {
  const id = getCompatibleValue(record, ["员工ID", "人员ID", "employeeId", "staffId", "id", "recordId", "record_id"]);
  if (id && !isPlaceholderPersonName(id)) {
    return `${roleLevel}:id:${id}`;
  }

  const name = getPersonName(record);
  if (!isPlaceholderPersonName(name)) {
    return `${roleLevel}:name:${name.replace(/\s+/g, "")}`;
  }

  const seatKey = getCompatibleValue(record, ["岗位席位", "席位", "岗位", "职位", "职务", "title", "areaName", "territory", "region", "district"]);
  return `${roleLevel}:seat:${seatKey || fallbackIndex}`;
}

function collectRoleLevelRows(regions) {
  const rows = [];
  (regions || []).forEach((region) => {
    (region.positions || []).forEach((position) => rows.push(position));
    (region.rosterRegionalManagers || []).forEach((manager) => {
      rows.push({
        ...manager,
        role: "大区经理",
        name: manager.managerName || manager.rawManagerName
      });
    });
    (region.rosterDistrictManagers || []).forEach((manager) => {
      rows.push({
        ...manager,
        role: "地区经理",
        name: manager.managerName || manager.rawManagerName
      });
    });
    (region.specialistAssignments || []).forEach((assignment) => {
      (assignment.specialists || []).forEach((specialist) => {
        rows.push({
          ...specialist,
          role: "专员",
          name: specialist.name || specialist.rawName,
          areaName: assignment.areaName,
          territory: assignment.territory,
          topRegion: assignment.topRegion,
          status: specialist.isVacant ? "空缺" : "已到位"
        });
      });
    });
  });
  return rows;
}

function countActivePeopleByRole(rows, roleLevel) {
  const keys = new Set();
  (rows || []).forEach((row, index) => {
    if (normalizeRoleLevel(row) !== roleLevel || !isActiveEmployee(row)) {
      return;
    }
    keys.add(getPersonKey(row, roleLevel, index));
  });
  return keys.size;
}

function sumActiveMetric(regions, metricKey) {
  return (regions || []).reduce((sum, region) => sum + Number(region.metrics?.[metricKey]?.active || 0), 0);
}

function calculateActiveRoleCounts(regions) {
  const rows = collectRoleLevelRows(regions);
  const regionalManager = sumActiveMetric(regions, "regionalManager") || countActivePeopleByRole(rows, "regionalManager");
  const districtManager = sumActiveMetric(regions, "districtManager") || countActivePeopleByRole(rows, "districtManager");
  const representative = sumActiveMetric(regions, "representative") || countActivePeopleByRole(rows, "representative");
  const totalActive = (regions || []).reduce((sum, region) => sum + Number(region.metrics?.active || 0), 0);
  const directorResidual = totalActive - regionalManager - districtManager - representative;
  const director = directorResidual > 0 ? directorResidual : countActivePeopleByRole(rows, "director");

  return {
    director,
    regionalManager,
    districtManager,
    representative
  };
}

function renderRoleLevelOverview(counts) {
  if (!roleLevelOverview) {
    return;
  }

  const items = [
    { key: "director", label: "总监在岗", chartLabel: "总监", value: counts.director, icon: "chart", tone: "director" },
    { key: "regionalManager", label: "大区经理在岗", chartLabel: "大区经理", value: counts.regionalManager, icon: "briefcase", tone: "regional" },
    { key: "districtManager", label: "地区经理在岗", chartLabel: "地区经理", value: counts.districtManager, icon: "users", tone: "district" },
    { key: "representative", label: "代表/专员在岗", chartLabel: "代表/专员", value: counts.representative, icon: "people", tone: "representative" }
  ];
  const maxValue = Math.max(...items.map((item) => Number(item.value || 0)), 1);

  roleLevelOverview.innerHTML = `
    <div class="role-level-copy">
      <div>
        <p class="section-kicker">全国组织结构</p>
        <h3>全国岗位层级在岗概览</h3>
        <p>按当前在岗人员口径统计总监、大区经理、地区经理与代表/专员人数</p>
      </div>
    </div>
    <div class="role-level-body">
      <div class="role-level-cards">
        ${items.map((item) => `
          <article class="role-level-card tone-${item.tone}">
            <span class="role-level-icon" aria-hidden="true">${getDashboardIcon(item.icon)}</span>
            <div>
              <h4>${item.label}</h4>
              <strong>${item.value}<em>人</em></strong>
              <p>当前已到位人员</p>
            </div>
          </article>
        `).join("")}
      </div>
      <div class="role-level-chart">
        <div class="role-level-chart-title">
          <span class="overview-pressure-icon" aria-hidden="true">${getDashboardIcon("chart")}</span>
          <h4>组织层级人数结构</h4>
        </div>
        <div class="role-level-bars">
          ${items.map((item) => {
            const width = Math.max(4, Math.round((Number(item.value || 0) / maxValue) * 100));
            return `
              <div class="role-level-bar-row" title="${item.chartLabel} ${item.value} 人">
                <span>${item.chartLabel}</span>
                <strong>${item.value}</strong>
                <div class="role-level-bar-track"><div style="width:${width}%"></div></div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    </div>
    <p class="role-level-note">按人员去重统计，待招、空缺、待入职不计入在岗。</p>
  `;
}

function renderOverview() {
  currentView = "overview";
  activeInterviewBoardId = null;
  activeRegionKey = null;
  activeDistrictManagerKey = null;
  activeSubareaName = null;
  pendingDistrictAreaFocus = null;
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
    if (roleLevelOverview) {
      roleLevelOverview.innerHTML = "";
    }
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
  const totalInterviewCount = interviewBoards.reduce((sum, board) => sum + Number(board.count || 0), 0);
  const vacancyRate = computeReadiness(totalHeadcount, totalVacant);
  const pressureRegions = [...new Set([maxVacantRegion.key, maxDistrictGap.key])].join("与");

  overviewHighlights.innerHTML = `
    <div class="overview-pressure-title">
      <span class="overview-pressure-icon" aria-hidden="true">${getDashboardIcon("chart")}</span>
      <h3>当前招聘压力总览</h3>
    </div>
    <article class="command-kpi command-kpi-risk">
      <div class="command-kpi-topline">
        <div>
          <span class="command-kpi-label">空岗压力</span>
          <strong class="command-kpi-value">${totalVacant}</strong>
        </div>
        <span class="command-kpi-status">高优先级</span>
      </div>
      <div class="command-kpi-facts">
        <span>空岗率 <strong>${vacancyRate}%</strong></span>
        <span>管理岗缺口 <strong>${totalManagerVacant}</strong></span>
        <span>代表空岗 <strong>${totalRepresentativeVacant}</strong></span>
      </div>
      <p class="command-kpi-alert">空岗压力较高，重点关注${pressureRegions}</p>
    </article>
    <article class="command-kpi command-kpi-interview">
      <div class="command-kpi-copy">
        <span class="command-kpi-label">待面试总人数</span>
        <strong class="command-kpi-value">${totalInterviewCount}</strong>
        <p>候选人待处理总量，点击右侧矩阵可进入明细</p>
        <div class="command-kpi-support">
          <span>${interviewBoards.length} 类候选池</span>
          <b>待安排 / 待确认面试</b>
        </div>
      </div>
      <div class="command-kpi-visual" aria-hidden="true">${getDashboardIcon("people")}</div>
    </article>
    <div class="compact-kpi-grid">
      ${createCompactKpiCard("总编制", totalHeadcount, "含三级销售组织", "briefcase")}
      ${createCompactKpiCard("当前在岗", totalActive, `在岗率 ${computeReadiness(totalHeadcount, totalActive)}%`, "users", "healthy")}
      ${createCompactKpiCard("待入职", totalIncoming, "已发 Offer / 待到岗", "clock", "warm")}
      ${createCompactKpiCard("在招岗位", openPositionCount, `${maxVacantRegion.key}压力较集中`, "search")}
    </div>
  `;

  if (headerPressureNote) {
    headerPressureNote.textContent = `本周招聘压力集中在${pressureRegions}，建议优先补位地区经理岗位`;
  }

  renderRoleLevelOverview(calculateActiveRoleCounts(regionData));
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
      <div class="interview-board-actions">
        <div class="interview-board-total">
          <span>总待面试人数</span>
          <strong>${total}</strong>
        </div>
        <button class="interview-detail-button" type="button" data-interview-overview="${escapeHtml(interviewBoards[0].id)}">查看详情</button>
      </div>
    </div>
    <div class="interview-board-grid">
      ${interviewBoards.map((board) => `
        <button class="interview-count-card ${getInterviewBoardToneClass(board)}" type="button" data-interview-id="${escapeHtml(board.id)}">
          <span class="interview-count-label">${escapeHtml(board.label)}</span>
          <strong>${board.count}</strong>
          <em>点击进入明细页 <b aria-hidden="true">→</b></em>
        </button>
      `).join("")}
    </div>
  `;

  interviewBoardPanel.querySelectorAll("[data-interview-id]").forEach((button) => {
    button.addEventListener("click", () => {
      showInterviewDetailPage(button.dataset.interviewId);
    });
  });

  const overviewButton = interviewBoardPanel.querySelector("[data-interview-overview]");
  if (overviewButton) {
    overviewButton.addEventListener("click", () => {
      showInterviewDetailPage(overviewButton.dataset.interviewOverview);
    });
  }
}

function isPriorityInterviewBoard(board) {
  const name = `${board.name || ""}${board.label || ""}`;
  return name.includes("创新药销售核心待面");
}

function getInterviewBoardToneClass(board) {
  const name = `${board.name || ""}${board.label || ""}`;
  if (isPriorityInterviewBoard(board)) {
    return "tone-risk";
  }
  if (Number(board.count || 0) === 0) {
    return "tone-healthy";
  }
  if (name.includes("销售促进非核心") || name.includes("医学市场")) {
    return "tone-primary";
  }
  return "tone-neutral";
}

function showInterviewDetailPage(boardId) {
  const board = interviewBoards.find((item) => item.id === boardId);
  if (!board) {
    return;
  }

  if (candidateWorkbenchState.boardId !== boardId) {
    candidateWorkbenchState = createCandidateWorkbenchState(boardId);
  }

  activeInterviewBoardId = boardId;
  activeRegionKey = null;
  activeDistrictManagerKey = null;
  currentView = "interview-detail";
  document.body.classList.add("candidate-workbench-active");
  if (dashboardGrid) {
    dashboardGrid.classList.remove("overview-full");
    dashboardGrid.classList.add("candidate-mode");
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
  interviewDetailView.classList.add("candidate-workbench-view");
  interviewDetailHero.className = "candidate-workbench-header";
  interviewDetailTitle.textContent = `${board.label}候选人列表`;
  renderCandidateWorkbench(board);
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function renderCandidateWorkbench(board) {
  const candidates = board.rows.map((row, index) => normalizeCandidate(row, index, board.id));
  const stats = buildCandidateStats(candidates);

  interviewDetailHero.innerHTML = `
    <div class="candidate-page-heading">
      <div class="candidate-heading-copy">
        <div class="candidate-breadcrumb">
          <button type="button" data-candidate-back>候选管理</button>
          <span>/</span>
          <strong>${escapeHtml(board.label)}</strong>
        </div>
        <h2>${escapeHtml(board.label)}</h2>
        <p>集中浏览、筛选并跟进当前待面候选人，点击任意候选人可在右侧查看完整信息。</p>
      </div>
      <div class="candidate-heading-actions">
        <div class="candidate-update-meta">
          <span>数据更新时间</span>
          <strong>${escapeHtml(getCandidateUpdateText())}</strong>
        </div>
        <button class="candidate-refresh-button" type="button" data-candidate-refresh>
          ${candidateIcon("refresh")}
          刷新数据
        </button>
        <button class="candidate-back-button" type="button" data-candidate-back>返回总览</button>
      </div>
    </div>
    <div class="candidate-summary-grid">
      ${renderCandidateSummaryCard("people", "待面人数", stats.total, "当前候选池", "primary")}
      ${renderCandidateSummaryCard("clock", "24h内待处理", stats.within24Hours, "按推荐时间计算", "violet")}
      ${renderCandidateSummaryCard("calendar", "已安排", stats.arranged, "已有明确面试形式", "healthy")}
      ${renderCandidateSummaryCard("star", "高优先级岗位", stats.highPriority, "按岗位层级识别", "warm")}
      ${renderCandidateSummaryCard("timer", "平均等待时长", stats.averageWaitingText, "基于有效推荐时间", "risk")}
    </div>
  `;

  renderCandidateWorkbenchContent(board, candidates);
  bindCandidateHeaderEvents();
}

function renderCandidateWorkbenchContent(board, candidates) {
  const filteredCandidates = filterAndSortCandidates(candidates);
  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / candidateWorkbenchState.pageSize));
  candidateWorkbenchState.page = Math.min(candidateWorkbenchState.page, totalPages);
  const pageStart = (candidateWorkbenchState.page - 1) * candidateWorkbenchState.pageSize;
  const pagedCandidates = filteredCandidates.slice(pageStart, pageStart + candidateWorkbenchState.pageSize);
  const selectedCandidate = candidates.find((candidate) => candidate.id === candidateWorkbenchState.selectedCandidateId) || null;

  interviewDetailList.innerHTML = `
    <section class="candidate-filter-panel">
      <div class="candidate-filter-row">
        <label class="candidate-search-field">
          ${candidateIcon("search")}
          <input
            type="search"
            value="${escapeHtml(candidateWorkbenchState.search)}"
            placeholder="搜索姓名 / 手机号 / 城市 / 岗位"
            aria-label="搜索候选人"
            data-candidate-search
          >
        </label>
        ${renderCandidateFilterSelect("region", "区域", candidates.map((item) => item.region), candidateWorkbenchState.region)}
        ${renderCandidateTerritoryFilter(candidates)}
        ${renderCandidateFilterSelect("position", "岗位", candidates.map((item) => item.position), candidateWorkbenchState.position)}
        ${renderCandidateFilterSelect("status", "当前状态", candidates.map((item) => item.status), candidateWorkbenchState.status)}
        ${renderCandidateFilterSelect("priority", "优先级", candidates.map((item) => item.priority), candidateWorkbenchState.priority)}
        <label class="candidate-filter-select">
          <span>排序</span>
          <select data-candidate-filter="sort">
            ${renderCandidateSelectOption("waiting-desc", "等待时长：从高到低", candidateWorkbenchState.sort)}
            ${renderCandidateSelectOption("waiting-asc", "等待时长：从低到高", candidateWorkbenchState.sort)}
            ${renderCandidateSelectOption("recommend-desc", "推荐时间：最新优先", candidateWorkbenchState.sort)}
            ${renderCandidateSelectOption("priority-desc", "优先级：从高到低", candidateWorkbenchState.sort)}
            ${renderCandidateSelectOption("name-asc", "姓名：拼音顺序", candidateWorkbenchState.sort)}
          </select>
        </label>
        <button class="candidate-clear-button" type="button" data-candidate-clear>清空筛选</button>
      </div>
      <div class="candidate-quick-filters" aria-label="快捷筛选">
        ${[
          ["all", "全部"],
          ["today", "今日待处理"],
          ["over24", "超24h未推进"],
          ["high", "高优先级"],
          ["unbooked", "未预约面试"],
          ["booked", "已约待面"],
          ["east", "东区"],
          ["south", "南区"],
          ["west", "西区"],
          ["north", "北区"]
        ].map(([value, label]) => `
          <button
            class="candidate-filter-chip ${candidateWorkbenchState.quickFilter === value ? "active" : ""}"
            type="button"
            data-candidate-quick="${value}"
          >${label}</button>
        `).join("")}
      </div>
    </section>

    <div class="candidate-workbench-body ${candidateWorkbenchState.drawerOpen && selectedCandidate ? "drawer-open" : ""}">
      <section class="candidate-list-panel">
        <div class="candidate-list-heading">
          <div>
            <p class="section-kicker">候选人列表</p>
            <h3>${escapeHtml(board.label)}</h3>
          </div>
          <div class="candidate-result-count">筛选结果 <strong>${filteredCandidates.length}</strong> 人</div>
        </div>
        ${renderCandidateTable(pagedCandidates, selectedCandidate)}
        ${renderCandidatePagination(filteredCandidates.length, totalPages)}
      </section>
      ${renderCandidateDrawer(selectedCandidate)}
    </div>
  `;

  bindCandidateWorkbenchEvents(board, candidates);
}

function normalizeCandidate(row, index, boardId) {
  const value = (...aliases) => getCandidateField(row, aliases);
  const name = value("候选人姓名", "人员姓名", "姓名", "name", "candidateName") || "未命名候选人";
  const recommendTime = value("推荐时间", "推荐日期", "recommendTime", "recommendDate");
  const recommendDate = parseRecommendTime(recommendTime);
  const waitingMinutes = recommendDate ? Math.max(0, Math.floor((Date.now() - recommendDate.getTime()) / 60000)) : null;
  const interviewForm = value("面试形式", "面试安排", "interviewForm");
  const position = value("拟匹配职位", "匹配职位", "岗位", "职位", "position");
  const explicitStatus = value("当前状态", "面试状态", "招聘状态", "状态", "status");
  const status = normalizeCandidateStatus(explicitStatus, interviewForm);
  const explicitPriority = value("优先级", "priority");
  const priority = normalizeCandidatePriority(explicitPriority, position);
  const sequence = value("序号", "id", "recordId", "record_id") || index + 1;

  return {
    id: `${boardId}-${sequence}-${name}-${recommendTime || index}`,
    sourceIndex: index,
    name,
    age: value("年龄", "age"),
    phone: value("手机号码", "手机号", "联系电话", "电话", "phone", "mobile"),
    email: value("邮箱", "电子邮箱", "email"),
    region: value("区域", "区域/TA", "region"),
    territory: value("大区", "territory", "cityGroup"),
    city: value("工作地点", "工作地", "城市", "city", "location"),
    position,
    department: value("拟匹配部门", "部门", "BU", "业务单元", "department"),
    channelOrBU: value("渠道BU", "渠道/BU", "渠道", "BU", "拟匹配部门", "department"),
    status,
    priority,
    recommendTime,
    recommendDate,
    waitingMinutes,
    waitingTimeText: formatCandidateWaitingTime(waitingMinutes),
    waitingLevel: getCandidateWaitingLevel(waitingMinutes),
    source: value("来源渠道", "简历来源", "来源", "source"),
    recommender: value("推荐人", "推荐者", "简历来源", "recommender"),
    recruiter: value("招聘负责人", "面试官", "recruiter"),
    interviewForm,
    market: value("拟定市场", "市场", "market"),
    company: value("目前公司", "现公司", "公司", "company"),
    currentPosition: value("目前职位", "现职位", "currentPosition"),
    notes: value("备注", "说明", "notes"),
    suggestion: value("招聘建议", "建议", "suggestion"),
    resumeUrl: value("简历链接", "附件", "简历", "resumeUrl"),
    raw: row
  };
}

function getCandidateField(row, aliases) {
  for (const alias of aliases) {
    const value = row?.[alias];
    if (value !== undefined && value !== null && String(value).trim() && !["-", "——"].includes(String(value).trim())) {
      return String(value).trim();
    }
  }
  return "";
}

function parseRecommendTime(value) {
  if (!value) {
    return null;
  }
  const normalized = String(value)
    .trim()
    .replace(/\//g, "-")
    .replace(/[年月]/g, "-")
    .replace(/日/g, "")
    .replace(/\s+/g, " ");
  const parsed = new Date(normalized.includes("T") ? normalized : normalized.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCandidateWaitingTime(minutes) {
  if (minutes === null || !Number.isFinite(minutes)) {
    return "暂无数据";
  }
  if (minutes < 60) {
    return `${Math.max(1, minutes)}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}小时${minutes % 60 ? `${minutes % 60}分` : ""}`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}天${remainingHours ? `${remainingHours}小时` : ""}`;
}

function getCandidateWaitingLevel(minutes) {
  if (minutes === null || !Number.isFinite(minutes)) {
    return "unknown";
  }
  if (minutes > 72 * 60) {
    return "danger";
  }
  if (minutes > 24 * 60) {
    return "warning";
  }
  return "normal";
}

function normalizeCandidateStatus(explicitStatus, interviewForm) {
  if (explicitStatus) {
    return explicitStatus;
  }
  if (interviewForm && !["待定", "暂无数据"].includes(interviewForm)) {
    return "已约待面";
  }
  return "未预约面试";
}

function normalizeCandidatePriority(explicitPriority, position) {
  if (explicitPriority) {
    const text = String(explicitPriority);
    if (text.includes("高")) return "高";
    if (text.includes("中")) return "中";
    if (text.includes("低")) return "低";
  }
  const positionText = String(position || "");
  if (positionText.includes("总监") || positionText.includes("大区经理") || positionText.includes("区域经理")) {
    return "高";
  }
  if (positionText.includes("地区经理") || positionText === "经理") {
    return "中";
  }
  return "低";
}

function buildCandidateStats(candidates) {
  const validWaiting = candidates.filter((candidate) => candidate.waitingMinutes !== null);
  const totalWaiting = validWaiting.reduce((sum, candidate) => sum + candidate.waitingMinutes, 0);
  const averageWaiting = validWaiting.length ? Math.round(totalWaiting / validWaiting.length) : null;
  return {
    total: candidates.length,
    within24Hours: candidates.filter((candidate) => candidate.waitingMinutes !== null && candidate.waitingMinutes <= 24 * 60).length,
    arranged: candidates.filter((candidate) => isCandidateBooked(candidate.status)).length,
    highPriority: candidates.filter((candidate) => candidate.priority === "高").length,
    averageWaitingText: formatCandidateWaitingTime(averageWaiting)
  };
}

function renderCandidateSummaryCard(icon, label, value, note, tone) {
  return `
    <article class="candidate-summary-card tone-${tone}">
      <div class="candidate-summary-icon">${candidateIcon(icon)}</div>
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <p>${escapeHtml(note)}</p>
      </div>
    </article>
  `;
}

function renderCandidateFilterSelect(key, label, values, selectedValue) {
  const uniqueValues = Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, "zh-CN"));
  return `
    <label class="candidate-filter-select">
      <span>${escapeHtml(label)}</span>
      <select data-candidate-filter="${key}">
        ${renderCandidateSelectOption("all", "全部", selectedValue)}
        ${uniqueValues.map((value) => renderCandidateSelectOption(value, value, selectedValue)).join("")}
      </select>
    </label>
  `;
}

function renderCandidateTerritoryFilter(candidates) {
  const options = [];
  const seen = new Set();
  candidates.forEach((candidate) => {
    [
      candidate.territory ? [`territory:${candidate.territory}`, `大区 · ${candidate.territory}`] : null,
      candidate.city ? [`city:${candidate.city}`, `城市 · ${candidate.city}`] : null
    ].filter(Boolean).forEach(([value, label]) => {
      if (!seen.has(value)) {
        seen.add(value);
        options.push([value, label]);
      }
    });
  });
  options.sort((left, right) => left[1].localeCompare(right[1], "zh-CN"));
  return `
    <label class="candidate-filter-select">
      <span>大区 / 城市</span>
      <select data-candidate-filter="territory">
        ${renderCandidateSelectOption("all", "全部", candidateWorkbenchState.territory)}
        ${options.map(([value, label]) => renderCandidateSelectOption(value, label, candidateWorkbenchState.territory)).join("")}
      </select>
    </label>
  `;
}

function renderCandidateSelectOption(value, label, selectedValue) {
  return `<option value="${escapeHtml(value)}" ${selectedValue === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function filterAndSortCandidates(candidates) {
  const query = candidateWorkbenchState.search.trim().toLowerCase();
  const priorityRank = { "高": 3, "中": 2, "低": 1 };
  const filtered = candidates.filter((candidate) => {
    if (query) {
      const haystack = [candidate.name, candidate.phone, candidate.city, candidate.position, candidate.region, candidate.territory]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    if (candidateWorkbenchState.region !== "all" && candidate.region !== candidateWorkbenchState.region) return false;
    if (candidateWorkbenchState.position !== "all" && candidate.position !== candidateWorkbenchState.position) return false;
    if (candidateWorkbenchState.status !== "all" && candidate.status !== candidateWorkbenchState.status) return false;
    if (candidateWorkbenchState.priority !== "all" && candidate.priority !== candidateWorkbenchState.priority) return false;
    if (candidateWorkbenchState.territory !== "all") {
      const [type, value] = candidateWorkbenchState.territory.split(":");
      if (type === "territory" && candidate.territory !== value) return false;
      if (type === "city" && candidate.city !== value) return false;
    }
    return matchesCandidateQuickFilter(candidate, candidateWorkbenchState.quickFilter);
  });

  return filtered.sort((left, right) => {
    if (candidateWorkbenchState.sort === "waiting-asc") {
      return compareNullableNumber(left.waitingMinutes, right.waitingMinutes, false);
    }
    if (candidateWorkbenchState.sort === "recommend-desc") {
      return compareNullableNumber(left.recommendDate?.getTime() ?? null, right.recommendDate?.getTime() ?? null, true);
    }
    if (candidateWorkbenchState.sort === "priority-desc") {
      return (priorityRank[right.priority] || 0) - (priorityRank[left.priority] || 0);
    }
    if (candidateWorkbenchState.sort === "name-asc") {
      return left.name.localeCompare(right.name, "zh-CN");
    }
    return compareNullableNumber(left.waitingMinutes, right.waitingMinutes, true);
  });
}

function compareNullableNumber(left, right, descending) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return descending ? right - left : left - right;
}

function matchesCandidateQuickFilter(candidate, filter) {
  if (filter === "today") return candidate.waitingMinutes !== null && candidate.waitingMinutes <= 24 * 60;
  if (filter === "over24") return candidate.waitingMinutes !== null && candidate.waitingMinutes > 24 * 60;
  if (filter === "high") return candidate.priority === "高";
  if (filter === "unbooked") return !isCandidateBooked(candidate.status);
  if (filter === "booked") return isCandidateBooked(candidate.status);
  if (filter === "east") return candidate.region.startsWith("东");
  if (filter === "south") return candidate.region.startsWith("南");
  if (filter === "west") return candidate.region.startsWith("西");
  if (filter === "north") return candidate.region.startsWith("北");
  return true;
}

function isCandidateBooked(status) {
  return /已约|已安排|待面/.test(String(status || "")) && !String(status || "").includes("未预约");
}

function renderCandidateTable(candidates, selectedCandidate) {
  if (!candidates.length) {
    return `<div class="candidate-empty-state">${candidateIcon("search")}<strong>没有匹配的候选人</strong><span>请调整筛选条件后重试。</span></div>`;
  }
  return `
    <div class="candidate-table-scroll">
      <div class="candidate-table" role="table" aria-label="候选人列表">
        <div class="candidate-table-head" role="row">
          <span>姓名</span>
          <span>区域</span>
          <span>城市</span>
          <span>岗位</span>
          <span>渠道 / BU</span>
          <span>当前状态</span>
          <span>等待时长</span>
          <span>优先级</span>
          <span>操作</span>
        </div>
        <div class="candidate-table-body">
          ${candidates.map((candidate) => `
            <div
              class="candidate-table-row ${selectedCandidate?.id === candidate.id ? "selected" : ""}"
              role="row"
              tabindex="0"
              data-candidate-id="${escapeHtml(candidate.id)}"
            >
              <div class="candidate-name-cell">
                <span class="candidate-selection-dot"></span>
                <div>
                  <strong>${escapeHtml(candidate.name)}</strong>
                  <small>${escapeHtml(candidate.company || "公司暂无数据")}</small>
                </div>
              </div>
              <span>${escapeHtml(candidate.region || "暂无数据")}</span>
              <span>${escapeHtml(candidate.city || "暂无数据")}</span>
              <span class="candidate-position-cell">${escapeHtml(candidate.position || "暂无数据")}</span>
              <span>${escapeHtml(candidate.channelOrBU || "暂无数据")}</span>
              <span>${renderCandidateStatusBadge(candidate.status)}</span>
              <span class="candidate-waiting ${candidate.waitingLevel}">${escapeHtml(candidate.waitingTimeText)}</span>
              <span>${renderCandidatePriorityBadge(candidate.priority)}</span>
              <button class="candidate-detail-button" type="button" data-candidate-open="${escapeHtml(candidate.id)}">查看详情</button>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderCandidateStatusBadge(status) {
  let tone = "neutral";
  if (String(status).includes("未预约")) tone = "pending";
  else if (String(status).includes("已约") || String(status).includes("已安排")) tone = "booked";
  else if (String(status).includes("已联系")) tone = "contacted";
  else if (String(status).includes("24h")) tone = "warning";
  return `<span class="candidate-status-badge ${tone}">${escapeHtml(status || "暂无数据")}</span>`;
}

function renderCandidatePriorityBadge(priority) {
  const tone = priority === "高" ? "high" : priority === "中" ? "medium" : "low";
  return `<span class="candidate-priority-badge ${tone}"><i></i>${escapeHtml(priority || "暂无数据")}</span>`;
}

function renderCandidatePagination(total, totalPages) {
  const currentPage = candidateWorkbenchState.page;
  const pageButtons = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  for (let page = start; page <= end; page += 1) {
    pageButtons.push(`<button class="${page === currentPage ? "active" : ""}" type="button" data-candidate-page="${page}">${page}</button>`);
  }
  return `
    <div class="candidate-pagination">
      <div class="candidate-page-size">
        <span>共 ${total} 条</span>
        <label>
          每页
          <select data-candidate-page-size>
            ${[10, 12, 20].map((size) => renderCandidateSelectOption(String(size), String(size), String(candidateWorkbenchState.pageSize))).join("")}
          </select>
          条
        </label>
      </div>
      <div class="candidate-page-buttons">
        <button type="button" data-candidate-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""} aria-label="上一页">‹</button>
        ${pageButtons.join("")}
        <button type="button" data-candidate-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""} aria-label="下一页">›</button>
      </div>
    </div>
  `;
}

function renderCandidateDrawer(candidate) {
  if (!candidate || !candidateWorkbenchState.drawerOpen) {
    return "";
  }
  return `
    <button class="candidate-drawer-backdrop" type="button" data-candidate-close aria-label="关闭候选人详情"></button>
    <aside class="candidate-drawer" aria-label="${escapeHtml(candidate.name)}候选人详情">
      <div class="candidate-drawer-header">
        <div>
          <div class="candidate-drawer-title-row">
            <h3>${escapeHtml(candidate.name)}</h3>
            ${renderCandidatePriorityBadge(candidate.priority)}
          </div>
          <p>${escapeHtml(candidate.position || "岗位暂无数据")} · ${escapeHtml(candidate.city || "城市暂无数据")}</p>
        </div>
        <button class="candidate-drawer-close" type="button" data-candidate-close aria-label="关闭">×</button>
      </div>
      <div class="candidate-drawer-waiting ${candidate.waitingLevel}">
        <span>已等待</span>
        <strong>${escapeHtml(candidate.waitingTimeText)}</strong>
        <small>${escapeHtml(candidate.recommendTime ? `推荐于 ${candidate.recommendTime}` : "推荐时间暂无数据")}</small>
      </div>
      <div class="candidate-drawer-scroll">
        <section class="candidate-drawer-section">
          <div class="candidate-drawer-section-title">${candidateIcon("profile")}<h4>基本信息</h4></div>
          <div class="candidate-info-grid">
            ${renderCandidateInfoItem("手机号码", candidate.phone)}
            ${renderCandidateInfoItem("邮箱", candidate.email)}
            ${renderCandidateInfoItem("区域", candidate.region)}
            ${renderCandidateInfoItem("大区", candidate.territory)}
            ${renderCandidateInfoItem("城市", candidate.city)}
            ${renderCandidateInfoItem("岗位", candidate.position)}
            ${renderCandidateInfoItem("渠道 / BU", candidate.channelOrBU)}
            ${renderCandidateInfoItem("来源渠道", candidate.source)}
            ${renderCandidateInfoItem("推荐人", candidate.recommender)}
            ${renderCandidateInfoItem("面试官", candidate.recruiter)}
            ${renderCandidateInfoItem("推荐时间", candidate.recommendTime)}
            ${renderCandidateInfoItem("目前公司", candidate.company)}
          </div>
        </section>
        <section class="candidate-drawer-section">
          <div class="candidate-drawer-section-title">${candidateIcon("timeline")}<h4>招聘进展</h4></div>
          ${renderCandidateTimeline(candidate)}
        </section>
        <section class="candidate-drawer-section">
          <div class="candidate-drawer-section-title">${candidateIcon("note")}<h4>备注与建议</h4></div>
          <div class="candidate-note-block">
            <span>备注信息</span>
            <p>${escapeHtml(candidate.notes || "暂无备注")}</p>
          </div>
          <div class="candidate-note-block">
            <span>招聘建议</span>
            <p>${escapeHtml(candidate.suggestion || buildCandidateSuggestion(candidate))}</p>
          </div>
        </section>
        <section class="candidate-drawer-section candidate-action-section">
          <div class="candidate-drawer-section-title">${candidateIcon("action")}<h4>候选人操作</h4></div>
          ${candidateWorkbenchState.actionMessage ? `<div class="candidate-action-message">${escapeHtml(candidateWorkbenchState.actionMessage)}</div>` : ""}
          <button class="candidate-primary-action" type="button" data-candidate-action="预约面试">预约面试</button>
          <button type="button" data-candidate-action="标记已联系">标记已联系</button>
          <button type="button" data-candidate-action="更新状态">更新状态</button>
          ${candidate.resumeUrl
            ? `<a href="${escapeHtml(candidate.resumeUrl)}" target="_blank" rel="noopener">查看完整简历</a>`
            : `<button type="button" disabled>查看完整简历 · 暂无链接</button>`}
        </section>
      </div>
    </aside>
  `;
}

function renderCandidateInfoItem(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "暂无数据")}</strong></div>`;
}

function renderCandidateTimeline(candidate) {
  const stages = ["简历筛选", "初步沟通", "HR初试", "业务面试", "终面", "Offer"];
  const status = String(candidate.status || "");
  let currentStage = 0;
  if (/Offer/i.test(status)) currentStage = 5;
  else if (status.includes("终面")) currentStage = 4;
  else if (status.includes("业务")) currentStage = 3;
  else if (status.includes("HR") || status.includes("初试")) currentStage = 2;
  else if (status.includes("联系") || status.includes("沟通")) currentStage = 1;
  return `
    <div class="candidate-timeline">
      ${stages.map((stage, index) => `
        <div class="${index === currentStage ? "current" : ""}">
          <i></i>
          <span>${stage}</span>
          ${index === currentStage ? `<strong>${escapeHtml(candidate.status || "当前阶段")}</strong>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function buildCandidateSuggestion(candidate) {
  if (candidate.waitingLevel === "danger") {
    return "等待时间较长，建议优先确认面试安排和下一步负责人。";
  }
  if (candidate.priority === "高") {
    return "管理岗位候选人，建议优先协调面试官时间。";
  }
  return "按当前招聘节奏持续跟进，及时补充沟通记录。";
}

function bindCandidateHeaderEvents() {
  interviewDetailHero.querySelectorAll("[data-candidate-back]").forEach((button) => {
    button.addEventListener("click", () => {
      activeInterviewBoardId = null;
      renderOverview();
    });
  });
  const candidateRefreshButton = interviewDetailHero.querySelector("[data-candidate-refresh]");
  if (candidateRefreshButton) {
    candidateRefreshButton.addEventListener("click", () => refreshButton.click());
  }
}

function bindCandidateWorkbenchEvents(board, candidates) {
  const searchInput = interviewDetailList.querySelector("[data-candidate-search]");
  if (searchInput) {
    let isComposing = false;

    const commitCandidateSearch = (searchValue) => {
      window.clearTimeout(candidateSearchTimer);
      candidateSearchTimer = window.setTimeout(() => {
        candidateWorkbenchState.search = searchValue;
        candidateWorkbenchState.page = 1;
        renderCandidateWorkbenchContent(board, candidates);
        const nextInput = interviewDetailList.querySelector("[data-candidate-search]");
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(searchValue.length, searchValue.length);
        }
      }, 180);
    };

    searchInput.addEventListener("compositionstart", () => {
      isComposing = true;
      window.clearTimeout(candidateSearchTimer);
    });

    searchInput.addEventListener("compositionend", (event) => {
      isComposing = false;
      commitCandidateSearch(event.target.value);
    });

    searchInput.addEventListener("input", (event) => {
      if (isComposing || event.isComposing) {
        return;
      }
      commitCandidateSearch(event.target.value);
    });
  }

  interviewDetailList.querySelectorAll("[data-candidate-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      candidateWorkbenchState[select.dataset.candidateFilter] = select.value;
      candidateWorkbenchState.page = 1;
      renderCandidateWorkbenchContent(board, candidates);
    });
  });

  interviewDetailList.querySelectorAll("[data-candidate-quick]").forEach((button) => {
    button.addEventListener("click", () => {
      candidateWorkbenchState.quickFilter = button.dataset.candidateQuick;
      candidateWorkbenchState.page = 1;
      renderCandidateWorkbenchContent(board, candidates);
    });
  });

  const clearButton = interviewDetailList.querySelector("[data-candidate-clear]");
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      const preservedBoardId = candidateWorkbenchState.boardId;
      const preservedPageSize = candidateWorkbenchState.pageSize;
      candidateWorkbenchState = createCandidateWorkbenchState(preservedBoardId);
      candidateWorkbenchState.pageSize = preservedPageSize;
      renderCandidateWorkbenchContent(board, candidates);
    });
  }

  interviewDetailList.querySelectorAll("[data-candidate-id]").forEach((row) => {
    const openCandidate = () => {
      candidateWorkbenchState.selectedCandidateId = row.dataset.candidateId;
      candidateWorkbenchState.drawerOpen = true;
      candidateWorkbenchState.actionMessage = "";
      renderCandidateWorkbenchContent(board, candidates);
    };
    row.addEventListener("click", (event) => {
      if (!event.target.closest("button")) {
        openCandidate();
      }
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCandidate();
      }
    });
  });

  interviewDetailList.querySelectorAll("[data-candidate-open]").forEach((button) => {
    button.addEventListener("click", () => {
      candidateWorkbenchState.selectedCandidateId = button.dataset.candidateOpen;
      candidateWorkbenchState.drawerOpen = true;
      candidateWorkbenchState.actionMessage = "";
      renderCandidateWorkbenchContent(board, candidates);
    });
  });

  interviewDetailList.querySelectorAll("[data-candidate-close]").forEach((button) => {
    button.addEventListener("click", () => {
      candidateWorkbenchState.drawerOpen = false;
      candidateWorkbenchState.actionMessage = "";
      renderCandidateWorkbenchContent(board, candidates);
    });
  });

  interviewDetailList.querySelectorAll("[data-candidate-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = Number(button.dataset.candidatePage);
      if (nextPage > 0) {
        candidateWorkbenchState.page = nextPage;
        renderCandidateWorkbenchContent(board, candidates);
      }
    });
  });

  const pageSizeSelect = interviewDetailList.querySelector("[data-candidate-page-size]");
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", () => {
      candidateWorkbenchState.pageSize = Number(pageSizeSelect.value);
      candidateWorkbenchState.page = 1;
      renderCandidateWorkbenchContent(board, candidates);
    });
  }

  interviewDetailList.querySelectorAll("[data-candidate-action]").forEach((button) => {
    button.addEventListener("click", () => {
      candidateWorkbenchState.actionMessage = `${button.dataset.candidateAction}入口已保留，当前版本未配置飞书写回。`;
      renderCandidateWorkbenchContent(board, candidates);
    });
  });
}

function getCandidateUpdateText() {
  const text = dataStatus?.textContent?.trim() || "";
  const match = text.match(/\d{4}[./-]\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2}/);
  return match ? match[0] : text || "以当前飞书数据为准";
}

function candidateIcon(name) {
  const icons = {
    people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.4-4 2.2-6 5.5-6s5.1 2 5.5 6"/><path d="M16 5.5a3 3 0 0 1 0 5.5M16 13c2.7.3 4.2 2.2 4.5 5"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M8 3v5M16 3v5M4 10h16"/><path d="m9 15 2 2 4-4"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9L12 3Z"/></svg>',
    timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M9 3h6M12 5v2M17.5 7.5l1.5-1.5M12 13l3-3"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.4-2.2L20 11M4 13l2.5 4.2A7 7 0 0 0 17.9 15"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>',
    profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M5 20c.5-4.5 2.8-7 7-7s6.5 2.5 7 7"/></svg>',
    timeline: '<svg viewBox="0 0 24 24"><circle cx="7" cy="6" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="7" cy="18" r="2"/><path d="M9 6h5a3 3 0 0 1 3 3v1M15 12h-5a3 3 0 0 0-3 3v1"/></svg>',
    note: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    action: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/></svg>'
  };
  return icons[name] || icons.people;
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

const STAFFING_OVERVIEW_DATA = [
  {
    region: T.east,
    roles: {
      regionalManager: { plan: 6, onboard: 4 },
      districtManager: { plan: 28, onboard: 15 },
      representative: { plan: 186, onboard: 81 }
    }
  },
  {
    region: T.south,
    roles: {
      regionalManager: { plan: 7, onboard: 5 },
      districtManager: { plan: 34, onboard: 21 },
      representative: { plan: 240, onboard: 124 }
    }
  },
  {
    region: T.west,
    roles: {
      regionalManager: { plan: 6, onboard: 5 },
      districtManager: { plan: 22, onboard: 17 },
      representative: { plan: 134, onboard: 88 }
    }
  },
  {
    region: T.north,
    roles: {
      regionalManager: { plan: 10, onboard: 6 },
      districtManager: { plan: 32, onboard: 16 },
      representative: { plan: 218, onboard: 108 }
    }
  }
];

const STAFFING_ROLE_LABELS = {
  overall: "总体",
  regionalManager: "大区经理",
  districtManager: "地区经理",
  representative: "代表"
};

function calcVacancy(plan, onboard) {
  return Math.max((Number(plan) || 0) - (Number(onboard) || 0), 0);
}

function calcRate(onboard, plan) {
  const total = Number(plan) || 0;
  if (!total) {
    return 0;
  }
  return Math.round(((Number(onboard) || 0) / total) * 100);
}

function sumRoles(roles) {
  const plan =
    roles.regionalManager.plan +
    roles.districtManager.plan +
    roles.representative.plan;
  const onboard =
    roles.regionalManager.onboard +
    roles.districtManager.onboard +
    roles.representative.onboard;

  return {
    plan,
    onboard,
    vacancy: calcVacancy(plan, onboard),
    rate: calcRate(onboard, plan)
  };
}

function normalizeStaffingMetric(metric) {
  const plan = Number(metric?.plan) || 0;
  const onboard = Number(metric?.onboard) || 0;
  return {
    plan,
    onboard,
    vacancy: calcVacancy(plan, onboard),
    rate: calcRate(onboard, plan)
  };
}

function getStaffingRateTone(rate) {
  if (rate >= 80) {
    return "green";
  }
  if (rate >= 60) {
    return "blue";
  }
  if (rate >= 40) {
    return "orange";
  }
  return "red";
}

function getStaffingRows(regions) {
  const order = (regions || []).map((region) => region.key);
  return STAFFING_OVERVIEW_DATA
    .map((region) => ({
      ...region,
      overall: sumRoles(region.roles),
      regionalManager: normalizeStaffingMetric(region.roles.regionalManager),
      districtManager: normalizeStaffingMetric(region.roles.districtManager),
      representative: normalizeStaffingMetric(region.roles.representative)
    }))
    .sort((a, b) => {
      const indexA = order.indexOf(a.region);
      const indexB = order.indexOf(b.region);
      return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
    });
}

function buildRoleProgressCard(label, metric) {
  const tone = getStaffingRateTone(metric.rate);
  return `
    <article class="role-progress-card rate-${tone}">
      <div class="role-progress-title">${escapeHtml(label)}</div>
      <div class="role-stats">
        <span class="role-stat-item">
          <em>编制</em>
          <strong>${metric.plan}</strong>
        </span>
        <span class="role-stat-item">
          <em>在岗</em>
          <strong>${metric.onboard}</strong>
        </span>
        <span class="role-stat-item">
          <em>空岗</em>
          <strong>${metric.vacancy}</strong>
        </span>
        <span class="role-stat-item role-rate-item">
          <em>到岗率</em>
          <span class="progress-wrap">
            <span class="progress-track">
              <span class="progress-fill" style="width:${metric.rate}%"></span>
            </span>
            <b class="progress-rate">${metric.rate}%</b>
          </span>
        </span>
      </div>
    </article>
  `;
}

function buildOverviewTable(regions) {
  const rows = getStaffingRows(regions)
    .map((region) => {
      return `
        <button class="staffing-row" type="button" data-region-row="${escapeHtml(region.region)}">
          <span class="staffing-region-cell">
            <span class="region-pill">
              <span>${escapeHtml(region.region)}</span>
              <b class="region-pill-arrow" aria-hidden="true">&rsaquo;</b>
            </span>
          </span>
          <span class="staffing-cell">${buildRoleProgressCard(STAFFING_ROLE_LABELS.overall, region.overall)}</span>
          <span class="staffing-cell">${buildRoleProgressCard(STAFFING_ROLE_LABELS.regionalManager, region.regionalManager)}</span>
          <span class="staffing-cell">${buildRoleProgressCard(STAFFING_ROLE_LABELS.districtManager, region.districtManager)}</span>
          <span class="staffing-cell">${buildRoleProgressCard(STAFFING_ROLE_LABELS.representative, region.representative)}</span>
        </button>
      `;
    })
    .join("");

  return `
    <div class="staffing-table" aria-label="四大战区编制与空岗进度总览">
      <div class="staffing-table-header">
        <span>区域</span>
        <span>${STAFFING_ROLE_LABELS.overall}</span>
        <span>${STAFFING_ROLE_LABELS.regionalManager}</span>
        <span>${STAFFING_ROLE_LABELS.districtManager}</span>
        <span>${STAFFING_ROLE_LABELS.representative}</span>
      </div>
      <div class="staffing-table-body">${rows}</div>
    </div>
  `;
}

function buildRegionPressure(vacancyRate) {
  if (vacancyRate >= 46) {
    return { label: "压力高", tone: "danger" };
  }
  if (vacancyRate >= 40) {
    return { label: "压力较高", tone: "warning" };
  }
  return { label: "压力可控", tone: "healthy" };
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

function formatOverviewNote(note) {
  return escapeHtml(note).replace(
    "建议优先补位",
    '<strong class="overview-note-keyword">建议优先补位</strong>'
  );
}
