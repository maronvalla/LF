package com.lafamilia.distribuidora;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Binder;
import android.os.Build;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class TrackingService extends Service {

    private static final String CHANNEL_ID = "lf_tracking_channel";
    private static final int NOTIFICATION_ID = 1001;

    public interface LocationListener {
        void onLocationUpdate(double lat, double lng);
    }

    private static final String WAKE_LOCK_TAG = "LaFamilia:TrackingWakeLock";

    private final IBinder binder = new LocalBinder();
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private LocationListener locationListener;
    private PowerManager.WakeLock wakeLock;
    private HandlerThread locationThread;

    private String serverUrl = "";
    private String authToken = "";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    public class LocalBinder extends Binder {
        TrackingService getService() {
            return TrackingService.this;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String url = intent.getStringExtra("serverUrl");
            String token = intent.getStringExtra("authToken");
            if (url != null && !url.isEmpty()) serverUrl = url;
            if (token != null && !token.isEmpty()) authToken = token;
        }

        createNotificationChannel();

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("La Familia Repartos")
                .setContentText("Rastreando ubicación del repartidor")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        if (!wakeLock.isHeld()) {
            wakeLock.acquire(12 * 60 * 60 * 1000L); // 12 hours max
        }
        startLocationUpdates();
        return START_STICKY;
    }

    private void startLocationUpdates() {
        // Use a dedicated background thread so location callbacks are never
        // blocked by the WebView main looper when the screen is off.
        if (locationThread != null) {
            locationThread.quit();
        }
        locationThread = new HandlerThread("LF_LocationThread");
        locationThread.start();

        LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000)
                .setMinUpdateIntervalMillis(3000)
                .setMaxUpdateDelayMillis(10000)
                .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                if (result.getLastLocation() != null) {
                    double lat = result.getLastLocation().getLatitude();
                    double lng = result.getLastLocation().getLongitude();

                    // Notify the WebView (works when screen is on)
                    if (locationListener != null) {
                        locationListener.onLocationUpdate(lat, lng);
                    }

                    // POST directly to backend (works even when screen is off / WebView paused)
                    postLocationToServer(lat, lng);
                }
            }
        };

        try {
            fusedLocationClient.requestLocationUpdates(
                    locationRequest,
                    locationCallback,
                    locationThread.getLooper()   // background thread, not main looper
            );
        } catch (SecurityException ignored) {
            // Permission not granted — service stays alive but sends no data
        }
    }

    private void postLocationToServer(double lat, double lng) {
        if (serverUrl == null || serverUrl.isEmpty() || authToken == null || authToken.isEmpty()) return;

        final double finalLat = lat;
        final double finalLng = lng;
        final String url = serverUrl + "/api/deliveries/driver-location";
        final String token = authToken;

        executor.submit(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + token);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setDoOutput(true);

                String body = "{\"lat\":" + finalLat + ",\"lng\":" + finalLng + "}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bytes);
                }

                // Read response code to complete the request (ignore result)
                conn.getResponseCode();
            } catch (Exception ignored) {
                // Network error — silently drop; next update will retry
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    public void setLocationListener(LocationListener listener) {
        this.locationListener = listener;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (fusedLocationClient != null && locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
        }
        if (locationThread != null) {
            locationThread.quit();
            locationThread = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        executor.shutdownNow();
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Rastreo de Ubicación",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Rastreo GPS del repartidor en ruta");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }
}
