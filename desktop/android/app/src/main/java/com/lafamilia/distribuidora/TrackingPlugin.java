package com.lafamilia.distribuidora;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TrackingPlugin")
public class TrackingPlugin extends Plugin implements TrackingService.LocationListener {

    private TrackingService trackingService;
    private boolean isBound = false;

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            TrackingService.LocalBinder binder = (TrackingService.LocalBinder) service;
            trackingService = binder.getService();
            trackingService.setLocationListener(TrackingPlugin.this);
            isBound = true;
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            isBound = false;
            trackingService = null;
        }
    };

    @PluginMethod
    public void startTracking(PluginCall call) {
        String serverUrl = call.getString("serverUrl", "");
        String authToken = call.getString("authToken", "");

        Context ctx = getContext();
        Intent intent = new Intent(ctx, TrackingService.class);
        intent.putExtra("serverUrl", serverUrl);
        intent.putExtra("authToken", authToken);
        ctx.startService(intent);
        ctx.bindService(intent, connection, Context.BIND_AUTO_CREATE);
        call.resolve();
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        if (isBound) {
            getContext().unbindService(connection);
            isBound = false;
        }
        Intent intent = new Intent(getContext(), TrackingService.class);
        getContext().stopService(intent);
        call.resolve();
    }

    @Override
    public void onLocationUpdate(double lat, double lng) {
        JSObject data = new JSObject();
        data.put("lat", lat);
        data.put("lng", lng);
        notifyListeners("location", data);
    }

    @Override
    protected void handleOnDestroy() {
        if (isBound) {
            getContext().unbindService(connection);
            isBound = false;
        }
    }
}
