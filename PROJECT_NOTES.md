# Recruitment Dashboard Notes

## Current Data Source

- The dashboard can read from Feishu Bitable first and fall back to the local Excel file.
- Current local fallback file: `招聘汇报表格汇总 (1).xlsx`
- `server.js` should prefer Feishu when the required env vars are present.
- If Feishu fails, the app should gracefully fall back to the local workbook.

## Current Page Structure

- `Overview`
  - Shows the four merged regions: East, South, West, North.
  - Region cards are the entry point into the detail flow.
- `Region Detail`
  - Shows region summary, metrics, status distribution, recruiting progress cards.
  - Keeps recruiting-process information only.
  - Should stay relatively clean and not absorb roster-heavy content.
- `Regional Manager Subpage`
  - Opened by clicking the `大区经理` metric card inside region detail.
  - Shows roster information for regional managers.
- `District Manager Subpage`
  - Opened by clicking the `地区经理` metric card inside region detail.
  - Shows roster information for district managers.
- `Specialist Subpage`
  - Opened by clicking a specific district-manager row inside the district-manager subpage.
  - Shows the specialists managed by that district manager and the hospitals each specialist covers.

## Roster Placement Rules

- Roster information should live in subpages, not inside the main region detail page.
- Regional manager roster can use richer grouped cards.
- District manager roster should stay lightweight and scan-friendly.
- District manager roster is grouped by `大区` first, then shows the managers/territories inside each group.

## Current Display Rules

- Empty regional-manager positions should display the manager name as `待招`.
- District-manager rows should stay compact.
- District-manager subpage currently emphasizes:
  - manager name
  - responsible territory
  - grouped by parent `大区`
- Specialist subpage should:
  - keep `地区经理 -> 专员 -> 医院` hierarchy clear
  - show vacant specialists as `待招`
  - avoid flattening repeated hospital-detail rows directly into the page

## Data Interpretation Rules

- Recruiting progress in the region detail page is based on:
  - Feishu table `创新药销售管理岗` when available
  - otherwise sheet `创新药销售管理岗`
  - department `创新药销售部`
  - levels `大区经理` and `地区经理`
- Summary metrics are based on:
  - Feishu table `创新药销售招聘汇总` when available
  - otherwise sheet `创新药销售招聘汇总`
- Roster-based manager pages are based on:
  - Feishu table `花名册表` when available
  - otherwise sheet `花名册表`
- Specialist drill-down is based on:
  - Feishu table `专员` when available
  - otherwise sheet `专员`
  - aggregated by `区域 / 大区 / 地区 / 地区经理 / 专员 / 医院`

## Feishu Integration

- The whole dashboard should now prefer Feishu Bitable data.
- Required env vars:
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET`
  - `FEISHU_BITABLE_APP_TOKEN`
  - `FEISHU_BITABLE_VIEW_ID` (optional but preferred)
- The server resolves the required Feishu tables by name inside the same Bitable base:
  - `创新药销售招聘汇总`
  - `创新药销售管理岗`
  - `花名册表`
  - `专员`
- If Feishu fetch fails, the server should gracefully fall back to the local Excel sheets.

## Interaction Rules

- Auto-refresh should not kick the user out of the current subpage.
- If the user is on a manager subpage, refresh should keep them there.
- Back button behavior:
  - from regional/district manager subpage -> back to region detail
  - from specialist subpage -> back to district manager subpage
  - from region detail -> back to overview

## Visual Direction

- The UI should avoid harsh high contrast and avoid ugly yellow-orange dominance.
- Current direction is softer and more executive-report-like:
  - muted blue-gray + warm off-white
  - readable but not aggressive contrast
- If visuals are adjusted later:
  - preserve readability first
  - keep hierarchy clean
  - avoid overly noisy colors

## User Preferences Captured So Far

- Dynamic data is required.
- Local Excel is acceptable as the current dynamic source.
- Main detail pages should not become cluttered.
- New information modules should often become subpages instead of being squeezed into one page.
- District-manager information should be concise and easy to scan.
