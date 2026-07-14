import random
import time
from datetime import datetime, timedelta
import math

try:
    import pandas as pd
except ImportError:
    pd = None

ROUTERS = {
    "ISTRAC-BGL": "ISTRAC Bangalore",
    "SDSC-SHAR": "SDSC Sriharikota",
    "MCF-HSN": "MCF Hassan",
    "NOC-DEL": "NOC Delhi",
    "NOC-MUM": "NOC Mumbai",
    "TRACK-PBL": "TRACK Port Blair"
}

class NetworkSimulator:
    def __init__(self, history_length=60):
        self.history_length = history_length
        # router_id -> list of telemetry dicts
        self.history = {rid: [] for rid in ROUTERS.keys()}
        self.active_scenarios = {rid: "normal" for rid in ROUTERS.keys()}
        self.scenario_timer = {rid: 0 for rid in ROUTERS.keys()}
        
        # Satellite orbital tracking variables
        self.leo_step = 0
        self.solar_flare_active = False
        self.solar_flare_timer = 0
        
        # Populate initial historical data (60 steps)
        self._initialize_history()

    def _initialize_history(self):
        # Generate 60 steps of historical data ending now
        now = datetime.now()
        for rid in ROUTERS.keys():
            for i in range(self.history_length, 0, -1):
                timestamp = now - timedelta(seconds=i * 2)
                # Introduce occasional random historical anomalies
                scenario = "normal"
                if i in [15, 16, 17] and rid == "SDSC-SHAR":
                    scenario = "congestion"
                elif i in [30, 31, 32] and rid == "NOC-DEL":
                    scenario = "overload"
                elif i in [45, 46, 47] and rid == "TRACK-PBL":
                    scenario = "instability"
                
                record = self._generate_point(rid, scenario, timestamp)
                self.history[rid].append(record)

    def set_scenario(self, router_id: str, scenario: str, duration_steps: int = 15):
        if router_id in self.history:
            self.active_scenarios[router_id] = scenario
            self.scenario_timer[router_id] = duration_steps

    def step(self) -> dict:
        """Advance the simulation by 1 step (2 seconds) and return the latest data for all routers."""
        now = datetime.now()
        step_data = {}
        
        for rid in ROUTERS.keys():
            scenario = self.active_scenarios[rid]
            
            # Count down scenario timer
            if self.scenario_timer[rid] > 0:
                self.scenario_timer[rid] -= 1
                if self.scenario_timer[rid] == 0:
                    self.active_scenarios[rid] = "normal"
            
            # Occasionally trigger random autonomous events if normal
            if scenario == "normal" and random.random() < 0.02:
                # Pick a random failure scenario
                failures = ["congestion", "overload", "instability"]
                self.active_scenarios[rid] = random.choice(failures)
                self.scenario_timer[rid] = random.randint(10, 20)
                scenario = self.active_scenarios[rid]
            
            record = self._generate_point(rid, scenario, now)
            
            # Append and maintain sliding window
            self.history[rid].append(record)
            if len(self.history[rid]) > self.history_length:
                self.history[rid].pop(0)
                
            step_data[rid] = record
            
        return step_data

    def _generate_point(self, router_id: str, scenario: str, timestamp: datetime) -> dict:
        # Defaults (Normal)
        latency = random.uniform(12.0, 22.0)
        packet_loss = random.uniform(0.0, 0.2)
        jitter = random.uniform(1.0, 2.5)
        bandwidth = random.uniform(25.0, 45.0)
        cpu = random.uniform(15.0, 35.0)
        memory = random.uniform(40.0, 50.0)
        link_status = 1
        failure_label = 0  # 0: Normal, 1: Congestion, 2: Overload, 3: Instability

        if scenario == "congestion":
            bandwidth = random.uniform(88.0, 97.0)
            latency = random.uniform(75.0, 140.0)
            packet_loss = random.uniform(3.5, 7.5)
            jitter = random.uniform(8.0, 16.0)
            cpu = random.uniform(40.0, 60.0)
            failure_label = 1
        elif scenario == "overload":
            cpu = random.uniform(92.0, 99.0)
            memory = random.uniform(88.0, 95.0)
            latency = random.uniform(25.0, 40.0)
            packet_loss = random.uniform(0.2, 1.5)
            jitter = random.uniform(2.5, 5.0)
            failure_label = 2
        elif scenario == "instability":
            # Link flapping / routing instability
            link_status = 0 if random.random() < 0.4 else 1
            packet_loss = random.uniform(12.0, 28.0)
            latency = random.uniform(180.0, 260.0)
            jitter = random.uniform(18.0, 32.0)
            bandwidth = random.uniform(10.0, 25.0)
            cpu = random.uniform(50.0, 75.0)
            failure_label = 3

        return {
            "timestamp": timestamp.isoformat(),
            "router_id": router_id,
            "router_name": ROUTERS[router_id],
            "latency": round(latency, 2),
            "packet_loss": round(packet_loss, 2),
            "jitter": round(jitter, 2),
            "bandwidth": round(bandwidth, 2),
            "cpu": round(cpu, 2),
            "memory": round(memory, 2),
            "link_status": link_status,
            "failure_label": failure_label
        }

    def get_router_history(self, router_id: str):
        return self.history.get(router_id, [])

    def get_training_data(self, samples_per_router=500):
        """Generates synthetic dataset for initial training of XGBoost and Isolation Forest."""
        data = []
        scenarios = ["normal", "congestion", "overload", "instability"]
        now = datetime.now()
        
        for rid in ROUTERS.keys():
            for i in range(samples_per_router):
                scenario = random.choice(scenarios)
                ts = now - timedelta(seconds=i * 2)
                record = self._generate_point(rid, scenario, ts)
                
                # To train predictive models ("will fail in next 10-15 steps"), we need lead time features
                # Let's add rolling features and predictive targets during the data prep step
                data.append(record)
                
        if pd is not None:
            return pd.DataFrame(data)
        return data

    def set_solar_flare(self, active: bool, duration_steps: int = 15):
        self.solar_flare_active = active
        self.solar_flare_timer = duration_steps if active else 0

    def get_satellite_telemetry(self) -> dict:
        # Advance LEO step dynamically
        self.leo_step = (self.leo_step + 2) % 360
        
        # Countdown solar flare
        if self.solar_flare_timer > 0:
            self.solar_flare_timer -= 1
            if self.solar_flare_timer == 0:
                self.solar_flare_active = False
                
        # LEO Satellite: line of sight is active between 60 and 180 degrees
        leo_in_los = 60 <= self.leo_step <= 180
        
        # Determine Lock Node based on sectors
        if 60 <= self.leo_step < 100:
            lock_node = "ISTRAC-BGL"
        elif 100 <= self.leo_step < 140:
            lock_node = "SDSC-SHAR"
        elif 140 <= self.leo_step <= 180:
            lock_node = "TRACK-PBL"
        else:
            lock_node = "NONE"

        # Check for transition disruption (AOS, Handovers, LOS)
        in_transition = False
        if leo_in_los:
            # transitions occur at boundaries 60, 100, 140, 180 (±2 degrees)
            for boundary in [60, 100, 140, 180]:
                if abs(self.leo_step - boundary) <= 2:
                    in_transition = True
                    break

        if self.solar_flare_active:
            leo_snr = 0.0
            geo_snr = 0.0
            leo_loss = 100.0
            geo_loss = 100.0
        else:
            if leo_in_los:
                if in_transition:
                    # Simulated signal degradation during handover/AOS/LOS transition
                    leo_snr = round(random.uniform(10.2, 14.5), 1)
                    leo_loss = round(random.uniform(8.5, 14.8), 2)
                else:
                    leo_snr = round(random.uniform(22.5, 27.8), 1)
                    leo_loss = round(random.uniform(0.0, 0.5), 2)
            else:
                leo_snr = 0.0
                leo_loss = 100.0
            geo_snr = round(random.uniform(15.2, 17.9), 1)
            geo_loss = round(random.uniform(0.1, 0.4), 2)

        return {
            "solar_flare": self.solar_flare_active,
            "satellites": {
                "Cartosat-3": {
                    "name": "Cartosat-3",
                    "type": "LEO (Imaging)",
                    "altitude": round(505.2 + math.sin(math.radians(self.leo_step)) * 2.1, 2),
                    "velocity": 7.62,
                    "snr": leo_snr,
                    "packet_loss": leo_loss,
                    "temp": round(24.5 + math.cos(math.radians(self.leo_step)) * 6.2, 1),
                    "los": leo_in_los,
                    "lock_node": lock_node,
                    "orbit_angle": self.leo_step
                },
                "GSAT-31": {
                    "name": "GSAT-31",
                    "type": "GEO (Comms)",
                    "altitude": 35786.4,
                    "velocity": 3.07,
                    "snr": geo_snr,
                    "packet_loss": geo_loss,
                    "temp": round(61.2 + random.uniform(-0.5, 0.5), 1),
                    "los": True,
                    "lock_node": "MCF-HSN",
                    "orbit_angle": 0
                }
            }
        }
