package com.example.wuliugenzong;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
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
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class MainActivity extends Activity {
    private static final int LOCATION_PERMISSION = 1001;
    private static final int NOTIFICATION_PERMISSION = 1002;
    private static final int SCREEN_LOGIN = 0;
    private static final int SCREEN_WORKSPACE = 1;
    private static final int SCREEN_TRACKING = 2;

    private static final String PREFS = "wuliu-mobile";
    private static final String KEY_TRACKING_RUNNING = "trackingRunning";
    private static final String KEY_SERVICE_STATUS = "serviceStatus";
    private static final String KEY_LAST_LOCATION_TEXT = "lastLocationText";
    private static final String KEY_LAST_UPLOAD_TEXT = "lastUploadText";

    private SharedPreferences prefs;
    private LocationManager locationManager;
    private AMapLocationClient amapLocationClient;
    private Location lastLocation;
    private int currentScreen = SCREEN_LOGIN;

    private View loginScreen;
    private View workspaceScreen;
    private View trackingScreen;
    private EditText phoneInput;
    private EditText passwordInput;
    private EditText apiBaseInput;
    private TextView loginStatusView;
    private TextView workspaceMemberView;
    private TextView workspaceProjectView;
    private TextView workspaceDeviceView;
    private TextView workspaceStatusView;
    private TextView trackingStateView;
    private TextView trackingNoticeView;
    private TextView trackingSummaryView;
    private TextView trackingLocationView;
    private TextView trackingUploadView;
    private Button loginButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        AMapLocationClient.updatePrivacyShow(this, true, true);
        AMapLocationClient.updatePrivacyAgree(this, true);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        setContentView(R.layout.activity_main);
        bindViews();
        bindActions();
        hydrateInputs();
        currentScreen = hasAuthenticatedSession() ? prefs.getInt("screen", SCREEN_WORKSPACE) : SCREEN_LOGIN;
        refreshWorkspacePanel();
        refreshTrackingPanel();
        showScreen(hasAuthenticatedSession() ? currentScreen : SCREEN_LOGIN);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshWorkspacePanel();
        refreshTrackingPanel();
    }

    @Override
    protected void onDestroy() {
        stopPreviewLocation();
        super.onDestroy();
    }

    private void bindViews() {
        loginScreen = findViewById(R.id.login_screen);
        workspaceScreen = findViewById(R.id.workspace_screen);
        trackingScreen = findViewById(R.id.tracking_screen);
        phoneInput = findViewById(R.id.input_phone);
        passwordInput = findViewById(R.id.input_password);
        apiBaseInput = findViewById(R.id.input_api_base);
        loginStatusView = findViewById(R.id.text_login_status);
        workspaceMemberView = findViewById(R.id.text_workspace_member);
        workspaceProjectView = findViewById(R.id.text_workspace_project);
        workspaceDeviceView = findViewById(R.id.text_workspace_device);
        workspaceStatusView = findViewById(R.id.text_workspace_status);
        trackingStateView = findViewById(R.id.text_tracking_state);
        trackingNoticeView = findViewById(R.id.text_tracking_notice);
        trackingSummaryView = findViewById(R.id.text_tracking_summary);
        trackingLocationView = findViewById(R.id.text_tracking_location);
        trackingUploadView = findViewById(R.id.text_tracking_upload);
        loginButton = findViewById(R.id.button_login);
    }

    private void bindActions() {
        loginButton.setOnClickListener(v -> attemptLogin());
        findViewById(R.id.button_logout).setOnClickListener(v -> logout());
        findViewById(R.id.tile_collect).setOnClickListener(v -> showScreen(SCREEN_TRACKING));
        findViewById(R.id.button_back_workspace).setOnClickListener(v -> showScreen(SCREEN_WORKSPACE));
        findViewById(R.id.button_start_collect).setOnClickListener(v -> startCollecting());
        findViewById(R.id.button_upload_once).setOnClickListener(v -> uploadCurrentLocation());
        findViewById(R.id.button_stop_collect).setOnClickListener(v -> stopCollecting());
    }

    private void hydrateInputs() {
        apiBaseInput.setText(prefs.getString("apiBase", defaultApiBase()));
        phoneInput.setText(prefs.getString("accountPhone", ""));
        passwordInput.setText("");
        setLoginStatus(hasAuthenticatedSession() ? "已保存登录状态，可直接进入工作区。" : "请输入 Web 管理端预置的成员账号。");
    }

    private void showScreen(int screen) {
        if (screen != SCREEN_LOGIN && !hasAuthenticatedSession()) {
            screen = SCREEN_LOGIN;
        }
        if (screen == SCREEN_TRACKING && !hasDeviceCredential()) {
            screen = SCREEN_WORKSPACE;
            setWorkspaceStatus("当前成员尚未完成本机绑定，请重新登录后自动绑定。");
        }
        currentScreen = screen;
        prefs.edit().putInt("screen", currentScreen).apply();
        loginScreen.setVisibility(screen == SCREEN_LOGIN ? View.VISIBLE : View.GONE);
        workspaceScreen.setVisibility(screen == SCREEN_WORKSPACE ? View.VISIBLE : View.GONE);
        trackingScreen.setVisibility(screen == SCREEN_TRACKING ? View.VISIBLE : View.GONE);
        refreshWorkspacePanel();
        refreshTrackingPanel();
    }

    private void attemptLogin() {
        final String phone = phoneInput.getText().toString().trim();
        final String password = passwordInput.getText().toString().trim();
        if (phone.isEmpty()) {
            setLoginStatus("请输入手机号账号。");
            return;
        }
        if (password.isEmpty()) {
            setLoginStatus("请输入登录密码。");
            return;
        }
        prefs.edit().putString("apiBase", currentApiBase()).putString("accountPhone", phone).apply();
        setLoginStatus("正在登录并自动绑定本机...");
        loginButton.setEnabled(false);
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("phone", phone);
                body.put("password", password);
                HttpResult loginResult = request("POST", "/auth/login", body, null, null);
                if (loginResult.code < 200 || loginResult.code >= 300) {
                    throw new IllegalStateException("登录失败 HTTP " + loginResult.code);
                }
                JSONObject loginJson = new JSONObject(loginResult.body);
                JSONObject member = loginJson.optJSONObject("member");
                JSONArray projects = loginJson.optJSONArray("projects");
                if (member == null) {
                    throw new IllegalStateException("当前账号不是已配置项目成员。");
                }
                if (projects == null || projects.length() == 0) {
                    throw new IllegalStateException("该成员尚未分配项目。");
                }
                JSONObject project = selectProject(projects, prefs.getString("projectId", ""));
                if (project == null) {
                    throw new IllegalStateException("未找到可用项目。");
                }
                String token = loginJson.getString("token");
                String memberId = member.optString("id", "");
                String memberName = member.optString("name", "");
                String memberPhone = member.optString("phone", phone);
                String memberRole = member.optString("role", "");
                String projectId = project.getString("id");
                String projectName = project.optString("name", projectId);
                boolean reuseExistingDevice = hasDeviceCredential()
                        && projectId.equals(prefs.getString("projectId", ""))
                        && memberPhone.equals(prefs.getString("memberPhone", ""));

                SharedPreferences.Editor editor = prefs.edit();
                editor.putString("authToken", token);
                editor.putString("memberId", memberId);
                editor.putString("memberName", memberName);
                editor.putString("memberPhone", memberPhone);
                editor.putString("memberRole", memberRole);
                editor.putString("projectId", projectId);
                editor.putString("projectName", projectName);
                editor.putString("accountPhone", memberPhone);
                editor.apply();

                ensureBoundDevice(token, projectId, memberName, memberPhone, reuseExistingDevice);
                rememberTrackingState(false, "设备已自动绑定，进入工作区后可直接开启采集。");
                setLastUploadText("最近上报：尚未开始");
                runOnUiThread(() -> {
                    passwordInput.setText("");
                    loginButton.setEnabled(true);
                    refreshWorkspacePanel();
                    refreshTrackingPanel();
                    showScreen(SCREEN_WORKSPACE);
                    setWorkspaceStatus("登录成功，已自动绑定本机设备。");
                });
            } catch (Exception ex) {
                runOnUiThread(() -> loginButton.setEnabled(true));
                setLoginStatus("登录失败：" + ex.getMessage());
            }
        }).start();
    }

    private JSONObject selectProject(JSONArray projects, String preferredProjectId) throws Exception {
        if (projects == null || projects.length() == 0) {
            return null;
        }
        if (preferredProjectId != null && !preferredProjectId.isEmpty()) {
            for (int i = 0; i < projects.length(); i++) {
                JSONObject project = projects.getJSONObject(i);
                if (preferredProjectId.equals(project.optString("id"))) {
                    return project;
                }
            }
        }
        return projects.getJSONObject(0);
    }

    private void ensureBoundDevice(String authToken, String projectId, String memberName, String memberPhone, boolean reuseExistingDevice) throws Exception {
        if (reuseExistingDevice) {
            return;
        }
        String deviceName = prefs.getString("deviceName", defaultDeviceName(memberPhone));
        JSONObject body = new JSONObject();
        body.put("projectId", projectId);
        body.put("name", deviceName);
        body.put("type", "phone");
        body.put("owner", memberName);
        body.put("phone", memberPhone);
        HttpResult result = request("POST", "/devices", body, authToken, null);
        if (result.code < 200 || result.code >= 300) {
            throw new IllegalStateException("自动绑定设备失败 HTTP " + result.code);
        }
        JSONObject device = new JSONObject(result.body);
        prefs.edit()
                .putString("deviceId", device.optString("id", ""))
                .putString("deviceToken", device.optString("deviceToken", ""))
                .putString("deviceName", device.optString("name", deviceName))
                .apply();
    }

    private void startCollecting() {
        if (!hasDeviceCredential()) {
            setTrackingNotice("请先重新登录，让系统自动绑定本机设备。");
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
        rememberTrackingState(true, "后台采集已启动，每 30 秒自动上报一次。");
        refreshTrackingPanel();
    }

    private void stopCollecting() {
        stopService(new Intent(this, TrackingService.class));
        stopPreviewLocation();
        rememberTrackingState(false, "后台采集已停止。");
        refreshTrackingPanel();
    }

    private void tryStartPreviewLocation() {
        try {
            startAmapLocation();
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10_000, 10, locationListener);
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10_000, 10, locationListener);
        } catch (SecurityException ex) {
            setTrackingNotice("定位权限不可用：" + ex.getMessage());
        } catch (Exception ex) {
            setTrackingNotice("高德定位启动失败，尝试系统定位：" + ex.getMessage());
            try {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10_000, 10, locationListener);
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10_000, 10, locationListener);
            } catch (SecurityException ignored) {
                setTrackingNotice("系统定位也不可用，无法采集真实位置。");
            }
        }
    }

    private void stopPreviewLocation() {
        stopAmapLocation();
        if (locationManager != null) {
            locationManager.removeUpdates(locationListener);
        }
    }

    private final LocationListener locationListener = location -> {
        if (isMockLocation(location)) {
            setTrackingNotice("检测到模拟位置，当前定位已忽略。");
            return;
        }
        lastLocation = location;
        setLastLocationText("最新定位：" + trim(location.getLongitude()) + ", " + trim(location.getLatitude()));
        setTrackingNotice("已获取真实定位，可随时上报。");
        refreshTrackingPanel();
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
                setTrackingNotice("高德定位失败：" + message);
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
            setLastLocationText("最新定位：" + trim(location.getLongitude()) + ", " + trim(location.getLatitude()) + " / 精度 " + trim(location.getAccuracy()) + "m");
            setTrackingNotice("高德定位已连接。");
            refreshTrackingPanel();
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
            setTrackingNotice("请先重新登录，完成本机设备绑定。");
            return;
        }
        Location location = lastLocation;
        if (location == null) {
            setTrackingNotice("尚未拿到真实定位，请先点击开始采集。");
            return;
        }
        if (isMockLocation(location)) {
            setTrackingNotice("当前是模拟位置，已阻止上报。");
            return;
        }
        setTrackingNotice("正在上报当前位置...");
        new Thread(() -> {
            try {
                HttpResult result = postLocation(location);
                setLastUploadText("最近上报：" + nowText() + " / HTTP " + result.code);
                setTrackingNotice("当前位置已成功上报。");
                refreshTrackingPanel();
            } catch (Exception ex) {
                setTrackingNotice("上报失败：" + ex.getMessage());
            }
        }).start();
    }

    private HttpResult postLocation(Location location) throws Exception {
        JSONObject body = new JSONObject();
        body.put("projectId", prefs.getString("projectId", ""));
        body.put("deviceId", prefs.getString("deviceId", ""));
        body.put("deviceName", prefs.getString("deviceName", ""));
        body.put("owner", prefs.getString("memberName", ""));
        body.put("phone", prefs.getString("memberPhone", ""));
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

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            setTrackingNotice(granted ? "定位权限已授权，请再次点击开始采集。" : "未授予定位权限，无法采集真实位置。");
        }
        if (requestCode == NOTIFICATION_PERMISSION) {
            setTrackingNotice("通知权限已处理，后台采集将通过通知展示状态。");
        }
    }

    private void logout() {
        stopCollecting();
        prefs.edit()
                .remove("authToken")
                .remove("memberId")
                .remove("memberName")
                .remove("memberPhone")
                .remove("memberRole")
                .remove("projectId")
                .remove("projectName")
                .remove("deviceId")
                .remove("deviceToken")
                .remove(KEY_TRACKING_RUNNING)
                .remove(KEY_SERVICE_STATUS)
                .remove(KEY_LAST_LOCATION_TEXT)
                .remove(KEY_LAST_UPLOAD_TEXT)
                .apply();
        passwordInput.setText("");
        setLoginStatus("已退出登录。");
        showScreen(SCREEN_LOGIN);
    }

    private void refreshWorkspacePanel() {
        workspaceMemberView.setText(prefs.getString("memberName", "未登录"));
        workspaceProjectView.setText("项目：" + prefs.getString("projectName", "未分配") + "  /  账号：" + prefs.getString("memberPhone", "未登录"));
        workspaceDeviceView.setText("本机设备：" + prefs.getString("deviceName", defaultDeviceName(prefs.getString("memberPhone", ""))));
        String deviceText = hasDeviceCredential() ? "本机已自动绑定，可直接进入定位采集。" : "等待自动绑定本机设备。";
        workspaceStatusView.setText(deviceText + "\n" + prefs.getString(KEY_SERVICE_STATUS, "未开启后台采集。"));
    }

    private void refreshTrackingPanel() {
        boolean running = prefs.getBoolean(KEY_TRACKING_RUNNING, false);
        trackingStateView.setText(running ? "采集中" : "未采集");
        trackingNoticeView.setText(prefs.getString(KEY_SERVICE_STATUS, "登录后自动绑定本机，再开启后台采集。"));
        trackingSummaryView.setText(
                "项目：" + prefs.getString("projectName", "未分配")
                        + "\n成员：" + prefs.getString("memberName", "未登录")
                        + "\n手机号：" + prefs.getString("memberPhone", "未登录")
                        + "\n设备：" + prefs.getString("deviceName", defaultDeviceName(prefs.getString("memberPhone", "")))
        );
        trackingLocationView.setText(prefs.getString(KEY_LAST_LOCATION_TEXT, "最新定位：尚未获取"));
        trackingUploadView.setText(prefs.getString(KEY_LAST_UPLOAD_TEXT, "最近上报：尚未开始"));
    }

    private void rememberTrackingState(boolean running, String status) {
        prefs.edit()
                .putBoolean(KEY_TRACKING_RUNNING, running)
                .putString(KEY_SERVICE_STATUS, status)
                .apply();
        runOnUiThread(this::refreshTrackingPanel);
    }

    private void setLastLocationText(String text) {
        prefs.edit().putString(KEY_LAST_LOCATION_TEXT, text).apply();
    }

    private void setLastUploadText(String text) {
        prefs.edit().putString(KEY_LAST_UPLOAD_TEXT, text).apply();
    }

    private void setLoginStatus(String text) {
        runOnUiThread(() -> loginStatusView.setText(text));
    }

    private void setWorkspaceStatus(String text) {
        runOnUiThread(() -> workspaceStatusView.setText(text));
    }

    private void setTrackingNotice(String text) {
        prefs.edit().putString(KEY_SERVICE_STATUS, text).apply();
        runOnUiThread(this::refreshTrackingPanel);
    }

    private boolean hasAuthenticatedSession() {
        return !prefs.getString("authToken", "").isEmpty()
                && !prefs.getString("memberPhone", "").isEmpty()
                && !prefs.getString("projectId", "").isEmpty();
    }

    private boolean hasDeviceCredential() {
        return !prefs.getString("deviceId", "").isEmpty()
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

    private String defaultApiBase() {
        return isEmulator() ? "http://10.0.2.2:4000/api" : "http://100.101.3.116:4000/api";
    }

    private boolean isEmulator() {
        return Build.FINGERPRINT.contains("generic") || Build.MODEL.contains("Emulator") || Build.MODEL.contains("sdk_gphone");
    }

    private String currentApiBase() {
        String value = apiBaseInput.getText().toString().trim();
        return value.isEmpty() ? defaultApiBase() : value;
    }

    private String defaultDeviceName(String phone) {
        String brand = Build.BRAND == null ? "" : Build.BRAND.trim();
        String model = Build.MODEL == null ? "Android设备" : Build.MODEL.trim();
        String suffix = phone.length() >= 4 ? phone.substring(phone.length() - 4) : phone;
        String name = (brand + " " + model).trim();
        if (name.isEmpty()) {
            name = "Android设备";
        }
        return suffix.isEmpty() ? name : name + "-" + suffix;
    }

    private HttpResult request(String method, String path, JSONObject body, String authToken, String deviceToken) throws Exception {
        URL url = new URL(currentApiBase() + path);
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

    private String utcNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private String nowText() {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.CHINA).format(new Date());
    }

    private String trim(double value) {
        return String.format(Locale.US, "%.6f", value);
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
