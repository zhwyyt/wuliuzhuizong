package com.example.wuliugenzong;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int LOCATION_PERMISSION = 1001;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView statusView;
    private EditText apiBaseInput;
    private EditText deviceIdInput;
    private LocationManager locationManager;
    private Location lastLocation;

    private final Runnable uploadLoop = new Runnable() {
        @Override
        public void run() {
            uploadCurrentLocation();
            handler.postDelayed(this, 30_000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        setContentView(createContentView());
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(uploadLoop);
        super.onDestroy();
    }

    private View createContentView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(36, 44, 36, 36);
        root.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView title = new TextView(this);
        title.setText("物流跟踪采集端");
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        root.addView(title, fullWidth());

        apiBaseInput = new EditText(this);
        apiBaseInput.setHint("后端地址");
        apiBaseInput.setSingleLine(true);
        apiBaseInput.setText("http://10.0.2.2:4000/api");
        root.addView(apiBaseInput, fullWidth());

        deviceIdInput = new EditText(this);
        deviceIdInput.setHint("设备 ID");
        deviceIdInput.setSingleLine(true);
        deviceIdInput.setText("d-1001");
        root.addView(deviceIdInput, fullWidth());

        Button startButton = new Button(this);
        startButton.setText("开始定位上报");
        startButton.setOnClickListener(v -> startCollecting());
        root.addView(startButton, fullWidth());

        Button onceButton = new Button(this);
        onceButton.setText("立即上报一次");
        onceButton.setOnClickListener(v -> uploadCurrentLocation());
        root.addView(onceButton, fullWidth());

        statusView = new TextView(this);
        statusView.setText("待启动。模拟器访问宿主机后端使用 10.0.2.2。");
        statusView.setTextSize(15);
        statusView.setPadding(0, 28, 0, 0);
        root.addView(statusView, fullWidth());
        return root;
    }

    private LinearLayout.LayoutParams fullWidth() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 10, 0, 10);
        return params;
    }

    private void startCollecting() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_PERMISSION);
            return;
        }
        try {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10_000, 10, locationListener);
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10_000, 10, locationListener);
            handler.removeCallbacks(uploadLoop);
            handler.post(uploadLoop);
            statusView.setText("定位采集中，每 30 秒上报一次。");
        } catch (SecurityException ex) {
            statusView.setText("定位权限不可用：" + ex.getMessage());
        }
    }

    private final LocationListener locationListener = location -> {
        lastLocation = location;
        statusView.setText("最新定位：" + location.getLongitude() + ", " + location.getLatitude());
    };

    private void uploadCurrentLocation() {
        Location location = lastLocation;
        if (location == null) {
            location = new Location("demo");
            location.setLongitude(121.4737 + Math.random() * 0.05);
            location.setLatitude(31.2304 + Math.random() * 0.04);
            location.setSpeed(12);
        }
        Location uploadLocation = location;
        new Thread(() -> postLocation(uploadLocation)).start();
    }

    private void postLocation(Location location) {
        try {
            JSONObject body = new JSONObject();
            body.put("deviceId", deviceIdInput.getText().toString().trim());
            body.put("lng", location.getLongitude());
            body.put("lat", location.getLatitude());
            body.put("speed", Math.max(0, location.getSpeed() * 3.6));
            body.put("heading", location.hasBearing() ? location.getBearing() : 0);
            body.put("status", "online");

            URL url = new URL(apiBaseInput.getText().toString().trim() + "/locations");
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setDoOutput(true);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = connection.getResponseCode();
            handler.post(() -> statusView.setText("上报完成，HTTP " + code));
            connection.disconnect();
        } catch (Exception ex) {
            handler.post(() -> statusView.setText("上报失败：" + ex.getMessage()));
        }
    }
}
