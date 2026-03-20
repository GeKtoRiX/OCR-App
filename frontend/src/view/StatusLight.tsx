import type { LightColor } from '../viewmodel/useHealthStatus';
import './StatusLight.css';

interface Props {
  color: LightColor;
  label: string;
  tooltip: string;
}

export function StatusLight({ color, label, tooltip }: Props) {
  const lines = tooltip.split(' | ');

  return (
    <div className="status-light-pill">
      <div className={`status-light status-light--${color}`} />
      <div className="status-light__tooltip">
        {lines.map((line) => (
          <div key={line} className="status-light__tooltip-row">{line}</div>
        ))}
      </div>
    </div>
  );
}
