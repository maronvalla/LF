const http = require("http");
const { Server } = require("socket.io");
const { app } = require("./app");
const { pool } = require("./db");
const { setIO, registerDriver, unregisterDriver } = require("./realtime");

const port = process.env.PORT || 4000;
const server = http.createServer(app);

function isDeliveryHour() {
  const hour = new Date().getHours();
  return hour >= 8 && hour < 22;
}

function isAllowedSocketOrigin(origin) {
  // Permitir cualquier origen para desarrollo y uso móvil local
  return true;
}

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedSocketOrigin(origin)) return callback(null, true);
      return callback(new Error("Not allowed by Socket.IO CORS"));
    },
    credentials: true,
  },
});
setIO(io);

io.on("connection", (socket) => {
  console.log("🟢 Nuevo dispositivo conectado al radar:", socket.id);

  socket.on("camion_ubicacion", async (payload = {}) => {
    const lat = Number(payload.lat);
    const lng = Number(payload.lng);
    const isValid =
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;

    if (!isValid) return;

    const outbound = {
      lat,
      lng,
      sale_id: payload.sale_id || null,
      user_id: payload.user_id || null,
      ts: new Date().toISOString(),
    };

    io.emit("update_mapa", outbound);

    try {
      await pool.query(
        `INSERT INTO delivery_tracking(sale_id, user_id, event_type, latitude, longitude, payload)
         VALUES ($1, $2, 'POSICION_CAMION', $3, $4, $5::jsonb)`,
        [
          outbound.sale_id,
          outbound.user_id,
          lat,
          lng,
          JSON.stringify({ source: "socket", ts: outbound.ts }),
        ]
      );
    } catch (err) {
      console.error("Error guardando tracking:", err.message);
    }
  });

  socket.on("driver_register", (payload = {}) => {
    const userId = payload.userId || null;
    const userName = String(payload.userName || "Repartidor desconocido");
    const role = String(payload.role || "").toUpperCase();
    if (role === "REPARTIDOR") {
      registerDriver(socket.id, userId, userName);
      console.log(`🚚 Repartidor registrado en socket: ${userName} (${socket.id})`);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 Dispositivo desconectado:", socket.id);
    const driver = unregisterDriver(socket.id);
    if (driver && isDeliveryHour()) {
      console.log(`⚠️  Repartidor desconectado en horario de recorrido: ${driver.userName}`);
      io.emit("driver_offline_alert", {
        type: "disconnect",
        driverName: driver.userName,
        userId: driver.userId,
        message: `${driver.userName} se desconectó o cerró la aplicación`,
        ts: new Date().toISOString(),
      });
    }
  });
});

server.listen(port, () => {
  console.log(`🚀 Backend y Radar corriendo en puerto ${port}`);
});
