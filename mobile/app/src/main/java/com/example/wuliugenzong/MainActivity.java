package com.example.wuliugenzong;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
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
import java.net.URLEncoder;
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
    private static final int BLUE = Color.rgb(25, 103, 210);
    private static final int GREEN = Color.rgb(24, 128, 56);
    private static final int RED = Color.rgb(186, 26, 26);
    private static final int TEXT = Color.rgb(34, 40, 49);
    private static final int MUTED = Color.rgb(92, 99, 112);
    private static final int PANEL = Color.rgb(245, 247, 250);

    private final List<ProjectOption> projects = new ArrayList<>();
    private final List<MemberOption> members = new ArrayList<>();
    private SharedPreferences prefs;
    private TextView statusView;
    private TextView progressView;
    private TextView summaryView;
    private EditText apiBaseInput;
    private EditText accountInput;
    private EditText deviceNameInput;
    private EditText navNameInput;
    private EditText navLongitudeInput;
    private EditText navLatitudeInput;
    private Spinner projectSpinner;
    private Spinner memberSpinner;
    private LocationManager locationManager;
    private AMapLocationClient amapLocationClient;
    private Location lastLocation;
    private int step = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        AMapLocationClient.updatePrivacyShow(this, true, true);
        AMapLocationClient.updatePrivacyAgree(this, true);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        step = prefs.getInt("step", hasDeviceCredential() ? 3 : 0);
        restoreCachedOptions();
        render();
    }

    @Override
    protected void onDestroy() {
        stopAmapLocation();
        if (locationManager != null) {
            locationManager.removeUpdates(locationListener);
        }
        super.onDestroy();
    }

    private void render() {
        setContentView(createPage());
        updateSummary();
    }

    private View createPage() {
        ScrollView scrollView = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(32, 36, 32, 36);
        scrollView.addView(root);

        TextView title = title("物流跟踪采集端");
        title.setTextSize(24);
        root.addView(title, fullWidth(0, 0, 0, 4));
        root.addView(small("手机端只负责身份确认、绑定本机设备、后台上报定位和辅助导航。项目和人员请先在 Web 管理端维护。"), fullWidth());
        root.addView(stepTabs(), fullWidth(0, 12, 0, 14));

        progressView = small(progressText());
        progressView.setGravity(Gravity.CENTER);
        root.addView(progressView, fullWidth(0, 0, 0, 12));

        if (step == 0) addLoginScreen(root);
        if (step == 1) addProjectScreen(root);
        if (step == 2) addDeviceScreen(root);
        if (step == 3) addTrackingScreen(root);
        if (step == 4) addNavigationScreen(root);

        statusView = small("");
        statusView.setTextColor(MUTED);
        statusView.setPadding(0, 18, 0, 0);
        root.addView(statusView, fullWidth());
        setStatus(defaultStatus());
        return scrollView;
    }

    private LinearLayout stepTabs() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        String[] labels = {"账号", "项目", "设备", "采集", "导航"};
        for (int i = 0; i < labels.length; i++) {
            int index = i;
            Button button = lightButton((i + 1) + " " + labels[i]);
            if (i == step) {
                button.setTextColor(Color.WHITE);
                button.setBackgroundColor(BLUE);
            }
            button.setOnClickListener(v -> goStep(index));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
            params.setMargins(3, 0, 3, 0);
            row.addView(button, params);
        }
        return row;
    }

    private void addLoginScreen(LinearLayout root) {
        root.addView(section("账号登录", "输入 Web 已配置的项目成员姓名。登录成功后，App 只会看到这个成员有权限访问的项目。"));
        apiBaseInput = input("后端地址", prefs.getString("apiBase", defaultApiBase()));
        root.addView(apiBaseInput, fullWidth());
        accountInput = input("成员姓名，例如 上海调度员", prefs.getString("account", "上海调度员"));
        root.addView(accountInput, fullWidth());
        Button login = primaryButton("登录并加载项目");
        login.setOnClickListener(v -> loginAndLoadProjects());
        root.addView(login, fullWidth(0, 12, 0, 0));
        root.addView(info("没有账号或项目？请先在 Web 管理端创建项目成员，再回到手机端登录。"));
    }

    private void addProjectScreen(LinearLayout root) {
        root.addView(section("选择项目和成员", "项目成员来自 Web 管理端。App 不创建人员，只确认这台手机要代表哪个项目成员上报定位。"));
        if (projects.isEmpty()) {
            root.addView(info("还没有加载项目，请先回到第 1 步登录。"));
        } else {
            projectSpinner = new Spinner(this);
            projectSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, projects));
            selectProject(prefs.getString("projectId", ""));
            root.addView(projectSpinner, fullWidth());
            Button loadMembers = primaryButton("加载该项目成员");
            loadMembers.setOnClickListener(v -> loadMembersForSelectedProject());
            root.addView(loadMembers, fullWidth());
        }
        if (!members.isEmpty()) {
            memberSpinner = new Spinner(this);
            memberSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, members));
            selectMember(prefs.getString("memberId", ""));
            root.addView(memberSpinner, fullWidth(0, 16, 0, 0));
            Button confirm = primaryButton("确认成员身份");
            confirm.setOnClickListener(v -> confirmMember());
            root.addView(confirm, fullWidth());
        } else {
            root.addView(info("加载成员后，如果列表为空，请到 Web 管理端给该项目添加成员。"));
        }
        root.addView(navRow("上一步", "下一步", () -> goStep(0), () -> goStep(2)));
    }

    private void addDeviceScreen(LinearLayout root) {
        root.addView(section("绑定本机设备", "这里绑定的是这台手机。后端会返回设备凭证，之后所有定位上报都会带这个凭证。"));
        summaryView = small("");
        summaryView.setTextColor(TEXT);
        summaryView.setBackgroundColor(PANEL);
        summaryView.setPadding(20, 20, 20, 20);
        root.addView(summaryView, fullWidth());
        deviceNameInput = input("本机设备名称", prefs.getString("deviceName", Build.MODEL + " 采集端"));
        root.addView(deviceNameInput, fullWidth());
        Button bind = primaryButton(hasDeviceCredential() ? "重新绑定/更新设备" : "绑定本机设备");
        bind.setOnClickListener(v -> bindDevice());
        root.addView(bind, fullWidth(0, 12, 0, 0));
        root.addView(info("人员姓名和手机号会使用上一步选择的 Web 项目成员，不在手机端随意填写。"));
        root.addView(navRow("上一步", "下一步", () -> goStep(1), () -> goStep(3)));
    }

    private void addTrackingScreen(LinearLayout root) {
        root.addView(section("定位采集", "启动后会显示前台服务通知，并每 30 秒向后端上报一次真实定位。"));
        summaryView = small("");
        summaryView.setTextColor(TEXT);
        summaryView.setBackgroundColor(PANEL);
        summaryView.setPadding(20, 20, 20, 20);
        root.addView(summaryView, fullWidth());

        Button start = primaryButton("开始后台定位上报");
        start.setBackgroundColor(GREEN);
        start.setOnClickListener(v -> startCollecting());
        root.addView(start, fullWidth(0, 12, 0, 0));

        Button once = lightButton("立即上报一次");
        once.setOnClickListener(v -> uploadCurrentLocation());
        root.addView(once, fullWidth());

        Button stop = lightButton("停止后台上报");
        stop.setTextColor(RED);
        stop.setOnClickListener(v -> stopCollecting());
        root.addView(stop, fullWidth());

        root.addView(info("Web 管理端可以实时看到本机最新位置和轨迹。手机端不负责调度项目成员，只负责持续上报。"));
        root.addView(navRow("上一步", "去导航", () -> goStep(2), () -> goStep(4)));
    }

    private void addNavigationScreen(LinearLayout root) {
        root.addView(section("辅助导航", "定位上报和导航是两件事。这里可以唤起高德地图或系统地图进行路线导航，后台上报服务会继续运行。"));
        navNameInput = input("目的地名称", prefs.getString("navName", "项目目的地"));
        navLongitudeInput = input("目的地经度，例如 120.1569", prefs.getString("navLongitude", ""));
        navLatitudeInput = input("目的地纬度，例如 30.7964", prefs.getString("navLatitude", ""));
        root.addView(navNameInput, fullWidth());
        root.addView(navLongitudeInput, fullWidth());
        root.addView(navLatitudeInput, fullWidth());
        Button open = primaryButton("打开导航");
        open.setOnClickListener(v -> openNavigation());
        root.addView(open, fullWidth(0, 12, 0, 0));
        root.addView(info("后续可以从 Web 任务单下发目的地，现在先支持手动输入坐标并唤起地图。"));
        root.addView(navRow("回采集页", "回账号页", () -> goStep(3), () -> goStep(0)));
    }

    private LinearLayout section(String heading, String body) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(PANEL);
        box.setPadding(22, 22, 22, 22);
        box.addView(title(heading));
        box.addView(small(body));
        return box;
    }

    private TextView title(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(TEXT);
        view.setTextSize(20);
        view.setGravity(Gravity.START);
        return view;
    }

    private TextView small(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(MUTED);
        view.setTextSize(14);
        view.setLineSpacing(4, 1);
        return view;
    }

    private TextView info(String text) {
        TextView view = small(text);
        view.setBackgroundColor(Color.rgb(238, 244, 255));
        view.setPadding(18, 18, 18, 18);
        return view;
    }

    private EditText input(String hint, String value) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setSingleLine(true);
        input.setText(value);
        input.setTextSize(16);
        return input;
    }

    private Button primaryButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(Color.WHITE);
        button.setBackgroundColor(BLUE);
        return button;
    }

    private Button lightButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(BLUE);
        button.setBackgroundColor(Color.rgb(235, 240, 248));
        return button;
    }

    private LinearLayout navRow(String leftText, String rightText, Runnable left, Runnable right) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button leftButton = lightButton(leftText);
        leftButton.setOnClickListener(v -> left.run());
        Button rightButton = primaryButton(rightText);
        rightButton.setOnClickListener(v -> right.run());
        row.addView(leftButton, weighted());
        row.addView(rightButton, weighted());
        return row;
    }

    private LinearLayout.LayoutParams weighted() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        params.setMargins(4, 12, 4, 0);
        return params;
    }

    private LinearLayout.LayoutParams fullWidth() {
        return fullWidth(0, 10, 0, 10);
    }

    private LinearLayout.LayoutParams fullWidth(int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(left, top, right, bottom);
        return params;
    }

    private String defaultApiBase() {
        return isEmulator() ? "http://10.0.2.2:4000/api" : "http://100.101.3.116:4000/api";
    }

    private boolean isEmulator() {
        return Build.FINGERPRINT.contains("generic") || Build.MODEL.contains("Emulator") || Build.MODEL.contains("sdk_gphone");
    }

    private String currentApiBase() {
        if (apiBaseInput != null) {
            return apiBaseInput.getText().toString().trim();
        }
        return prefs.getString("apiBase", defaultApiBase());
    }

    private void goStep(int nextStep) {
        int normalized = Math.max(0, Math.min(4, nextStep));
        if (!canEnterStep(normalized, true)) {
            return;
        }
        step = normalized;
        prefs.edit().putInt("step", step).apply();
        render();
    }

    private boolean canEnterStep(int targetStep, boolean announce) {
        if (targetStep <= 0) return true;
        if (targetStep == 1) {
            boolean ok = !prefs.getString("authToken", "").isEmpty() && !projects.isEmpty();
            if (!ok && announce) setStatus("请先在第 1 步登录并加载可见项目。");
            return ok;
        }
        if (targetStep == 2) {
            boolean ok = !prefs.getString("projectId", "").isEmpty() && !prefs.getString("memberId", "").isEmpty();
            if (!ok && announce) setStatus("请先在第 2 步确认项目和 Web 项目成员。");
            return ok;
        }
        if (targetStep >= 3) {
            boolean ok = hasDeviceCredential();
            if (!ok && announce) setStatus("请先在第 3 步绑定本机设备并获取设备凭证。");
            return ok;
        }
        return true;
    }

    private String progressText() {
        return "流程：" + (step + 1) + "/5  " + new String[]{"账号登录", "项目成员", "设备绑定", "定位采集", "辅助导航"}[step];
    }

    private String defaultStatus() {
        if (step == 0) return "请先用 Web 端已有项目成员登录。";
        if (step == 1) return "选择项目后加载成员，成员为空时请回 Web 管理端维护。";
        if (step == 2) return hasDeviceCredential() ? "设备已绑定，可以进入采集页。" : "请绑定这台手机，获取设备上报凭证。";
        if (step == 3) return "启动前请确认设备已绑定并授予定位权限。";
        return "输入目的地坐标后可以打开外部地图导航。";
    }

    private void loginAndLoadProjects() {
        String account = accountInput.getText().toString().trim();
        if (account.isEmpty()) {
            setStatus("请输入 Web 已配置的成员姓名。");
            return;
        }
        prefs.edit().putString("apiBase", currentApiBase()).putString("account", account).apply();
        setStatus("正在登录并加载可见项目...");
        new Thread(() -> {
            try {
                JSONObject loginBody = new JSONObject();
                loginBody.put("name", account);
                HttpResult login = request("POST", "/auth/login", loginBody, null, null);
                if (login.code < 200 || login.code >= 300) {
                    throw new IllegalStateException("登录失败 HTTP " + login.code + " " + login.body);
                }
                JSONObject loginJson = new JSONObject(login.body);
                String token = loginJson.getString("token");
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
                        .putString("account", account)
                        .putString("cachedProjects", projectResult.body)
                        .apply();
                runOnUiThread(() -> {
                    projects.clear();
                    projects.addAll(loaded);
                    members.clear();
                    setStatus(loaded.isEmpty() ? "登录成功，但没有可见项目。请在 Web 管理端给该成员分配项目。" : "登录成功，已加载 " + loaded.size() + " 个项目。");
                    if (!loaded.isEmpty()) {
                        goStep(1);
                    }
                });
            } catch (Exception ex) {
                setStatus("登录/加载项目失败：" + ex.getMessage());
            }
        }).start();
    }

    private void loadMembersForSelectedProject() {
        ProjectOption project = selectedProject();
        String token = prefs.getString("authToken", "");
        if (project == null) {
            setStatus("请先选择项目。");
            return;
        }
        if (token.isEmpty()) {
            setStatus("登录已失效，请回第 1 步重新登录。");
            return;
        }
        prefs.edit().putString("projectId", project.id).putString("projectName", project.name).apply();
        setStatus("正在加载 Web 项目成员...");
        new Thread(() -> {
            try {
                HttpResult result = request("GET", "/members?projectId=" + encode(project.id), null, token, null);
                if (result.code < 200 || result.code >= 300) {
                    throw new IllegalStateException("成员加载失败 HTTP " + result.code + " " + result.body);
                }
                JSONArray array = new JSONArray(result.body);
                List<MemberOption> loaded = new ArrayList<>();
                String account = prefs.getString("account", "");
                for (int i = 0; i < array.length(); i++) {
                    JSONObject member = array.getJSONObject(i);
                    loaded.add(new MemberOption(
                            member.getString("id"),
                            member.getString("projectId"),
                            member.optString("name", member.getString("id")),
                            member.optString("role", ""),
                            member.optString("phone", "")
                    ));
                }
                prefs.edit().putString("cachedMembers", result.body).apply();
                runOnUiThread(() -> {
                    members.clear();
                    members.addAll(loaded);
                    if (!account.isEmpty()) {
                        for (MemberOption member : loaded) {
                            if (member.name.equals(account)) {
                                saveMember(member);
                                break;
                            }
                        }
                    }
                    setStatus(loaded.isEmpty() ? "该项目没有成员。请先到 Web 管理端添加成员。" : "已加载 " + loaded.size() + " 个成员，请确认本机代表谁上报。");
                    render();
                });
            } catch (Exception ex) {
                setStatus("成员加载失败：" + ex.getMessage());
            }
        }).start();
    }

    private void confirmMember() {
        ProjectOption project = selectedProject();
        MemberOption member = selectedMember();
        if (project == null || member == null) {
            setStatus("请先选择项目和成员。");
            return;
        }
        prefs.edit().putString("projectId", project.id).putString("projectName", project.name).apply();
        saveMember(member);
        setStatus("已确认成员：" + member.name + "，可以绑定本机设备。");
        goStep(2);
    }

    private void bindDevice() {
        ProjectOption project = selectedProjectFromPrefs();
        String token = prefs.getString("authToken", "");
        String memberName = prefs.getString("memberName", "");
        if (project == null) {
            setStatus("请先在第 2 步确认项目。");
            return;
        }
        if (memberName.isEmpty()) {
            setStatus("请先在第 2 步确认 Web 项目成员。");
            return;
        }
        if (token.isEmpty()) {
            setStatus("登录已失效，请回第 1 步重新登录。");
            return;
        }
        String deviceName = deviceNameInput.getText().toString().trim();
        if (deviceName.isEmpty()) {
            setStatus("请输入本机设备名称。");
            return;
        }
        prefs.edit().putString("deviceName", deviceName).apply();
        setStatus("正在绑定本机设备...");
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("projectId", project.id);
                body.put("name", deviceName);
                body.put("type", "phone");
                body.put("owner", prefs.getString("memberName", ""));
                body.put("phone", prefs.getString("memberPhone", ""));
                HttpResult result = request("POST", "/devices", body, token, null);
                if (result.code < 200 || result.code >= 300) {
                    throw new IllegalStateException("设备绑定失败 HTTP " + result.code + " " + result.body);
                }
                JSONObject device = new JSONObject(result.body);
                prefs.edit()
                        .putString("deviceId", device.getString("id"))
                        .putString("deviceToken", device.optString("deviceToken", ""))
                        .putString("deviceName", device.optString("name", deviceName))
                        .apply();
                runOnUiThread(() -> {
                    setStatus("设备已绑定，可以启动定位采集。");
                    goStep(3);
                });
            } catch (Exception ex) {
                setStatus("设备绑定失败：" + ex.getMessage());
            }
        }).start();
    }

    private void startCollecting() {
        if (!hasDeviceCredential()) {
            setStatus("请先完成设备绑定。");
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
        setStatus("最新定位：" + trim(location.getLongitude()) + ", " + trim(location.getLatitude()));
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
            setStatus("高德定位：" + trim(location.getLongitude()) + ", " + trim(location.getLatitude()) + "，精度 " + trim(location.getAccuracy()) + "m");
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
            setStatus("请先完成设备绑定。");
            return;
        }
        Location location = lastLocation;
        if (location == null) {
            setStatus("尚未获取真实定位，请先启动定位并等待定位成功。");
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

    private void openNavigation() {
        try {
            String name = navNameInput.getText().toString().trim();
            String longitudeText = navLongitudeInput.getText().toString().trim();
            String latitudeText = navLatitudeInput.getText().toString().trim();
            double longitude = Double.parseDouble(longitudeText);
            double latitude = Double.parseDouble(latitudeText);
            prefs.edit().putString("navName", name).putString("navLongitude", longitudeText).putString("navLatitude", latitudeText).apply();

            String encodedName = encode(name.isEmpty() ? "目的地" : name);
            Uri amap = Uri.parse("amapuri://route/plan/?dlat=" + latitude + "&dlon=" + longitude + "&dname=" + encodedName + "&dev=0&t=0");
            Intent intent = new Intent(Intent.ACTION_VIEW, amap);
            try {
                startActivity(intent);
                setStatus("已打开高德导航。后台定位上报会继续运行。");
            } catch (Exception ignored) {
                Uri geo = Uri.parse("geo:0,0?q=" + latitude + "," + longitude + "(" + encodedName + ")");
                startActivity(new Intent(Intent.ACTION_VIEW, geo));
                setStatus("未找到高德地图，已尝试打开系统地图。");
            }
        } catch (Exception ex) {
            setStatus("导航打开失败，请检查目的地经纬度：" + ex.getMessage());
        }
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

    private void restoreCachedOptions() {
        parseProjects(prefs.getString("cachedProjects", ""));
        parseMembers(prefs.getString("cachedMembers", ""));
        String savedProjectId = prefs.getString("projectId", "");
        String savedProjectName = prefs.getString("projectName", "");
        if (projects.isEmpty() && !savedProjectId.isEmpty()) {
            projects.add(new ProjectOption(savedProjectId, savedProjectName.isEmpty() ? savedProjectId : savedProjectName));
        }
    }

    private void parseProjects(String json) {
        if (json == null || json.isEmpty()) return;
        try {
            JSONArray array = new JSONArray(json);
            projects.clear();
            for (int i = 0; i < array.length(); i++) {
                JSONObject project = array.getJSONObject(i);
                projects.add(new ProjectOption(project.getString("id"), project.optString("name", project.getString("id"))));
            }
        } catch (Exception ignored) {
            projects.clear();
        }
    }

    private void parseMembers(String json) {
        if (json == null || json.isEmpty()) return;
        try {
            JSONArray array = new JSONArray(json);
            members.clear();
            for (int i = 0; i < array.length(); i++) {
                JSONObject member = array.getJSONObject(i);
                members.add(new MemberOption(
                        member.getString("id"),
                        member.getString("projectId"),
                        member.optString("name", member.getString("id")),
                        member.optString("role", ""),
                        member.optString("phone", "")
                ));
            }
        } catch (Exception ignored) {
            members.clear();
        }
    }

    private void selectProject(String projectId) {
        if (projectSpinner == null) return;
        for (int i = 0; i < projects.size(); i++) {
            if (projects.get(i).id.equals(projectId)) {
                projectSpinner.setSelection(i);
                return;
            }
        }
    }

    private void selectMember(String memberId) {
        if (memberSpinner == null) return;
        for (int i = 0; i < members.size(); i++) {
            if (members.get(i).id.equals(memberId)) {
                memberSpinner.setSelection(i);
                return;
            }
        }
    }

    private ProjectOption selectedProject() {
        Object selected = projectSpinner == null ? null : projectSpinner.getSelectedItem();
        return selected instanceof ProjectOption ? (ProjectOption) selected : null;
    }

    private ProjectOption selectedProjectFromPrefs() {
        String id = prefs.getString("projectId", "");
        String name = prefs.getString("projectName", id);
        return id.isEmpty() ? null : new ProjectOption(id, name);
    }

    private MemberOption selectedMember() {
        Object selected = memberSpinner == null ? null : memberSpinner.getSelectedItem();
        return selected instanceof MemberOption ? (MemberOption) selected : null;
    }

    private void saveMember(MemberOption member) {
        prefs.edit()
                .putString("memberId", member.id)
                .putString("memberName", member.name)
                .putString("memberRole", member.role)
                .putString("memberPhone", member.phone)
                .apply();
    }

    private void updateSummary() {
        if (summaryView == null) return;
        String project = prefs.getString("projectName", "未确认");
        String member = prefs.getString("memberName", "未确认");
        String phone = prefs.getString("memberPhone", "");
        String device = prefs.getString("deviceName", "未绑定");
        String deviceId = prefs.getString("deviceId", "未绑定");
        String credential = prefs.getString("deviceToken", "").isEmpty() ? "未获取" : "已保存";
        summaryView.setText("项目：" + project
                + "\n成员：" + member + (phone.isEmpty() ? "" : " / " + phone)
                + "\n本机设备：" + device
                + "\n设备 ID：" + deviceId
                + "\n设备凭证：" + credential);
    }

    private boolean hasDeviceCredential() {
        return !prefs.getString("projectId", "").isEmpty()
                && !prefs.getString("memberId", "").isEmpty()
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

    private String trim(double value) {
        return String.format(Locale.US, "%.6f", value);
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private void setStatus(String text) {
        runOnUiThread(() -> {
            if (statusView != null) {
                statusView.setText(text);
            }
        });
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

    private static class MemberOption {
        final String id;
        final String projectId;
        final String name;
        final String role;
        final String phone;

        MemberOption(String id, String projectId, String name, String role, String phone) {
            this.id = id;
            this.projectId = projectId;
            this.name = name;
            this.role = role;
            this.phone = phone;
        }

        @Override
        public String toString() {
            return name + " / " + role + (phone.isEmpty() ? "" : " / " + phone);
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
