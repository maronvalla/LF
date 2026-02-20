const http = require("http");
const { Server } = require("socket.io");
const { app } = require("./app"); 
const { pool } = require("./db"); 

const port = process.env.PORT || 4000;
const server = http.createServer(app);

function isAllowedSocketOrigin(origin) {
  if (!origin) return true;
  const explicit = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit.includes(origin)) return true;

  const isLan =
    /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d+$/.test(origin) ||
    /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(origin) ||
    /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}:\d+$/.test(origin);
  return isLan;
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
