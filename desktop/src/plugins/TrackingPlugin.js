import { registerPlugin } from '@capacitor/core';

// Bridges to TrackingPlugin.java (foreground service).
// On web/desktop the no-op stubs are used so startTracking/stopTracking are safe to call.
const TrackingPlugin = registerPlugin('TrackingPlugin', {
  web: {
    startTracking: async () => {},
    stopTracking: async () => {},
  },
});

export default TrackingPlugin;
