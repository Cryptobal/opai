# Inventario - Setup de desarrollo

## Requisitos

- Node.js 18+
- PostgreSQL (local o Neon/Supabase)

## Pasos

### 1. Configurar base de datos

**Opción A: Neon (recomendado para dev rápido)**

1. Crea una cuenta en [Neon](https://neon.tech)
2. Crea un proyecto y copia el connection string
3. En `.env.local`:
   ```
   DATABASE_URL=postgresql://user:pass@host.region.neon.tech/neondb?sslmode=require
   ```

**Opción B: PostgreSQL local con Docker**

```bash
docker compose -f docker-compose.dev.yml up -d
# .env.local ya tiene: postgresql://postgres:postgres@localhost:5432/gard?sslmode=disable
```

### 2. Ejecutar migraciones

```bash
npm run db:migrate
```

### 3. Ejecutar seed (datos iniciales + usuario de prueba)

```bash
npx prisma db seed
```

Credenciales: `carlos.irigoyen@gard.cl` / `GardSecurity2026!`

### 4. Iniciar servidor de desarrollo

```bash
npm run dev:watch
```

Abre http://localhost:3000 → Ops → Inventario

### 5. Flujo de prueba

1. **Productos**: Crear "Camisa" (uniforme) → Agregar tallas S, M, L, XL
2. **Bodegas**: Crear "Bodega central"
3. **Compras**: Registrar compra de 10 Camisa M a Bodega central
4. **Stock**: Ver stock actualizado
5. **Activos**: Crear producto "Celular" (activo) → Registrar activo con número
