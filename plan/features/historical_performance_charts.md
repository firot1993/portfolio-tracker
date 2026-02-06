# Historical Performance Charts Implementation Plan

## Goal
Implement a visual representation of portfolio value over time to track performance (P&L) and total value trends.

## Features
1. **Backend**
   - [x] Database schema for `price_snapshots` (date, total_value, total_cost).
   - [x] Service to calculate and record daily portfolio snapshots.
   - [x] API endpoint to fetch history data (`GET /api/history/portfolio`).
   - [x] **Task**: Automate daily snapshot recording (cron or startup check).

2. **Frontend**
   - [x] Chart component using Recharts.
   - [x] Time range selector (1D, 1W, 1M, etc.).
   - [x] Integration into Dashboard.
   - [ ] **Task**: Verify chart data loading and display.

## Implementation Details

### Database Schema
```sql
CREATE TABLE price_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date DATE NOT NULL UNIQUE,
    total_value_usd REAL,
    total_cost_usd REAL,
    usdcny_rate REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### API Endpoints
- `GET /api/history/portfolio?range=1M`
- `POST /api/history/snapshot` (Manual trigger)

### Automation
- Add a check on server startup to record a snapshot for the current day if one doesn't exist.
- Optionally add a scheduled task (e.g., `node-cron`) to record snapshots at market close or midnight.

## Status
- Core logic implemented in `backend/src/services/priceHistoryService.ts`.
- Routes implemented in `backend/src/routes/history.ts`.
- UI component implemented in `frontend/src/components/PerformanceChart.tsx`.
- **Done**: Automatic snapshot triggering is now implemented in `backend/src/index.ts`.

## Next Steps
1. Verify the chart works with real data.
