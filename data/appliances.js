// Home appliances for the simulator.
// running / starting are watts ("starting" = TOTAL starting watts, not just the extra surge).
// volts: 120 or 240 (240V loads use a 2-pole breaker = 2 transfer-switch circuits).
// Values marked src:'guide' come from the DuroMax Residential Generator Sizing Guide (rev. 7-29-26),
// "Wattage Reference" tab (manufacturer-backed planning values). Others are typical estimates.
// Actual appliance nameplate data always overrides these planning values.
window.APPLIANCES = [
  // Kitchen
  { id: 'fridge',      name: 'Refrigerator',                     room: 'Kitchen',     running: 300,  starting: 1200, volts: 120, tag: 'Essential', src: 'guide' },
  { id: 'microwave',   name: 'Microwave (1,300 W input)',        room: 'Kitchen',     running: 1300, starting: 1600, volts: 120, src: 'guide' },
  { id: 'coffee',      name: 'Coffee Maker',                     room: 'Kitchen',     running: 800,  starting: 800,  volts: 120, src: 'guide' },
  { id: 'toaster',     name: 'Toaster',                          room: 'Kitchen',     running: 1100, starting: 1100, volts: 120 },
  { id: 'dishwasher',  name: 'Dishwasher',                       room: 'Kitchen',     running: 1500, starting: 1500, volts: 120 },
  { id: 'range',       name: 'Electric Range (one 8" burner)',   room: 'Kitchen',     running: 2100, starting: 2100, volts: 240, src: 'guide' },
  // Living room
  { id: 'lights',      name: 'Essential LED Lights (10 bulbs)',  room: 'Whole Home',  running: 150,  starting: 150,  volts: 120, tag: 'Essential', src: 'guide' },
  { id: 'internet',    name: 'Internet & Device Charging',       room: 'Living Room', running: 100,  starting: 100,  volts: 120, tag: 'Essential', src: 'guide' },
  { id: 'tv',          name: 'Television',                       room: 'Living Room', running: 150,  starting: 150,  volts: 120, src: 'guide' },
  { id: 'security',    name: 'Security System & Cameras',        room: 'Living Room', running: 50,   starting: 50,   volts: 120 },
  { id: 'fans',        name: 'Ceiling Fans (2)',                 room: 'Living Room', running: 150,  starting: 150,  volts: 120 },
  { id: 'spaceheater', name: 'Space Heater',                     room: 'Living Room', running: 1500, starting: 1500, volts: 120, src: 'guide' },
  // Bedroom
  { id: 'cpap',        name: 'CPAP / BiPAP with Humidifier',     room: 'Bedroom',     running: 120,  starting: 120,  volts: 120, tag: 'Medical', src: 'guide' },
  { id: 'oxygen',      name: 'Oxygen Concentrator',              room: 'Bedroom',     running: 350,  starting: 350,  volts: 120, tag: 'Medical', src: 'guide' },
  { id: 'windowac',    name: 'Window AC (10,000 BTU)',           room: 'Bedroom',     running: 1200, starting: 2400, volts: 120, src: 'guide' },
  { id: 'hairdryer',   name: 'Hair Dryer',                       room: 'Bedroom',     running: 1500, starting: 1500, volts: 120 },
  // Utility / laundry
  { id: 'furnace',     name: 'Furnace / A/C Indoor Blower',      room: 'Utility',     running: 700,  starting: 1600, volts: 120, tag: 'Essential', src: 'guide' },
  { id: 'sump',        name: 'Sump Pump (1/3 HP)',               room: 'Utility',     running: 700,  starting: 1600, volts: 120, tag: 'Essential', src: 'guide' },
  { id: 'well',        name: 'Well Pump (1/2 HP)',               room: 'Utility',     running: 1000, starting: 2000, volts: 240, tag: 'Essential', src: 'guide' },
  { id: 'freezer',     name: 'Chest Freezer',                    room: 'Utility',     running: 300,  starting: 1000, volts: 120, tag: 'Essential', src: 'guide' },
  { id: 'waterheater', name: 'Electric Water Heater',            room: 'Utility',     running: 4500, starting: 4500, volts: 240, src: 'guide' },
  { id: 'washer',      name: 'Washing Machine',                  room: 'Utility',     running: 750,  starting: 2000, volts: 120, src: 'guide' },
  { id: 'gasdryer',    name: 'Gas Dryer',                        room: 'Utility',     running: 700,  starting: 1800, volts: 120, src: 'guide' },
  { id: 'elecdryer',   name: 'Electric Dryer',                   room: 'Utility',     running: 5600, starting: 6750, volts: 240, src: 'guide' },
  { id: 'dehumidifier',name: 'Dehumidifier',                     room: 'Utility',     running: 700,  starting: 700,  volts: 120 },
  { id: 'smoke',       name: 'Hardwired Smoke Detectors',        room: 'Utility',     running: 10,   starting: 10,   volts: 120, tag: 'Essential' },
  // Garage / outdoor
  { id: 'garagedoor',  name: 'Garage Door Opener',               room: 'Garage',      running: 720,  starting: 1420, volts: 120, src: 'guide' },
  { id: 'ev',          name: 'EV Charger - Level 1 (12A)',       room: 'Garage',      running: 1440, starting: 1440, volts: 120, src: 'guide' },
  { id: 'ev2',         name: 'EV Charger - Level 2 (32A)',       room: 'Garage',      running: 7680, starting: 7680, volts: 240, src: 'guide' },
  // Central A/C watts are set from the tonnage / nameplate picker (CENTRAL_AC below).
  { id: 'centralac',   name: 'Central A/C (outdoor unit)',       room: 'Outdoor',     running: 3800, starting: 10300, volts: 240, softStart: true, needs: 'furnace', src: 'guide' },
];

// Central A/C planning values by nominal tonnage: averages of the verified single-stage models in the
// sizing guide's "Central A-C Reference" tab (Goodman GSXN4, Trane 4TTR6, Lennox ML14KC1/10ACC),
// Running = V x (RLA + fan FLA); Starting = (V x LRA x 0.49) + V x fan FLA, each rounded up to 100 W.
// homeSqFt = the guide's "Home Sq. Ft Guidelines" range for that tonnage (about 1 ton per 400-500 sq ft).
// rla = typical compressor RLA, used to pick the matching AirGo G3 soft starter (8-16A vs 16-32A).
window.CENTRAL_AC = {
  default: 3,
  tons: {
    1.5: { running: 2000, starting: 5100,  rla: 7.8,  homeSqFt: null },
    2:   { running: 2400, starting: 6100,  rla: 9.6,  homeSqFt: '1,000 - 1,400 sq ft' },
    2.5: { running: 3100, starting: 7900,  rla: 12.4, homeSqFt: '1,000 - 1,900 sq ft' },
    3:   { running: 3800, starting: 10300, rla: 15.4, homeSqFt: '1,500 - 1,900 sq ft' },
    3.5: { running: 4300, starting: 13000, rla: 16.9, homeSqFt: '1,900 - 2,200 sq ft' },
    4:   { running: 5000, starting: 14300, rla: 19.5, homeSqFt: '2,200 - 2,600 sq ft' },
    5:   { running: 5700, starting: 16400, rla: 22.8, homeSqFt: 'over 2,600 sq ft' },
  },
  lraFactor: 0.49,
};

// AirGo soft starter: share of the additional start-up surge (starting - running) removed when installed.
// Sizing guide planning reduction = 50% (the product pages state "up to 70%").
window.SOFT_START_REDUCTION = 0.50;
window.HEADROOM = 0.20;   // continuous-running reserve used for the recommendation

window.PRESETS = {
  essentials: ['fridge', 'freezer', 'lights', 'internet', 'furnace', 'sump', 'well', 'smoke', 'cpap', 'oxygen'],
  comfort: ['fridge', 'freezer', 'lights', 'internet', 'furnace', 'sump', 'well', 'smoke', 'cpap', 'oxygen',
            'tv', 'security', 'fans', 'microwave', 'coffee', 'windowac', 'washer', 'gasdryer'],
  wholehome: ['fridge', 'freezer', 'lights', 'internet', 'furnace', 'sump', 'well', 'smoke', 'cpap', 'oxygen',
            'tv', 'security', 'fans', 'microwave', 'centralac'],
};
