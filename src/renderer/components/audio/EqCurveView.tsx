import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { EqBand } from '../../../shared/types/eq';

type EqCurveViewProps = {
  bands: EqBand[];
  preampDb: number;
  enabled: boolean;
  onBandChange: (index: number, gainDb: number) => void;
  onBandCommit: (index: number, gainDb: number) => void;
};

const width = 720;
const height = 210;
const paddingX = 34;
const centerY = height / 2;
const gainScale = 7;
const minGainDb = -12;
const maxGainDb = 12;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const roundGain = (value: number): number => Math.round(value * 10) / 10;

const formatFrequency = (frequencyHz: number): string =>
  frequencyHz >= 1000 ? `${frequencyHz / 1000} kHz` : `${frequencyHz} Hz`;

const gainToY = (gainDb: number, preampDb: number): number =>
  clamp(centerY - (gainDb + preampDb * 0.2) * gainScale, 20, height - 20);

const yToGain = (y: number, preampDb: number): number =>
  roundGain(clamp((centerY - y) / gainScale - preampDb * 0.2, minGainDb, maxGainDb));

const pointForBand = (band: EqBand, index: number, bands: EqBand[], preampDb: number): { x: number; y: number } => {
  const x = paddingX + (index / Math.max(1, bands.length - 1)) * (width - paddingX * 2);
  const y = gainToY(band.gainDb, preampDb);
  return { x, y };
};

const formatPoint = (band: EqBand, index: number, bands: EqBand[], preampDb: number): string => {
  const { x, y } = pointForBand(band, index, bands, preampDb);
  return `${x.toFixed(1)},${y.toFixed(1)}`;
};

export const EqCurveView = ({
  bands,
  preampDb,
  enabled,
  onBandChange,
  onBandCommit,
}: EqCurveViewProps): JSX.Element => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeBand, setActiveBand] = useState<number | null>(null);
  const points = bands.map((band, index) => formatPoint(band, index, bands, preampDb)).join(' ');
  const areaPoints = `${paddingX},${centerY} ${points} ${width - paddingX},${centerY}`;
  const handlePointerGain = (event: ReactPointerEvent<SVGElement>, index: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    const fallbackOffsetY = Number((event.nativeEvent as PointerEvent & { offsetY?: number }).offsetY ?? centerY);
    const y =
      rect && rect.height > 0
        ? (event.clientY - rect.top) * (height / rect.height)
        : fallbackOffsetY;
    const gainDb = yToGain(y, preampDb);
    onBandChange(index, gainDb);
    return gainDb;
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGGElement>, index: number): void => {
    event.preventDefault();
    setActiveBand(index);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    handlePointerGain(event, index);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (activeBand === null) {
      return;
    }

    handlePointerGain(event, activeBand);
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement | SVGGElement>): void => {
    if (activeBand === null) {
      return;
    }

    const gainDb = handlePointerGain(event, activeBand);
    onBandCommit(activeBand, gainDb);
    setActiveBand(null);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<SVGGElement>, index: number): void => {
    const band = bands[index];
    const delta = event.shiftKey ? 1 : 0.5;

    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();
    const gainDb = roundGain(clamp(band.gainDb + (event.key === 'ArrowUp' ? delta : -delta), minGainDb, maxGainDb));
    onBandChange(index, gainDb);
    onBandCommit(index, gainDb);
  };

  return (
    <div className="eq-curve-shell" data-enabled={enabled}>
      <svg
        className="eq-curve-view"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Draggable EQ curve"
        ref={svgRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <linearGradient id="eqCurveStroke" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#467aa7" />
            <stop offset="46%" stopColor="#8b9aa9" />
            <stop offset="100%" stopColor="#c07b4d" />
          </linearGradient>
          <linearGradient id="eqCurveFill" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(190, 123, 77, 0.16)" />
            <stop offset="100%" stopColor="rgba(70, 122, 167, 0.04)" />
          </linearGradient>
        </defs>
        {[36, 72, 108, 144, 180].map((lineY) => (
          <line className="eq-grid-line" x1="22" x2={width - 22} y1={lineY} y2={lineY} key={lineY} />
        ))}
        {bands.map((band, index) => {
          const x = paddingX + (index / Math.max(1, bands.length - 1)) * (width - paddingX * 2);
          return <line className="eq-grid-line eq-grid-line--vertical" x1={x} x2={x} y1="20" y2={height - 20} key={band.frequencyHz} />;
        })}
        <line className="eq-zero-line" x1="22" x2={width - 22} y1={centerY} y2={centerY} />
        <polygon className="eq-curve-fill" points={areaPoints} />
        <polyline className="eq-curve-stroke" points={points} />
        <polyline className="eq-curve-hit-area" points={points} />
        {bands.map((band, index) => {
          const { x, y } = pointForBand(band, index, bands, preampDb);
          return (
            <g
              className="eq-curve-node-group"
              aria-label={`Drag ${formatFrequency(band.frequencyHz)} curve point`}
              data-testid={`eq-curve-node-${index}`}
              key={band.frequencyHz}
              tabIndex={0}
              transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onPointerDown={(event) => handlePointerDown(event, index)}
            >
              <circle className="eq-curve-node-hit" r="13" />
              <circle className="eq-curve-node" r={activeBand === index ? 5.8 : 4.6} />
              <text className="eq-curve-node-label" y="-14">
                {band.gainDb > 0 ? `+${band.gainDb.toFixed(1)}` : band.gainDb.toFixed(1)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="eq-spectrum-placeholder">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
};
