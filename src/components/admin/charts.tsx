'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

// ApexCharts touches `window`, so it is only ever loaded in the browser.
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" /> });

const font = 'ui-sans-serif, system-ui, sans-serif';

export function CategoryBars({ data }: { data: { name: string; count: number }[] }) {
  const options: ApexOptions = {
    chart: { type: 'bar', toolbar: { show: false }, fontFamily: font },
    colors: ['#465fff'],
    plotOptions: { bar: { horizontal: true, borderRadius: 5, barHeight: '58%', borderRadiusApplication: 'end' } },
    dataLabels: { enabled: true, style: { fontSize: '12px', fontWeight: 500 } },
    xaxis: { categories: data.map((item) => item.name), labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { fontSize: '13px' } } },
    grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: false } } },
    tooltip: { y: { formatter: (value) => `${value} sản phẩm` } },
  };
  return <Chart type="bar" height={Math.max(260, data.length * 40)} options={options} series={[{ name: 'Sản phẩm', data: data.map((item) => item.count) }]} />;
}

export function StockDonut({ ok, low, out }: { ok: number; low: number; out: number }) {
  const options: ApexOptions = {
    chart: { type: 'donut', fontFamily: font },
    labels: ['Còn hàng', 'Sắp hết', 'Hết hàng'],
    colors: ['#12b76a', '#f79009', '#f04438'],
    stroke: { width: 0 },
    legend: { position: 'bottom', fontSize: '13px', markers: { size: 6 } },
    dataLabels: { enabled: false },
    plotOptions: { pie: { donut: { size: '72%', labels: { show: true, total: { show: true, label: 'Đang bán', formatter: () => String(ok + low + out) } } } } },
  };
  return <div className="apex-donut"><Chart type="donut" height={300} options={options} series={[ok, low, out]} /></div>;
}

export function RevenueChart({ data }: { data: { date: string; revenueVnd: number; orders: number }[] }) {
  const label = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const options: ApexOptions = {
    chart: { type: 'area', toolbar: { show: false }, fontFamily: font, zoom: { enabled: false } },
    colors: ['#465fff'],
    stroke: { curve: 'smooth', width: 2.5 },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.02 } },
    dataLabels: { enabled: false },
    xaxis: { categories: data.map((item) => label(item.date)), axisBorder: { show: false }, axisTicks: { show: false }, tickAmount: 7 },
    yaxis: { labels: { formatter: (value) => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}tr` : `${Math.round(value / 1000)}k`) } },
    grid: { strokeDashArray: 4 },
    tooltip: { y: { formatter: (value) => `${Math.round(value ?? 0).toLocaleString('vi-VN')}₫` } },
  };
  return <Chart type="area" height={280} options={options} series={[{ name: 'Doanh thu', data: data.map((item) => item.revenueVnd) }]} />;
}
