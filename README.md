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
- 💱 USD/CNY currency conversion
- 📝 Transaction history with P&L tracking

## Tech Stack

- **Frontend:** React + TypeScript + Vite + Recharts
- **Backend:** Node.js + Express + SQLite (sql.js)
- **Data Sources:** CoinGecko, Yahoo Finance, Sina Finance

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| GET /api/portfolio/summary | Portfolio overview with allocation |
| GET /api/holdings | All holdings with current values |
| GET /api/assets | List tracked assets |
| POST /api/assets | Add new asset |
| GET /api/transactions | Transaction history |
| POST /api/transactions | Add transaction |
