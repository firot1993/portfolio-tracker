import { getPortfolioHistory, getAssetHistory } from './priceHistoryService.js';
import { query } from '../db/index.js';

export interface MetricsResult {
  range: string;
  startDate: string;
  endDate: string;
  startValue: number;
  endValue: number;
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  maxDrawdown: number;
  cagr: number | null;
  volatility: number | null;
  downside_volatility: number | null;
  bestDay: number | null;
  worstDay: number | null;
  winningDays: number;
  losingDays: number;
  winRate: number | null;
}

export interface AssetMetricsResult {
  assetId: number;
  symbol: string;
  range: string;
  startDate: string;
  endDate: string;
  startPrice: number;
  endPrice: number;
  totalReturn: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  maxDrawdown: number;
  volatility: number | null;
  correlation_with_portfolio: number | null;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function calculateSharpeRatio(returns: number[], riskFreeRate: number): number | null {
  const volatility = stdDev(returns);
  if (!volatility || volatility === 0) return null;
  const averageReturn = mean(returns);
  const dailyRiskFree = riskFreeRate / 365;
  return (averageReturn - dailyRiskFree) / volatility;
}

export function calculateSortinoRatio(returns: number[], riskFreeRate: number): number | null {
  const negativeReturns = returns.filter(r => r < 0);
  const downside = stdDev(negativeReturns);
  if (!downside || downside === 0) return null;
  const averageReturn = mean(returns);
  const dailyRiskFree = riskFreeRate / 365;
  return (averageReturn - dailyRiskFree) / downside;
}

export function calculateMaxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const value of values) {
    if (value > peak) peak = value;
    const drawdown = peak > 0 ? (value - peak) / peak : 0;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  return maxDrawdown;
}

export function calculateCAGR(startValue: number, endValue: number, years: number): number | null {
  if (years <= 0 || startValue <= 0) return null;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

export function calculateVolatility(returns: number[]): number | null {
  return stdDev(returns);
}

export function calculateDownsideVolatility(returns: number[]): number | null {
  const negativeReturns = returns.filter(r => r < 0);
  return stdDev(negativeReturns);
}

function calculateDailyReturns(values: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    if (prev === 0) continue;
    returns.push((curr - prev) / prev);
  }
  return returns;
}

export async function getPortfolioMetrics(userId: number, range: string, riskFreeRate: number): Promise<MetricsResult> {
  const history = await getPortfolioHistory(range, userId);
  if (history.length < 2) {
    throw new Error('Insufficient data to calculate metrics');
  }

  const values = history.map(point => point.value);
  const returns = calculateDailyReturns(values);
  const startValue = values[0];
  const endValue = values[values.length - 1];
  const startDate = history[0].date;
  const endDate = history[history.length - 1].date;

  const totalReturn = startValue ? (endValue - startValue) / startValue : 0;
  const days = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000));
  const years = days / 365;
  const annualizedReturn = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : totalReturn;

  const sharpeRatio = calculateSharpeRatio(returns, riskFreeRate);
  const sortinoRatio = calculateSortinoRatio(returns, riskFreeRate);
  const volatility = calculateVolatility(returns);
  const downsideVolatility = calculateDownsideVolatility(returns);
  const maxDrawdown = calculateMaxDrawdown(values);
  const cagr = calculateCAGR(startValue, endValue, years);

  const bestDay = returns.length ? Math.max(...returns) : null;
  const worstDay = returns.length ? Math.min(...returns) : null;
  const winningDays = returns.filter(r => r > 0).length;
  const losingDays = returns.filter(r => r < 0).length;
  const winRate = returns.length ? winningDays / returns.length : null;

  return {
    range,
    startDate,
    endDate,
    startValue,
    endValue,
    totalReturn,
    annualizedReturn,
    sharpeRatio,
    sortinoRatio,
    maxDrawdown,
    cagr,
    volatility,
    downside_volatility: downsideVolatility,
    bestDay,
    worstDay,
    winningDays,
    losingDays,
    winRate,
  };
}

function calculateCorrelation(seriesA: number[], seriesB: number[]): number | null {
  if (seriesA.length !== seriesB.length || seriesA.length < 2) return null;
  const meanA = mean(seriesA);
  const meanB = mean(seriesB);
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < seriesA.length; i++) {
    const diffA = seriesA[i] - meanA;
    const diffB = seriesB[i] - meanB;
    numerator += diffA * diffB;
    denomA += diffA * diffA;
    denomB += diffB * diffB;
  }
  if (denomA === 0 || denomB === 0) return null;
  return numerator / Math.sqrt(denomA * denomB);
}

export async function getAssetMetrics(userId: number, assetId: number, range: string, riskFreeRate: number): Promise<AssetMetricsResult> {
  const asset = query<{ id: number; symbol: string }>('SELECT id, symbol FROM assets WHERE id = ?', [assetId])[0];
  if (!asset) {
    throw new Error('Asset not found');
  }

  const history = await getAssetHistory(assetId, range, userId);
  if (history.length < 2) {
    throw new Error('Insufficient data to calculate asset metrics');
  }

  const prices = history.map(point => point.price);
  const returns = calculateDailyReturns(prices);
  const startPrice = prices[0];
  const endPrice = prices[prices.length - 1];
  const startDate = history[0].date;
  const endDate = history[history.length - 1].date;

  const totalReturn = startPrice ? (endPrice - startPrice) / startPrice : 0;
  const sharpeRatio = calculateSharpeRatio(returns, riskFreeRate);
  const sortinoRatio = calculateSortinoRatio(returns, riskFreeRate);
  const volatility = calculateVolatility(returns);
  const maxDrawdown = calculateMaxDrawdown(prices);

  const portfolioHistory = await getPortfolioHistory(range, userId);
  const portfolioValues = portfolioHistory.map(point => point.value);
  const portfolioReturns = calculateDailyReturns(portfolioValues);
  const minLength = Math.min(returns.length, portfolioReturns.length);
  const correlation = minLength >= 2
    ? calculateCorrelation(returns.slice(-minLength), portfolioReturns.slice(-minLength))
    : null;

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    range,
    startDate,
    endDate,
    startPrice,
    endPrice,
    totalReturn,
    sharpeRatio,
    sortinoRatio,
    maxDrawdown,
    volatility,
    correlation_with_portfolio: correlation,
  };
}
