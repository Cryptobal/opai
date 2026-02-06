-- CreateSchema: payroll (liquidaciones y parámetros legales)
CREATE SCHEMA IF NOT EXISTS payroll;

-- CreateSchema: fx (tasas financieras: UF, UTM, IPC)
CREATE SCHEMA IF NOT EXISTS fx;

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add comment
COMMENT ON SCHEMA payroll IS 'Módulo de nómina y liquidaciones Chile';
COMMENT ON SCHEMA fx IS 'Tasas financieras y económicas (UF, UTM, IPC)';
