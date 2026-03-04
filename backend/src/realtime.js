let io = null;
// socket.id → { userId, userName }  (populated by driver_register events)
const connectedDrivers = new Map();

function setIO(instance) {
  io = instance;
}

function getIO() {
  return io;
}

function registerDriver(socketId, userId, userName) {
  connectedDrivers.set(socketId, { userId, userName });
}

// Returns the removed driver data, or null if not found
function unregisterDriver(socketId) {
  const driver = connectedDrivers.get(socketId) || null;
  connectedDrivers.delete(socketId);
  return driver;
}

function getConnectedDriverUserIds() {
  const ids = new Set();
  for (const { userId } of connectedDrivers.values()) {
    if (userId) ids.add(String(userId));
  }
  return [...ids];
}

module.exports = {
  setIO,
  getIO,
  registerDriver,
  unregisterDriver,
  getConnectedDriverUserIds,
};
