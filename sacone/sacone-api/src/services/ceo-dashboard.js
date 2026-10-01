import { AppError } from '../core/http.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';

const repo = repos.ceoDashboard;
const financeTxn = repos.financeTransactions;

function startOfLocalDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date = new Date()) {
  const d = startOfLocalDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function startOfMonth(date = new Date()) {
  const d = startOfLocalDay(date);
  d.setDate(1);
  return d;
}

function startOfQuarter(date = new Date()) {
  const d = startOfLocalDay(date);
  const q = Math.floor(d.getMonth() / 3) * 3;
  d.setMonth(q, 1);
  return d;
}

/** Indian FY: 1 Apr → 31 Mar */
function startOfFinancialYear(date = new Date()) {
  const d = startOfLocalDay(date);
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(year, 3, 1);
}

function parseDateInput(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const d = raw.length <= 10
    ? new Date(`${raw}T00:00:00`)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function round2(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Resolve inclusive UI range to [dateFrom, dateTo) ISO strings.
 */
export function resolveCeoDateRange({ preset = 'today', dateFrom, dateTo } = {}) {
  const now = new Date();
  let from;
  let to;

  switch (String(preset || 'today')) {
    case 'today':
      from = startOfLocalDay(now);
      to = addDays(from, 1);
      break;
    case 'yesterday':
      to = startOfLocalDay(now);
      from = addDays(to, -1);
      break;
    case 'week':
    case 'this_week':
      from = startOfWeek(now);
      to = addDays(from, 7);
      break;
    case 'last_week': {
      const thisWeek = startOfWeek(now);
      to = thisWeek;
      from = addDays(thisWeek, -7);
      break;
    }
    case 'month':
    case 'this_month':
      from = startOfMonth(now);
      to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
      break;
    case 'last_month': {
      const thisMonth = startOfMonth(now);
      to = thisMonth;
      from = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 1, 1);
      break;
    }
    case 'this_quarter':
      from = startOfQuarter(now);
      to = new Date(from.getFullYear(), from.getMonth() + 3, 1);
      break;
    case 'this_fy':
    case 'this_financial_year':
      from = startOfFinancialYear(now);
      to = new Date(from.getFullYear() + 1, 3, 1);
      break;
    case 'custom': {
      from = parseDateInput(dateFrom);
      const end = parseDateInput(dateTo);
      if (!from || !end) {
        throw new AppError('Custom range requires dateFrom and dateTo (YYYY-MM-DD)', 400);
      }
      from = startOfLocalDay(from);
      to = addDays(startOfLocalDay(end), 1);
      if (to <= from) {
        throw new AppError('dateTo must be on or after dateFrom', 400);
      }
      break;
    }
    default:
      throw new AppError(
        'Invalid date preset. Use today, yesterday, this_week, last_week, this_month, last_month, this_quarter, this_fy, or custom',
        400
      );
  }

  return {
    preset: String(preset || 'today'),
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
    labelFrom: toLocalDateStr(from),
    labelTo: toLocalDateStr(addDays(to, -1)),
    durationMs: to.getTime() - from.getTime(),
  };
}

function previousComparableRange(range) {
  const from = new Date(range.dateFrom);
  const to = new Date(range.dateTo);
  const duration = to.getTime() - from.getTime();
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - duration);
  return {
    preset: 'previous_comparable',
    dateFrom: prevFrom.toISOString(),
    dateTo: prevTo.toISOString(),
    labelFrom: toLocalDateStr(prevFrom),
    labelTo: toLocalDateStr(addDays(prevTo, -1)),
  };
}

function delta(current, previous) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  const change = round2(cur - prev);
  let percentChange = null;
  if (prev !== 0) percentChange = round2((change / Math.abs(prev)) * 100);
  else if (cur !== 0) percentChange = 100;
  else percentChange = 0;
  return {
    current: cur,
    previous: prev,
    change,
    percentChange,
    trend: change > 0.009 ? 'up' : change < -0.009 ? 'down' : 'flat',
  };
}

function parseFilters(query = {}) {
  return {
    companyId: query.companyId || query.firmId || null,
    branchId: query.branchId || null, // reserved
    warehouseId: query.warehouseId || null,
    salespersonId: query.salespersonId || null,
    categoryId: query.categoryId || null,
    brandId: query.brandId || null,
  };
}

function computeHealthScore({
  salesDelta,
  profitDelta,
  cashFlow,
  receivables,
  payables,
  inventoryHealth,
  inventoryValue,
  weights,
}) {
  const factors = [];

  // Sales trend: up good
  let salesScore = 50;
  if (salesDelta.percentChange > 5) salesScore = 90;
  else if (salesDelta.percentChange > 0) salesScore = 75;
  else if (salesDelta.percentChange > -10) salesScore = 45;
  else salesScore = 25;
  factors.push({ key: 'sales_trend', label: 'Sales trend', score: salesScore, weight: weights.salesTrend });

  let gpScore = 50;
  if (profitDelta.percentChange > 5) gpScore = 90;
  else if (profitDelta.current > 0 && profitDelta.percentChange >= 0) gpScore = 75;
  else if (profitDelta.current > 0) gpScore = 55;
  else gpScore = 20;
  factors.push({ key: 'gross_profit', label: 'Gross profit trend', score: gpScore, weight: weights.grossProfit });

  let cashScore = 50;
  if (cashFlow.periodNetCash > 0) cashScore = 80;
  else if (cashFlow.periodNetCash === 0) cashScore = 55;
  else cashScore = 30;
  factors.push({ key: 'cash_flow', label: 'Cash flow (period)', score: cashScore, weight: weights.cashFlow });

  const invVal = inventoryValue.atCost || 1;
  const recvRatio = receivables.total / invVal;
  let recvScore = 70;
  if (recvRatio > 1) recvScore = 25;
  else if (recvRatio > 0.5) recvScore = 45;
  else if (receivables.total === 0) recvScore = 85;
  factors.push({ key: 'receivables', label: 'Receivables pressure', score: recvScore, weight: weights.receivables });

  const payRatio = payables.total / invVal;
  let payScore = 70;
  if (payRatio > 1) payScore = 30;
  else if (payRatio > 0.5) payScore = 50;
  else if (payables.total === 0) payScore = 85;
  factors.push({ key: 'payables', label: 'Payables pressure', score: payScore, weight: weights.payables });

  let invScore = 70;
  if (inventoryHealth.negativeStock > 0) invScore -= 30;
  if (inventoryHealth.deadStock > 10) invScore -= 20;
  else if (inventoryHealth.deadStock > 0) invScore -= 10;
  if (inventoryHealth.lowStock > 15) invScore -= 15;
  else if (inventoryHealth.lowStock > 0) invScore -= 5;
  invScore = Math.max(0, Math.min(100, invScore));
  factors.push({ key: 'inventory', label: 'Inventory health', score: invScore, weight: weights.inventory });

  const weightSum = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const score = Math.round(factors.reduce((s, f) => s + (f.score * f.weight), 0) / weightSum);
  let category = 'Needs Attention';
  if (score >= 80) category = 'Excellent';
  else if (score >= 65) category = 'Good';
  else if (score >= 40) category = 'Needs Attention';
  else category = 'Critical';

  return {
    score,
    category,
    disclaimer: 'Indicative score for management attention — not a precise accounting metric.',
    factors,
    weights,
  };
}

export class CeoDashboardService {
  getFilterOptions(actor) {
    authService.checkPermission(actor.permissions, 'reports.ceo_dashboard.view');
    return {
      ...repo.listFilterOptions(),
      presets: [
        { id: 'today', label: 'Today' },
        { id: 'yesterday', label: 'Yesterday' },
        { id: 'this_week', label: 'This Week' },
        { id: 'last_week', label: 'Last Week' },
        { id: 'this_month', label: 'This Month' },
        { id: 'last_month', label: 'Last Month' },
        { id: 'this_quarter', label: 'This Quarter' },
        { id: 'this_fy', label: 'This Financial Year' },
        { id: 'custom', label: 'Custom Date Range' },
      ],
      multiFirmReady: true,
      multiBranchReady: false,
      note: 'Branch filter is reserved for future multi-branch. Firm maps to company record.',
    };
  }

  getDashboard(query, actor) {
    authService.checkPermission(actor.permissions, 'reports.ceo_dashboard.view');

    const range = resolveCeoDateRange(query);
    const prevRange = previousComparableRange(range);
    const filters = parseFilters(query);
    const settings = repo.getCeoSettings();
    const granularity = ['daily', 'weekly', 'monthly'].includes(query.granularity)
      ? query.granularity
      : (range.durationMs > 1000 * 60 * 60 * 24 * 60 ? 'monthly'
        : range.durationMs > 1000 * 60 * 60 * 24 * 14 ? 'weekly' : 'daily');

    const { dateFrom, dateTo } = range;
    const sales = repo.salesTotals(dateFrom, dateTo, filters);
    const prevSales = repo.salesTotals(prevRange.dateFrom, prevRange.dateTo, filters);
    const purchases = repo.purchasesTotals(dateFrom, dateTo, filters);
    const prevPurchases = repo.purchasesTotals(prevRange.dateFrom, prevRange.dateTo, filters);
    const profit = repo.estimatedGrossProfit(dateFrom, dateTo, filters);
    const prevProfit = repo.estimatedGrossProfit(prevRange.dateFrom, prevRange.dateTo, filters);
    const cash = repo.cashCollections(dateFrom, dateTo, filters);
    const prevCash = repo.cashCollections(prevRange.dateFrom, prevRange.dateTo, filters);
    const cashFlow = repo.cashFlowSummary(dateFrom, dateTo, filters);
    const upiFlow = repo.upiFlowSummary(dateFrom, dateTo, filters);
    const manualFlow = financeTxn.postedFlowByMode(dateFrom, dateTo);
    const manualTotals = financeTxn.postedTotals(dateFrom, dateTo);
    const paymentCollections = repo.cashCollections(dateFrom, dateTo, filters);
    const supplierPayments = repo.supplierPaymentsByMethod(dateFrom, dateTo);

    cashFlow.cashIn.otherCashReceipts = round2(manualFlow.cashIn);
    cashFlow.cashIn.total = round2(cashFlow.cashIn.total + manualFlow.cashIn);
    cashFlow.cashOut.expenses = round2(manualFlow.cashOut);
    cashFlow.cashOut.total = round2(cashFlow.cashOut.total + manualFlow.cashOut);
    cashFlow.periodNetCash = round2(cashFlow.cashIn.total - cashFlow.cashOut.total);
    cashFlow.manualBreakdown = {
      cashIn: manualFlow.cashIn,
      cashOut: manualFlow.cashOut,
    };
    cashFlow.note = 'Includes POS cash, supplier cash payments, and manual finance entries. Opening/closing cash book uses payment account opening balances when configured.';

    upiFlow.upiReceived = round2(upiFlow.upiReceived + manualFlow.upiIn);
    upiFlow.upiPaid = round2(upiFlow.upiPaid + manualFlow.upiOut);
    upiFlow.netUpiFlow = round2(upiFlow.upiReceived - upiFlow.upiPaid);
    upiFlow.manualBreakdown = { upiIn: manualFlow.upiIn, upiOut: manualFlow.upiOut };

    const bankFlow = {
      openingBank: null,
      bankIn: round2((paymentCollections.byMethod.bank || 0) + (paymentCollections.byMethod.cheque || 0) + manualFlow.bankIn),
      bankOut: round2((supplierPayments.byMethod.bank || 0) + (supplierPayments.byMethod.cheque || 0) + manualFlow.bankOut),
      posBankIn: round2((paymentCollections.byMethod.bank || 0) + (paymentCollections.byMethod.cheque || 0)),
      supplierBankOut: round2((supplierPayments.byMethod.bank || 0) + (supplierPayments.byMethod.cheque || 0)),
      manualBankIn: manualFlow.bankIn,
      manualBankOut: manualFlow.bankOut,
    };
    bankFlow.netBankFlow = round2(bankFlow.bankIn - bankFlow.bankOut);
    bankFlow.closingBank = null;

    const accountBalances = financeTxn.accountBalances();
    const cashAccount = accountBalances.find((a) => a.accountType === 'cash');
    const upiAccount = accountBalances.find((a) => a.accountType === 'upi');
    const bankAccount = accountBalances.find((a) => a.accountType === 'bank');
    if (cashAccount) {
      cashFlow.openingCash = cashAccount.openingBalance;
      cashFlow.closingCash = cashAccount.closingBalance;
    }
    if (upiAccount) {
      upiFlow.openingUpi = upiAccount.openingBalance;
      upiFlow.closingUpi = upiAccount.closingBalance;
    }
    if (bankAccount) {
      bankFlow.openingBank = bankAccount.openingBalance;
      bankFlow.closingBank = bankAccount.closingBalance;
    }

    const estimatedOperatingProfit = round2(
      profit.estimatedGrossProfit + manualTotals.otherIncome - manualTotals.operatingExpenses
    );
    const inventoryValue = repo.inventoryValue(filters);
    const inventoryHealth = repo.inventoryHealthCounts(settings, filters);
    const receivables = repo.receivables();
    const payables = repo.payables();
    const arAging = repo.receivablesAging();
    const apAging = repo.payablesAging();

    const salesDelta = delta(sales.netSales, prevSales.netSales);
    const grossSalesDelta = delta(sales.grossSales, prevSales.grossSales);
    const purchaseDelta = delta(purchases.purchaseTotal, prevPurchases.purchaseTotal);
    const profitDelta = delta(profit.estimatedGrossProfit, prevProfit.estimatedGrossProfit);
    const marginDelta = delta(profit.grossMarginPercent, prevProfit.grossMarginPercent);
    const cashRecvDelta = delta(cash.byMethod.cash, prevCash.byMethod.cash);
    const upiRecvDelta = delta(cash.byMethod.upi, prevCash.byMethod.upi);
    const bankRecvDelta = delta(cash.byMethod.bank, prevCash.byMethod.bank);

    const profitability = repo.profitabilityByInvoice(dateFrom, dateTo, filters, { limit: 25, sort: 'recent' });
    const trend = repo.salesPurchaseTrend(dateFrom, dateTo, granularity, filters);
    const dailyFlows = repo.dailyCashFlow(dateFrom, dateTo, filters);

    const health = computeHealthScore({
      salesDelta,
      profitDelta,
      cashFlow,
      receivables,
      payables,
      inventoryHealth,
      inventoryValue,
      weights: settings.healthWeights,
    });

    return {
      generatedAt: new Date().toISOString(),
      range,
      previousRange: prevRange,
      filters,
      settings: {
        deadStockDays: settings.deadStockDays,
        slowMovingMaxQty: settings.slowMovingMaxQty,
        minMarginPercent: settings.minMarginPercent,
        unusualDiscountPercent: settings.unusualDiscountPercent,
        costingMethod: settings.costingMethod,
        refreshSeconds: settings.refreshSeconds,
      },
      readOnly: true,
      financialLabels: {
        grossProfitNote: 'Estimated gross profit from product purchase price — not accounting net profit.',
        operatingProfitNote: 'Gross profit + other manual income − operating expenses. Not full net profit after tax.',
        costingNote: profit.costingNote,
      },
      healthScore: health,
      kpis: {
        grossSales: { ...grossSalesDelta, label: 'Gross Sales' },
        netSales: { ...salesDelta, label: 'Net Sales', hint: 'Gross sales invoices − completed returns' },
        purchaseValue: { ...purchaseDelta, label: 'Purchase Value' },
        grossProfit: { ...profitDelta, label: 'Gross Profit (est.)' },
        grossMarginPercent: { ...marginDelta, label: 'Gross Margin %' },
        cashReceived: { ...cashRecvDelta, label: 'Cash Received' },
        upiReceived: { ...upiRecvDelta, label: 'UPI Received' },
        bankReceived: { ...bankRecvDelta, label: 'Bank Received' },
        customerReceivables: {
          current: receivables.total,
          previous: null,
          change: null,
          percentChange: null,
          trend: 'flat',
          label: 'Customer Receivables',
          hint: `${receivables.customerCount} customers`,
        },
        supplierPayables: {
          current: payables.total,
          previous: null,
          change: null,
          percentChange: null,
          trend: 'flat',
          label: 'Supplier Payables',
          hint: `${payables.supplierCount} suppliers`,
        },
        inventoryValue: {
          current: inventoryValue.atCost,
          previous: null,
          change: null,
          percentChange: null,
          trend: 'flat',
          label: 'Inventory Value',
          hint: 'At purchase cost',
        },
        cashFlowPosition: {
          current: cashFlow.periodNetCash,
          previous: null,
          change: null,
          percentChange: null,
          trend: cashFlow.periodNetCash >= 0 ? 'up' : 'down',
          label: 'Cash Flow Position',
          hint: 'Period cash in − cash out (includes manual entries)',
        },
        otherIncome: {
          current: manualTotals.otherIncome,
          previous: null,
          change: null,
          percentChange: null,
          trend: manualTotals.otherIncome > 0 ? 'up' : 'flat',
          label: 'Other Income',
          hint: 'Manual income entries (posted)',
        },
        operatingExpenses: {
          current: manualTotals.operatingExpenses,
          previous: null,
          change: null,
          percentChange: null,
          trend: manualTotals.operatingExpenses > 0 ? 'down' : 'flat',
          label: 'Operating Expenses',
          hint: 'Manual expense entries (posted)',
        },
        estimatedOperatingProfit: {
          current: estimatedOperatingProfit,
          previous: null,
          change: null,
          percentChange: null,
          trend: estimatedOperatingProfit >= 0 ? 'up' : 'down',
          label: 'Est. Operating Profit',
          hint: 'Gross profit + other income − operating expenses',
        },
      },
      salesBreakdown: {
        period: sales,
        previous: prevSales,
        invoiceCount: sales.invoiceCount,
      },
      profit: {
        ...profit,
        otherIncome: manualTotals.otherIncome,
        operatingExpenses: manualTotals.operatingExpenses,
        estimatedOperatingProfit,
        formula: 'Gross Profit + Other Income − Operating Expenses = Estimated Operating Profit',
      },
      cashFlow,
      upiFlow,
      bankFlow,
      manualFinance: {
        totals: manualTotals,
        flow: manualFlow,
        accounts: accountBalances,
      },
      salesAgentPerformance: (() => {
        try {
          return repos.saleCommissions.performanceReport({ dateFrom, dateTo });
        } catch {
          return [];
        }
      })(),
      recentUpi: repo.recentUpiTransactions(15),
      paymentPosition: {
        customer: {
          total: receivables.total,
          overdue: arAging.overdue,
          dueToday: arAging.dueToday,
          upcoming: arAging.upcoming,
          aging: arAging,
        },
        supplier: {
          total: payables.total,
          overdue: apAging.overdue,
          dueToday: apAging.dueToday,
          upcoming: apAging.upcoming,
          aging: apAging,
        },
      },
      inventory: {
        ...inventoryValue,
        health: inventoryHealth,
        byCategory: repo.inventoryByDimension('category', filters),
        byBrand: repo.inventoryByDimension('brand', filters),
        byWarehouse: repo.inventoryByDimension('warehouse', filters),
      },
      charts: {
        salesVsPurchaseVsProfit: trend,
        granularity,
        dailyCashFlow: dailyFlows,
      },
      profitability: {
        summary: profitability.summary,
        invoices: profitability.items,
        linesSample: repo.profitabilityByLine(dateFrom, dateTo, filters, { limit: 40 }),
      },
      products: {
        topByQty: repo.productMovement(dateFrom, dateTo, { orderBy: 'qty', limit: 8 }, filters),
        topByRevenue: repo.productMovement(dateFrom, dateTo, { orderBy: 'revenue', limit: 8 }, filters),
        topByProfit: repo.productMovement(dateFrom, dateTo, { orderBy: 'profit', limit: 8 }, filters),
        topByMargin: repo.productMovement(dateFrom, dateTo, { orderBy: 'margin', limit: 8 }, filters),
        fastMoving: repo.productMovement(dateFrom, dateTo, { orderBy: 'qty', limit: 8 }, filters),
        slowMoving: repo.slowMovingWithStock(dateFrom, dateTo, 8, filters, settings.slowMovingMaxQty),
        deadStock: repo.deadStock(settings.deadStockDays, 8, filters),
        lowStock: repo.lowStock(8, filters),
        lowMargin: repo.productMovement(dateFrom, dateTo, { orderBy: 'margin', order: 'ASC', limit: 8 }, filters)
          .filter((p) => p.margin < settings.minMarginPercent),
        highReturns: repo.highReturnProducts(dateFrom, dateTo, 8),
      },
      customers: {
        topBySales: repo.topCustomers(dateFrom, dateTo, 8, filters),
        topByProfit: repo.topCustomersByProfit(dateFrom, dateTo, 8, filters),
        highestOutstanding: repo.highestOutstandingCustomers(8),
      },
      purchases: {
        total: purchases.purchaseTotal,
        billCount: purchases.billCount,
        trend,
        topSuppliers: repo.topSuppliers(dateFrom, dateTo, 8),
      },
      alerts: [
        ...repo.alerts(settings),
      ],
      recentActivity: repo.recentActivity(20),
      multiFirm: {
        mode: filters.companyId ? 'firm' : 'consolidated',
        note: 'Transactions are not yet firm-scoped in schema; company filter is reserved for future multi-firm.',
      },
    };
  }

  getProfitability(query, actor) {
    authService.checkPermission(actor.permissions, 'reports.ceo_dashboard.view');
    const range = resolveCeoDateRange(query);
    const filters = parseFilters(query);
    const sort = query.sort || 'profit';
    const limit = Math.min(parseInt(query.limit || '50', 10) || 50, 200);
    return {
      range,
      ...repo.profitabilityByInvoice(range.dateFrom, range.dateTo, filters, { limit, sort }),
      lines: query.includeLines === 'true'
        ? repo.profitabilityByLine(range.dateFrom, range.dateTo, filters, { limit: 200 })
        : undefined,
    };
  }

  getAgingDrilldown(query, actor) {
    authService.checkPermission(actor.permissions, 'reports.ceo_dashboard.view');
    const side = query.side === 'supplier' ? 'supplier' : 'customer';
    const bucket = query.bucket || null;
    if (side === 'supplier') {
      return {
        side,
        bucket,
        items: repo.listPayableSuppliers({ bucket, limit: parseInt(query.limit || '50', 10) || 50 }),
      };
    }
    return {
      side,
      bucket,
      items: repo.listReceivableCustomers({ bucket, limit: parseInt(query.limit || '50', 10) || 50 }),
    };
  }
}

export const ceoDashboardService = new CeoDashboardService();
