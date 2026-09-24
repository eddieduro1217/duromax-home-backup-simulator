// Home appliances for the simulator.
// running / starting are watts. starting = running when the load has no motor surge.
// volts: 120 or 240 (240V loads use a 2-pole breaker = 2 transfer-switch circuits).
// softStart: true where an AirGo 240V soft starter applies (reduces the start-up surge).
// Values are typical industry estimates (approved as defaults, Sept 2026) - edit here to change the app.
window.APPLIANCES = [
  // Kitchen
  { id: 'fridge',      name: 'Refrigerator',                    room: 'Kitchen',  running: 700,  starting: 2200, volts: 120, tag: 'Essential' },
  { id: 'microwave',   name: 'Microwave (1,300 W cooking)',     room: 'Kitchen',  running: 2000, starting: 2000, volts: 120 },
  { id: 'coffee',      name: 'Coffee Maker',                    room: 'Kitchen',  running: 1000, starting: 1000, volts: 120 },
  { id: 'toaster',     name: 'Toaster',                         room: 'Kitchen',  running: 1100, starting: 1100, volts: 120 },
  { id: 'dishwasher',  name: 'Dishwasher',                      room: 'Kitchen',  running: 1500, starting: 1500, volts: 120 },
  { id: 'range',       name: 'Electric Range',                  room: 'Kitchen',  running: 5000, starting: 5000, volts: 240 },
  // Living room
  { id: 'lights',      name: 'Essential LED Lights (10 bulbs)', room: 'Whole Home', running: 90, starting: 90,  volts: 120, tag: 'Essential' },
  { id: 'internet',    name: 'Internet Modem / Router',         room: 'Living Room', running: 20,  starting: 20,   volts: 120, tag: 'Essential' },
  { id: 'tv',          name: 'Television',                      room: 'Living Room', running: 150, starting: 150,  volts: 120 },
  { id: 'chargers',    name: 'Phone & Laptop Charging',         room: 'Living Room', running: 100, starting: 100,  volts: 120 },
  { id: 'security',    name: 'Security System & Cameras',       room: 'Living Room', running: 50,  starting: 50,   volts: 120 },
  { id: 'fans',        name: 'Ceiling Fans (2)',                room: 'Living Room', running: 150, starting: 150,  volts: 120 },
  { id: 'spaceheater', name: 'Space Heater',                    room: 'Living Room', running: 1500, starting: 1500, volts: 120 },
  // Bedroom
  { id: 'cpap',        name: 'CPAP / BiPAP with Humidifier',    room: 'Bedroom',  running: 150,  starting: 150,  volts: 120, tag: 'Medical' },
  { id: 'oxygen',      name: 'Oxygen Concentrator',             room: 'Bedroom',  running: 350,  starting: 700,  volts: 120, tag: 'Medical' },
  { id: 'windowac',    name: 'Window AC (10,000 BTU)',          room: 'Bedroom',  running: 1200, starting: 3600, volts: 120 },
  { id: 'hairdryer',   name: 'Hair Dryer',                      room: 'Bedroom',  running: 1500, starting: 1500, volts: 120 },
  // Utility / laundry
  { id: 'furnace',     name: 'Gas Furnace Blower (1/2 HP)',     room: 'Utility',  running: 800,  starting: 2350, volts: 120, tag: 'Essential' },
  { id: 'sump',        name: 'Sump Pump (1/3 HP)',              room: 'Utility',  running: 800,  starting: 1300, volts: 120, tag: 'Essential' },
  { id: 'well',        name: 'Well Pump (1/2 HP)',              room: 'Utility',  running: 1000, starting: 2100, volts: 240, tag: 'Essential' },
  { id: 'freezer',     name: 'Chest Freezer',                   room: 'Utility',  running: 500,  starting: 1500, volts: 120, tag: 'Essential' },
  { id: 'waterheater', name: 'Electric Water Heater',           room: 'Utility',  running: 4500, starting: 4500, volts: 240 },
  { id: 'washer',      name: 'Washing Machine',                 room: 'Utility',  running: 1150, starting: 2250, volts: 120 },
  { id: 'gasdryer',    name: 'Gas Dryer',                       room: 'Utility',  running: 700,  starting: 1800, volts: 120 },
  { id: 'elecdryer',   name: 'Electric Dryer',                  room: 'Utility',  running: 5400, starting: 6750, volts: 240 },
  { id: 'dehumidifier',name: 'Dehumidifier',                    room: 'Utility',  running: 700,  starting: 700,  volts: 120 },
  { id: 'smoke',       name: 'Hardwired Smoke Detectors',       room: 'Utility',  running: 10,   starting: 10,   volts: 120, tag: 'Essential' },
  // Garage / outdoor
  { id: 'garagedoor',  name: 'Garage Door Opener (1/2 HP)',     room: 'Garage',   running: 875,  starting: 2350, volts: 120 },
  { id: 'ev',          name: 'EV Charger (Level 1)',            room: 'Garage',   running: 1440, starting: 1440, volts: 120 },
  { id: 'centralac',   name: 'Central AC (3-ton)',              room: 'Outdoor',  running: 3500, starting: 9000, volts: 240, softStart: true },
];

// AirGo soft starter: share of the start-up surge (starting - running) removed when the option is on.
// duromaxpower.com states "up to 70%" start-current reduction; 60% is used as a conservative typical value.
window.SOFT_START_REDUCTION = 0.60;

window.PRESETS = {
  essentials: ['fridge', 'freezer', 'lights', 'internet', 'furnace', 'sump', 'well', 'smoke', 'cpap', 'oxygen'],
  comfort: ['fridge', 'freezer', 'lights', 'internet', 'furnace', 'sump', 'well', 'smoke', 'cpap', 'oxygen',
            'tv', 'chargers', 'security', 'fans', 'microwave', 'coffee', 'windowac', 'washer', 'gasdryer'],
};
