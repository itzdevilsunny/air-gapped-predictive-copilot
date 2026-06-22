import React, { useMemo, useCallback } from 'react';
import ReactFlow, { Background, Controls, Edge, Node, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import type { Snapshot, Router } from '../types';
import { FAILURE_LABEL_MAP } from '../types';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';

interface Props {
  liveData: Record<string, Snapshot>;
  routers: Router[];
  selectedId: string;
  onSelect: (id: string) => void;
}

// Fixed positions for the ISRO topology
const POSITIONS: Record<string, { x: number, y: number }> = {
  'ISTRAC-BGL': { x: 300, y: 50 },
  'SDSC-SHAR': { x: 550, y: 150 },
  'MCF-HSN': { x: 50, y: 150 },
  'NOC-DEL': { x: 450, y: 300 },
  'NOC-MUM': { x: 150, y: 300 },
  'TRACK-PBL': { x: 650, y: 300 },
};

// Physical links matching network_engine.py
const PHYSICAL_LINKS = [
  { id: 'ISTRAC-SDSC', source: 'ISTRAC-BGL', target: 'SDSC-SHAR' },
  { id: 'ISTRAC-MCF', source: 'ISTRAC-BGL', target: 'MCF-HSN' },
  { id: 'SDSC-NOCDEL', source: 'SDSC-SHAR', target: 'NOC-DEL' },
  { id: 'MCF-NOCMUM', source: 'MCF-HSN', target: 'NOC-MUM' },
  { id: 'NOCDEL-NOCMUM', source: 'NOC-DEL', target: 'NOC-MUM' },
  { id: 'ISTRAC-TRACK', source: 'ISTRAC-BGL', target: 'TRACK-PBL' },
  { id: 'NOCMUM-TRACK', source: 'NOC-MUM', target: 'TRACK-PBL' },
];

// Custom Node for Routers
const RouterNode = ({ data }: { data: any }) => {
  const isDown = data.snap?.link_status === 0;
  const label = data.snap?.failure_label ?? 0;
  const isSelected = data.isSelected;

  let borderColor = 'var(--c-border)';
  if (isSelected) borderColor = 'var(--c-primary)';
  else if (isDown) borderColor = 'var(--c-danger)';
  else if (label > 0) borderColor = 'var(--c-warning)';

  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '12px',
      border: `1px solid ${borderColor}`,
      background: isSelected ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(8px)',
      color: 'white',
      minWidth: '160px',
      boxShadow: isSelected ? '0 0 20px var(--c-primary)' : '0 4px 6px rgba(0, 0, 0, 0.3)',
      transition: 'all 0.2s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--c-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{data.router.site_type}</span>
        {isDown ? <WifiOff size={14} color="var(--c-danger)" /> : <Wifi size={14} color="var(--c-success)" />}
      </div>
      <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: 8, color: '#f8fafc' }}>{data.router.name}</div>
      
      {data.snap ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '10px', fontFamily: 'monospace' }}>
          <div>LAT: <span style={{ color: data.snap.latency > 100 ? 'var(--c-danger)' : (data.snap.latency > 50 ? 'var(--c-warning)' : '#f8fafc') }}>{data.snap.latency.toFixed(1)}ms</span></div>
          <div>LOSS: <span style={{ color: data.snap.packet_loss > 1 ? 'var(--c-danger)' : '#f8fafc' }}>{data.snap.packet_loss.toFixed(1)}%</span></div>
          <div>CPU: <span style={{ color: data.snap.cpu > 80 ? 'var(--c-danger)' : '#f8fafc' }}>{data.snap.cpu.toFixed(0)}%</span></div>
          <div>BW: <span style={{ color: 'var(--c-secondary)' }}>{data.snap.bandwidth.toFixed(0)}M</span></div>
        </div>
      ) : (
        <div style={{ fontSize: '10px', color: 'var(--c-muted)', marginTop: '8px' }}>Connecting telemetry...</div>
      )}

      {label > 0 && (
         <div style={{ marginTop: '8px', padding: '4px 6px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: 'bold', color: 'var(--c-warning)' }}>
           <AlertTriangle size={12} /> {FAILURE_LABEL_MAP[label] || 'ANOMALY DETECTED'}
         </div>
      )}
    </div>
  );
};

const nodeTypes = {
  router: RouterNode,
};

export const TopologySimulator: React.FC<Props> = ({ liveData, routers, selectedId, onSelect }) => {
  const nodes: Node[] = useMemo(() => {
    return routers.map(r => ({
      id: r.id,
      type: 'router',
      position: POSITIONS[r.id] || { x: 100, y: 100 },
      data: {
        router: r,
        snap: liveData[r.id],
        isSelected: r.id === selectedId
      }
    }));
  }, [routers, liveData, selectedId]);

  const edges: Edge[] = useMemo(() => {
    return PHYSICAL_LINKS.map(link => {
      const srcSnap = liveData[link.source];
      const tgtSnap = liveData[link.target];
      
      // Heuristic: If either node is moving high bandwidth, animate fast and color it.
      const bw = Math.max(srcSnap?.bandwidth || 0, tgtSnap?.bandwidth || 0);
      const isCongested = bw > 80;
      
      let strokeColor = 'rgba(59, 130, 246, 0.4)'; // bright blue transparent by default
      if (isCongested) strokeColor = 'var(--c-warning)';
      if (srcSnap?.link_status === 0 || tgtSnap?.link_status === 0) strokeColor = 'var(--c-danger)';

      return {
        id: link.id,
        source: link.source,
        target: link.target,
        animated: bw > 10 && srcSnap?.link_status !== 0 && tgtSnap?.link_status !== 0,
        type: 'smoothstep', // Use smoothstep instead of bezier for better visual
        style: {
          stroke: strokeColor,
          strokeWidth: isCongested ? 4 : 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
        },
      };
    });
  }, [liveData]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    onSelect(node.id);
  }, [onSelect]);

  return (
    <div className="glass-card" style={{ height: '100%', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px', paddingBottom: 0, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--c-primary)', letterSpacing: '0.1em' }}>
          ISRO NETWORK DIGITAL TWIN (PHYSICS SIMULATOR)
        </span>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          attributionPosition="bottom-left"
          className="dark-theme"
        >
          <Background color="#1a1e2e" gap={16} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
};
