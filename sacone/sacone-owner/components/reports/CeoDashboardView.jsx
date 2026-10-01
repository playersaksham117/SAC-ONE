'use client';

import SmartLink from '../SmartLink';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';
import { Alert, LoadingState } from '../ui';
import {
  CashFlowChart,
  HealthScore,
  InventoryPie,
  KpiCard,
  MiniTable,
  Panel,
  SalesPurchaseChart,
  UpiFlowChart,
  money,
  moneyExact,
  severityClass,
} from '../ceo';

const PRESETS = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['this_week', 'This Week'],
  ['last_week', 'Last Week'],
  ['this_month', 'This Month'],
  ['last_month', 'Last Month'],
  ['this_quarter', 'This Quarter'],
  ['this_fy', 'This FY'],
  ['custom', 'Custom'],
];

function buildQuery({
  preset, dateFrom, dateTo, warehouseId, salespersonId, categoryId, brandId, companyId, granularity,
}) {
  const q = new URLSearchParams({ preset });
  if (preset === 'custom') {
    if (dateFrom) q.set('dateFrom', dateFrom);
    if (dateTo) q.set('dateTo', dateTo);
  }
  if (warehouseId) q.set('warehouseId', warehouseId);
  if (salespersonId) q.set('salespersonId', salespersonId);
  if (categoryId) q.set('categoryId', categoryId);
  if (brandId) q.set('brandId', brandId);
  if (companyId) q.set('companyId', companyId);
  if (granularity) q.set('granularity', granularity);
  return q.toString();
}

export default function CeoDashboardView() {
  const [preset, setPreset] = useState('this_month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [salespersonId, setSalespersonId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [granularity, setGranularity] = useState('daily');
  const [metricToggles, setMetricToggles] = useState({ sales: true, purchases: true, profit: true });

  const [filterOptions, setFilterOptions] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agingSide, setAgingSide] = useState(null);
  const [agingBucket, setAgingBucket] = useState(null);
  const [agingItems, setAgingItems] = useState([]);
  const [agingLoading, setAgingLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  useEffect(() => {
    apiRequest('/api/ceo-dashboard/filters')
      .then(setFilterOptions)
      .catch(() => setFilterOptions(null));
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const qs = buildQuery({
        preset, dateFrom, dateTo, warehouseId, salespersonId, categoryId, brandId, companyId, granularity,
      });
      const payload = await apiRequest(`/api/ceo-dashboard?${qs}`);
      setData(payload);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.message);
      if (!silent) setData(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [preset, dateFrom, dateTo, warehouseId, salespersonId, categoryId, brandId, companyId, granularity]);

  useEffect(() => {
    if (preset === 'custom' && (!dateFrom || !dateTo)) return;
    load(false);
  }, [load, preset, dateFrom, dateTo]);

  // Real time: refresh as soon as sales, purchases, stock or payments are written.
  useLiveRefresh(() => {
    if (preset === 'custom' && (!dateFrom || !dateTo)) return;
    load(true);
  }, { delay: 1500 });

  // Fallback poll (also rolls "today" over at midnight)
  useEffect(() => {
    const seconds = data?.settings?.refreshSeconds || 60;
    const id = setInterval(() => {
      if (preset === 'custom' && (!dateFrom || !dateTo)) return;
      load(true);
    }, Math.max(15, seconds) * 1000);
    return () => clearInterval(id);
  }, [load, data?.settings?.refreshSeconds, preset, dateFrom, dateTo]);

  const openAging = async (side, bucket) => {
    setAgingSide(side);
    setAgingBucket(bucket);
    setAgingLoading(true);
    try {
      const q = new URLSearchParams({ side });
      if (bucket) q.set('bucket', bucket);
      const res = await apiRequest(`/api/ceo-dashboard/aging?${q.toString()}`);
      setAgingItems(res.items || []);
    } catch (err) {
      setError(err.message);
      setAgingItems([]);
    } finally {
      setAgingLoading(false);
    }
  };

  const k = data?.kpis;
  const health = data?.healthScore;

  const agingBuckets = useMemo(() => {
    if (!data?.paymentPosition) return [];
    const src = agingSide === 'supplier'
      ? data.paymentPosition.supplier.aging
      : data.paymentPosition.customer.aging;
    return src ? Object.entries(src.buckets || {}) : [];
  }, [data, agingSide]);

  return (
    <div className="ceo-dashboard">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Live aggregates from POS, purchases, inventory &amp; payments — read-only decision view.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
            Read-only
          </span>
          <button type="button" className="btn-secondary text-xs" onClick={() => load(false)}>
            Refresh
          </button>
          {lastRefresh && (
            <span className="text-[11px] text-slate-400">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Global filters */}
        <div className="mb-5 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium sm:text-sm ${
                  preset === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                onClick={() => setPreset(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {preset === 'custom' && (
              <>
                <input className="input-field" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <input className="input-field" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </>
            )}
            <select className="input-field" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">All firms (consolidated)</option>
              {(filterOptions?.firms || []).map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <select className="input-field" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">All warehouses</option>
              {(filterOptions?.warehouses || []).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <select className="input-field" value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)}>
              <option value="">All salespersons</option>
              {(filterOptions?.salespersons || []).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <select className="input-field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All categories</option>
              {(filterOptions?.categories || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className="input-field" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">All brands</option>
              {(filterOptions?.brands || []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <select className="input-field" value={granularity} onChange={(e) => setGranularity(e.target.value)}>
              <option value="daily">Daily chart</option>
              <option value="weekly">Weekly chart</option>
              <option value="monthly">Monthly chart</option>
            </select>
          </div>

          {data?.range && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                Period {data.range.labelFrom} → {data.range.labelTo}
                {data.previousRange ? ` · vs ${data.previousRange.labelFrom} → ${data.previousRange.labelTo}` : ''}
              </span>
              <span title={data.financialLabels?.costingNote}>
                Costing: {data.settings?.costingMethod || 'purchase_price'} (est.)
              </span>
            </div>
          )}
        </div>

        <Alert type="error" message={error} />
        {loading && !data ? <LoadingState message="Loading executive metrics…" /> : null}

        {data && (
          <div className="space-y-5 pb-10">
            {/* Row 1 */}
            <div className="grid gap-3 lg:grid-cols-4">
              <HealthScore health={health} />
              <div className="grid gap-3 sm:grid-cols-3 lg:col-span-3 lg:grid-cols-3">
                <KpiCard kpi={k.netSales} onClick={() => document.getElementById('sales-trend')?.scrollIntoView({ behavior: 'smooth' })} />
                <KpiCard kpi={k.grossProfit} onClick={() => document.getElementById('profitability')?.scrollIntoView({ behavior: 'smooth' })} />
                <KpiCard kpi={k.cashFlowPosition} onClick={() => document.getElementById('cash-flow')?.scrollIntoView({ behavior: 'smooth' })} />
              </div>
            </div>

            {/* KPI strip */}
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              <KpiCard kpi={k.grossSales} />
              <KpiCard kpi={k.purchaseValue} />
              <KpiCard kpi={k.grossMarginPercent} format="percent" />
              <KpiCard kpi={k.totalEmployees} />
              <KpiCard kpi={k.attendanceToday} format="percent" />
              <KpiCard kpi={k.monthlyWageCost} />
              <KpiCard kpi={k.pendingWagePayments} />
              <KpiCard kpi={k.otherIncome} />
              <KpiCard kpi={k.operatingExpenses} />
              <KpiCard kpi={k.estimatedOperatingProfit} />
              <KpiCard kpi={k.cashReceived} />
              <KpiCard kpi={k.upiReceived} />
              <KpiCard kpi={k.bankReceived} />
              <KpiCard kpi={k.customerReceivables} onClick={() => openAging('customer', null)} />
              <KpiCard kpi={k.supplierPayables} onClick={() => openAging('supplier', null)} />
              <KpiCard kpi={k.inventoryValue} onClick={() => document.getElementById('inventory')?.scrollIntoView({ behavior: 'smooth' })} />
            </div>

            {/* Charts */}
            <div className="grid gap-4 xl:grid-cols-2" id="sales-trend">
              <Panel
                title="Sales vs Purchases vs Gross Profit"
                subtitle={`Granularity: ${data.charts?.granularity}`}
                action={(
                  <div className="flex gap-2 text-xs">
                    {['sales', 'purchases', 'profit'].map((m) => (
                      <label key={m} className="flex items-center gap-1 capitalize text-slate-600">
                        <input
                          type="checkbox"
                          checked={metricToggles[m]}
                          onChange={() => setMetricToggles((t) => ({ ...t, [m]: !t[m] }))}
                        />
                        {m}
                      </label>
                    ))}
                  </div>
                )}
              >
                <SalesPurchaseChart
                  data={data.charts?.salesVsPurchaseVsProfit}
                  showSales={metricToggles.sales}
                  showPurchases={metricToggles.purchases}
                  showProfit={metricToggles.profit}
                />
              </Panel>

              <Panel title="Daily Cash & UPI Flows" id="cash-flow">
                <div className="grid gap-4 md:grid-cols-2">
                  <CashFlowChart data={data.charts?.dailyCashFlow} />
                  <UpiFlowChart data={data.charts?.dailyCashFlow} />
                </div>
              </Panel>
            </div>

            {/* Cash / UPI / AR / AP */}
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
              <Panel title="Cash Flow" subtitle={data.cashFlow?.note}>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Opening cash</dt><dd className="font-medium">{data.cashFlow?.openingCash == null ? 'Not set' : money(data.cashFlow.openingCash)}</dd></div>
                  <div className="flex justify-between text-emerald-700"><dt>Cash in</dt><dd className="font-semibold">{money(data.cashFlow?.cashIn?.total)}</dd></div>
                  {data.cashFlow?.manualBreakdown?.cashIn > 0 && (
                    <div className="flex justify-between text-xs text-emerald-600/80 pl-2"><dt>↳ Manual</dt><dd>{money(data.cashFlow.manualBreakdown.cashIn)}</dd></div>
                  )}
                  <div className="flex justify-between text-rose-700"><dt>Cash out</dt><dd className="font-semibold">{money(data.cashFlow?.cashOut?.total)}</dd></div>
                  {data.cashFlow?.cashOut?.expenses > 0 && (
                    <div className="flex justify-between text-xs text-rose-600/80 pl-2"><dt>↳ Expenses</dt><dd>{money(data.cashFlow.cashOut.expenses)}</dd></div>
                  )}
                  <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-medium">Period net</dt><dd className="font-bold">{money(data.cashFlow?.periodNetCash)}</dd></div>
                  {data.cashFlow?.closingCash != null && (
                    <div className="flex justify-between text-xs text-slate-500"><dt>Closing (cash account)</dt><dd>{money(data.cashFlow.closingCash)}</dd></div>
                  )}
                </dl>
              </Panel>

              <Panel title="UPI Flow" subtitle="Kept separate from cash">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Opening UPI</dt><dd>{data.upiFlow?.openingUpi == null ? 'Not set' : money(data.upiFlow.openingUpi)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">UPI received</dt><dd className="font-semibold text-sky-700">{money(data.upiFlow?.upiReceived)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">UPI paid</dt><dd className="font-semibold">{money(data.upiFlow?.upiPaid)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Net UPI</dt><dd className="font-bold">{money(data.upiFlow?.netUpiFlow)}</dd></div>
                  {data.upiFlow?.closingUpi != null && (
                    <div className="flex justify-between text-xs text-slate-500"><dt>Closing (UPI account)</dt><dd>{money(data.upiFlow.closingUpi)}</dd></div>
                  )}
                </dl>
              </Panel>

              <Panel title="Bank Flow" subtitle="POS + supplier + manual bank entries">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Opening bank</dt><dd>{data.bankFlow?.openingBank == null ? 'Not set' : money(data.bankFlow.openingBank)}</dd></div>
                  <div className="flex justify-between text-emerald-700"><dt>Bank in</dt><dd className="font-semibold">{money(data.bankFlow?.bankIn)}</dd></div>
                  <div className="flex justify-between text-rose-700"><dt>Bank out</dt><dd className="font-semibold">{money(data.bankFlow?.bankOut)}</dd></div>
                  <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-medium">Net bank</dt><dd className="font-bold">{money(data.bankFlow?.netBankFlow)}</dd></div>
                  {data.bankFlow?.closingBank != null && (
                    <div className="flex justify-between text-xs text-slate-500"><dt>Closing (bank account)</dt><dd>{money(data.bankFlow.closingBank)}</dd></div>
                  )}
                </dl>
              </Panel>

              <Panel title="Receivables" subtitle="Click a bucket to drill down">
                <dl className="mb-3 space-y-1 text-sm">
                  <div className="flex justify-between"><dt>Total</dt><dd className="font-bold">{money(data.paymentPosition?.customer?.total)}</dd></div>
                  <div className="flex justify-between text-rose-700"><dt>Overdue (31d+)</dt><dd className="font-semibold">{money(data.paymentPosition?.customer?.overdue)}</dd></div>
                </dl>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(data.paymentPosition?.customer?.aging?.buckets || {}).map(([bucket, amount]) => (
                    <button
                      key={bucket}
                      type="button"
                      onClick={() => openAging('customer', bucket)}
                      className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2 text-left hover:border-slate-300"
                    >
                      <div className="text-[10px] uppercase text-slate-400">{bucket} days</div>
                      <div className="text-sm font-semibold tabular-nums">{money(amount)}</div>
                    </button>
                  ))}
                </div>
              </Panel>

              <Panel title="Payables" subtitle="Supplier aging by due date">
                <dl className="mb-3 space-y-1 text-sm">
                  <div className="flex justify-between"><dt>Total</dt><dd className="font-bold">{money(data.paymentPosition?.supplier?.total)}</dd></div>
                  <div className="flex justify-between text-rose-700"><dt>Overdue</dt><dd className="font-semibold">{money(data.paymentPosition?.supplier?.overdue)}</dd></div>
                  <div className="flex justify-between text-xs text-slate-500"><dt>Due today</dt><dd>{money(data.paymentPosition?.supplier?.dueToday)}</dd></div>
                </dl>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(data.paymentPosition?.supplier?.aging?.buckets || {}).map(([bucket, amount]) => (
                    <button
                      key={bucket}
                      type="button"
                      onClick={() => openAging('supplier', bucket)}
                      className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2 text-left hover:border-slate-300"
                    >
                      <div className="text-[10px] uppercase text-slate-400">{bucket} days</div>
                      <div className="text-sm font-semibold tabular-nums">{money(amount)}</div>
                    </button>
                  ))}
                </div>
              </Panel>
            </div>

            {/* Aging drill-down drawer-ish panel */}
            {agingSide && (
              <Panel
                title={`${agingSide === 'customer' ? 'Customer' : 'Supplier'} list${agingBucket ? ` · ${agingBucket} days` : ''}`}
                action={(
                  <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={() => { setAgingSide(null); setAgingItems([]); }}>
                    Close
                  </button>
                )}
              >
                {agingLoading ? <LoadingState message="Loading…" /> : (
                  <MiniTable
                    columns={[
                      { key: 'name', label: 'Name', render: (r) => (
                        <SmartLink className="font-medium text-sky-700 hover:underline" href={agingSide === 'customer' ? `/business/crm?customer=${r.id}` : `/business/crm?supplier=${r.id}`}>
                          {r.name}
                          <div className="font-mono text-[10px] text-slate-400">{r.code}</div>
                        </SmartLink>
                      ) },
                      { key: 'outstanding', label: 'Outstanding', align: 'right', render: (r) => moneyExact(r.outstanding) },
                    ]}
                    rows={agingItems}
                    empty="No parties in this bucket"
                  />
                )}
                {!agingLoading && agingBuckets.length > 0 && (
                  <p className="mt-2 text-[11px] text-slate-400">Tip: switch buckets from the cards above.</p>
                )}
              </Panel>
            )}

            {/* Inventory */}
            <div className="grid gap-4 xl:grid-cols-3" id="inventory">
              <Panel title="Inventory Health" subtitle={`Dead stock ≥ ${data.settings?.deadStockDays || 90} days`}>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    ['Value (cost)', money(data.inventory?.atCost)],
                    ['Available', data.inventory?.available],
                    ['Reserved', data.inventory?.reserved],
                    ['Low stock', data.inventory?.health?.lowStock],
                    ['Out of stock', data.inventory?.health?.outOfStock],
                    ['Dead stock', data.inventory?.health?.deadStock],
                    ['Negative', data.inventory?.health?.negativeStock],
                    ['SKUs', data.inventory?.skuCount],
                  ].map(([label, val]) => (
                    <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-[10px] uppercase text-slate-400">{label}</div>
                      <div className="font-semibold tabular-nums">{val}</div>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Value by Category">
                <InventoryPie data={data.inventory?.byCategory} title="" />
              </Panel>
              <Panel title="Value by Warehouse / Brand">
                <div className="grid gap-2 md:grid-cols-2">
                  <InventoryPie data={data.inventory?.byWarehouse} title="Warehouse" />
                  <InventoryPie data={data.inventory?.byBrand} title="Brand" />
                </div>
              </Panel>
            </div>

            {/* Products & customers */}
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Top Products" subtitle="By revenue · click product opens catalog">
                <MiniTable
                  columns={[
                    { key: 'productName', label: 'Product', render: (p) => (
                      <SmartLink href={`/operations/products?q=${encodeURIComponent(p.sku || p.productName)}`} className="hover:underline">
                        {p.productName}
                        <div className="font-mono text-[10px] text-slate-400">{p.sku}</div>
                      </SmartLink>
                    ) },
                    { key: 'quantitySold', label: 'Qty', align: 'right' },
                    { key: 'revenue', label: 'Revenue', align: 'right', render: (p) => money(p.revenue) },
                    { key: 'profit', label: 'Profit', align: 'right', render: (p) => money(p.profit) },
                  ]}
                  rows={data.products?.topByRevenue}
                />
              </Panel>
              <Panel title="Top Customers" subtitle="By sales · CRM drill-down">
                <MiniTable
                  columns={[
                    { key: 'name', label: 'Customer', render: (c) => (
                      <SmartLink href={`/business/crm?customer=${c.customerId}`} className="hover:underline">
                        {c.name}
                        <div className="font-mono text-[10px] text-slate-400">{c.code}</div>
                      </SmartLink>
                    ) },
                    { key: 'invoiceCount', label: 'Invoices', align: 'right' },
                    { key: 'salesTotal', label: 'Sales', align: 'right', render: (c) => money(c.salesTotal) },
                  ]}
                  rows={data.customers?.topBySales}
                />
              </Panel>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Panel title="Fast Moving">
                <MiniTable
                  columns={[
                    { key: 'productName', label: 'Product' },
                    { key: 'quantitySold', label: 'Qty', align: 'right' },
                  ]}
                  rows={data.products?.fastMoving}
                />
              </Panel>
              <Panel title="Slow Moving">
                <MiniTable
                  columns={[
                    { key: 'productName', label: 'Product' },
                    { key: 'quantityOnHand', label: 'Stock', align: 'right' },
                    { key: 'quantitySold', label: 'Sold', align: 'right' },
                  ]}
                  rows={data.products?.slowMoving}
                />
              </Panel>
              <Panel title="Dead Stock">
                <MiniTable
                  columns={[
                    { key: 'productName', label: 'Product' },
                    { key: 'quantityOnHand', label: 'On hand', align: 'right' },
                  ]}
                  rows={data.products?.deadStock}
                />
              </Panel>
              <Panel title="High Returns">
                <MiniTable
                  columns={[
                    { key: 'productName', label: 'Product' },
                    { key: 'quantityReturned', label: 'Qty', align: 'right' },
                    { key: 'returnValue', label: 'Value', align: 'right', render: (p) => money(p.returnValue) },
                  ]}
                  rows={data.products?.highReturns}
                />
              </Panel>
            </div>

            {/* Profitability */}
            <Panel
              id="profitability"
              title="Sale Profitability"
              subtitle="Net revenue − estimated product cost (purchase_price). Not net profit."
              action={(
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-700">Profitable {data.profitability?.summary?.profitable || 0}</span>
                  <span className="text-amber-700">Low margin {data.profitability?.summary?.lowMargin || 0}</span>
                  <span className="text-rose-700">Loss {data.profitability?.summary?.lossMaking || 0}</span>
                </div>
              )}
            >
              <div className="mb-4 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Top profit invoices</div>
                  <MiniTable
                    columns={[
                      { key: 'invoiceNumber', label: 'Invoice', render: (r) => (
                        <SmartLink href={`/operations/pos?sale=${r.saleId}`} className="font-mono text-sky-700 hover:underline">{r.invoiceNumber}</SmartLink>
                      ) },
                      { key: 'grossProfit', label: 'GP', align: 'right', render: (r) => moneyExact(r.grossProfit) },
                      { key: 'grossMarginPercent', label: 'Margin', align: 'right', render: (r) => `${r.grossMarginPercent}%` },
                    ]}
                    rows={data.profitability?.summary?.topProfit}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Top loss invoices</div>
                  <MiniTable
                    columns={[
                      { key: 'invoiceNumber', label: 'Invoice', render: (r) => (
                        <SmartLink href={`/operations/pos?sale=${r.saleId}`} className="font-mono text-sky-700 hover:underline">{r.invoiceNumber}</SmartLink>
                      ) },
                      { key: 'grossProfit', label: 'GP', align: 'right', render: (r) => (
                        <span className="text-rose-700">{moneyExact(r.grossProfit)}</span>
                      ) },
                      { key: 'grossMarginPercent', label: 'Margin', align: 'right', render: (r) => `${r.grossMarginPercent}%` },
                    ]}
                    rows={data.profitability?.summary?.topLoss}
                    empty="No loss-making sales in period"
                  />
                </div>
              </div>

              <MiniTable
                columns={[
                  { key: 'invoiceNumber', label: 'Invoice', render: (r) => (
                    <SmartLink href={`/operations/pos?sale=${r.saleId}`} className="font-mono text-sky-700 hover:underline">{r.invoiceNumber}</SmartLink>
                  ) },
                  { key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleDateString('en-IN') },
                  { key: 'customerName', label: 'Customer' },
                  { key: 'netRevenue', label: 'Net rev', align: 'right', render: (r) => moneyExact(r.netRevenue) },
                  { key: 'productCost', label: 'Cost', align: 'right', render: (r) => moneyExact(r.productCost) },
                  { key: 'grossProfit', label: 'GP', align: 'right', render: (r) => (
                    <span className={r.grossProfit < 0 ? 'text-rose-700' : r.classification === 'low_margin' ? 'text-amber-700' : 'text-emerald-700'}>
                      {moneyExact(r.grossProfit)}
                    </span>
                  ) },
                  { key: 'grossMarginPercent', label: 'Margin', align: 'right', render: (r) => `${r.grossMarginPercent}%` },
                ]}
                rows={data.profitability?.invoices}
              />
            </Panel>

            {/* Purchases & alerts */}
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Purchase Analytics" subtitle={`${data.purchases?.billCount || 0} bills in period`}>
                <div className="mb-3 text-2xl font-bold tabular-nums">{money(data.purchases?.total)}</div>
                <MiniTable
                  columns={[
                    { key: 'name', label: 'Supplier', render: (s) => (
                      <SmartLink href={`/business/crm?supplier=${s.supplierId}`} className="hover:underline">{s.name}</SmartLink>
                    ) },
                    { key: 'billCount', label: 'Bills', align: 'right' },
                    { key: 'purchaseTotal', label: 'Purchase', align: 'right', render: (s) => money(s.purchaseTotal) },
                    { key: 'outstanding', label: 'Payable', align: 'right', render: (s) => money(s.outstanding) },
                  ]}
                  rows={data.purchases?.topSuppliers}
                />
              </Panel>

              <Panel title="Business Alert Center">
                {!data.alerts?.length && <p className="text-sm text-slate-500">No alerts right now.</p>}
                <ul className="space-y-2">
                  {data.alerts?.map((a) => (
                    <li key={a.code} className={`rounded-lg border px-3 py-2 text-sm ${severityClass(a.severity)}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{a.severity}</div>
                          <div className="font-semibold">{a.title || a.message}</div>
                          <div className="text-xs opacity-90">{a.description || a.message}</div>
                        </div>
                        {a.actionHref ? (
                          <SmartLink href={a.actionHref} hideIfNoPage className="shrink-0 text-xs font-medium underline">Open</SmartLink>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>

            <Panel title="Recent Important Activity">
              <ul className="grid gap-2 md:grid-cols-2">
                {data.recentActivity?.map((row, idx) => (
                  <li key={`${row.type}-${row.reference}-${idx}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-50 px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{row.label}</div>
                      {row.href ? (
                        <SmartLink href={row.href} className="font-mono text-xs text-sky-700 hover:underline">{row.reference}</SmartLink>
                      ) : (
                        <div className="font-mono text-xs text-slate-400">{row.reference}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums">{moneyExact(row.amount)}</div>
                      <div className="text-[11px] text-slate-400">{new Date(row.at).toLocaleString()}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            <p className="text-center text-[11px] text-slate-400">
              Gross profit is estimated from product master purchase price.
              Estimated operating profit = gross profit + other manual income − operating expenses — not full net profit after tax.
              Manual finance entries feed cash, UPI, and bank flows on the CEO Dashboard.
            </p>
          </div>
        )}
    </div>
  );
}
