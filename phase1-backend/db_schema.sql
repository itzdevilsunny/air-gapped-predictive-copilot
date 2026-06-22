-- ============================================================
-- ISRO Predictive NOC Phase 1 — Database Schema
-- Compatible with PostgreSQL 16 / SQLite 3
-- ============================================================

-- Router Registry: Static configuration of all ISRO MPLS nodes
CREATE TABLE IF NOT EXISTS router_registry (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    location    TEXT NOT NULL,
    ip_address  TEXT NOT NULL,
    site_type   TEXT NOT NULL DEFAULT 'NOC',  -- ISTRAC, SDSC, MCF, NOC, TRACK
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Network Snapshots: Raw time-series telemetry (also mirrored in InfluxDB)
CREATE TABLE IF NOT EXISTS network_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    router_id     TEXT NOT NULL,
    timestamp     TIMESTAMP NOT NULL,
    latency       REAL NOT NULL,
    packet_loss   REAL NOT NULL,
    jitter        REAL NOT NULL,
    bandwidth     REAL NOT NULL,
    cpu           REAL NOT NULL,
    memory        REAL NOT NULL,
    link_status   INTEGER NOT NULL DEFAULT 1,
    failure_label INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (router_id) REFERENCES router_registry(id)
);

-- Incident Log: Detected anomalies and failure events
CREATE TABLE IF NOT EXISTS incident_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    router_id       TEXT NOT NULL,
    started_at      TIMESTAMP NOT NULL,
    resolved_at     TIMESTAMP,
    failure_type    TEXT NOT NULL,  -- congestion, overload, instability, link_down
    severity        TEXT NOT NULL DEFAULT 'WARNING',  -- INFO, WARNING, CRITICAL
    peak_latency    REAL,
    peak_loss       REAL,
    peak_cpu        REAL,
    notes           TEXT,
    FOREIGN KEY (router_id) REFERENCES router_registry(id)
);

-- Ingestion Stats: Generator health tracking
CREATE TABLE IF NOT EXISTS ingestion_stats (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rows_inserted   INTEGER NOT NULL DEFAULT 0,
    errors          INTEGER NOT NULL DEFAULT 0,
    generator_pid   INTEGER,
    influx_writes   INTEGER NOT NULL DEFAULT 0
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_snapshots_router_ts ON network_snapshots (router_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON network_snapshots (timestamp);
CREATE INDEX IF NOT EXISTS idx_incidents_router ON incident_log (router_id, started_at);
CREATE INDEX IF NOT EXISTS idx_incidents_active ON incident_log (resolved_at);

-- Seed router registry with ISRO MPLS topology
INSERT OR IGNORE INTO router_registry (id, name, location, ip_address, site_type) VALUES
    ('ISTRAC-BGL', 'ISTRAC Bangalore',   'Bangalore, Karnataka',       '10.100.10.1', 'ISTRAC'),
    ('SDSC-SHAR',  'SDSC Sriharikota',   'Sriharikota, Andhra Pradesh','10.100.20.1', 'SDSC'),
    ('MCF-HSN',    'MCF Hassan',         'Hassan, Karnataka',          '10.100.30.1', 'MCF'),
    ('NOC-DEL',    'NOC Delhi',          'New Delhi',                  '10.100.40.1', 'NOC'),
    ('NOC-MUM',    'NOC Mumbai',         'Mumbai, Maharashtra',        '10.100.50.1', 'NOC'),
    ('TRACK-PBL',  'TRACK Port Blair',   'Port Blair, Andaman Islands','10.100.60.1', 'TRACK');

-- Network Links (Topology Edges)
CREATE TABLE IF NOT EXISTS network_links (
    id          TEXT PRIMARY KEY,
    source_id   TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    capacity    REAL NOT NULL,  -- in Mbps
    delay       REAL NOT NULL,  -- base propagation delay in ms
    status      INTEGER NOT NULL DEFAULT 1, -- 1=up, 0=down
    FOREIGN KEY (source_id) REFERENCES router_registry(id),
    FOREIGN KEY (target_id) REFERENCES router_registry(id)
);

-- Demand Flows (Traffic generators)
CREATE TABLE IF NOT EXISTS demand_flows (
    id          TEXT PRIMARY KEY,
    source_id   TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    bandwidth_mbps REAL NOT NULL,
    status      INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (source_id) REFERENCES router_registry(id),
    FOREIGN KEY (target_id) REFERENCES router_registry(id)
);

-- Seed Initial Physical Topology
INSERT OR IGNORE INTO network_links (id, source_id, target_id, capacity, delay) VALUES
    ('ISTRAC-SDSC', 'ISTRAC-BGL', 'SDSC-SHAR', 100.0, 5.0),
    ('ISTRAC-MCF', 'ISTRAC-BGL', 'MCF-HSN', 80.0, 3.0),
    ('SDSC-NOCDEL', 'SDSC-SHAR', 'NOC-DEL', 100.0, 20.0),
    ('MCF-NOCMUM', 'MCF-HSN', 'NOC-MUM', 80.0, 15.0),
    ('NOCDEL-NOCMUM', 'NOC-DEL', 'NOC-MUM', 150.0, 10.0),
    ('ISTRAC-TRACK', 'ISTRAC-BGL', 'TRACK-PBL', 50.0, 45.0),
    ('NOCMUM-TRACK', 'NOC-MUM', 'TRACK-PBL', 50.0, 40.0);

-- Seed Initial Baseline Traffic Flows
INSERT OR IGNORE INTO demand_flows (id, source_id, target_id, bandwidth_mbps) VALUES
    ('FLOW-SDSC-DEL', 'SDSC-SHAR', 'NOC-DEL', 40.0),
    ('FLOW-MCF-MUM', 'MCF-HSN', 'NOC-MUM', 30.0),
    ('FLOW-TRACK-BGL', 'TRACK-PBL', 'ISTRAC-BGL', 15.0),
    ('FLOW-BGL-DEL', 'ISTRAC-BGL', 'NOC-DEL', 25.0);
