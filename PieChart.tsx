import { View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { tapLight } from "./haptics";

export type PieSlice = {
  key: string;
  amount: number;
  color: string;
};

/**
 * Simple SVG donut. Renders each slice as an arc path so it stays crisp at any
 * size. Single slice degrades to a full ring so it doesn't disappear. Empty
 * data draws just the background track.
 */
export function PieChart({
  data,
  size = 180,
  thickness = 22,
  trackColor = "#1a1a1a",
  onSlicePress,
}: {
  data: PieSlice[];
  size?: number;
  thickness?: number;
  trackColor?: string;
  /** Called with the slice's key when it is tapped. */
  onSlicePress?: (key: string) => void;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - thickness / 2;

  const total = data.reduce((s, d) => s + d.amount, 0);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={trackColor}
          strokeWidth={thickness}
          fill="none"
        />
        {total > 0 && data.length === 1 ? (
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={data[0].color}
            strokeWidth={thickness}
            fill="none"
          />
        ) : (
          <G>
            {data.map((slice, i) => {
              if (slice.amount <= 0) return null;
              const startFrac = data
                .slice(0, i)
                .reduce((s, d) => s + d.amount, 0) / total;
              const endFrac = startFrac + slice.amount / total;
              return (
                <ArcPath
                  key={slice.key}
                  cx={cx}
                  cy={cy}
                  r={r}
                  startFrac={startFrac}
                  endFrac={endFrac}
                  stroke={slice.color}
                  strokeWidth={thickness}
                  onPress={
                    onSlicePress
                      ? () => {
                          tapLight();
                          onSlicePress(slice.key);
                        }
                      : undefined
                  }
                />
              );
            })}
          </G>
        )}
      </Svg>
    </View>
  );
}

function ArcPath({
  cx,
  cy,
  r,
  startFrac,
  endFrac,
  stroke,
  strokeWidth,
  onPress,
}: {
  cx: number;
  cy: number;
  r: number;
  startFrac: number;
  endFrac: number;
  stroke: string;
  strokeWidth: number;
  onPress?: () => void;
}) {
  const startAngle = startFrac * Math.PI * 2 - Math.PI / 2;
  const endAngle = endFrac * Math.PI * 2 - Math.PI / 2;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const large = endFrac - startFrac > 0.5 ? 1 : 0;
  const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  return (
    <Path
      d={d}
      stroke={stroke}
      strokeWidth={strokeWidth}
      fill="none"
      strokeLinecap="butt"
      onPress={onPress}
    />
  );
}
