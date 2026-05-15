package com.example.wuliugenzong;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.amap.api.location.AMapLocationClient;
import com.amap.api.location.AMapLocationClientOption;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class MainActivity extends Activity {
    private static final int LOCATION_PERMISSION = 1001;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView statusView;
    private EditText apiBaseInput;
    private EditText projectIdInput;
    private EditText deviceIdInput;
    private EditText deviceNameInput;
    private LocationManager locationManager;
    private AMapLocationClient amapLocationClient;
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
        AMapLocationClient.updatePrivacyShow(this, true, true);
        AMapLocationClient.updatePrivacyAgree(this, true);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        setContentView(createContentView());
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(uploadLoop);
        stopAmapLocation();
        super.onDestroy();
    }

    private View createContentView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(36, 44, 36, 36);
        root.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView title = new TextView(this);
        title.setText("物流跟踪采集端 v" + BuildConfig.VERSION_NAME);
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        root.addView(title, fullWidth());

        apiBaseInput = new EditText(this);
        apiBaseInput.setHint("后端地址");
        apiBaseInput.setSingleLine(true);
        apiBaseInput.setText("http://100.101.3.116:4000/api");
        root.addView(apiBaseInput, fullWidth());

        projectIdInput = new EditText(this);
        projectIdInput.setHint("项目 ID");
        projectIdInput.setSingleLine(true);
        projectIdInput.setText("p-shanghai");
        root.addView(projectIdInput, fullWidth());

        deviceIdInput = new EditText(this);
        deviceIdInput.setHint("设备 ID");
        deviceIdInput.setSingleLine(true);
        deviceIdInput.setText("d-android-001");
        root.addView(deviceIdInput, fullWidth());

        deviceNameInput = new EditText(this);
        deviceNameInput.setHint("设备名称");
        deviceNameInput.setSingleLine(true);
        deviceNameInput.setText("Android 测试手机");
        root.addView(deviceNameInput, fullWidth());

        Button startButton = new Button(this);
        startButton.setText("开始定位上报");
        startButton.setOnClickListener(v -> startCollecting());
        root.addView(startButton, fullWidth());

        Button stopButton = new Button(this);
        stopButton.setText("停止定时上报");
        stopButton.setOnClickListener(v -> stopCollecting());
        root.addView(stopButton, fullWidth());

        Button onceButton = new Button(this);
        onceButton.setText("立即上报一次");
        onceButton.setOnClickListener(v -> uploadCurrentLocation());
        root.addView(onceButton, fullWidth());

        statusView = new TextView(this);
        statusView.setText("待启动。真机默认通过 Tailscale 访问本机后端。");
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
            startAmapLocation();
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10_000, 10, locationListener);
            handler.removeCallbacks(uploadLoop);
            handler.post(uploadLoop);
            statusView.setText("高德定位采集中，每 30 秒上报一次。");
        } catch (SecurityException ex) {
            statusView.setText("定位权限不可用：" + ex.getMessage());
        } catch (Exception ex) {
            statusView.setText("高德定位启动失败，使用系统定位兜底：" + ex.getMessage());
            tryStartSystemLocation();
            handler.removeCallbacks(uploadLoop);
            handler.post(uploadLoop);
        }
    }

    private void stopCollecting() {
        handler.removeCallbacks(uploadLoop);
        stopAmapLocation();
        if (locationManager != null) {
            locationManager.removeUpdates(locationListener);
        }
        statusView.setText("已停止定时上报。");
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                statusView.setText("定位权限已授权，请再次点击开始定位上报。");
            } else {
                statusView.setText("定位权限未授权，无法上报真实位置。");
            }
        }
    }

    private final LocationListener locationListener = location -> {
        if (isMockLocation(location)) {
            statusView.setText("检测到模拟位置，已忽略。请关闭开发者选项里的模拟定位。");
            return;
        }
        lastLocation = location;
        statusView.setText("最新定位：" + location.getLongitude() + ", " + location.getLatitude());
    };

    private void startAmapLocation() throws Exception {
        stopAmapLocation();
        amapLocationClient = new AMapLocationClient(getApplicationContext());
        AMapLocationClientOption option = new AMapLocationClientOption();
        option.setLocationMode(AMapLocationClientOption.AMapLocationMode.Hight_Accuracy);
        option.setInterval(10_000);
        option.setNeedAddress(false);
        option.setMockEnable(false);
        amapLocationClient.setLocationOption(option);
        amapLocationClient.setLocationListener(location -> {
            if (location == null || location.getErrorCode() != 0) {
                String message = location == null ? "无定位结果" : location.getErrorInfo();
                statusView.setText("高德定位失败：" + message);
                return;
            }
            Location androidLocation = new Location("amap");
            androidLocation.setLongitude(location.getLongitude());
            androidLocation.setLatitude(location.getLatitude());
            androidLocation.setSpeed(location.getSpeed());
            androidLocation.setBearing(location.getBearing());
            if (location.hasAccuracy()) {
                androidLocation.setAccuracy(location.getAccuracy());
            }
            lastLocation = androidLocation;
            statusView.setText("高德定位：" + location.getLongitude() + ", " + location.getLatitude() + "，精度 " + location.getAccuracy() + "m");
        });
        amapLocationClient.startLocation();
    }

    private void stopAmapLocation() {
        if (amapLocationClient != null) {
            amapLocationClient.stopLocation();
            amapLocationClient.onDestroy();
            amapLocationClient = null;
        }
    }

    private void tryStartSystemLocation() {
        try {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10_000, 10, locationListener);
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10_000, 10, locationListener);
        } catch (SecurityException ignored) {
            statusView.setText("系统定位也不可用，无法上报真实位置。");
        }
    }

    private void uploadCurrentLocation() {
        Location location = lastLocation;
        if (location == null) {
            statusView.setText("尚未获取真实定位，暂不上报。请打开定位权限并等待定位成功。");
            return;
        }
        if (isMockLocation(location)) {
            statusView.setText("当前是模拟位置，已阻止上报。");
            return;
        }
        Location uploadLocation = location;
        new Thread(() -> postLocation(uploadLocation)).start();
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

    private void postLocation(Location location) {
        try {
            JSONObject body = new JSONObject();
            body.put("projectId", projectIdInput.getText().toString().trim());
            body.put("deviceId", deviceIdInput.getText().toString().trim());
            body.put("deviceName", deviceNameInput.getText().toString().trim());
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
