import React, { useEffect, useRef } from 'react';

interface HealthGaugeProps {
  score: number;          // 0–100, higher = healthier
  alertCount: number;
  solarFlare: boolean;
  healActive: boolean;
}

function getGaugeColor(score: number, solarFlare: boolean, healActive: boolean): string {
  if (solarFlare)   return '#8b5cf6'; // purple
  if (healActive)   return '#06b6d4'; // cyan
  if (score >= 75)  return '#10b981'; // green
  if (score >= 50)  return '#f59e0b'; // amber
  return '#f43f5e';                   // red
}

function getStatusLabel(score: number, solarFlare: boolean, healActive: boolean): string {
  if (solarFlare) return 'SOLAR STORM';
  if (healActive) return 'HEALING';
  if (score >= 75) return 'NOMINAL';
  if (score >= 50) return 'DEGRADED';
  if (score >= 25) return 'CRITICAL';
  return 'FAILURE';
}

export const HealthGauge: React.FC<HealthGaugeProps> = ({ score, alertCount, solarFlare, healActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const currentRef = useRef(score);

  const color = getGaugeColor(score, solarFlare, healActive);
  const label = getStatusLabel(score, solarFlare, healActive);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2 + 4;
    const r  = 36;
    const startAngle = Math.PI * 0.75;
    const totalArc   = Math.PI * 1.5;

    let frameId: number;

    const draw = () => {
      // Animate toward target
      const diff = score - currentRef.current;
      if (Math.abs(diff) > 0.3) {
        currentRef.current += diff * 0.08;
      } else {
        currentRef.current = score;
      }

      const disp = Math.max(0, Math.min(100, currentRef.current));
      const endAngle = startAngle + totalArc * (disp / 100);

      ctx.clearRect(0, 0, W, H);

      // Background track
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, startAngle + totalArc);
      ctx.strokeStyle = '#0a1628';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Tick marks
      for (let i = 0; i <= 10; i++) {
        const ang = startAngle + (totalArc * i) / 10;
        const inner = r - 12;
        const outer = r - 8;
        ctx.beginPath();
        ctx.moveTo(cx + inner * Math.cos(ang), cy + inner * Math.sin(ang));
        ctx.lineTo(cx + outer * Math.cos(ang), cy + outer * Math.sin(ang));
        ctx.strokeStyle = '#1b2547';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Glow arc (larger, blurred)
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();

      // Score text
      ctx.font = 'bold 16px Orbitron, Inter, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(disp).toString(), cx, cy - 4);

      // Label
      ctx.font = '7px JetBrains Mono, monospace';
      ctx.fillStyle = '#64748b';
      ctx.fillText('NOC HEALTH', cx, cy + 12);

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    animRef.current = frameId;

    return () => cancelAnimationFrame(frameId);
  }, [score, color]);

  return (
    <div className="flex flex-col items-center gap-0.5 select-none" title={`NOC Health Index: ${Math.round(score)}/100`}>
      <canvas
        ref={canvasRef}
        width={100}
        height={95}
        className="block"
      />
      <div
        className="text-[9px] font-mono font-bold tracking-widest px-2 py-0.5 rounded uppercase transition-all duration-500"
        style={{ color, background: `${color}18`, border: `1px solid ${color}44` }}
      >
        {label}
      </div>
      {alertCount > 0 && (
        <div className="text-[8px] font-mono text-noc-danger mt-0.5 animate-pulse">
          ⚠ {alertCount} ALARM{alertCount > 1 ? 'S' : ''}
        </div>
      )}
    </div>
  );
};
