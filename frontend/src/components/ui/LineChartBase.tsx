import * as React from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { ChartCard } from "./ChartCard";

export interface LineChartBaseProps {
  title: string;
  subtitle?: string;
  data: any[];
  dataKeys: { key: string; color: string; name?: string }[];
  xAxisKey: string;
  height?: number | string;
  className?: string;
  icon?: React.ReactNode;
  value?: string;
  trend?: { value: string; isPositive: boolean };
}

export function LineChartBase({
  title, subtitle, data, dataKeys, xAxisKey, height = 300, className, icon, value, trend
}: LineChartBaseProps) {
  return (
    <ChartCard title={title} subtitle={subtitle} className={className} icon={icon} value={value} trend={trend}>
      <ResponsiveContainer width="100%" height={height as any}>
        <LineChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="#e7e7e7" />
          <XAxis dataKey={xAxisKey} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A3A3A3' }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A3A3A3' }} dx={-10} />
          <Tooltip 
            contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)", padding: "12px" }}
            itemStyle={{ fontSize: "14px", fontWeight: 500 }}
            labelStyle={{ fontSize: "12px", color: "#6B7280", marginBottom: "4px" }}
          />
          <Legend iconType="circle" verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '20px', fontSize: "12px" }} />
          {dataKeys.map((dk, idx) => (
            <Line
              key={idx}
              type="monotone"
              dataKey={dk.key}
              name={dk.name || dk.key}
              stroke={dk.color}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, fill: "#ffffff" }}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
