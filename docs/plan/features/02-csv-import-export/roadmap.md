# Feature Roadmap: CSV Import/Export

> **Category:** Data Management  
> **Priority:** High  
> **Effort:** Medium  
> **Target Version:** v1.2  
> **Status:** Planned

---

## Overview

Allow users to import transactions from brokerage CSV exports and export their portfolio data for analysis or tax reporting.

---

## Goals

1. Save time by importing transactions from brokerages
2. Support popular export formats (Binance, Coinbase, IBKR, Futu)
3. Provide validation and preview before import
4. Enable data portability with export functionality

---

## User Stories

- As a user, I want to import my Binance trade history so that I don't manually enter hundreds of transactions
- As a user, I want to preview my import before confirming so that I can catch errors
- As a user, I want to export my transactions for tax reporting so that I can file taxes accurately

---

## Supported Formats

| Platform | Type | Priority | File Pattern |
|----------|------|----------|--------------|
| Binance | Crypto | High | trade_export_*.csv |
| Coinbase | Crypto | High | transactions.csv |
| Interactive Brokers | Stocks | Medium | U1234567_*.csv |
| Futu/Moomoo | Stocks | Medium | orders_*.csv |
| Generic | Universal | High | Any CSV with required columns |

### Required Columns (Generic Format)

| Column | Format | Example |
|--------|--------|---------|
| Date | ISO 8601 or locale | 2024-01-15 |
| Symbol | Asset symbol | BTC, AAPL, 600519 |
| Type | buy/sell | buy |
| Quantity | Number | 1.5 |
| Price | Number | 42000.50 |
| Fee | Number (optional) | 5.00 |

---

## Features

### 1. CSV Import Wizard
- Multi-step import process
- File upload with drag-and-drop
- Format selection or auto-detection
- Preview parsed data
- Validation error display
- Duplicate detection
- Column mapping for custom formats

### 2. Export Functionality
- Export transactions to CSV
- Export holdings snapshot
- Date range selection
- Multiple format options (CSV, JSON)

### 3. Templates
- Download CSV template for manual entry
- Format-specific examples

---

## Technical Implementation

### Backend API

#### New Endpoints

```typescript
// POST /api/import/csv/preview
// Upload and preview CSV before import
// Body: multipart/form-data with file and format
// Response: Parsed data with validation results
{
  "valid": [
    { "date": "2024-01-01", "symbol": "BTC", "type": "buy", "quantity": 0.5, "price": 42000 }
  ],
  "invalid": [
    { "row": 5, "reason": "Invalid date format", "data": { ... } }
  ],
  "warnings": ["Row 3: Fee not specified, defaulting to 0"],
  "summary": { "totalRows": 100, "validRows": 98, "invalidRows": 2 }
}

// POST /api/import/csv/confirm
// Actually import the validated transactions
// Body: { transactions: ParsedTransaction[] }
// Response: Import summary
{
  "imported": 98,
  "failed": 0,
  "createdAssets": ["BTC", "ETH"],
  "updatedHoldings": ["BTC", "ETH"]
}

// GET /api/export/transactions?startDate=&endDate=&format=csv
// Export transactions as CSV or JSON
// Response: File download

// GET /api/import/csv/template?format=generic
// Download CSV template for manual entry
```

#### Services

**CSV Parser Service** (`backend/src/services/csvService.ts`)

```typescript
export interface ParsedTransaction {
  date: Date;
  symbol: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  total: number;
}

export interface CsvParseResult {
  valid: ParsedTransaction[];
  invalid: Array<{ row: number; reason: string; data: any }>;
  warnings: string[];
  summary: { totalRows: number; validRows: number; invalidRows: number };
}

// Supported parsers
export function parseBinanceCsv(content: string): CsvParseResult;
export function parseCoinbaseCsv(content: string): CsvParseResult;
export function parseIBKRCsv(content: string): CsvParseResult;
export function parseFutuCsv(content: string): CsvParseResult;
export function parseGenericCsv(content: string): CsvParseResult;

// Auto-detect format
export function detectCsvFormat(content: string): string;

// Validation
export function validateTransactions(transactions: ParsedTransaction[]): CsvParseResult;
```

### Frontend Components

#### New Components

1. **ImportModal** - Multi-step import wizard
2. **FileUploadZone** - Drag-and-drop file upload
3. **ImportPreviewTable** - Preview with validation errors
4. **ColumnMapper** - Map custom CSV columns
5. **ExportPanel** - Export settings and download

#### Import Flow

```
Step 1: Upload
┌─────────────────────────────────────┐
│  Import Transactions                │
│                                     │
│    ┌─────────────────────────┐      │
│    │   📁 Drop CSV here      │      │
│    │   or click to browse    │      │
│    └─────────────────────────┘      │
│                                     │
│  Format: [Generic ▼]                │
│                                     │
│  [Download Template]                │
└─────────────────────────────────────┘

Step 2: Preview
┌─────────────────────────────────────┐
│  Preview (98/100 valid)             │
│                                     │
│  Date       | Symbol | Type | Qty   │
│  2024-01-01 | BTC    | BUY  | 0.5   │
│  2024-01-02 | ETH    | BUY  | 2.0   │
│  ⚠️ Row 5: Invalid date             │
│                                     │
│  [Back] [Skip Invalid] [Import 98]  │
└─────────────────────────────────────┘

Step 3: Success
┌─────────────────────────────────────┐
│  Import Complete!                   │
│                                     │
│  ✅ 98 transactions imported        │
│  ✅ 2 new assets created            │
│  ✅ Holdings updated                │
│                                     │
│           [Done]                    │
└─────────────────────────────────────┘
```

---

## Tasks

### Phase 1: Backend (Week 1)
- [ ] Install csv-parse and csv-stringify packages
- [ ] Create CSV parser service
- [ ] Implement Binance parser
- [ ] Implement Coinbase parser
- [ ] Implement generic parser
- [ ] Add preview endpoint
- [ ] Add confirm import endpoint
- [ ] Add export endpoint
- [ ] Write parser unit tests

### Phase 2: Frontend (Week 2)
- [ ] Create ImportModal component
- [ ] Implement file upload with drag-and-drop
- [ ] Create preview table component
- [ ] Add format selector
- [ ] Create export UI
- [ ] Add template download

### Phase 3: Additional Formats (Week 3)
- [ ] Implement IBKR parser
- [ ] Implement Futu parser
- [ ] Add format auto-detection
- [ ] Column mapping for custom formats
- [ ] Duplicate detection logic
- [ ] E2E tests

---

## Dependencies

```json
{
  "backend": {
    "csv-parse": "^5.0.0",
    "csv-stringify": "^6.0.0",
    "multer": "^1.4.0"
  },
  "frontend": {
    "react-dropzone": "^14.0.0"
  }
}
```

---

## Error Handling

| Error | Handling |
|-------|----------|
| Invalid CSV format | Show error with expected format |
| Missing required columns | Show which columns are missing |
| Invalid date format | Try multiple formats, show examples |
| Duplicate transactions | Detect and warn, allow skip |
| Unknown symbols | Create asset or prompt user |
| Negative quantities | Flag as error |

---

## Security Considerations

- Validate file size (max 10MB)
- Scan for malicious content
- Sanitize parsed data
- Rate limit import endpoints

---

## Success Metrics

- Support for top 5 brokerage formats
- Import 1000 transactions in < 5 seconds
- < 1% error rate for supported formats

---

## Future Enhancements

- PDF statement parsing (OCR)
- Direct API import from exchanges
- Scheduled auto-import
- Import history/log
- Undo import functionality

---

*Last Updated: 2026-02-05*  
*Related: [Exchange API Sync](../07-exchange-api-sync/roadmap.md)*
