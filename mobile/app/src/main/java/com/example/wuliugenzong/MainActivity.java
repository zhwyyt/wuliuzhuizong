package com.example.wuliugenzong;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import com.amap.api.location.AMapLocationClient;
import com.amap.api.location.AMapLocationClientOption;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

public class MainActivity extends Activity {
    private static final int LOCATION_PERMISSION = 1001;
    private static final int NOTIFICATION_PERMISSION = 1002;
    private static final String PREFS = "wuliu-mobile";

    private final List<ProjectOption> projects = new ArrayList<>();
    private SharedPreferences prefs;
    private TextView statusView;
    private TextView currentDeviceView;
    private EditText apiBaseInput;
    private EditText accountInput;
    private EditText deviceNameInput;
    private EditText ownerInput;
    private EditText phoneInput;
    private Spinner projectSpinner;
    private LocationManager locationManager;
    private AMapLocationClient amapLocationClient;
    private Location lastLocation;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        AMapLocationClient.updatePrivacyShow(this, true, true);
        AMapLocationClient.updatePrivacyAgree(this, true);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        setContentView(createContentView());
        restoreSavedProject();
        refreshDeviceSummary();
    }

    @Override
    protected void onDestroy() {
        stopAmapLocation();
        if (locationManager != null) {
            locationManager.removeUpdates(locationListener);
        }
        super.onDestroy();
    }

    private View createContentView() {
        ScrollView scrollView = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(36, 44, 36, 36);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        scrollView.addView(root);

        TextView title = new TextView(this);
        title.setText("物流跟踪采集端 v" + BuildConfig.VERSION_NAME);
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        root.addView(title, fullWidth());

        apiBaseInput = input("后端地址", prefs.getString("apiBase", defaultApiBase()));
        root.addView(apiBaseInput, fullWidth());

        accountInput = input("登录账号", prefs.getString("account", "上海调度员"));
        root.addView(accountInput, fullWidth());

        Button loginButton = new Button(this);
        loginButton.setText("登录并加载项目");
        loginButton.setOnClickListener(v -> loginAndLoadProjects());
        root.addView(loginButton, fullWidth());

        projectSpinner = new Spinner(this);
        projectSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, projects));
        root.addView(projectSpinner, fullWidth());

        deviceNameInput = input("本机设备名称", prefs.getString("deviceName", Build.MODEL + " 采集端"));
        root.addView(deviceNameInput, fullWidth());

        ownerInput = input("人员姓名", prefs.getString("owner", prefs.getString("account", "上海调度员")));
        root.addView(ownerInput, fullWidth());

        phoneInput = input("手机号", prefs.getString("phone", ""));
        root.addView(phoneInput, fullWidth());

        Button bindButton = new Button(this);
        bindButton.setText("注册/绑定本机设备");
        bindButton.setOnClickListener(v -> bindDevice());
        root.addView(bindButton, fullWidth());

        Button startButton = new Button(this);
        startButton.setText("开始后台定位上报");
        startButton.setOnClickListener(v -> startCollecting());
        root.addView(startButton, fullWidth());

        Button stopButton = new Button(this);
        stopButton.setText("停止后台上报");
        stopButton.setOnClickListener(v -> stopCollecting());
        root.addView(stopButton, fullWidth());

        Button onceButton = new Button(this);
        onceButton.setText("立即上报一次");
        onceButton.setOnClickListener(v -> uploadCurrentLocation());
        root.addView(onceButton, fullWidth());

        currentDeviceView = new TextView(this);
        currentDeviceView.setTextSize(14);
        currentDeviceView.setPadding(0, 20, 0, 0);
        root.addView(currentDeviceView, fullWidth());

        statusView = new TextView(this);
        statusView.setText("先登录加载项目，再注册本机设备。启动后会以前台服务每 30 秒上报真实定位。");
        statusView.setTextSize(15);
        statusView.setPadding(0, 18, 0, 0);
        root.addView(statusView, fullWidth());
        return scrollView;
    }

    private EditText input(String hint, String value) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setSingleLine(true);
        input.setText(value);
        return input;
    }

    private LinearLayout.LayoutParams fullWidth() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 10, 0, 10);
        return params;
    }

    private String defaultApiBase() {
        return isEmulator() ? "http://10.0.2.2:4000/api" : "http://100.101.3.116:4000/api";
    }

    private boolean isEmulator() {
        return Build.FINGERPRINT.contains("generic") || Build.MODEL.contains("Emulator") || Build.MODEL.contains("sdk_gphone");
    }

    private void loginAndLoadProjects() {
        saveCommonInputs();
        setStatus("正在登录并加载项目...");
        new Thread(() -> {
            try {
                JSONObject loginBody = new JSONObject();
                loginBody.put("name", accountInput.getText().toString().trim());
                HttpResult login = request("POST", "/auth/login", loginBody, null, null);
                if (login.code < 200 || login.code >= 300) {
                    throw new IllegalStateException("登录失败 HTTP " + login.code + " " + login.body);
                }
                String token = new JSONObject(login.body).getString("token");
                HttpResult projectResult = request("GET", "/projects", null, token, null);
                if (projectResult.code < 200 || projectResult.code >= 300) {
                    throw new IllegalStateException("项目加载失败 HTTP " + projectResult.code + " " + projectResult.body);
                }
                JSONArray array = new JSONArray(projectResult.body);
                List<ProjectOption> loaded = new ArrayList<>();
                for (int i = 0; i < array.length(); i++) {
                    JSONObject project = array.getJSONObject(i);
                    loaded.add(new ProjectOption(project.getString("id"), project.optString("name", project.getString("id"))));
                }
                prefs.edit()
                        .putString("authToken", token)
                        .putString("account", accountInput.getText().toString().trim())
                        .apply();
                runOnUiThread(() -> {
                    projects.clear();
                    projects.addAll(loaded);
                    ((ArrayAdapter<?>) projectSpinner.getAdapter()).notifyDataSetChanged();
                    restoreSavedProject();
                    setStatus("登录成功，已加载 " + loaded.size() + " 个项目。");
                });
            } catch (Exception ex) {
                setStatus("登录/加载项目失败：" + ex.getMessage());
            }
        }).start();
    }

    private void bindDevice() {
        saveCommonInputs();
        ProjectOption project = selectedProject();
        String token = prefs.getString("authToken", "");
        if (project == null) {
            setStatus("请先登录并选择项目。");
            return;
        }
        if (token.isEmpty()) {
            setStatus("请先登录获取账号凭证。");
            return;
        }
        setStatus("正在注册本机设备...");
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("projectId", project.id);
                body.put("name", deviceNameInput.getText().toString().trim());
                body.put("type", "phone");
                body.put("owner", ownerInput.getText().toString().trim());
                body.put("phone", phoneInput.getText().toString().trim());
                HttpResult result = request("POST", "/devices", body, token, null);
                if (result.code < 200 || result.code >= 300) {
                    throw new IllegalStateException("设备绑定失败 HTTP " + result.code + " " + result.body);
                }
                JSONObject device = new JSONObject(result.body);
                prefs.edit()
                        .putString("projectId", project.id)
                        .putString("projectName", project.name)
                        .putString("deviceId", device.getString("id"))
                        .putString("deviceToken", device.optString("deviceToken", ""))
                        .putString("deviceName", device.optString("name", deviceNameInput.getText().toString().trim()))
                        .putString("owner", ownerInput.getText().toString().trim())
                        .putString("phone", phoneInput.getText().toString().trim())
                        .apply();
                runOnUiThread(() -> {
                    refreshDeviceSummary();
                    setStatus("设备已绑定：" + prefs.getString("deviceId", ""));
                });
            } catch (Exception ex) {
                setStatus("设备绑定失败：" + ex.getMessage());
            }
        }).start();
    }

    private void startCollecting() {
        saveCommonInputs();
        if (!hasDeviceCredential()) {
            setStatus("请先注册/绑定本机设备。");
            return;
        }
        if (!hasLocationPermission()) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_PERMISSION);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION);
        }
        tryStartPreviewLocation();
        Intent intent = TrackingService.createStartIntent(this);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
        setStatus("后台定位服务已启动，每 30 秒上报一次。");
    }

    private void stopCollecting() {
        stopService(new Intent(this, TrackingService.class));
        stopAmapLocation();
        if (locationManager != null) {
            locationManager.removeUpdates(locationListener);
        }
        setStatus("后台定位服务已停止。");
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            setStatus(granted ? "定位权限已授权，请再次点击开始后台定位上报。" : "定位权限未授权，无法上报真实位置。");
        }
        if (requestCode == NOTIFICATION_PERMISSION) {
            setStatus("通知权限已处理，后台服务会用通知展示采集状态。");
        }
    }

    private void tryStartPreviewLocation() {
        try {
            startAmapLocation();
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10_000, 10, locationListener);
        } catch (SecurityException ex) {
            setStatus("定位权限不可用：" + ex.getMessage());
        } catch (Exception ex) {
            setStatus("高德定位启动失败，使用系统定位预览：" + ex.getMessage());
            try {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10_000, 10, locationListener);
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10_000, 10, locationListener);
            } catch (SecurityException ignored) {
                setStatus("系统定位也不可用，无法上报真实位置。");
            }
        }
    }

    private final LocationListener locationListener = location -> {
        if (isMockLocation(location)) {
            setStatus("检测到模拟位置，已忽略。请关闭开发者选项里的模拟定位。");
            return;
        }
        lastLocation = location;
        setStatus("最新定位：" + location.getLongitude() + ", " + location.getLatitude());
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
                setStatus("高德定位失败：" + message);
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
            setStatus("高德定位：" + location.getLongitude() + ", " + location.getLatitude() + "，精度 " + location.getAccuracy() + "m");
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

    private void uploadCurrentLocation() {
        if (!hasDeviceCredential()) {
            setStatus("请先注册/绑定本机设备。");
            return;
        }
        Location location = lastLocation;
        if (location == null) {
            setStatus("尚未获取真实定位，先启动定位并等待定位成功。");
            return;
        }
        if (isMockLocation(location)) {
            setStatus("当前是模拟位置，已阻止上报。");
            return;
        }
        new Thread(() -> {
            try {
                HttpResult result = postLocation(location);
                setStatus("立即上报完成，HTTP " + result.code);
            } catch (Exception ex) {
                setStatus("立即上报失败：" + ex.getMessage());
            }
        }).start();
    }

    private HttpResult postLocation(Location location) throws Exception {
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
        return request("POST", "/locations", body, null, prefs.getString("deviceToken", ""));
    }

    private HttpResult request(String method, String path, JSONObject body, String authToken, String deviceToken) throws Exception {
        URL url = new URL(apiBaseInput.getText().toString().trim() + path);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod(method);
        connection.setRequestProperty("Accept", "application/json");
        if (authToken != null && !authToken.isEmpty()) {
            connection.setRequestProperty("Authorization", "Bearer " + authToken);
        }
        if (deviceToken != null && !deviceToken.isEmpty()) {
            connection.setRequestProperty("X-Device-Token", deviceToken);
        }
        if (body != null) {
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setDoOutput(true);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
        }
        int code = connection.getResponseCode();
        String responseBody = readBody(code >= 400 ? connection.getErrorStream() : connection.getInputStream());
        connection.disconnect();
        return new HttpResult(code, responseBody);
    }

    private String readBody(InputStream stream) throws Exception {
        if (stream == null) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private void restoreSavedProject() {
        String savedProjectId = prefs.getString("projectId", "");
        if (projects.isEmpty()) {
            String projectName = prefs.getString("projectName", "");
            if (!savedProjectId.isEmpty()) {
                projects.add(new ProjectOption(savedProjectId, projectName.isEmpty() ? savedProjectId : projectName));
            }
        }
        for (int i = 0; i < projects.size(); i++) {
            if (projects.get(i).id.equals(savedProjectId)) {
                projectSpinner.setSelection(i);
                return;
            }
        }
    }

    private ProjectOption selectedProject() {
        Object selected = projectSpinner.getSelectedItem();
        return selected instanceof ProjectOption ? (ProjectOption) selected : null;
    }

    private void saveCommonInputs() {
        ProjectOption project = selectedProject();
        SharedPreferences.Editor editor = prefs.edit()
                .putString("apiBase", apiBaseInput.getText().toString().trim())
                .putString("account", accountInput.getText().toString().trim())
                .putString("deviceName", deviceNameInput.getText().toString().trim())
                .putString("owner", ownerInput.getText().toString().trim())
                .putString("phone", phoneInput.getText().toString().trim());
        if (project != null) {
            editor.putString("projectId", project.id).putString("projectName", project.name);
        }
        editor.apply();
    }

    private boolean hasDeviceCredential() {
        return !prefs.getString("projectId", "").isEmpty()
                && !prefs.getString("deviceId", "").isEmpty()
                && !prefs.getString("deviceToken", "").isEmpty();
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
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

    private void refreshDeviceSummary() {
        String text = "当前项目：" + prefs.getString("projectName", prefs.getString("projectId", "未选择"))
                + "\n设备 ID：" + prefs.getString("deviceId", "未绑定")
                + "\n设备凭证：" + (prefs.getString("deviceToken", "").isEmpty() ? "未获取" : "已保存");
        currentDeviceView.setText(text);
    }

    private void setStatus(String text) {
        runOnUiThread(() -> statusView.setText(text));
    }

    private static class ProjectOption {
        final String id;
        final String name;

        ProjectOption(String id, String name) {
            this.id = id;
            this.name = name;
        }

        @Override
        public String toString() {
            return name + " (" + id + ")";
        }
    }

    private static class HttpResult {
        final int code;
        final String body;

        HttpResult(int code, String body) {
            this.code = code;
            this.body = body;
        }
    }
}
