"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { ChartCard } from "./ChartCard";

type BarChartDatum = Record<string, number | string | undefined>;

export interface BarChartBaseProps {
  title: string;
  subtitle?: string;
  data: BarChartDatum[];
  dataKeys: { key: string; color: string; name?: string }[];
  xAxisKey: string;
  height?: number | `${number}%`;
  stacked?: boolean;
  className?: string;
  icon?: React.ReactNode;
  value?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  action?: React.ReactNode;
}

export function BarChartBase({
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
  action,
}: BarChartBaseProps) {
  return (
    <ChartCard 
      title={title} 
      subtitle={subtitle} 
      className={className}
      icon={icon}
      value={value}
      trend={trend}
      action={action}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
          barCategoryGap="28%"
        >
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#E9EEF5" />
          <XAxis 
            dataKey={xAxisKey} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: "#8c9198" }} 
            dy={8}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: "#8c9198" }}
            width={32}
            allowDecimals={false}
          />
          <Tooltip 
            cursor={{ fill: "#F8FAFC" }}
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
            wrapperStyle={{ paddingBottom: '12px', fontSize: "12px" }}
          />
          {dataKeys.map((dk, idx) => {
            const isBottom = idx === 0;
            const isTop = idx === dataKeys.length - 1;

            let currentRadius: [number, number, number, number] = [0, 0, 0, 0];

            if (!stacked || dataKeys.length === 1) {
              currentRadius = [8, 8, 8, 8];
            } else if (isBottom) {
              currentRadius = [0, 0, 8, 8];
            } else if (isTop) {
              currentRadius = [8, 8, 0, 0];
            }

            return stacked ? (
              <Bar
                key={idx}
                dataKey={dk.key}
                name={dk.name ?? dk.key}
                fill={dk.color}
                radius={currentRadius}
                stackId="stack"
                barSize={28}
              />
            ) : (
              <Bar
                key={idx}
                dataKey={dk.key}
                name={dk.name ?? dk.key}
                fill={dk.color}
                radius={currentRadius}
                barSize={28}
              />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
