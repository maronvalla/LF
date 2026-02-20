# DISTRIBUIDORA LA FAMILIA - Fase 1

Sistema interno con:
- `backend/`: API REST (`Node.js + Express + PostgreSQL`)
- `desktop/`: app de escritorio Windows (`Electron + React + Vite + Tailwind`)

## Requisitos
- Node.js 20+
- PostgreSQL 14+

## 1) Configurar entorno

### Backend
```bash
cd backend
copy .env.example .env
```

Editar `backend/.env`:
- `DATABASE_URL=postgres://postgres:postgres@localhost:5432/lf_db`
- `JWT_SECRET=<tu_secret>`
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`
- `CORS_ORIGIN=http://localhost:5173`

### Desktop
```bash
cd desktop
copy .env.example .env
```

Si el backend corre en otra URL, editar `desktop/.env`:
- `VITE_API_URL=http://localhost:4000/api`

## 2) Crear DB en Postgres
```sql
CREATE DATABASE lf_db;
```

## 3) Instalar dependencias
```bash
cd backend
npm install
cd ../desktop
npm install
```

## 4) Migraciones + seed
```bash
cd backend
npm run migrate
npm run seed
```

El seed crea:
- Locations: `GALPON`, `LOCAL`
- Usuario ADMIN por `.env`
- Datos de ejemplo opcionales (clientes y productos)

## 5) Ejecutar

Terminal 1:
```bash
cd backend
npm run dev
```

Terminal 2:
```bash
cd desktop
npm run dev
```

## Scripts disponibles

### Raiz
- `npm run migrate` -> ejecuta migraciones backend
- `npm run seed` -> ejecuta seed backend
- `npm run start` -> inicia backend en modo normal

### Backend (`backend/package.json`)
- `npm run dev`
- `npm run start`
- `npm run migrate`
- `npm run seed`

### Desktop (`desktop/package.json`)
- `npm run dev`
- `npm run build`
- `npm run start`

## Roles Fase 1
- `ADMIN`: acceso total
- `VENDEDOR`: ventas, clientes, inventario lectura, marcar `PREPARADO`, reparto
- `CAJERO`: ventas + dashboard
- `REPARTIDOR`: reservado para fase 2 (sin permisos)

## Flujos implementados
- Login con JWT (bearer) + cookie httpOnly
- Gestión de usuarios (ADMIN)
- Inventario por ubicación (`GALPON` / `LOCAL`)
- Transferencia `GALPON -> LOCAL` con movimiento registrado
- Ventas `MOSTRADOR` / `ENVIO`, turno auto sugerido para envío
- Estados de venta Fase 1: `PENDIENTE`, `PREPARADO`, `CARGADO`, `ANULADO`
- Descuento de stock de `LOCAL` al marcar `PREPARADO`
- Reparto del día (mañana/tarde), consolidado por producto, checklist persistido
- Cierre de carga: delivery -> `CARGA_CERRADA`; ventas incluidas `PREPARADO` -> `CARGADO`
- Auditoría de acciones en `audit_log`

