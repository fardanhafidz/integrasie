# Implementation Plan: IntegraSiE Smart Dashboard

## Overview

This implementation plan covers the full-stack development of the IntegraSiE Smart Dashboard — an Integrated Enterprise & Smart Warehousing Platform. The system includes a Node.js/Express backend with PostgreSQL, a React frontend, real-time temperature monitoring via WebSocket, smart slotting engine, enterprise audit trail, and WhatsApp gateway integration for critical alerts. Implementation uses TypeScript throughout with Prisma ORM, Vitest for testing, and fast-check for property-based tests.

## Tasks

- [ ] 1. Project Setup and Database Schema
  - [ ] 1.1 Initialize project with Node.js, TypeScript, Express, and Vite (React frontend)
    - Set up monorepo structure with server and client directories
    - Configure TypeScript, ESLint, and Prettier
    - _Requirements: 1.1, 2.1_
  - [ ] 1.2 Configure Prisma ORM and PostgreSQL connection
    - Install Prisma, initialize schema, configure database URL
    - _Requirements: 2.1_
  - [ ] 1.3 Create Prisma schema with all tables: users, supplier_intakes, lots, qc_results, warehouse_zones, rack_slots, drums, temperature_readings, audit_trails, notification_configs, production_schedules, production_schedule_lots, work_orders, hazard_segregation_matrix
    - Define all models, relations, enums, and constraints as specified in design
    - _Requirements: 1.2, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1_
  - [ ] 1.4 Create initial database migration
    - Run prisma migrate dev to generate and apply migration
    - _Requirements: 2.1_
  - [ ] 1.5 Seed database with warehouse zones, rack slots, and hazard segregation matrix data
    - Create seed script with zone configurations, rack coordinates, and hazard compatibility data
    - _Requirements: 4.2, 4.3, 5.1_
  - [ ] 1.6 Configure environment variables (database URL, JWT secret, Twilio credentials)
    - Create .env.example with all required variables
    - _Requirements: 1.1, 7.1_

- [ ] 2. Authentication and RBAC Module
  - [ ] 2.1 Implement user model with bcrypt password hashing
    - Create password hashing utility with bcrypt
    - _Requirements: 1.1, 1.8_
  - [ ] 2.2 Create auth service with login, token generation (JWT), and refresh token logic
    - Implement login with credential validation, JWT access/refresh token pair generation, account lockout after 5 failed attempts, 30-minute session timeout
    - _Requirements: 1.1, 1.8, 1.9_
  - [ ] 2.3 Create auth middleware for JWT verification on protected routes
    - Verify access token, handle expiration, check session timeout
    - _Requirements: 1.1, 1.9_
  - [ ] 2.4 Create RBAC middleware that checks user role against route permission map
    - Implement role-based route guard returning 403 for unauthorized access
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7_
  - [ ] 2.5 Define role-permission mapping: Warehouse_Operator, QC_Staff, PPIC_Team, Factory_Manager
    - Create constants mapping each role to allowed routes and resources
    - _Requirements: 1.3, 1.4, 1.5, 1.6_
  - [ ] 2.6 Create auth routes: POST /api/auth/login, POST /api/auth/refresh, POST /api/auth/logout
    - Wire controller to auth service, handle error responses
    - _Requirements: 1.1, 1.8_
  - [ ]* 2.7 Write property test for role-permission invariant
    - **Property 1: Role-Permission Invariant**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7**
  - [ ]* 2.8 Write integration tests for authentication and role-based access denial
    - Test login success/failure, token refresh, lockout, RBAC enforcement
    - _Requirements: 1.1, 1.7, 1.8_

- [ ] 3. Supplier Intake and Auto-Lot Generation
  - [ ] 3.1 Create Zod validation schema for supplier intake form (supplier_name, material_group, material_group_code, quantity, unit, delivery_date, truck_reference)
    - Validate all fields per requirement constraints (max lengths, numeric ranges, date format)
    - _Requirements: 2.1, 2.5_
  - [ ] 3.2 Implement lot number generation function: [MaterialGroupCode]-[YYYYMMDD]-[SequentialNumber]
    - Generate unique lot numbers with daily-resetting 4-digit sequence per material group
    - _Requirements: 2.2_
  - [ ] 3.3 Create intake service: validate input, create supplier_intake record, generate lot number, set status to pending_qc, lock intake data
    - Wrap in transaction, check for duplicate truck reference on same day
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7_
  - [ ] 3.4 Create intake controller and routes: POST /api/intakes, GET /api/intakes, GET /api/intakes/:id
    - Wire controller to service, apply RBAC for Warehouse_Operator
    - _Requirements: 2.1, 2.6_
  - [ ] 3.5 Implement intake data immutability (reject any PUT/PATCH on locked intakes)
    - Return 403 for any modification attempt on locked intake records
    - _Requirements: 2.4_
  - [ ]* 3.6 Write property test for lot number uniqueness and format validation
    - **Property 2: Lot Number Uniqueness and Format**
    - **Validates: Requirements 2.2**
  - [ ]* 3.7 Write property test for supplier intake immutability after lot generation
    - **Property 4: Supplier Intake Immutability**
    - **Validates: Requirements 2.4**

- [ ] 4. Checkpoint - Ensure core modules pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. QC Digital Queue and Decision Recording
  - [ ] 5.1 Create QC service: fetch pending QC queue (chronological), submit QC result with decision
    - Query lots with pending_qc status ordered by delivery_date ASC, record QC result
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ] 5.2 Implement lot status state machine transitions: pending_qc → passed/rejected, passed → ready_to_store
    - Enforce valid transitions only, reject invalid state changes
    - _Requirements: 3.4, 3.5_
  - [ ] 5.3 Create Zod validation for QC submission (parameters object, decision enum, rejection_reason conditional requirement)
    - Require at least one parameter, require rejection_reason (10-500 chars) when rejected
    - _Requirements: 3.3, 3.5, 3.7_
  - [ ] 5.4 Create QC controller and routes: GET /api/lots/pending-qc, POST /api/qc/:lotId/result, GET /api/qc/:lotId/history
    - Wire controller to service, apply RBAC for QC_Staff
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ] 5.5 Trigger notification to Warehouse_Operator when lot status changes to ready_to_store
    - Emit event on status change, integrate with notification service
    - _Requirements: 3.6_
  - [ ]* 5.6 Write property test for lot status state machine valid transitions only
    - **Property 3: Lot Status State Machine**
    - **Validates: Requirements 2.3, 3.4, 3.5**
  - [ ]* 5.7 Write property test for QC decision completeness
    - **Property 12: QC Decision Completeness**
    - **Validates: Requirements 3.3, 3.5, 3.7**

- [ ] 6. Smart Slotting Recommendation Engine
  - [ ] 6.1 Implement zone eligibility logic: temperature-sensitive → cold_chain only, hazardous → hazardous/standard zones
    - Filter zones based on lot properties
    - _Requirements: 4.2_
  - [ ] 6.2 Implement hazard segregation matrix lookup and compatibility checking
    - Query matrix for compatibility between two hazard classes
    - _Requirements: 4.3_
  - [ ] 6.3 Implement adjacent slot detection (get neighboring slots for a given coordinate)
    - Find left, right, above, below slots based on row/level/position
    - _Requirements: 4.3_
  - [ ] 6.4 Implement smart slotting engine: combine zone filtering, availability check, hazard compatibility, and proximity ranking
    - Return 1-5 valid recommendations within 3 seconds
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ] 6.5 Create slotting controller and routes: GET /api/slotting/:lotId/recommendations, POST /api/slotting/:lotId/assign, POST /api/slotting/:lotId/override
    - Wire controller to engine, apply RBAC for Warehouse_Operator
    - _Requirements: 4.1, 4.5, 4.6_
  - [ ] 6.6 Implement slot assignment confirmation (update slot status to occupied, record lot at coordinate)
    - Update rack_slot status, create audit trail record
    - _Requirements: 4.5_
  - [ ] 6.7 Implement override flow with mandatory justification field
    - Require 10+ char justification, record in audit trail, notify Factory_Manager
    - _Requirements: 4.6, 4.7_
  - [ ]* 6.8 Write property test for temperature-sensitive drums only recommended cold_chain slots
    - **Property 5: Smart Slotting Temperature Constraint**
    - **Validates: Requirements 4.2**
  - [ ]* 6.9 Write property test for hazardous drums respect segregation matrix for all adjacent slots
    - **Property 6: Smart Slotting Hazard Segregation**
    - **Validates: Requirements 4.3**

- [ ] 7. Cold-Chain Temperature Monitoring
  - [ ] 7.1 Create temperature polling background worker that reads sensor data every 60 seconds
    - Implement polling loop with configurable interval
    - _Requirements: 5.1_
  - [ ] 7.2 Implement breach detection logic: temperature > -4°C triggers breach classification
    - Check each reading against threshold, mark as breach
    - _Requirements: 5.3_
  - [ ] 7.3 Implement breach alert formatting with zone identifier, current temperature, and safe limit
    - Format message per notification requirements (≤1000 chars)
    - _Requirements: 5.4, 5.5_
  - [ ] 7.4 Set up WebSocket (Socket.IO) for real-time temperature updates to connected dashboards
    - Emit temperature readings and breach events to connected clients
    - _Requirements: 5.2, 5.6_
  - [ ] 7.5 Create temperature controller and routes: GET /api/temperature/current, GET /api/temperature/history/:zoneId, GET /api/temperature/breaches
    - Wire controller to service
    - _Requirements: 5.2, 5.6_
  - [ ] 7.6 Integrate breach detection with notification service (trigger WhatsApp alert)
    - Send alert within 30 seconds of breach detection
    - _Requirements: 5.4_
  - [ ]* 7.7 Write property test for temperature breach classification
    - **Property 7: Temperature Breach Classification**
    - **Validates: Requirements 5.3**

- [ ] 8. Enterprise Audit Trail
  - [ ] 8.1 Create audit trail service: record status changes with user_id, action, entity_type, entity_id, old_value, new_value, timestamp
    - Implement append-only audit record creation within transactions
    - _Requirements: 6.1, 6.2_
  - [ ] 8.2 Integrate audit trail recording into lot status changes (QC decisions, slot assignments)
    - Wrap status-changing operations in transactions that include audit record
    - _Requirements: 6.1, 6.6_
  - [ ] 8.3 Integrate audit trail recording into drum location changes
    - Record old and new rack coordinates on placement/move
    - _Requirements: 6.2_
  - [ ] 8.4 Implement append-only enforcement at database level (PostgreSQL policy: no UPDATE/DELETE on audit_trails)
    - Create database policy/trigger to prevent modification
    - _Requirements: 6.3_
  - [ ] 8.5 Create audit controller and routes: GET /api/audit with filters (date range, user, action type, lot number)
    - Implement pagination (50 per page), reverse chronological order
    - _Requirements: 6.4_
  - [ ]* 8.6 Write property test for audit trail completeness
    - **Property 8: Audit Trail Completeness**
    - **Validates: Requirements 6.1, 6.2**
  - [ ]* 8.7 Write property test for audit trail append-only
    - **Property 9: Audit Trail Append-Only**
    - **Validates: Requirements 6.3**

- [ ] 9. Checkpoint - Ensure backend modules pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Critical Notification via WhatsApp Gateway
  - [ ] 10.1 Create WhatsApp gateway service with Twilio API integration (send message function)
    - Implement Twilio WhatsApp message sending
    - _Requirements: 7.1_
  - [ ] 10.2 Implement alert message formatting: severity, event description, affected area, current reading, safe threshold, recommended action
    - Format messages ≤1000 characters
    - _Requirements: 7.2_
  - [ ] 10.3 Implement retry logic: up to 3 retries with 10-second intervals on delivery failure
    - Retry on failure, log each attempt
    - _Requirements: 7.4_
  - [ ] 10.4 Log delivery failures in audit trail after all retries exhausted
    - Create audit record for final failure, display persistent alert banner
    - _Requirements: 7.4_
  - [ ] 10.5 Create notification config controller and routes: GET /api/notifications/config, PUT /api/notifications/config
    - Wire controller, apply RBAC for Factory_Manager
    - _Requirements: 7.5, 7.6_
  - [ ] 10.6 Allow Factory_Manager to configure recipient phone numbers per alert category
    - Validate E.164 format, require at least one recipient per category
    - _Requirements: 7.5, 7.6_
  - [ ]* 10.7 Write property test for retry logic
    - **Property 11: Notification Retry Logic**
    - **Validates: Requirements 7.4**

- [ ] 11. PPIC Stock Visibility and Production Planning
  - [ ] 11.1 Create PPIC service: fetch real-time stock of lots with status passed/ready_to_store
    - Query lots with appropriate status, include location and quantity data
    - _Requirements: 8.1_
  - [ ] 11.2 Implement production schedule creation with stock validation (all referenced lots must be ready_to_store)
    - Validate lot statuses and unreserved quantities before creating schedule
    - _Requirements: 8.3, 8.4, 8.6, 8.8_
  - [ ] 11.3 Implement work order creation and notification to assigned production operators
    - Create work order, reserve lot quantities, send notification within 30 seconds
    - _Requirements: 8.5, 8.7_
  - [ ] 11.4 Create PPIC controller and routes: GET /api/ppic/stock, POST /api/ppic/schedules, GET /api/ppic/schedules, POST /api/ppic/work-orders
    - Wire controller to service, apply RBAC for PPIC_Team
    - _Requirements: 8.1, 8.3, 8.5_
  - [ ] 11.5 Set up WebSocket event for real-time stock updates when lot status changes to ready_to_store
    - Emit stock update events to connected PPIC dashboards
    - _Requirements: 8.2_
  - [ ]* 11.6 Write property test for production schedule validation
    - **Property 10: PPIC Stock Validation**
    - **Validates: Requirements 8.4, 8.6**

- [ ] 12. Frontend - Authentication and Layout
  - [ ] 12.1 Create login page with email/password form
    - Implement form with validation, error display, lockout messaging
    - _Requirements: 1.1, 1.8_
  - [ ] 12.2 Implement JWT token storage and automatic refresh logic
    - Store tokens securely, auto-refresh before expiration
    - _Requirements: 1.1, 1.9_
  - [ ] 12.3 Create role-based route guards (redirect unauthorized users)
    - Protect routes based on user role, redirect to appropriate page
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7_
  - [ ] 12.4 Create main layout with sidebar navigation (role-filtered menu items)
    - Show only menu items relevant to user's role
    - _Requirements: 1.3, 1.4, 1.5, 1.6_
  - [ ] 12.5 Create shared UI components: DataTable, StatusBadge, AlertBanner, FormField
    - Build reusable accessible components with TailwindCSS
    - _Requirements: 1.1_

- [ ] 13. Frontend - Warehouse Operator Pages
  - [ ] 13.1 Create Supplier Intake form page with all required fields and validation
    - Implement form with inline validation errors, duplicate truck reference warning
    - _Requirements: 2.1, 2.5, 2.6, 2.7_
  - [ ] 13.2 Create Lot Queue page showing lots with status filtering
    - Display lots with status badges, filtering options
    - _Requirements: 2.3_
  - [ ] 13.3 Create Smart Slotting page: display recommendations, confirm placement, override flow
    - Show 1-5 recommendations, confirm/override with justification
    - _Requirements: 4.1, 4.5, 4.6_
  - [ ] 13.4 Display real-time notifications for "Ready to Store" lots
    - Subscribe to WebSocket events, show notification badges
    - _Requirements: 3.6_

- [ ] 14. Frontend - QC Staff Pages
  - [ ] 14.1 Create Pending QC Queue page with chronological lot list
    - Display lots ordered by delivery date, show lot details on selection
    - _Requirements: 3.1, 3.2_
  - [ ] 14.2 Create QC Result Input form with quality parameters and Pass/Reject decision
    - Implement parameter entry, decision selection, submission
    - _Requirements: 3.3, 3.4, 3.5_
  - [ ] 14.3 Implement conditional rejection reason field (required when Rejected)
    - Show/hide rejection reason field, validate 10-500 char length
    - _Requirements: 3.5, 3.7_

- [ ] 15. Frontend - PPIC Team Pages
  - [ ] 15.1 Create Stock Availability Dashboard with real-time lot data
    - Display lots with quantities, locations, real-time updates via WebSocket
    - _Requirements: 8.1, 8.2_
  - [ ] 15.2 Create Production Schedule form with lot selection and stock validation
    - Implement lot selection, quantity input, validation feedback
    - _Requirements: 8.3, 8.4, 8.6, 8.8_
  - [ ] 15.3 Create Work Order creation and assignment interface
    - Implement work order form with operator assignment
    - _Requirements: 8.5, 8.7_

- [ ] 16. Frontend - Factory Manager Dashboard
  - [ ] 16.1 Create main dashboard with production efficiency graphs (Recharts)
    - Implement charts showing production metrics
    - _Requirements: 1.6_
  - [ ] 16.2 Create cold room temperature trend visualization with real-time WebSocket updates
    - Display temperature charts per zone, update in real-time
    - _Requirements: 5.2, 5.6_
  - [ ] 16.3 Create Audit Trail viewer with filtering (date, user, action, lot)
    - Implement paginated table with filter controls
    - _Requirements: 6.4_
  - [ ] 16.4 Create Alert Configuration page for managing notification recipients
    - Implement phone number management per alert category with E.164 validation
    - _Requirements: 7.5, 7.6_
  - [ ] 16.5 Implement visual alarm indicator for active temperature breaches
    - Show persistent alarm banner until breach resolved
    - _Requirements: 5.6_

- [ ] 17. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout (Node.js/Express backend, React frontend)
- Prisma ORM handles database access with PostgreSQL
- WebSocket (Socket.IO) provides real-time updates for temperature and stock dashboards
- Vitest + fast-check are used for testing (property-based and unit tests)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.6"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4"] },
    { "id": 4, "tasks": ["1.5", "2.1", "2.5"] },
    { "id": 5, "tasks": ["2.2", "2.4", "2.6"] },
    { "id": 6, "tasks": ["2.3", "2.7", "2.8"] },
    { "id": 7, "tasks": ["3.1", "3.2"] },
    { "id": 8, "tasks": ["3.3", "3.4", "3.5"] },
    { "id": 9, "tasks": ["3.6", "3.7"] },
    { "id": 10, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 11, "tasks": ["5.4", "5.5"] },
    { "id": 12, "tasks": ["5.6", "5.7"] },
    { "id": 13, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 14, "tasks": ["6.4", "6.5"] },
    { "id": 15, "tasks": ["6.6", "6.7"] },
    { "id": 16, "tasks": ["6.8", "6.9"] },
    { "id": 17, "tasks": ["7.1", "7.2"] },
    { "id": 18, "tasks": ["7.3", "7.4", "7.5"] },
    { "id": 19, "tasks": ["7.6", "7.7"] },
    { "id": 20, "tasks": ["8.1"] },
    { "id": 21, "tasks": ["8.2", "8.3", "8.4", "8.5"] },
    { "id": 22, "tasks": ["8.6", "8.7"] },
    { "id": 23, "tasks": ["10.1", "10.2"] },
    { "id": 24, "tasks": ["10.3", "10.5", "10.6"] },
    { "id": 25, "tasks": ["10.4", "10.7"] },
    { "id": 26, "tasks": ["11.1", "11.4"] },
    { "id": 27, "tasks": ["11.2", "11.3", "11.5"] },
    { "id": 28, "tasks": ["11.6"] },
    { "id": 29, "tasks": ["12.1", "12.5"] },
    { "id": 30, "tasks": ["12.2", "12.3", "12.4"] },
    { "id": 31, "tasks": ["13.1", "13.2", "13.3", "13.4"] },
    { "id": 32, "tasks": ["14.1", "14.2", "14.3"] },
    { "id": 33, "tasks": ["15.1", "15.2", "15.3"] },
    { "id": 34, "tasks": ["16.1", "16.2", "16.3", "16.4", "16.5"] }
  ]
}
```
