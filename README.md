# Portfolio Tracker

A personal investment tracking application for crypto, US stocks, China A-shares, and gold.

## Quick Start

### Backend
```bash
cd backend
npm install
npm run dev
```
API runs at http://localhost:3001

### Historical Data Collector
```bash
cd backend
npm run collector -- daily
npm run collector -- backfills
npm run collector -- all
```
The collector writes daily snapshots and price history into the database. It is intended to run separately from the API server (cron or a background process).

### Frontend
```bash
cd frontend
npm install
npm run dev
```
UI runs at http://localhost:5173

## Features

- 📊 Unified dashboard with total portfolio value
- 💰 Track holdings across multiple asset classes
- 📈 Real-time price fetching (CoinGecko, Yahoo Finance, Sina)
- 🗓️ Historical performance charts (via collector)
- 💱 USD/CNY currency conversion
- 📝 Transaction history with P&L tracking

## Tech Stack

- **Frontend:** React + TypeScript + Vite + Recharts
- **Backend:** Node.js + Express + SQLite (sql.js)
- **Data Sources:** CoinGecko, Yahoo Finance, Sina Finance

## Architecture

The system is split into two processes:
- **API Server:** handles CRUD and read-only history queries.
- **Collector:** runs on a schedule, fetches prices, and writes `price_history` and `price_snapshots`.

This keeps history collection reliable and decoupled from API traffic.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| GET /api/portfolio/summary | Portfolio overview with allocation |
| GET /api/holdings | All holdings with current values |
| GET /api/assets | List tracked assets |
| POST /api/assets | Add new asset |
| GET /api/transactions | Transaction history |
| POST /api/transactions | Add transaction |
| GET /api/history/portfolio | Portfolio value history |
| GET /api/history/asset/:id | Asset price history |
| POST /api/history/snapshot | Trigger collector run |
