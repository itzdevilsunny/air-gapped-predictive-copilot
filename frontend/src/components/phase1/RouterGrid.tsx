import React from 'react';
import type { Snapshot, Router } from './types';
import { FAILURE_LABEL_MAP, FAILURE_LABEL_CLASS, SITE_TYPE_CLASS } from './types';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';

interface Props {
  liveData: Record<string, Snapshot>;
  routers: Router[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const RouterGrid: React.FC<Props> = ({ liveData, routers, selectedId, onSelect }) => {
  return (
    <div className="glass-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--c-primary)', letterSpacing: '0.1em' }}>
          LIVE ROUTER STATUS GRID
        </span>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>
          {Object.keys(liveData).length} / 6 ACTIVE
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {routers.map(router => {
          const snap = liveData[router.id];
          const isSelected = router.id === selectedId;
          const label = snap?.failure_label ?? -1;
          const siteClass = SITE_TYPE_CLASS[router.site_type] || 'site-noc';
          const isDown = snap?.link_status === 0;
          const isAnomaly = label > 0;

          return (
            <div
              key={router.id}
              onClick={() => onSelect(router.id)}
              style={{
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${isSelected ? 'var(--c-primary)' : isDown ? 'var(--c-danger)40' : isAnomaly ? 'var(--c-warning)40' : 'var(--c-border)'}`,
                background: isSelected ? 'var(--c-primary)10' : 'var(--c-bg2)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Failure glow overlay */}
              {isDown && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(135deg, var(--c-danger)08, transparent)',
                  pointerEvents: 'none'
                }} />
              )}

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className={siteClass} style={{ fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.1em' }}>
                  {router.site_type}
                </span>
                <span style={{ color: isDown ? 'var(--c-danger)' : 'var(--c-success)', display: 'flex', alignItems: 'center' }}>
                  {isDown ? <WifiOff size={11} /> : <Wifi size={11} />}
                </span>
              </div>

              {/* Name */}
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text)', marginBottom: 3, lineHeight: 1.2 }}>
                {router.name}
              </div>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)', marginBottom: 10 }}>
                {router.ip_address}
              </div>

              {/* Metrics */}
              {snap ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {[
                    { l: 'CPU', v: `${snap.cpu.toFixed(0)}%`, danger: snap.cpu > 80 },
                    { l: 'MEM', v: `${snap.memory.toFixed(0)}%`, danger: snap.memory > 85 },
                    { l: 'LAT', v: `${snap.latency.toFixed(0)}ms`, danger: snap.latency > 200 },
                    { l: 'LOSS', v: `${snap.packet_loss.toFixed(2)}%`, danger: snap.packet_loss > 3 },
                  ].map(m => (
                    <div key={m.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>{m.l}</span>
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, color: m.danger ? 'var(--c-danger)' : 'var(--c-text)' }}>
                        {m.v}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)', textAlign: 'center' }}>
                  Awaiting data...
                </div>
              )}

              {/* Failure label badge */}
              {snap && label > 0 && (
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--c-border)' }}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: label === 1 ? 'var(--c-warning)' : label === 2 ? 'var(--c-orange)' : 'var(--c-danger)'
                  }}>
                    <AlertTriangle size={9} />
                    {FAILURE_LABEL_MAP[label]?.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* Placeholder cards if no routers */}
        {routers.length === 0 && (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--c-border)',
              background: 'var(--c-bg2)',
              height: 130,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: 10, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)' }}>
                Loading...
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
