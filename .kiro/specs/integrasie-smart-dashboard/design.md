# Design Document: IntegraSiE Smart Dashboard

## Overview

This document describes the technical design for the IntegraSiE Smart Dashboard — an Integrated Enterprise & Smart Warehousing Platform. The system is a web application with a backend API, relational database, real-time temperature monitoring service, and WhatsApp gateway integration.

## Architecture

### System Architecture

The platform follows a layered architecture:

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (SPA)                         │
│         React + TypeScript + TailwindCSS                 │
├─────────────────────────────────────────────────────────┤
│                   API Gateway / Router                   │
├─────────────────────────────────────────────────────────┤
│                Backend API (Node.js + Express)           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │Auth/RBAC │ │Intake/Lot│ │QC Module │ │Smart Slot │  │
│  │ Module   │ │ Module   │ │          │ │  Engine   │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │Audit     │ │Notif.    │ │Temp.     │ │PPIC       │  │
│  │Trail     │ │Service   │ │Monitor   │ │Module     │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
├─────────────────────────────────────────────────────────┤
│              Database (PostgreSQL)                       │
├─────────────────────────────────────────────────────────┤
│         External Services                               │
│  ┌──────────────┐  ┌──────────────────┐                 │
│  │ WhatsApp API │  │ Temperature IoT  │                 │
│  │ (Twilio)     │  │ Sensors          │                 │
│  └──────────────┘  └──────────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL 15+
- **ORM**: Prisma
- **Authentication**: JWT with refresh tokens
- **Real-time**: WebSocket (Socket.IO) for temperature updates and notifications
- **Testing**: Vitest + fast-check (property-based testing)
- **WhatsApp Integration**: Twilio WhatsApp API

## Components and Interfaces

### Auth/RBAC Module

**Responsibility**: User authentication, session management, and role-based access enforcement.

**Interfaces**:
- `AuthService.login(email, password): { accessToken, refreshToken }` — Authenticates user credentials, returns JWT tokens
- `AuthService.refresh(refreshToken): { accessToken }` — Issues new access token from valid refresh token
- `AuthService.logout(refreshToken): void` — Invalidates refresh token
- `RBACMiddleware.authorize(requiredRoles: Role[]): Middleware` — Express middleware that checks user role against required roles
- `AuthService.lockAccount(userId): void` — Locks account after consecutive failed attempts
- `AuthService.checkSessionTimeout(lastActivity): boolean` — Returns true if session has exceeded 30-minute inactivity limit

### Intake/Lot Module

**Responsibility**: Supplier intake form processing and automatic lot number generation.

**Interfaces**:
- `IntakeService.create(data: SupplierIntakeInput): { intake, lot }` — Validates intake data, creates intake record, generates lot number
- `LotGenerator.generate(materialGroupCode, date): string` — Generates unique lot number in format `[CODE]-[YYYYMMDD]-[NNNN]`
- `IntakeService.checkDuplicate(truckRef, date): boolean` — Checks for duplicate truck reference on same day
- `IntakeService.getById(id): SupplierIntake` — Retrieves locked intake record

### QC Module

**Responsibility**: Quality control queue management and decision recording.

**Interfaces**:
- `QCService.getPendingQueue(): Lot[]` — Returns lots with status "Pending QC" ordered by delivery date ascending
- `QCService.submitResult(lotId, params, decision, reason?): QCResult` — Records QC decision, transitions lot status
- `QCService.getLotDetails(lotId): LotWithIntake` — Returns lot details including supplier intake data

### Smart Slotting Engine

**Responsibility**: Recommends optimal rack coordinates based on material properties, hazard segregation, and cold-chain constraints.

**Interfaces**:
- `SlottingEngine.recommend(lotId): RackSlot[]` — Returns 1–5 valid slot recommendations
- `SlottingEngine.assignSlot(lotId, slotId): void` — Confirms placement at recommended slot
- `SlottingEngine.overrideSlot(lotId, slotId, justification): void` — Records override placement with justification
- `HazardMatrix.isCompatible(classA, classB): boolean` — Checks hazard compatibility between two classes
- `SlottingEngine.getAdjacentSlots(slot): RackSlot[]` — Returns directly adjacent slots (left, right, above, below)

### Temperature Monitor

**Responsibility**: Polls temperature sensors, detects breaches, and triggers alerts.

**Interfaces**:
- `TemperatureService.pollSensors(): TemperatureReading[]` — Reads current temperature from all cold-chain zones (≤60s interval)
- `BreachDetector.check(reading): boolean` — Returns true if temperature > -4.0°C
- `BreachDetector.isResolved(zoneId): boolean` — Returns true after 3 consecutive readings ≤ -4.0°C
- `TemperatureService.detectSensorFailure(zoneId): boolean` — Returns true if no data for >120 seconds

### Audit Trail Module

**Responsibility**: Append-only recording of all status changes with full context.

**Interfaces**:
- `AuditService.record(userId, action, entityType, entityId, oldValue, newValue): AuditTrail` — Creates immutable audit record
- `AuditService.query(filters: AuditFilters): PaginatedResult<AuditTrail>` — Queries audit trail with date range, user, action type, lot number filters
- `AuditService.ensureRecorded(operation): Result` — Wraps operation in transaction; blocks if audit record creation fails

### Notification Service

**Responsibility**: WhatsApp gateway integration for critical alerts with retry logic.

**Interfaces**:
- `NotificationService.sendAlert(category, message, recipients): void` — Sends WhatsApp alert with retry (3 attempts, 10s intervals)
- `NotificationService.formatAlert(event): string` — Formats alert message (≤1000 chars) with severity, description, area, reading, threshold, action
- `NotificationService.getRecipients(category): PhoneNumber[]` — Returns configured recipients for alert category
- `NotificationService.configureRecipients(category, phoneNumbers): void` — Updates recipient configuration (E.164 validation)

### PPIC Module

**Responsibility**: Stock visibility dashboard, production scheduling, and work order management.

**Interfaces**:
- `PPICService.getAvailableStock(): StockDashboard` — Returns lots with status "Ready to Store" with quantities and locations
- `PPICService.createSchedule(data: ScheduleInput): ProductionSchedule` — Validates stock availability, creates schedule
- `PPICService.issueWorkOrder(scheduleId, assignedTo): WorkOrder` — Creates work order, reserves lot quantities, notifies operators
- `PPICService.validateStockAvailability(lots: LotQuantity[]): ValidationResult` — Checks unreserved quantities against requested amounts

## Data Models

### Entity Relationship Diagram

```
User (1) ──── (1) Role
User (1) ──── (*) AuditTrail
Lot (1) ──── (1) SupplierIntake
Lot (1) ──── (*) QCResult
Lot (1) ──── (*) Drum
Drum (1) ──── (1) RackSlot
RackSlot (*) ──── (1) WarehouseZone
WarehouseZone (1) ──── (*) TemperatureReading
ProductionSchedule (*) ──── (*) Lot
WorkOrder (*) ──── (1) ProductionSchedule
```

### Core Tables

#### users
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| full_name | VARCHAR(255) | NOT NULL |
| role | ENUM('warehouse_operator', 'qc_staff', 'ppic_team', 'factory_manager') | NOT NULL |
| phone_number | VARCHAR(20) | NULL |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMP | NOT NULL |
| updated_at | TIMESTAMP | NOT NULL |

#### supplier_intakes
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| supplier_name | VARCHAR(255) | NOT NULL |
| material_group | VARCHAR(100) | NOT NULL |
| material_group_code | VARCHAR(10) | NOT NULL |
| quantity | DECIMAL(10,2) | NOT NULL |
| unit | VARCHAR(20) | NOT NULL |
| delivery_date | DATE | NOT NULL |
| truck_reference | VARCHAR(100) | NOT NULL |
| is_locked | BOOLEAN | DEFAULT true |
| created_by | UUID | FK → users.id |
| created_at | TIMESTAMP | NOT NULL |

#### lots
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| lot_number | VARCHAR(50) | UNIQUE, NOT NULL |
| supplier_intake_id | UUID | FK → supplier_intakes.id |
| status | ENUM('pending_qc', 'passed', 'rejected', 'ready_to_store') | NOT NULL |
| material_group_code | VARCHAR(10) | NOT NULL |
| is_temperature_sensitive | BOOLEAN | DEFAULT false |
| is_hazardous | BOOLEAN | DEFAULT false |
| hazard_class | VARCHAR(50) | NULL |
| created_at | TIMESTAMP | NOT NULL |
| updated_at | TIMESTAMP | NOT NULL |

#### qc_results
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| lot_id | UUID | FK → lots.id |
| parameters | JSONB | NOT NULL |
| decision | ENUM('passed', 'rejected') | NOT NULL |
| rejection_reason | TEXT | NULL |
| tested_by | UUID | FK → users.id |
| tested_at | TIMESTAMP | NOT NULL |

#### warehouse_zones
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | VARCHAR(100) | NOT NULL |
| zone_type | ENUM('standard', 'cold_chain', 'hazardous') | NOT NULL |
| temperature_min | DECIMAL(5,2) | NULL |
| temperature_max | DECIMAL(5,2) | NULL |
| block_identifier | VARCHAR(10) | NOT NULL |

#### rack_slots
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| zone_id | UUID | FK → warehouse_zones.id |
| coordinate | VARCHAR(20) | UNIQUE, NOT NULL |
| row | INTEGER | NOT NULL |
| level | INTEGER | NOT NULL |
| position | INTEGER | NOT NULL |
| status | ENUM('available', 'occupied', 'reserved', 'maintenance') | NOT NULL |
| current_lot_id | UUID | FK → lots.id, NULL |

#### drums
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| lot_id | UUID | FK → lots.id |
| rack_slot_id | UUID | FK → rack_slots.id, NULL |
| drum_number | INTEGER | NOT NULL |
| weight_kg | DECIMAL(10,2) | NOT NULL |
| placed_at | TIMESTAMP | NULL |
| placed_by | UUID | FK → users.id, NULL |

#### temperature_readings
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| zone_id | UUID | FK → warehouse_zones.id |
| temperature_celsius | DECIMAL(5,2) | NOT NULL |
| is_breach | BOOLEAN | DEFAULT false |
| recorded_at | TIMESTAMP | NOT NULL |

#### audit_trails
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → users.id |
| action | VARCHAR(100) | NOT NULL |
| entity_type | VARCHAR(50) | NOT NULL |
| entity_id | UUID | NOT NULL |
| old_value | JSONB | NULL |
| new_value | JSONB | NOT NULL |
| timestamp | TIMESTAMP | NOT NULL |

#### notification_configs
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| alert_category | VARCHAR(50) | NOT NULL |
| user_id | UUID | FK → users.id |
| phone_number | VARCHAR(20) | NOT NULL |
| is_active | BOOLEAN | DEFAULT true |

#### production_schedules
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| title | VARCHAR(255) | NOT NULL |
| scheduled_date | DATE | NOT NULL |
| status | ENUM('draft', 'confirmed', 'in_progress', 'completed') | NOT NULL |
| created_by | UUID | FK → users.id |
| created_at | TIMESTAMP | NOT NULL |

#### production_schedule_lots
| Column | Type | Constraints |
|--------|------|-------------|
| schedule_id | UUID | FK → production_schedules.id |
| lot_id | UUID | FK → lots.id |
| quantity_required | DECIMAL(10,2) | NOT NULL |

#### work_orders
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| schedule_id | UUID | FK → production_schedules.id |
| assigned_to | UUID | FK → users.id |
| instructions | TEXT | NOT NULL |
| status | ENUM('pending', 'in_progress', 'completed') | NOT NULL |
| created_at | TIMESTAMP | NOT NULL |

#### hazard_segregation_matrix
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| hazard_class_a | VARCHAR(50) | NOT NULL |
| hazard_class_b | VARCHAR(50) | NOT NULL |
| is_compatible | BOOLEAN | NOT NULL |
| min_separation_slots | INTEGER | DEFAULT 0 |

## API Endpoints

### Authentication
- `POST /api/auth/login` — Authenticate user, return JWT
- `POST /api/auth/refresh` — Refresh access token
- `POST /api/auth/logout` — Invalidate refresh token

### Supplier Intake
- `POST /api/intakes` — Create supplier intake + auto-generate lot (Warehouse_Operator)
- `GET /api/intakes` — List intakes (Warehouse_Operator, Factory_Manager)
- `GET /api/intakes/:id` — Get intake details (Warehouse_Operator, Factory_Manager)

### Lots
- `GET /api/lots` — List lots with filtering (all roles, filtered by permission)
- `GET /api/lots/:id` — Get lot details
- `GET /api/lots/pending-qc` — Get pending QC queue (QC_Staff)
- `GET /api/lots/ready-to-store` — Get lots ready for storage (Warehouse_Operator)

### Quality Control
- `POST /api/qc/:lotId/result` — Submit QC result (QC_Staff)
- `GET /api/qc/:lotId/history` — Get QC history for a lot

### Smart Slotting
- `GET /api/slotting/:lotId/recommendations` — Get slot recommendations (Warehouse_Operator)
- `POST /api/slotting/:lotId/assign` — Confirm slot assignment (Warehouse_Operator)
- `POST /api/slotting/:lotId/override` — Override with justification (Warehouse_Operator)

### Temperature Monitoring
- `GET /api/temperature/current` — Get current readings for all zones
- `GET /api/temperature/history/:zoneId` — Get temperature history
- `GET /api/temperature/breaches` — Get active breaches

### Audit Trail
- `GET /api/audit` — Query audit trail with filters (Factory_Manager)

### PPIC
- `GET /api/ppic/stock` — Get available stock dashboard (PPIC_Team)
- `POST /api/ppic/schedules` — Create production schedule (PPIC_Team)
- `GET /api/ppic/schedules` — List schedules (PPIC_Team)
- `POST /api/ppic/work-orders` — Create work order (PPIC_Team)

### Notifications
- `GET /api/notifications/config` — Get notification config (Factory_Manager)
- `PUT /api/notifications/config` — Update notification config (Factory_Manager)

## Key Algorithms

### Lot Number Generation

```typescript
function generateLotNumber(materialGroupCode: string, date: Date): string {
  const dateStr = format(date, 'yyyyMMdd');
  const sequence = await getNextSequence(materialGroupCode, dateStr);
  const paddedSeq = String(sequence).padStart(4, '0');
  return `${materialGroupCode}-${dateStr}-${paddedSeq}`;
}
```

### Smart Slotting Algorithm

```typescript
function recommendSlots(lot: Lot, drums: Drum[]): RackSlot[] {
  // 1. Determine zone constraints
  const eligibleZones = getEligibleZones(lot);
  
  // 2. Get available slots in eligible zones
  const availableSlots = getAvailableSlots(eligibleZones);
  
  // 3. If hazardous, filter by segregation compatibility
  if (lot.is_hazardous) {
    return filterByHazardCompatibility(availableSlots, lot.hazard_class);
  }
  
  // 4. Rank by proximity (group drums from same lot together)
  return rankByProximity(availableSlots, drums.length);
}

function getEligibleZones(lot: Lot): WarehouseZone[] {
  if (lot.is_temperature_sensitive) {
    return zones.filter(z => z.zone_type === 'cold_chain');
  }
  if (lot.is_hazardous) {
    return zones.filter(z => z.zone_type === 'hazardous' || z.zone_type === 'standard');
  }
  return zones.filter(z => z.zone_type === 'standard');
}

function filterByHazardCompatibility(
  slots: RackSlot[], 
  hazardClass: string
): RackSlot[] {
  return slots.filter(slot => {
    const adjacentSlots = getAdjacentSlots(slot);
    const occupiedAdjacent = adjacentSlots.filter(s => s.status === 'occupied');
    
    return occupiedAdjacent.every(adj => {
      const adjLot = getLotForSlot(adj);
      if (!adjLot.is_hazardous) return true;
      return isCompatible(hazardClass, adjLot.hazard_class);
    });
  });
}
```

### Temperature Breach Detection

```typescript
const SAFE_TEMP_LIMIT = -4.0; // °C

function checkTemperatureBreach(reading: TemperatureReading): boolean {
  return reading.temperature_celsius > SAFE_TEMP_LIMIT;
}

async function handleBreach(reading: TemperatureReading, zone: WarehouseZone): Promise<void> {
  // 1. Mark reading as breach
  await markAsBreach(reading);
  
  // 2. Format alert message
  const message = formatBreachAlert(zone, reading);
  
  // 3. Get recipients for temperature breach category
  const recipients = await getAlertRecipients('temperature_breach');
  
  // 4. Send WhatsApp alerts
  await sendWhatsAppAlerts(recipients, message);
  
  // 5. Emit WebSocket event for dashboard alarm
  io.emit('temperature_breach', { zone, reading });
}
```

## Correctness Properties

### Property 1: Role-Permission Invariant
*For any* user in the system with role R, that user can only access resources in the permission set defined for R. No request from a user with role R succeeds for a resource outside that permission set.

**Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7**

### Property 2: Lot Number Uniqueness and Format
*For any* generated lot number, each lot number is unique across the system and matches the regex pattern `^[A-Z]{2,5}-\d{8}-\d{4}$`.

**Validates: Requirements 2.2**

### Property 3: Lot Status State Machine
*For any* lot, the status transitions follow the valid state machine: `pending_qc → passed | rejected`, `passed → ready_to_store`. No other transitions are permitted.

**Validates: Requirements 2.3, 3.4, 3.5**

### Property 4: Supplier Intake Immutability
*For any* supplier intake that has an associated lot, no field of the intake record can be modified after lot generation.

**Validates: Requirements 2.4**

### Property 5: Smart Slotting Temperature Constraint
*For any* slot recommendation where the lot is temperature-sensitive, every recommended slot belongs to a zone with zone_type = 'cold_chain'.

**Validates: Requirements 4.2**

### Property 6: Smart Slotting Hazard Segregation
*For any* slot recommendation where the lot is hazardous with hazard_class H, no recommended slot has an adjacent occupied slot containing a lot with an incompatible hazard_class according to the segregation matrix.

**Validates: Requirements 4.3**

### Property 7: Temperature Breach Classification
*For any* temperature reading, a reading is classified as a breach if and only if temperature_celsius > -4.0.

**Validates: Requirements 5.3**

### Property 8: Audit Trail Completeness
*For any* status change on a lot and any location change on a drum, an audit trail record exists with matching user_id, timestamp, old_value, and new_value.

**Validates: Requirements 6.1, 6.2**

### Property 9: Audit Trail Append-Only
*For any* audit trail record, once created, the record cannot be modified or deleted. The count of audit records is monotonically non-decreasing.

**Validates: Requirements 6.3**

### Property 10: PPIC Stock Validation
*For any* production schedule, every referenced lot has status 'ready_to_store' at the time of schedule creation. Schedules referencing lots with any other status are rejected.

**Validates: Requirements 8.4, 8.6**

### Property 11: Notification Retry Logic
*For any* WhatsApp delivery failure, the system retries exactly up to 3 times with 10-second intervals. After 3 failures, the failure is logged in the audit trail.

**Validates: Requirements 7.4**

### Property 12: QC Decision Completeness
*For any* QC submission, a decision of "Passed" or "Rejected" is required. Submissions without quality parameters are rejected. Rejected decisions require a non-empty rejection reason.

**Validates: Requirements 3.3, 3.5, 3.7**

## Error Handling

### Error Categories and Strategies

| Category | Strategy | User Feedback |
|----------|----------|---------------|
| Validation Errors | Return 400 with field-level error details | Display inline error messages adjacent to invalid fields |
| Authentication Errors | Return 401, clear tokens | Redirect to login page with generic error message |
| Authorization Errors | Return 403 with role information | Display "Access Denied" message indicating required role |
| Not Found | Return 404 | Display "Resource not found" message |
| Conflict (duplicates) | Return 409 with conflict details | Display warning with option to confirm or cancel |
| Audit Recording Failure | Block operation, revert changes | Display "Action cannot be completed due to audit recording failure" |
| External Service Failure | Retry with backoff, log failure | Display persistent alert banner on dashboard |
| Database Errors | Return 500, log full error | Display generic "Something went wrong" message |

### Critical Error Handling Patterns

**Audit Trail Failure (Requirement 6.6)**:
- All status-changing operations are wrapped in a database transaction that includes audit record creation
- If the audit record INSERT fails, the entire transaction is rolled back
- The user receives an error message and the triggering operation is blocked

**WhatsApp Gateway Failure (Requirement 7.4)**:
- On delivery failure: retry up to 3 times with 10-second intervals
- Each retry attempt is logged in the audit trail
- After 3 failures: log final failure, display persistent unacknowledged alert banner on Factory_Manager dashboard
- Alert banner persists until manually acknowledged

**Temperature Sensor Communication Failure (Requirement 5.7)**:
- If no data received for >120 seconds (2 polling intervals): classify as sensor failure
- Send WhatsApp alert to Factory_Manager and Warehouse Maintenance Team
- Display sensor failure indicator on dashboard until communication resumes

**Account Lockout (Requirement 1.8)**:
- After 5 consecutive failed login attempts: lock account for 15 minutes
- Log lockout event in audit trail and notify Factory_Manager
- Display generic authentication failure message (no field-specific hints)

### Global Error Handler

All unhandled errors are caught by Express global error handler middleware:
- Logs full error stack trace to application logs
- Returns sanitized error response (no internal details exposed)
- Assigns correlation ID for tracing across services

## Testing Strategy

### Testing Approach

The project uses a dual testing approach combining unit tests for specific examples and edge cases with property-based tests for universal correctness guarantees.

### Testing Tools

- **Unit & Integration Tests**: Vitest
- **Property-Based Testing**: fast-check (minimum 100 iterations per property)
- **API Integration Tests**: Supertest
- **Database**: In-memory PostgreSQL (via pg-mem) for unit/property tests; test database for integration tests

### Property-Based Tests

Each correctness property from the design document is implemented as a property-based test using fast-check. Tests are tagged with the format:

**Tag format**: `Feature: integrasie-smart-dashboard, Property {number}: {property_text}`

| Property | Test File | What Varies |
|----------|-----------|-------------|
| 1: Role-Permission Invariant | `tests/property/rbac.property.test.ts` | Random users, roles, and resource access attempts |
| 2: Lot Number Uniqueness and Format | `tests/property/lotNumber.property.test.ts` | Random material group codes, dates, sequence numbers |
| 3: Lot Status State Machine | `tests/property/statusTransition.property.test.ts` | Random sequences of status transition attempts |
| 4: Supplier Intake Immutability | `tests/property/intake.property.test.ts` | Random intake records with random modification attempts |
| 5: Smart Slotting Temperature Constraint | `tests/property/slotting.property.test.ts` | Random temperature-sensitive lots and warehouse configurations |
| 6: Smart Slotting Hazard Segregation | `tests/property/slotting.property.test.ts` | Random hazardous lots with random adjacent slot occupancy |
| 7: Temperature Breach Classification | `tests/property/temperature.property.test.ts` | Random temperature readings across the full range |
| 8: Audit Trail Completeness | `tests/property/auditTrail.property.test.ts` | Random status changes and location changes |
| 9: Audit Trail Append-Only | `tests/property/auditTrail.property.test.ts` | Random sequences of audit operations |
| 10: PPIC Stock Validation | `tests/property/ppic.property.test.ts` | Random production schedules with random lot statuses |
| 11: Notification Retry Logic | `tests/property/notification.property.test.ts` | Random failure sequences from WhatsApp gateway mock |
| 12: QC Decision Completeness | `tests/property/qc.property.test.ts` | Random QC submissions with varying parameter completeness |

### Unit Tests

Unit tests cover specific examples, edge cases, and integration points:

- **Auth Module**: Login success/failure, token refresh, session timeout, account lockout after 5 attempts
- **Lot Generator**: Format validation, daily sequence reset, concurrent generation
- **QC Module**: Decision recording, rejection reason validation (10–500 chars), queue ordering
- **Smart Slotting**: No available slot scenario, override justification recording
- **Temperature**: Breach resolution after 3 consecutive safe readings, sensor failure detection
- **Notification**: Message formatting (≤1000 chars), E.164 phone validation, recipient configuration
- **PPIC**: Stock reservation conflicts, insufficient quantity rejection

### Integration Tests

Integration tests verify end-to-end flows with a test database:

- Full supplier intake → lot generation → QC → slotting flow
- Authentication and RBAC enforcement across all endpoints
- WhatsApp gateway integration (mocked external API)
- Temperature polling and breach alert delivery
- Audit trail recording for all state-changing operations

### Test Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { lines: 80, branches: 75 }
    }
  }
});
```

## File Structure

```
src/
├── server/
│   ├── index.ts                    # Express app entry point
│   ├── config/
│   │   ├── database.ts             # Prisma client setup
│   │   └── env.ts                  # Environment configuration
│   ├── middleware/
│   │   ├── auth.ts                 # JWT authentication middleware
│   │   ├── rbac.ts                 # Role-based access control middleware
│   │   └── errorHandler.ts         # Global error handler
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.routes.ts
│   │   ├── intake/
│   │   │   ├── intake.controller.ts
│   │   │   ├── intake.service.ts
│   │   │   ├── lotGenerator.ts     # Lot number generation logic
│   │   │   └── intake.routes.ts
│   │   ├── qc/
│   │   │   ├── qc.controller.ts
│   │   │   ├── qc.service.ts
│   │   │   └── qc.routes.ts
│   │   ├── slotting/
│   │   │   ├── slotting.controller.ts
│   │   │   ├── slotting.service.ts
│   │   │   ├── slottingEngine.ts   # Smart slotting algorithm
│   │   │   ├── hazardMatrix.ts     # Hazard compatibility logic
│   │   │   └── slotting.routes.ts
│   │   ├── temperature/
│   │   │   ├── temperature.controller.ts
│   │   │   ├── temperature.service.ts
│   │   │   ├── breachDetector.ts   # Breach detection logic
│   │   │   └── temperature.routes.ts
│   │   ├── audit/
│   │   │   ├── audit.controller.ts
│   │   │   ├── audit.service.ts
│   │   │   └── audit.routes.ts
│   │   ├── notification/
│   │   │   ├── notification.controller.ts
│   │   │   ├── notification.service.ts
│   │   │   ├── whatsappGateway.ts  # Twilio WhatsApp integration
│   │   │   └── notification.routes.ts
│   │   └── ppic/
│   │       ├── ppic.controller.ts
│   │       ├── ppic.service.ts
│   │       └── ppic.routes.ts
│   └── shared/
│       ├── types.ts                # Shared TypeScript types
│       ├── constants.ts            # Application constants
│       └── validators.ts           # Shared validation schemas (Zod)
├── client/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   ├── common/
│   │   │   └── dashboard/
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── operator/
│   │   │   ├── qc/
│   │   │   ├── ppic/
│   │   │   └── manager/
│   │   ├── hooks/
│   │   ├── services/              # API client functions
│   │   ├── store/                 # State management
│   │   └── types/
│   └── vite.config.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── tests/
│   ├── unit/
│   │   ├── lotGenerator.test.ts
│   │   ├── slottingEngine.test.ts
│   │   ├── breachDetector.test.ts
│   │   └── hazardMatrix.test.ts
│   ├── property/
│   │   ├── lotNumber.property.test.ts
│   │   ├── slotting.property.test.ts
│   │   ├── statusTransition.property.test.ts
│   │   └── auditTrail.property.test.ts
│   └── integration/
│       ├── auth.integration.test.ts
│       ├── intake.integration.test.ts
│       ├── qc.integration.test.ts
│       └── notification.integration.test.ts
└── package.json
```

## Security Considerations

- All passwords hashed with bcrypt (cost factor 12)
- JWT access tokens expire after 15 minutes; refresh tokens after 7 days
- All API endpoints require authentication except login
- RBAC middleware checks role permissions before controller execution
- Input validation using Zod schemas on all endpoints
- SQL injection prevention via Prisma parameterized queries
- Rate limiting on authentication endpoints (5 attempts per minute)
- Audit trail table has no DELETE or UPDATE permissions at database level (enforced via PostgreSQL row-level security)

## Deployment Considerations

- Application containerized with Docker
- PostgreSQL database with automated backups
- WebSocket connections for real-time temperature updates
- Temperature sensor polling runs as a background worker process
- WhatsApp gateway calls are queued to handle rate limits
