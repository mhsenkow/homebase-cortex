# Database Seeding Guide

> **AI Note**: Instructions for populating the database with demo data. See [LOCAL_DB_SETUP.md](./LOCAL_DB_SETUP.md) for database setup.

**Guide for populating the database with realistic demo data for testing and development.**

This guide explains how to seed the database with realistic, cohesive demo data for each site.

## Overview

The seeding script creates:
- **3 Sites** (stores) with unique characteristics
- **Devices** (fixtures, motion sensors) with components, positioned in zones
- **Zones** that logically group devices (Grocery, Produce, Electronics, etc.)
- **BACnet Mappings** for zones (80% of zones have mappings)
- **Rules/Schedules** for automation (motion-activated, daylight harvesting, store hours)
- **Faults** (devices with offline/missing status)

Each site has a unique theme and characteristics:
- **Main St Market** (Springfield, IL): Grocery-focused, large grocery section
- **Riverside Garden Center** (Riverside, CA): Outdoor-focused, garden center emphasis
- **Watertown** (Watertown, MA): Headquarters satellite location, smaller footprint

### Adding Watertown to an existing database

If your database was already seeded and you want to add the Watertown site without re-seeding:

```bash
npm run db:add-watertown
```

## Running the Seed Script

### Option 1: Command Line

```bash
npm run db:seed
```

This will:
1. Clear all existing data (sites, devices, zones, BACnet mappings, rules)
2. Create 3 sites with complete demo data (including Watertown)
3. Generate ~150-200 devices per site
4. Create 8-10 zones per site
5. Create BACnet mappings for most zones
6. Create 4-6 rules per site

### Option 2: Direct Script Execution

You can also run the script directly:

```bash
npx tsx scripts/seedDatabase.ts
```

**Note:** The tRPC endpoint was removed because Next.js cannot resolve TypeScript files in the `scripts/` directory at runtime. Use the npm script or direct execution instead.

## What Gets Created

### Sites
- 5 stores matching the StoreContext default stores
- Each with unique ID, name, store number, and address

### Devices
- **Fixtures**: Main lighting fixtures with components (LCM, Driver Board, Power Supplies, LED Boards, Metal Brackets, Cable Harnesses, Lower LED Housings with Optic, Sensors)
- **Motion Sensors**: In high-traffic areas (Lobby, Grocery, Produce)
- **Device Distribution**:
  - 85% Online
  - 10% Offline (will show as faults)
  - 5% Missing (will show as faults)

### Zones
Each site gets these zones (if applicable):
- Grocery Aisles (30-45 fixtures)
- Produce Section (12 fixtures)
- Meat & Seafood (8 fixtures)
- Deli Counter (6 fixtures, if store has deli)
- Bakery (6 fixtures, if store has bakery)
- Apparel & Clothing (25 fixtures)
- Home & Garden (20 fixtures)
- Electronics & Sporting Goods (18 fixtures)
- Toys & Electronics (22 fixtures)
- Main Lobby (8 fixtures + 3 motion sensors)

### BACnet Mappings
- 80% of zones get BACnet mappings
- Status distribution:
  - 70% Connected
  - 20% Not Assigned
  - 10% Error

### Rules
Each site gets:
- **Motion-activated lighting** for high-traffic zones (Lobby, Grocery, Produce)
- **Daylight harvesting** for Produce and Grocery (if enabled)
- **Store Opening Schedule** (6:00 AM, Mon-Sat, full brightness)
- **Store Closing Schedule** (10:00 PM, Mon-Sat, dimmed to 30%)

## Data Cohesion

The seed script ensures data makes sense:
- Devices are positioned within their zone polygons
- Motion sensors are placed in high-traffic areas
- Rules reference actual zones that exist
- BACnet mappings are created for zones that have devices
- Faults (offline/missing devices) are distributed realistically

## Customization

To customize the seed data, edit `scripts/seedDatabase.ts`:
- Modify `STORE_CONFIGS` to change store characteristics
- Adjust `ZONE_TEMPLATES` to change zone layouts
- Update device counts in `generateZonesForStore()`
- Modify rule generation in `generateRules()`

## Troubleshooting

### "Seeding is not allowed in production"
- The seed endpoint only works in development mode
- Use the command line script instead: `npm run db:seed`

### "Failed to clear existing data"
- Make sure your database connection is working
- Check that Prisma client is generated: `npm run db:generate`

### "Device serial number already exists"
- The script clears existing data first, but if it fails partway through, you may need to manually clear the database
- Use Prisma Studio: `npm run db:studio`

## Next Steps

After seeding:
1. Start the dev server: `npm run dev`
2. Navigate to any page and select a store
3. You should see devices, zones, BACnet mappings, and rules populated
4. Check the Faults page to see devices with offline/missing status

