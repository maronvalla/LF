const http = require("http");
const { Server } = require("socket.io");
const { app } = require("./app");
const { pool } = require("./db");
const { setIO } = require("./realtime");

const port = process.env.PORT || 4000;
const server = http.createServer(app);

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

  socket.on("disconnect", () => {
    console.log("🔴 Dispositivo desconectado:", socket.id);
  });
});

server.listen(port, () => {
  console.log(`🚀 Backend y Radar corriendo en puerto ${port}`);
});
