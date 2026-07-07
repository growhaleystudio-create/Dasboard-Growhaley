import * as React from "react";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, Legend } from "recharts";
import { ChartCard } from "./ChartCard";

export interface RadarChartBaseProps {
  title: string;
  subtitle?: string;
  data: any[];
  dataKeys: { key: string; color: string; name?: string }[];
  angleKey: string;
  height?: number | string;
  className?: string;
  icon?: React.ReactNode;
  value?: string;
  trend?: { value: string; isPositive: boolean };
}

export function RadarChartBase({
  title, subtitle, data, dataKeys, angleKey, height = 300, className, icon, value, trend
}: RadarChartBaseProps) {
  return (
    <ChartCard title={title} subtitle={subtitle} className={className} icon={icon} value={value} trend={trend}>
      <ResponsiveContainer width="100%" height={height as any}>
        <RadarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <PolarGrid stroke="#e7e7e7" />
          <PolarAngleAxis dataKey={angleKey} tick={{ fill: '#A3A3A3', fontSize: 12 }} />
          <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fill: '#A3A3A3', fontSize: 10 }} />
          <Tooltip 
            contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", padding: "12px" }}
            itemStyle={{ fontSize: "14px", fontWeight: 500 }}
          />
          <Legend iconType="circle" verticalAlign="bottom" wrapperStyle={{ paddingTop: '20px', fontSize: "12px" }} />
          {dataKeys.map((dk, idx) => (
            <Radar
              key={idx}
              name={dk.name || dk.key}
              dataKey={dk.key}
              stroke={dk.color}
              fill={dk.color}
              fillOpacity={0.5}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
