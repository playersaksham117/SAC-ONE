'use client';

import dynamic from 'next/dynamic';
import { HealthScore, KpiCard, MiniTable, Panel } from './CeoWidgets';
import { money, moneyExact, pct, severityClass } from './formatters';

function ChartSkeleton({ height = 'h-64' }) {
  return <div className={`${height} w-full animate-pulse rounded-lg bg-slate-100`} />;
}

const SalesPurchaseChart = dynamic(
  () => import('./CeoCharts').then((mod) => ({ default: mod.SalesPurchaseChart })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const CashFlowChart = dynamic(
  () => import('./CeoCharts').then((mod) => ({ default: mod.CashFlowChart })),
  { ssr: false, loading: () => <ChartSkeleton height="h-56" /> },
);
const UpiFlowChart = dynamic(
  () => import('./CeoCharts').then((mod) => ({ default: mod.UpiFlowChart })),
  { ssr: false, loading: () => <ChartSkeleton height="h-56" /> },
);
const InventoryPie = dynamic(
  () => import('./CeoCharts').then((mod) => ({ default: mod.InventoryPie })),
  { ssr: false, loading: () => <ChartSkeleton height="h-48" /> },
);

export {
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
  pct,
  severityClass,
};
