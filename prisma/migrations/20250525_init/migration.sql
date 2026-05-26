-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('warehouse_operator', 'qc_staff', 'ppic_team', 'factory_manager');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('pending_qc', 'passed', 'rejected', 'ready_to_store');

-- CreateEnum
CREATE TYPE "QCDecision" AS ENUM ('passed', 'rejected');

-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('standard', 'cold_chain', 'hazardous');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('available', 'occupied', 'reserved', 'maintenance');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('draft', 'confirmed', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('pending', 'in_progress', 'completed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "phone_number" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_intakes" (
    "id" TEXT NOT NULL,
    "supplier_name" VARCHAR(255) NOT NULL,
    "material_group" VARCHAR(100) NOT NULL,
    "material_group_code" VARCHAR(10) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "delivery_date" DATE NOT NULL,
    "truck_reference" VARCHAR(100) NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" TEXT NOT NULL,
    "lot_number" VARCHAR(50) NOT NULL,
    "supplier_intake_id" TEXT,
    "status" "LotStatus" NOT NULL,
    "material_group_code" VARCHAR(10) NOT NULL,
    "is_temperature_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "is_hazardous" BOOLEAN NOT NULL DEFAULT false,
    "hazard_class" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_results" (
    "id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "decision" "QCDecision" NOT NULL,
    "rejection_reason" TEXT,
    "tested_by" TEXT NOT NULL,
    "tested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qc_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_zones" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "zone_type" "ZoneType" NOT NULL,
    "temperature_min" DECIMAL(5,2),
    "temperature_max" DECIMAL(5,2),
    "block_identifier" VARCHAR(10) NOT NULL,

    CONSTRAINT "warehouse_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rack_slots" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "coordinate" VARCHAR(20) NOT NULL,
    "row" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "SlotStatus" NOT NULL,
    "current_lot_id" TEXT,

    CONSTRAINT "rack_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drums" (
    "id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "rack_slot_id" TEXT,
    "drum_number" INTEGER NOT NULL,
    "weight_kg" DECIMAL(10,2) NOT NULL,
    "placed_at" TIMESTAMP(3),
    "placed_by" TEXT,

    CONSTRAINT "drums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temperature_readings" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "temperature_celsius" DECIMAL(5,2) NOT NULL,
    "is_breach" BOOLEAN NOT NULL DEFAULT false,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temperature_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_trails" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_trails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_configs" (
    "id" TEXT NOT NULL,
    "alert_category" VARCHAR(50) NOT NULL,
    "user_id" TEXT NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_schedules" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "status" "ScheduleStatus" NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_schedule_lots" (
    "schedule_id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "quantity_required" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "production_schedule_lots_pkey" PRIMARY KEY ("schedule_id","lot_id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "assigned_to" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hazard_segregation_matrix" (
    "id" TEXT NOT NULL,
    "hazard_class_a" VARCHAR(50) NOT NULL,
    "hazard_class_b" VARCHAR(50) NOT NULL,
    "is_compatible" BOOLEAN NOT NULL,
    "min_separation_slots" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "hazard_segregation_matrix_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "lots_lot_number_key" ON "lots"("lot_number");

-- CreateIndex
CREATE UNIQUE INDEX "rack_slots_coordinate_key" ON "rack_slots"("coordinate");

-- AddForeignKey
ALTER TABLE "supplier_intakes" ADD CONSTRAINT "supplier_intakes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_supplier_intake_id_fkey" FOREIGN KEY ("supplier_intake_id") REFERENCES "supplier_intakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_results" ADD CONSTRAINT "qc_results_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_results" ADD CONSTRAINT "qc_results_tested_by_fkey" FOREIGN KEY ("tested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rack_slots" ADD CONSTRAINT "rack_slots_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "warehouse_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rack_slots" ADD CONSTRAINT "rack_slots_current_lot_id_fkey" FOREIGN KEY ("current_lot_id") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drums" ADD CONSTRAINT "drums_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drums" ADD CONSTRAINT "drums_rack_slot_id_fkey" FOREIGN KEY ("rack_slot_id") REFERENCES "rack_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drums" ADD CONSTRAINT "drums_placed_by_fkey" FOREIGN KEY ("placed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temperature_readings" ADD CONSTRAINT "temperature_readings_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "warehouse_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_trails" ADD CONSTRAINT "audit_trails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_configs" ADD CONSTRAINT "notification_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_schedules" ADD CONSTRAINT "production_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_schedule_lots" ADD CONSTRAINT "production_schedule_lots_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "production_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_schedule_lots" ADD CONSTRAINT "production_schedule_lots_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "production_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
