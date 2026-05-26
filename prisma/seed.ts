import { PrismaClient, ZoneType, SlotStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Warehouse Zones ─────────────────────────────────────────────────────────

  const zones = await Promise.all([
    prisma.warehouseZone.upsert({
      where: { id: 'zone-a-standard-001' },
      update: {},
      create: {
        id: 'zone-a-standard-001',
        name: 'Zone A - Standard Storage',
        zone_type: ZoneType.standard,
        temperature_min: null,
        temperature_max: null,
        block_identifier: 'A',
      },
    }),
    prisma.warehouseZone.upsert({
      where: { id: 'zone-b-coldchain-001' },
      update: {},
      create: {
        id: 'zone-b-coldchain-001',
        name: 'Zone B - Cold Chain',
        zone_type: ZoneType.cold_chain,
        temperature_min: -20.0,
        temperature_max: -4.0,
        block_identifier: 'B',
      },
    }),
    prisma.warehouseZone.upsert({
      where: { id: 'zone-c-hazardous-001' },
      update: {},
      create: {
        id: 'zone-c-hazardous-001',
        name: 'Zone C - Hazardous Materials',
        zone_type: ZoneType.hazardous,
        temperature_min: null,
        temperature_max: null,
        block_identifier: 'C',
      },
    }),
    prisma.warehouseZone.upsert({
      where: { id: 'zone-d-standard-002' },
      update: {},
      create: {
        id: 'zone-d-standard-002',
        name: 'Zone D - Standard Overflow',
        zone_type: ZoneType.standard,
        temperature_min: null,
        temperature_max: null,
        block_identifier: 'D',
      },
    }),
  ]);

  console.log(`✅ Created ${zones.length} warehouse zones`);

  // ─── Rack Slots ──────────────────────────────────────────────────────────────
  // Format: [Block]-[Row][Level][Position] e.g., "A-1A01"
  // Row: 1-5, Level: A-D (mapped from 1-4), Position: 01-10

  const levelLabels = ['A', 'B', 'C', 'D'];

  function generateRackSlots(
    zoneId: string,
    block: string,
    rows: number,
    levels: number,
    positions: number
  ) {
    const slots: {
      zone_id: string;
      coordinate: string;
      row: number;
      level: number;
      position: number;
      status: SlotStatus;
    }[] = [];

    for (let row = 1; row <= rows; row++) {
      for (let level = 1; level <= levels; level++) {
        for (let position = 1; position <= positions; position++) {
          const coordinate = `${block}-${row}${levelLabels[level - 1]}${String(position).padStart(2, '0')}`;
          slots.push({
            zone_id: zoneId,
            coordinate,
            row,
            level,
            position,
            status: SlotStatus.available,
          });
        }
      }
    }

    return slots;
  }

  // Generate 25 slots per zone (5 rows × 1 level × 5 positions for compact seed)
  // Zone A: 5 rows, 4 levels, 2 positions = 40 slots
  // Zone B: 5 rows, 4 levels, 2 positions = 40 slots
  // Zone C: 5 rows, 4 levels, 2 positions = 40 slots
  // Zone D: 5 rows, 4 levels, 2 positions = 40 slots
  const zoneSlotConfigs = [
    { zoneId: 'zone-a-standard-001', block: 'A', rows: 5, levels: 4, positions: 2 },
    { zoneId: 'zone-b-coldchain-001', block: 'B', rows: 5, levels: 4, positions: 2 },
    { zoneId: 'zone-c-hazardous-001', block: 'C', rows: 5, levels: 4, positions: 2 },
    { zoneId: 'zone-d-standard-002', block: 'D', rows: 5, levels: 4, positions: 2 },
  ];

  let totalSlots = 0;

  for (const config of zoneSlotConfigs) {
    const slots = generateRackSlots(
      config.zoneId,
      config.block,
      config.rows,
      config.levels,
      config.positions
    );

    for (const slot of slots) {
      await prisma.rackSlot.upsert({
        where: { coordinate: slot.coordinate },
        update: {},
        create: slot,
      });
    }

    totalSlots += slots.length;
  }

  console.log(`✅ Created ${totalSlots} rack slots (${totalSlots / 4} per zone)`);

  // ─── Hazard Segregation Matrix ───────────────────────────────────────────────
  // Common chemical hazard classes and their compatibility
  // Symmetric: if A-B is defined, B-A has the same compatibility

  const hazardClasses = [
    'Flammable',
    'Oxidizer',
    'Corrosive',
    'Toxic',
    'Explosive',
    'Reactive',
  ];

  // Define compatibility rules (symmetric pairs)
  // Format: [classA, classB, isCompatible, minSeparationSlots]
  const segregationRules: [string, string, boolean, number][] = [
    // Flammable combinations
    ['Flammable', 'Flammable', true, 0],
    ['Flammable', 'Oxidizer', false, 3],
    ['Flammable', 'Corrosive', false, 2],
    ['Flammable', 'Toxic', false, 2],
    ['Flammable', 'Explosive', false, 4],
    ['Flammable', 'Reactive', false, 3],

    // Oxidizer combinations
    ['Oxidizer', 'Oxidizer', true, 0],
    ['Oxidizer', 'Corrosive', false, 2],
    ['Oxidizer', 'Toxic', false, 2],
    ['Oxidizer', 'Explosive', false, 4],
    ['Oxidizer', 'Reactive', false, 3],

    // Corrosive combinations
    ['Corrosive', 'Corrosive', true, 0],
    ['Corrosive', 'Toxic', true, 1],
    ['Corrosive', 'Explosive', false, 3],
    ['Corrosive', 'Reactive', false, 2],

    // Toxic combinations
    ['Toxic', 'Toxic', true, 0],
    ['Toxic', 'Explosive', false, 3],
    ['Toxic', 'Reactive', false, 2],

    // Explosive combinations
    ['Explosive', 'Explosive', false, 4],
    ['Explosive', 'Reactive', false, 4],

    // Reactive combinations
    ['Reactive', 'Reactive', false, 2],
  ];

  let matrixCount = 0;

  for (const [classA, classB, isCompatible, minSeparation] of segregationRules) {
    // Insert A→B
    await prisma.hazardSegregationMatrix.upsert({
      where: {
        id: `hsm-${classA.toLowerCase()}-${classB.toLowerCase()}`,
      },
      update: {},
      create: {
        id: `hsm-${classA.toLowerCase()}-${classB.toLowerCase()}`,
        hazard_class_a: classA,
        hazard_class_b: classB,
        is_compatible: isCompatible,
        min_separation_slots: minSeparation,
      },
    });
    matrixCount++;

    // Insert B→A (symmetric) if A !== B
    if (classA !== classB) {
      await prisma.hazardSegregationMatrix.upsert({
        where: {
          id: `hsm-${classB.toLowerCase()}-${classA.toLowerCase()}`,
        },
        update: {},
        create: {
          id: `hsm-${classB.toLowerCase()}-${classA.toLowerCase()}`,
          hazard_class_a: classB,
          hazard_class_b: classA,
          is_compatible: isCompatible,
          min_separation_slots: minSeparation,
        },
      });
      matrixCount++;
    }
  }

  console.log(`✅ Created ${matrixCount} hazard segregation matrix entries`);
  console.log('🌱 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
