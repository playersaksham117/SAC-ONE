'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { moneyExact } from './formatters';

const CHART_COLORS = ['#0f766e', '#0369a1', '#b45309', '#7c3aed', '#be123c', '#15803d'];

export function SalesPurchaseChart({ data, showSales = true, showPurchases = true, showProfit = true }) {
  if (!data?.length) {
    return <p className="py-8 text-center text-sm text-slate-400">No trend data for this period</p>;
  }
  return (
    <div className="h-64 w-full min-h-[16rem]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
          <Tooltip formatter={(v) => moneyExact(v)} />
          <Legend />
          {showSales ? <Bar dataKey="sales" name="Sales" fill="#0f766e" radius={[3, 3, 0, 0]} /> : null}
          {showPurchases ? <Bar dataKey="purchases" name="Purchases" fill="#0369a1" radius={[3, 3, 0, 0]} /> : null}
          {showProfit ? <Line type="monotone" dataKey="profit" name="Gross Profit" stroke="#b45309" strokeWidth={2} dot={false} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashFlowChart({ data }) {
  if (!data?.length) {
    return <p className="py-8 text-center text-sm text-slate-400">No cash flow points in period</p>;
  }
  return (
    <div className="h-56 w-full min-h-[14rem]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
          <Tooltip formatter={(v) => moneyExact(v)} />
          <Legend />
          <Area type="monotone" dataKey="cashIn" name="Cash In" stroke="#0f766e" fill="#ccfbf1" />
          <Area type="monotone" dataKey="cashOut" name="Cash Out" stroke="#be123c" fill="#ffe4e6" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function UpiFlowChart({ data }) {
  if (!data?.length) {
    return <p className="py-8 text-center text-sm text-slate-400">No UPI activity in period</p>;
  }
  return (
    <div className="h-56 w-full min-h-[14rem]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
          <Tooltip formatter={(v) => moneyExact(v)} />
          <Legend />
          <Area type="monotone" dataKey="upiIn" name="UPI In" stroke="#0369a1" fill="#e0f2fe" />
          <Area type="monotone" dataKey="upiOut" name="UPI Out" stroke="#7c3aed" fill="#ede9fe" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InventoryPie({ data, title }) {
  if (!data?.length) {
    return <p className="py-6 text-center text-sm text-slate-400">No inventory breakdown</p>;
  }
  return (
    <div>
      {title ? <div className="mb-1 text-xs font-medium text-slate-500">{title}</div> : null}
      <div className="h-48 w-full min-h-[12rem]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => moneyExact(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
