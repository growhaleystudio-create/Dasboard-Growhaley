"use client";

import * as React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { ChartCard } from "./ChartCard";

export interface AreaChartBaseProps {
  title: string;
  subtitle?: string;
  data: any[];
  dataKeys: { key: string; color: string; name?: string }[];
  xAxisKey: string;
  height?: number | string;
  stacked?: boolean;
  className?: string;
  icon?: React.ReactNode;
  value?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

export function AreaChartBase({
  title,
  subtitle,
  data,
  dataKeys,
  xAxisKey,
  height = 300,
  stacked = false,
  className,
  icon,
  value,
  trend,
}: AreaChartBaseProps) {
  return (
    <ChartCard 
      title={title} 
      subtitle={subtitle} 
      className={className}
      icon={icon}
      value={value}
      trend={trend}
    >
      <ResponsiveContainer width="100%" height={height as any}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
        >
          <defs>
            {dataKeys.map((dk, idx) => (
              <linearGradient key={`color-${idx}`} id={`color-${idx}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={dk.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={dk.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="#e3e8ef" />
          <XAxis 
            dataKey={xAxisKey} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: "#8c9198" }} 
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: "#8c9198" }} 
          />
          <Tooltip 
            contentStyle={{ 
              borderRadius: "12px", 
              border: "none", 
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
              padding: "12px"
            }}
            itemStyle={{ fontSize: "14px", fontWeight: 500 }}
            labelStyle={{ fontSize: "12px", color: "#6B7280", marginBottom: "4px" }}
          />
          <Legend 
            iconType="circle" 
            verticalAlign="top" 
            align="right" 
            wrapperStyle={{ paddingBottom: '20px' }}
          />
          {dataKeys.map((dk, idx) => (
            <Area
              key={idx}
              type="monotone"
              dataKey={dk.key}
              name={dk.name || dk.key}
              stroke={dk.color}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#color-${idx})`}
              stackId={stacked ? "stack" : (undefined as any)}
              dot={{ r: 4, strokeWidth: 2, fill: "#ffffff" }}
              activeDot={{ r: 6 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
