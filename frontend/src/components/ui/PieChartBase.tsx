import * as React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { ChartCard } from "./ChartCard";

export interface PieChartBaseProps {
  title: string;
  subtitle?: string;
  data: { name: string; value: number; color: string }[];
  height?: number | `${number}%`;
  className?: string;
  icon?: React.ReactNode;
  value?: string;
  trend?: { value: string; isPositive: boolean };
  action?: React.ReactNode;
  innerRadius?: number;
  outerRadius?: number;
  centerText?: string;
}

export function PieChartBase({
  title, subtitle, data, height = 300, className, icon, value, trend, action, innerRadius = 60, outerRadius = 80, centerText
}: PieChartBaseProps) {
  const hasData = data.some((item) => item.value > 0);
  const chartData = hasData ? data : [{ name: 'No data', value: 1, color: '#E5E7EB' }];

  return (
    <ChartCard title={title} subtitle={subtitle} className={className} icon={icon} value={value} trend={trend} action={action}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Tooltip 
            contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", padding: "12px" }}
            itemStyle={{ fontSize: "14px", fontWeight: 500 }}
          />
          <Legend
            iconType="circle"
            layout="horizontal"
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{ fontSize: "12px", paddingTop: '12px' }}
          />
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={hasData ? 2 : 0}
            dataKey="value"
            stroke="none"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          {centerText && (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: '22px', fontWeight: 700, fill: '#171717' }}
            >
              {centerText}
            </text>
          )}
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
