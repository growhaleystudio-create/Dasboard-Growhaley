import * as React from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { ChartCard } from "./ChartCard";

const geoUrl = "https://unpkg.com/world-atlas@2.0.2/countries-110m.json";

export interface RegionMapBaseProps {
  title: string;
  subtitle?: string;
  markers?: { name: string; coordinates: [number, number]; value: string | number }[];
  height?: number | string;
  className?: string;
  icon?: React.ReactNode;
  value?: string;
  trend?: { value: string; isPositive: boolean };
  variant?: 'md' | 'xl';
}

export function RegionMapBase({
  title, subtitle, markers = [], height = 400, className, icon, value, trend, variant = 'md'
}: RegionMapBaseProps) {
  return (
    <ChartCard title={title} subtitle={subtitle} className={className} icon={icon} value={value} trend={trend} variant={variant}>
      <div style={{ width: "100%", height, position: "relative" }} className="flex items-center justify-center">
        <ComposableMap projection="geoMercator" projectionConfig={{ scale: 120 }}>
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography 
                  key={geo.rsmKey} 
                  geography={geo} 
                  fill="#E5E7EB" 
                  stroke="#FFFFFF" 
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "#D1D5DB", outline: "none" },
                    pressed: { fill: "#9CA3AF", outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>
          {markers.map(({ name, coordinates, value }, idx) => (
            <Marker key={idx} coordinates={coordinates}>
              <circle r={6} fill="#EF4444" stroke="#fff" strokeWidth={2} />
              <text textAnchor="middle" y={-10} style={{ fontFamily: "inherit", fill: "#374151", fontSize: "12px", fontWeight: "bold" }}>
                {name}
              </text>
              <rect x={-20} y={-45} width={40} height={20} rx={10} fill="#1F2937" />
              <text textAnchor="middle" y={-32} style={{ fontFamily: "inherit", fill: "#FFFFFF", fontSize: "10px", fontWeight: "bold" }}>
                {value}
              </text>
            </Marker>
          ))}
        </ComposableMap>
      </div>
    </ChartCard>
  );
}
