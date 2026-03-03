package com.lafamilia.distribuidora;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

public class TrackingService extends Service {

    private static final String CHANNEL_ID = "lf_tracking_channel";
    private static final int NOTIFICATION_ID = 1001;

    public interface LocationListener {
        void onLocationUpdate(double lat, double lng);
    }

    private final IBinder binder = new LocalBinder();
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private LocationListener locationListener;

    public class LocalBinder extends Binder {
        TrackingService getService() {
            return TrackingService.this;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
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

        startLocationUpdates();
        return START_STICKY;
    }

    private void startLocationUpdates() {
        LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000)
                .setMinUpdateIntervalMillis(3000)
                .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                if (result.getLastLocation() != null) {
                    double lat = result.getLastLocation().getLatitude();
                    double lng = result.getLastLocation().getLongitude();
                    if (locationListener != null) {
                        locationListener.onLocationUpdate(lat, lng);
                    }
                }
            }
        };

        try {
            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper());
        } catch (SecurityException ignored) {
            // Permission not granted — service will stay alive but send no data
        }
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
