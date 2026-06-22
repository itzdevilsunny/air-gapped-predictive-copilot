"""
ISRO Predictive NOC — Phase 1 Network Physics Engine
====================================================
Replaces random "dummy data" with a discrete flow simulation engine.
Uses NetworkX for OSPF (Dijkstra) shortest-path routing and
M/M/1 queueing theory to calculate exact latency, loss, and CPU load.
"""

import networkx as nx
import sqlite3
import math
from typing import Dict, List, Tuple
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "phase1.db")

class ISRONetworkEngine:
    def __init__(self):
        self.graph = nx.DiGraph()
        self.routers = {}
        self.links = {}
        self.demands = []
        
        # Link state caches
        self.link_utilization = {} # link_id -> mbps
        self.link_latency = {}     # link_id -> ms
        self.link_loss = {}        # link_id -> %
        
        # Router state caches
        self.router_traffic = {}   # router_id -> mbps processed
        self.router_metrics = {}   # router_id -> {cpu, mem, lat, loss}

        self.reload_topology()

    def _get_db(self):
        return sqlite3.connect(DB_PATH)

    def reload_topology(self):
        """Reads the physical topology and flows from the database."""
        self.graph.clear()
        self.routers.clear()
        self.links.clear()
        self.demands.clear()

        try:
            with self._get_db() as db:
                db.row_factory = sqlite3.Row
                
                # Load Routers
                for r in db.execute("SELECT * FROM router_registry"):
                    self.routers[r['id']] = dict(r)
                    self.graph.add_node(r['id'])
                    
                # Load Links
                for l in db.execute("SELECT * FROM network_links WHERE status = 1"):
                    # Add bi-directional links
                    self.links[(l['source_id'], l['target_id'])] = dict(l)
                    self.links[(l['target_id'], l['source_id'])] = dict(l)
                    
                    self.graph.add_edge(l['source_id'], l['target_id'], weight=l['delay'], capacity=l['capacity'], id=l['id'])
                    self.graph.add_edge(l['target_id'], l['source_id'], weight=l['delay'], capacity=l['capacity'], id=l['id'])
                    
                # Load Demands
                for d in db.execute("SELECT * FROM demand_flows WHERE status = 1"):
                    self.demands.append(dict(d))
                    
        except sqlite3.OperationalError:
            pass # DB might not be initialized yet

    def cut_link(self, source: str, target: str):
        """Simulates a fiber cut by removing an edge and updating DB."""
        if self.graph.has_edge(source, target):
            self.graph.remove_edge(source, target)
        if self.graph.has_edge(target, source):
            self.graph.remove_edge(target, source)
            
        with self._get_db() as db:
            db.execute("UPDATE network_links SET status = 0 WHERE source_id = ? AND target_id = ?", (source, target))
            db.execute("UPDATE network_links SET status = 0 WHERE source_id = ? AND target_id = ?", (target, source))
            db.commit()

    def step(self):
        """Calculates 1 tick of physics simulation."""
        # Reset utilization
        for u, v in self.graph.edges:
            self.link_utilization[(u, v)] = 0.0
            
        for r in self.routers:
            self.router_traffic[r] = 0.0

        # Route flows
        for demand in self.demands:
            src = demand['source_id']
            dst = demand['target_id']
            bw = demand['bandwidth_mbps']
            
            try:
                # OSPF Shortest Path
                path = nx.shortest_path(self.graph, source=src, target=dst, weight='weight')
                
                # Assign flow to edges and nodes
                for i in range(len(path) - 1):
                    u = path[i]
                    v = path[i+1]
                    self.link_utilization[(u, v)] += bw
                    self.router_traffic[u] += bw
                self.router_traffic[dst] += bw
                
            except nx.NetworkXNoPath:
                # Flow dropped entirely (100% loss for this flow)
                pass

        # Calculate Link Physics
        for u, v, data in self.graph.edges(data=True):
            cap = data['capacity']
            delay = data['weight']
            util = self.link_utilization[(u, v)]
            
            if util > cap:
                loss = ((util - cap) / util) * 100.0
                # Latency spikes immensely when queue overflows
                lat = delay + 500.0 
            else:
                loss = 0.0
                # M/M/1 Queueing theory approximation for delay
                # T = 1 / (μ - λ) -> scaled for latency
                if util == 0:
                    lat = delay
                else:
                    rho = util / cap
                    queue_delay = (rho / (1.0 - rho)) * 2.0 if rho < 0.99 else 200.0
                    lat = delay + queue_delay

            self.link_latency[(u, v)] = lat
            self.link_loss[(u, v)] = loss

        # Calculate Router Aggregates
        for rid, info in self.routers.items():
            # Sum max lat/loss of adjacent outgoing links
            out_edges = list(self.graph.out_edges(rid))
            if not out_edges:
                max_lat = 9999.0
                max_loss = 100.0
            else:
                max_lat = max([self.link_latency[e] for e in out_edges] + [0.0])
                max_loss = max([self.link_loss[e] for e in out_edges] + [0.0])

            traffic = self.router_traffic[rid]
            # Max processing capability of a router node
            MAX_ROUTER_CAP = 300.0 
            
            cpu = min(10.0 + (traffic / MAX_ROUTER_CAP) * 80.0, 99.9)
            mem = min(20.0 + (traffic / MAX_ROUTER_CAP) * 60.0, 95.0)

            # Failure labeling
            failure_label = 0
            if cpu > 85 or max_loss > 5.0 or traffic > MAX_ROUTER_CAP:
                failure_label = 1 # Congestion/Overload
            if not out_edges:
                failure_label = 3 # Isolated/Down

            self.router_metrics[rid] = {
                "latency": round(max_lat, 2),
                "packet_loss": round(max_loss, 3),
                "bandwidth": round(traffic, 2),
                "cpu": round(cpu, 2),
                "memory": round(mem, 2),
                "jitter": round(max_lat * 0.1, 2), # Simplified jitter
                "link_status": 1 if out_edges else 0,
                "failure_label": failure_label
            }

    def get_router_snapshot(self, rid: str) -> dict:
        """Returns the calculated metrics for a given router."""
        base = self.router_metrics.get(rid, {
            "latency": 9999.0, "packet_loss": 100.0, "bandwidth": 0.0,
            "cpu": 0.0, "memory": 0.0, "jitter": 0.0,
            "link_status": 0, "failure_label": 3
        })
        
        # Add slight natural jitter/noise to the physical exacts for realism
        import random
        return {
            "latency": max(0.1, round(base["latency"] + random.uniform(-1, 1), 2)),
            "packet_loss": max(0.0, round(base["packet_loss"] + random.uniform(0, 0.1), 3)),
            "bandwidth": max(0.0, round(base["bandwidth"] + random.uniform(-0.5, 0.5), 2)),
            "cpu": max(0.1, min(99.9, round(base["cpu"] + random.uniform(-1, 1), 2))),
            "memory": max(0.1, min(99.9, round(base["memory"] + random.uniform(-0.5, 0.5), 2))),
            "jitter": max(0.0, round(base["jitter"] + random.uniform(0, 0.5), 2)),
            "link_status": base["link_status"],
            "failure_label": base["failure_label"],
        }
