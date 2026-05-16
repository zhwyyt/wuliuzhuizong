package com.example.wuliugenzong;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class TrackingService extends Service {
    private static final String CHANNEL_ID = "wuliu_tracking";
    private static final int NOTIFICATION_ID = 3001;
    private static final String PREFS = "wuliu-mobile";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private LocationManager locationManager;
    private Location lastLocation;

    private final Runnable uploadLoop = new Runnable() {
        @Override
        public void run() {
            uploadCurrentLocation();
            handler.postDelayed(this, 30_000);
        }
    };

    public static Intent createStartIntent(Context context) {
        return new Intent(context, TrackingService.class);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        createChannel();
        startForeground(NOTIFICATION_ID, notification("正在准备定位上报"));
        startLocationUpdates();
        handler.post(uploadLoop);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, notification("物流跟踪后台上报中"));
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(uploadLoop);
        if (locationManager != null) {
            locationManager.removeUpdates(locationListener);
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startLocationUpdates() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            updateNotification("缺少定位权限，后台上报未启动");
            stopSelf();
            return;
        }
        try {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10_000, 10, locationListener);
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10_000, 10, locationListener);
        } catch (SecurityException ex) {
            updateNotification("定位权限不可用：" + ex.getMessage());
            stopSelf();
        }
    }

    private final LocationListener locationListener = location -> {
        if (isMockLocation(location)) {
            updateNotification("检测到模拟位置，已忽略");
            return;
        }
        lastLocation = location;
        updateNotification("最新定位 " + trim(location.getLongitude()) + ", " + trim(location.getLatitude()));
    };

    private void uploadCurrentLocation() {
        Location location = lastLocation;
        if (location == null) {
            updateNotification("等待真实定位结果");
            return;
        }
        if (isMockLocation(location)) {
            updateNotification("模拟位置已阻止上报");
            return;
        }
        new Thread(() -> {
            try {
                int code = postLocation(location);
                updateNotification("上报完成 HTTP " + code + " " + trim(location.getLongitude()) + ", " + trim(location.getLatitude()));
            } catch (Exception ex) {
                updateNotification("上报失败：" + ex.getMessage());
            }
        }).start();
    }

    private int postLocation(Location location) throws Exception {
        JSONObject body = new JSONObject();
        body.put("projectId", prefs.getString("projectId", ""));
        body.put("deviceId", prefs.getString("deviceId", ""));
        body.put("deviceName", prefs.getString("deviceName", ""));
        body.put("owner", prefs.getString("owner", ""));
        body.put("phone", prefs.getString("phone", ""));
        body.put("longitude", location.getLongitude());
        body.put("latitude", location.getLatitude());
        body.put("speed", Math.max(0, location.getSpeed() * 3.6));
        body.put("heading", location.hasBearing() ? location.getBearing() : 0);
        body.put("battery", JSONObject.NULL);
        body.put("source", "android");
        body.put("status", "online");
        body.put("capturedAt", utcNow());
        body.put("provider", location.getProvider());
        body.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
        body.put("mock", isMockLocation(location));
        body.put("appVersion", BuildConfig.VERSION_NAME);
        body.put("appVersionCode", BuildConfig.VERSION_CODE);

        URL url = new URL(prefs.getString("apiBase", "http://10.0.2.2:4000/api") + "/locations");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("X-Device-Token", prefs.getString("deviceToken", ""));
        connection.setDoOutput(true);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
        int code = connection.getResponseCode();
        readBody(code >= 400 ? connection.getErrorStream() : connection.getInputStream());
        connection.disconnect();
        return code;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "物流定位上报", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("显示物流跟踪采集端后台上报状态");
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }

    private Notification notification(String text) {
        Intent launchIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return builder
                .setContentTitle("物流跟踪采集端")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, notification(text));
    }

    private boolean isMockLocation(Location location) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return location.isMock();
        }
        return location.isFromMockProvider();
    }

    private String utcNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private String trim(double value) {
        return String.format(Locale.US, "%.6f", value);
    }

    private void readBody(InputStream stream) throws Exception {
        if (stream == null) {
            return;
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            while (reader.readLine() != null) {
                // Drain the stream so the HTTP connection can be closed cleanly.
            }
        }
    }
}
