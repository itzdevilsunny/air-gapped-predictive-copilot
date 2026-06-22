"""
ISRO Phase 6 — Autonomous Self-Healing Recommendation Engine
=============================================================
Monitors live predictions + root cause data and generates:
  - Impact analysis (what services are affected)
  - Priority-ordered mitigation steps
  - Cisco IOS CLI automation scripts
  - Python automation scripts for network engineers
  - Self-healing confidence scores
"""

import os
import sqlite3
import logging
import datetime
from typing import Dict, Any, List, Optional

import pandas as pd
import numpy as np

logger = logging.getLogger("Phase6-SelfHeal")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "phase1.db")

# ISRO Network dependency map — which services depend on each router
ROUTER_DEPENDENCIES = {
    "ISTRAC-BGL": {
        "name": "ISTRAC Bangalore",
        "role": "Master NOC Hub",
        "criticality": "CRITICAL",
        "depends_on": [],
        "services": ["Mission Control Link", "Spacecraft Tracking Master", "Data Archival", "Network Management"],
        "downstream": ["NOC-DEL", "NOC-MUM", "SDSC-SHAR"],
        "backup_path": "via NOC-DEL secondary MPLS"
    },
    "SDSC-SHAR": {
        "name": "SDSC Sriharikota",
        "role": "Launch Site Operations",
        "criticality": "CRITICAL",
        "depends_on": ["ISTRAC-BGL"],
        "services": ["Launch Command Link", "Real-time Countdown Data", "Safety System Telemetry"],
        "downstream": [],
        "backup_path": "via VSAT backup (30s failover)"
    },
    "MCF-HSN": {
        "name": "MCF Hassan",
        "role": "Satellite Control Facility",
        "criticality": "HIGH",
        "depends_on": ["ISTRAC-BGL"],
        "services": ["Satellite TT&C Commands", "Orbital Maintenance Data", "GEO Belt Coordination"],
        "downstream": [],
        "backup_path": "via MCF Bhopal secondary"
    },
    "NOC-DEL": {
        "name": "NOC Delhi",
        "role": "Northern India Gateway",
        "criticality": "HIGH",
        "depends_on": ["ISTRAC-BGL"],
        "services": ["MPLS Backbone Routing", "Government Network Interface", "NIC Peering"],
        "downstream": ["TRACK-PBL"],
        "backup_path": "via NOC-MUM alternate path"
    },
    "NOC-MUM": {
        "name": "NOC Mumbai",
        "role": "Western India Gateway",
        "criticality": "MEDIUM",
        "depends_on": ["ISTRAC-BGL"],
        "services": ["International Peering", "ISRO External Data Exchange", "Cloud Connectivity"],
        "downstream": [],
        "backup_path": "via NOC-DEL reroute"
    },
    "TRACK-PBL": {
        "name": "TRACK Port Blair",
        "role": "Downrange Tracking Station",
        "criticality": "HIGH",
        "depends_on": ["NOC-DEL"],
        "services": ["Launch Vehicle Downrange Tracking", "Telemetry Reception", "Radar Data"],
        "downstream": [],
        "backup_path": "via VSAT emergency channel"
    }
}

# Mitigation playbooks per failure type
MITIGATION_PLAYBOOKS = {
    "Link Congestion": {
        "steps": [
            "Apply QoS traffic shaping to throttle non-critical flows",
            "Activate secondary MPLS tunnel to distribute load",
            "Rate-limit bulk data transfers (science data, file backups)",
            "Enable ECMP (Equal-Cost Multi-Path) if available",
            "Notify upstream provider to increase MPLS CIR",
        ],
        "cli_template": lambda name, rid: (
            f"! === Auto-Generated Congestion Mitigation for {name} ===\n"
            f"! Generated: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n"
            f"!\n"
            f"policy-map ISRO-EMERGENCY-QOS\n"
            f" class ISRO-CRITICAL-TELEMETRY\n"
            f"  priority percent 50\n"
            f" class ISRO-MISSION-CONTROL\n"
            f"  bandwidth percent 25\n"
            f" class class-default\n"
            f"  shape average 8000000\n"
            f"  random-detect\n"
            f" exit\n"
            f"!\n"
            f"interface Tunnel10\n"
            f" service-policy output ISRO-EMERGENCY-QOS\n"
            f"!\n"
            f"! Activate backup tunnel\n"
            f"interface Tunnel20\n"
            f" no shutdown\n"
            f" ip ospf cost 50\n"
            f"!\n"
            f"! Rate-limit non-critical traffic\n"
            f"ip access-list extended BULK-DATA\n"
            f" permit ip any any dscp default\n"
            f"rate-limit input access-group BULK-DATA 10000000 2000000 4000000 "
            f"conform-action transmit exceed-action drop\n"
            f"end\n"
            f"!\n"
            f"! Verify: show policy-map interface Tunnel10\n"
            f"! Verify: show interface Tunnel20 | include line protocol"
        ),
        "automation_script": lambda name, rid: (
            f"#!/usr/bin/env python3\n"
            f'"""Auto-generated Self-Healing Script for {name} — Congestion Mitigation"""\n'
            f"# Generated: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n\n"
            f"import netmiko\nimport time\n\n"
            f"DEVICE = {{\n"
            f"    'device_type': 'cisco_ios',\n"
            f"    'host': '10.100.{rid[-2:]}.1',  # Update with actual IP\n"
            f"    'username': 'isro-noc',\n"
            f"    'password': 'VAULT_SECRET',\n"
            f"}}\n\n"
            f"COMMANDS = [\n"
            f"    'configure terminal',\n"
            f"    'policy-map ISRO-EMERGENCY-QOS',\n"
            f"    ' class ISRO-CRITICAL-TELEMETRY',\n"
            f"    '  priority percent 50',\n"
            f"    ' class class-default',\n"
            f"    '  shape average 8000000',\n"
            f"    ' exit',\n"
            f"    'interface Tunnel10',\n"
            f"    ' service-policy output ISRO-EMERGENCY-QOS',\n"
            f"    'interface Tunnel20',\n"
            f"    ' no shutdown',\n"
            f"    'end',\n"
            f"    'write memory',\n"
            f"]\n\n"
            f"def apply_mitigation():\n"
            f"    print(f'[SELFHEAL] Connecting to {name}...')\n"
            f"    with netmiko.ConnectHandler(**DEVICE) as ssh:\n"
            f"        for cmd in COMMANDS:\n"
            f"            output = ssh.send_command_timing(cmd)\n"
            f"            print(f'> {{cmd}}')\n"
            f"        print('[SELFHEAL] Mitigation applied successfully.')\n\n"
            f"if __name__ == '__main__':\n"
            f"    apply_mitigation()\n"
        ),
        "estimated_fix_minutes": 3,
        "auto_applicable": True,
    },
    "Device Overload": {
        "steps": [
            "Identify top CPU-consuming processes and terminate non-critical ones",
            "Clear bloated IP routing tables to free memory",
            "Apply CPU threshold monitoring and SNMP alerts",
            "Redistribute routing load via OSPF weight adjustment",
            "Schedule maintenance window for hardware upgrade assessment",
        ],
        "cli_template": lambda name, rid: (
            f"! === Auto-Generated Overload Mitigation for {name} ===\n"
            f"! Generated: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n"
            f"!\n"
            f"! Step 1: Check top CPU processes\n"
            f"show processes cpu sorted | head 20\n"
            f"show memory statistics\n"
            f"!\n"
            f"! Step 2: Clear routing tables (brief reconvergence expected)\n"
            f"clear ip route *\n"
            f"clear arp\n"
            f"!\n"
            f"! Step 3: Apply CPU alerting\n"
            f"process cpu threshold type total rising 85 interval 5\n"
            f"snmp-server enable traps cpu threshold\n"
            f"!\n"
            f"! Step 4: Reduce OSPF load\n"
            f"router ospf 1\n"
            f" auto-cost reference-bandwidth 1000\n"
            f" max-lsa 12000\n"
            f" exit\n"
            f"!\n"
            f"! Step 5: BGP prefix limit to prevent table bloat\n"
            f"router bgp 65001\n"
            f" neighbor <peer_ip> maximum-prefix 50000 80\n"
            f" exit\n"
            f"end\n"
            f"!\n"
            f"! Monitor: show platform resources (every 2 min)\n"
        ),
        "automation_script": lambda name, rid: (
            f"#!/usr/bin/env python3\n"
            f'"""Auto-generated Self-Healing Script for {name} — Overload Mitigation"""\n'
            f"# Generated: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n\n"
            f"import netmiko, time\n\n"
            f"DEVICE = {{'device_type': 'cisco_ios', 'host': '10.100.{rid[-2:]}.1', "
            f"'username': 'isro-noc', 'password': 'VAULT_SECRET'}}\n\n"
            f"COMMANDS = [\n"
            f"    'clear ip route *',\n"
            f"    'clear arp',\n"
            f"    'configure terminal',\n"
            f"    'process cpu threshold type total rising 85 interval 5',\n"
            f"    'snmp-server enable traps cpu threshold',\n"
            f"    'end',\n"
            f"    'write memory',\n"
            f"]\n\n"
            f"def apply_mitigation():\n"
            f"    print(f'[SELFHEAL] Clearing {name} routing tables...')\n"
            f"    with netmiko.ConnectHandler(**DEVICE) as ssh:\n"
            f"        for cmd in COMMANDS:\n"
            f"            ssh.send_command_timing(cmd)\n"
            f"            print(f'> {{cmd}}')\n"
            f"        print('[SELFHEAL] Overload mitigation complete.')\n\n"
            f"if __name__ == '__main__':\n"
            f"    apply_mitigation()\n"
        ),
        "estimated_fix_minutes": 5,
        "auto_applicable": True,
    },
    "Link Flapping": {
        "steps": [
            "Apply carrier-delay to suppress brief link flaps",
            "Tune OSPF hello/dead timers to prevent false adjacency drops",
            "Enable BFD for hardware-level fast detection",
            "Verify physical layer integrity (CRC errors, optical power)",
            "Pre-activate secondary path for fast failover",
        ],
        "cli_template": lambda name, rid: (
            f"! === Auto-Generated Flapping Mitigation for {name} ===\n"
            f"! Generated: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n"
            f"!\n"
            f"interface GigabitEthernet0/1\n"
            f" carrier-delay msec 2000\n"
            f" ip ospf hello-interval 10\n"
            f" ip ospf dead-interval 40\n"
            f" dampening 15 750 2000 60\n"
            f" exit\n"
            f"!\n"
            f"! Enable BFD for fast detection\n"
            f"interface GigabitEthernet0/1\n"
            f" bfd interval 300 min_rx 300 multiplier 3\n"
            f" exit\n"
            f"!\n"
            f"router ospf 1\n"
            f" bfd all-interfaces\n"
            f" exit\n"
            f"!\n"
            f"! Pre-activate backup path\n"
            f"interface GigabitEthernet0/2\n"
            f" no shutdown\n"
            f" ip ospf cost 100\n"
            f" exit\n"
            f"end\n"
            f"!\n"
            f"! Verify: show ip ospf neighbor | include Full\n"
            f"! Verify: show bfd neighbors"
        ),
        "automation_script": lambda name, rid: (
            f"#!/usr/bin/env python3\n"
            f'"""Auto-generated Self-Healing Script for {name} — Link Flap Suppression"""\n'
            f"# Generated: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n\n"
            f"import netmiko\n\n"
            f"DEVICE = {{'device_type': 'cisco_ios', 'host': '10.100.{rid[-2:]}.1', "
            f"'username': 'isro-noc', 'password': 'VAULT_SECRET'}}\n\n"
            f"COMMANDS = [\n"
            f"    'configure terminal',\n"
            f"    'interface GigabitEthernet0/1',\n"
            f"    ' carrier-delay msec 2000',\n"
            f"    ' ip ospf hello-interval 10',\n"
            f"    ' ip ospf dead-interval 40',\n"
            f"    ' bfd interval 300 min_rx 300 multiplier 3',\n"
            f"    ' exit',\n"
            f"    'router ospf 1',\n"
            f"    ' bfd all-interfaces',\n"
            f"    ' exit',\n"
            f"    'end',\n"
            f"    'write memory',\n"
            f"]\n\n"
            f"def apply_mitigation():\n"
            f"    with netmiko.ConnectHandler(**DEVICE) as ssh:\n"
            f"        for cmd in COMMANDS:\n"
            f"            ssh.send_command_timing(cmd)\n"
            f"            print(f'> {{cmd}}')\n"
            f"    print('[SELFHEAL] Flap suppression applied.')\n\n"
            f"if __name__ == '__main__':\n"
            f"    apply_mitigation()\n"
        ),
        "estimated_fix_minutes": 2,
        "auto_applicable": True,
    },
    "Link Down": {
        "steps": [
            "Attempt software-level interface restoration (no shutdown)",
            "Activate pre-configured backup static route immediately",
            "Dispatch field engineer to check physical layer",
            "Switch to VSAT emergency backup channel",
            "Notify Mission Director and NOC supervisor within 5 minutes",
        ],
        "cli_template": lambda name, rid: (
            f"! === EMERGENCY Link Restoration for {name} ===\n"
            f"! Generated: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n"
            f"!\n"
            f"! STEP 1: Attempt software restoration\n"
            f"interface GigabitEthernet0/1\n"
            f" no shutdown\n"
            f" exit\n"
            f"!\n"
            f"! Wait 10 seconds then verify\n"
            f"show interface GigabitEthernet0/1 | include line protocol\n"
            f"!\n"
            f"! STEP 2: If still down, activate backup route\n"
            f"ip route 0.0.0.0 0.0.0.0 <backup_gateway_ip> 1\n"
            f"!\n"
            f"! STEP 3: Log event\n"
            f"event manager applet LINK-DOWN-ALERT\n"
            f" event syslog pattern \"GigabitEthernet0/1.*changed state to down\"\n"
            f" action 1.0 syslog msg \"CRITICAL: Primary link down on {name}. Backup activated.\"\n"
            f" action 2.0 snmp-trap\n"
            f"end\n"
            f"!\n"
            f"! IMPORTANT: Dispatch field engineer. Check SFP, fiber, patch panel."
        ),
        "automation_script": lambda name, rid: (
            f"#!/usr/bin/env python3\n"
            f'"""EMERGENCY Self-Healing Script for {name} — Link Down Recovery"""\n'
            f"# Generated: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n"
            f"# WARNING: This activates backup routing. Notify NOC supervisor before running.\n\n"
            f"import netmiko, time, smtplib\n\n"
            f"DEVICE = {{'device_type': 'cisco_ios', 'host': '10.100.{rid[-2:]}.1', "
            f"'username': 'isro-noc', 'password': 'VAULT_SECRET'}}\n\n"
            f"def restore_link():\n"
            f"    try:\n"
            f"        with netmiko.ConnectHandler(**DEVICE) as ssh:\n"
            f"            # Attempt no-shutdown\n"
            f"            ssh.send_command_timing('configure terminal')\n"
            f"            ssh.send_command_timing('interface GigabitEthernet0/1')\n"
            f"            ssh.send_command_timing(' no shutdown')\n"
            f"            ssh.send_command_timing('end')\n"
            f"            time.sleep(10)\n"
            f"            status = ssh.send_command('show interface GigabitEthernet0/1 | include line protocol')\n"
            f"            if 'up' in status.lower():\n"
            f"                print('[SELFHEAL] Link restored successfully!')\n"
            f"                return True\n"
            f"            # Activate backup route\n"
            f"            ssh.send_command_timing('configure terminal')\n"
            f"            ssh.send_command_timing('ip route 0.0.0.0 0.0.0.0 <backup_gw> 1')\n"
            f"            ssh.send_command_timing('end')\n"
            f"            print('[SELFHEAL] Backup route activated. Dispatch field engineer.')\n"
            f"    except Exception as e:\n"
            f"        print(f'[SELFHEAL ERROR] Cannot connect to device: {{e}}')\n"
            f"        print('[SELFHEAL] Manual intervention required immediately!')\n\n"
            f"if __name__ == '__main__':\n"
            f"    restore_link()\n"
        ),
        "estimated_fix_minutes": 15,
        "auto_applicable": False,
    },
    "Normal": {
        "steps": ["No action required. Continue standard monitoring."],
        "cli_template": lambda name, rid: f"! {name} operating normally. No CLI actions required.",
        "automation_script": lambda name, rid: f"# {name} is healthy. No automation needed.",
        "estimated_fix_minutes": 0,
        "auto_applicable": False,
    }
}


def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def generate_selfheal_report() -> Dict[str, Any]:
    """
    Generates comprehensive self-healing recommendations for all routers
    by correlating Phase 2 predictions + Phase 4 root cause + live telemetry.
    """
    import phase2_predictor
    import phase4_root_cause

    conn = get_db()
    
    # Get live root cause analysis
    try:
        rc_data = phase4_root_cause.analyze_root_cause(conn)
    except Exception as e:
        logger.error(f"Root cause fetch failed: {e}")
        rc_data = {}

    # Get AI predictions
    try:
        predictions = phase2_predictor.predict_all_routers(conn)
    except Exception as e:
        logger.error(f"Prediction fetch failed: {e}")
        predictions = {}

    # Get live telemetry
    rows = conn.execute(
        """SELECT s.*, r.name AS router_name
           FROM network_snapshots s
           JOIN router_registry r ON s.router_id = r.id
           WHERE s.id IN (SELECT MAX(id) FROM network_snapshots GROUP BY router_id)"""
    ).fetchall()
    conn.close()

    telemetry = {dict(r)["router_id"]: dict(r) for r in rows}

    results = {}
    for rid, dep_info in ROUTER_DEPENDENCIES.items():
        rc = rc_data.get(rid, {})
        pred = predictions.get(rid, {})
        telem = telemetry.get(rid, {})

        root_cause = rc.get("root_cause", "Normal operations")
        status = rc.get("status", "NORMAL")
        confidence = rc.get("confidence_score", 0)

        # Get failure type for playbook lookup
        failure_type = "Normal"
        if root_cause and root_cause not in ("Normal operations", "Normal operation"):
            failure_type = root_cause

        # Get prediction risk
        risk_score = 0
        predicted_class = "Normal"
        time_to_failure = None
        if pred:
            risk_score = round(pred.get("failure_probability", 0) * 100, 1)
            predicted_class = pred.get("predicted_failure_class", "Normal")
            if risk_score > 30 and predicted_class != "Normal":
                # Estimate time based on risk (higher risk = closer to failure)
                if risk_score > 90:
                    time_to_failure = f"~{max(5, int(35 - (risk_score - 90) * 2))} min"
                elif risk_score > 75:
                    time_to_failure = f"~{int(40 - (risk_score - 75) * 0.5)} min"
                elif risk_score > 50:
                    time_to_failure = "~45-60 min"
                else:
                    time_to_failure = ">60 min"

        # Determine effective failure type (root cause takes priority for CRITICAL)
        effective_failure = failure_type if status == "CRITICAL" else (
            predicted_class if predicted_class not in ("Normal", "") and risk_score > 40 else "Normal"
        )
        if effective_failure == "":
            effective_failure = "Normal"

        # Get playbook
        playbook = MITIGATION_PLAYBOOKS.get(effective_failure, MITIGATION_PLAYBOOKS["Normal"])

        # Impact analysis
        impact = []
        if status != "NORMAL" or risk_score > 50:
            services = dep_info.get("services", [])
            downstream = dep_info.get("downstream", [])
            criticality = dep_info.get("criticality", "MEDIUM")
            
            if status == "CRITICAL":
                impact.append(f"ACTIVE FAULT: {len(services)} critical services at risk")
            elif status == "PREDICTIVE":
                impact.append(f"PREDICTED FAULT: {len(services)} services may be interrupted in {time_to_failure or '45+ min'}")
            
            for svc in services[:3]:
                impact.append(f"Service at risk: {svc}")
            
            if downstream:
                downstream_names = [ROUTER_DEPENDENCIES.get(d, {}).get("name", d) for d in downstream]
                impact.append(f"Downstream impact: {', '.join(downstream_names)} may lose connectivity")
            
            if criticality == "CRITICAL":
                impact.append("⚠ CRITICAL: Mission operations may be interrupted")

        # Generate CLI and automation
        cli_fix = playbook["cli_template"](dep_info["name"], rid)
        auto_script = playbook["automation_script"](dep_info["name"], rid)

        # Overall self-heal priority
        if status == "CRITICAL":
            priority = "P1-CRITICAL"
            priority_color = "red"
        elif risk_score > 75 or status == "PREDICTIVE":
            priority = "P2-HIGH"
            priority_color = "orange"
        elif risk_score > 40:
            priority = "P3-MEDIUM"
            priority_color = "yellow"
        else:
            priority = "P4-NORMAL"
            priority_color = "green"

        results[rid] = {
            "router_id": rid,
            "router_name": dep_info["name"],
            "role": dep_info["role"],
            "criticality": dep_info["criticality"],
            "status": status,
            "priority": priority,
            "priority_color": priority_color,

            # Prediction data
            "risk_score": risk_score,
            "predicted_failure": predicted_class,
            "time_to_failure": time_to_failure,

            # Root cause data
            "root_cause": root_cause,
            "confidence_score": confidence,
            "rule_triggered": rc.get("rule_triggered", "None"),
            "ai_attribution": rc.get("ai_attribution", "Normal Profile"),
            "evidences": rc.get("evidences", []),

            # Live telemetry
            "latest_metrics": {
                "latency": round(telem.get("latency", 0), 2),
                "packet_loss": round(telem.get("packet_loss", 0), 3),
                "jitter": round(telem.get("jitter", 0), 2),
                "bandwidth": round(telem.get("bandwidth", 0), 1),
                "cpu": round(telem.get("cpu", 0), 1),
                "memory": round(telem.get("memory", 0), 1),
                "link_status": int(telem.get("link_status", 1)),
            },

            # Self-healing output
            "failure_type": effective_failure,
            "impact_analysis": impact,
            "mitigation_steps": playbook["steps"],
            "cli_fix": cli_fix,
            "automation_script": auto_script,
            "estimated_fix_minutes": playbook["estimated_fix_minutes"],
            "auto_applicable": playbook["auto_applicable"],

            # Network context
            "services": dep_info["services"],
            "downstream_routers": dep_info["downstream"],
            "backup_path": dep_info["backup_path"],
        }

    return results
