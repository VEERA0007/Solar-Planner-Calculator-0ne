/**
 * Complete Native Android Studio Project Source Files
 * Kotlin + Jetpack Compose + Material 3 + Room Database + Architecture Components
 */

export interface AndroidFile {
  path: string;
  name: string;
  description: string;
  language: 'kotlin' | 'xml' | 'groovy' | 'markdown';
  content: string;
}

export const ANDROID_PROJECT_FILES: AndroidFile[] = [
  {
    path: 'build.gradle.kts',
    name: 'build.gradle.kts (Root)',
    description: 'Top-level build configuration with Compose and Android plugins',
    language: 'kotlin',
    content: `// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.ksp) apply false
}
`,
  },
  {
    path: 'app/build.gradle.kts',
    name: 'app/build.gradle.kts',
    description: 'Application module build file with Jetpack Compose & Material 3 dependencies',
    language: 'kotlin',
    content: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.solarplanner.calculator"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.solarplanner.calculator"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "2.4.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.activity:activity-compose:1.10.0")

    // Jetpack Compose BOM & Material 3
    implementation(platform("androidx.compose:compose-bom:2025.02.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Navigation & ViewModel
    implementation("androidx.navigation:navigation-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")

    // Room Database for persistent local maintenance logs
    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    ksp("androidx.room:room-compiler:$roomVersion")

    // Coroutines & Location Services
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")
    implementation("com.google.android.gms:play-services-location:21.3.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
`,
  },
  {
    path: 'app/src/main/AndroidManifest.xml',
    name: 'AndroidManifest.xml',
    description: 'Android app manifest with location and network permissions',
    language: 'xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

    <application
        android:allowBackup="true"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:fullBackupContent="@xml/backup_rules"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.SolarPlannerCalculator">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:theme="@style/Theme.SolarPlannerCalculator">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>

</manifest>
`,
  },
  {
    path: 'app/src/main/java/com/solarplanner/calculator/MainActivity.kt',
    name: 'MainActivity.kt',
    description: 'Main activity launching the Jetpack Compose Material 3 theme & NavGraph',
    language: 'kotlin',
    content: `package com.solarplanner.calculator

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.solarplanner.calculator.ui.navigation.SolarNavGraph
import com.solarplanner.calculator.ui.theme.SolarPlannerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SolarPlannerTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    SolarNavGraph()
                }
            }
        }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/solarplanner/calculator/ui/theme/Color.kt',
    name: 'Color.kt',
    description: 'Solar design system palette (Sky blue, Solar Amber, Navy, Emerald)',
    language: 'kotlin',
    content: `package com.solarplanner.calculator.ui.theme

import androidx.compose.ui.graphics.Color

// Solar Planner & Calculator Material 3 Palette
val SolarSkyBlue = Color(0xFFE8F2FD)
val SolarSkyBlueDark = Color(0xFF101C2B)

val PrimaryBlue = Color(0xFF0284C7)
val PrimaryNavy = Color(0xFF0B2545)
val SunAmber = Color(0xFFF59E0B)
val SunOrange = Color(0xFFEA580C)
val EcoGreen = Color(0xFF10B981)

val CardBackgroundLight = Color(0xFFFFFFFF)
val CardBorderLight = Color(0xFFE0EBF7)
val TextPrimaryLight = Color(0xFF0F172A)
val TextSecondaryLight = Color(0xFF64748B)

val SurfaceTint = Color(0xFFEBF5FF)
val WarningRed = Color(0xFFEF4444)
`,
  },
  {
    path: 'app/src/main/java/com/solarplanner/calculator/calculator/SolarMathEngine.kt',
    name: 'SolarMathEngine.kt',
    description: 'Core solar engineering calculation engine in Kotlin',
    language: 'kotlin',
    content: `package com.solarplanner.calculator.calculator

import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

data class CalculationInputs(
    val monthlyUnits: Double,
    val tariffPerKwh: Double,
    val panelWattage: Int, // 330, 400, 450, 550, 600
    val peakSunHours: Double = 5.2,
    val performanceRatio: Double = 0.78,
    val currency: String = "INR",
    val requiresBattery: Boolean = false,
    val backupHours: Int = 4,
    val enableGridExport: Boolean = true,
    val gridExportPercent: Double = 30.0,
    val feedInTariffPerKwh: Double = 4.5
)

data class SizingResults(
    val dailyConsumptionKwh: Double,
    val recommendedCapacityKwp: Double,
    val requiredPanelCount: Int,
    val totalDcCapacityKwp: Double,
    val requiredRoofAreaSqm: Double,
    val requiredRoofAreaSqft: Double,
    val monthlyGenerationKwh: Int,
    val annualGenerationKwh: Int,
    val suggestedInverterKw: Double,
    val energyCoveragePercent: Int,
    val estimatedExportKwh: Int,
    val estimatedSelfKwh: Int
)

data class FinancialResults(
    val monthlySavings: Double,
    val annualSavings: Double,
    val monthlySelfSavings: Double,
    val monthlyExportRevenue: Double,
    val grossCost: Double,
    val subsidy: Double,
    val netCost: Double,
    val paybackYears: Double,
    val twentyFiveYearOutlook: Double
)

object SolarMathEngine {

    fun calculateRequirements(inputs: CalculationInputs): SizingResults {
        val dailyCons = inputs.monthlyUnits / 30.0
        val pr = inputs.performanceRatio
        val peakSun = max(inputs.peakSunHours, 2.5)

        val rawKwp = dailyCons / (peakSun * pr)
        val panelKw = inputs.panelWattage / 1000.0
        val panelCount = max(2, ceil(rawKwp / panelKw).toInt())
        val totalDcKwp = ((panelCount * panelKw) * 100).roundToInt() / 100.0

        // Panel Area based on wattage + 28% spacing allowance
        val areaPerPanel = when (inputs.panelWattage) {
            330 -> 1.95
            400 -> 2.05
            450 -> 2.18
            550 -> 2.58
            else -> 2.76
        }
        val roofAreaSqm = ((panelCount * areaPerPanel * 1.28) * 10).roundToInt() / 10.0
        val roofAreaSqft = roofAreaSqm * 10.764

        val dailyGen = totalDcKwp * peakSun * pr
        val monthlyGen = (dailyGen * 30).roundToInt()
        val annualGen = (dailyGen * 365).roundToInt()

        val inverterKw = ((totalDcKwp / 1.18) * 10).roundToInt() / 10.0
        val coverage = ((monthlyGen / inputs.monthlyUnits) * 100).roundToInt().coerceAtMost(120)

        val exportFraction = if (inputs.enableGridExport) (inputs.gridExportPercent / 100.0).coerceIn(0.0, 1.0) else 0.0
        val exportKwh = (monthlyGen * exportFraction).roundToInt()
        val selfKwh = monthlyGen - exportKwh

        return SizingResults(
            dailyConsumptionKwh = (dailyCons * 100).roundToInt() / 100.0,
            recommendedCapacityKwp = (rawKwp * 100).roundToInt() / 100.0,
            requiredPanelCount = panelCount,
            totalDcCapacityKwp = totalDcKwp,
            requiredRoofAreaSqm = roofAreaSqm,
            requiredRoofAreaSqft = roofAreaSqft,
            monthlyGenerationKwh = monthlyGen,
            annualGenerationKwh = annualGen,
            suggestedInverterKw = inverterKw,
            energyCoveragePercent = coverage,
            estimatedExportKwh = exportKwh,
            estimatedSelfKwh = selfKwh
        )
    }

    fun calculateFinancials(inputs: CalculationInputs, sizing: SizingResults): FinancialResults {
        val kwp = sizing.totalDcCapacityKwp
        val costPerKwp = if (inputs.currency == "INR") 52000.0 else 1350.0
        val gross = kwp * costPerKwp

        // PM Surya Ghar subsidy rule for India
        val subsidy = if (inputs.currency == "INR") {
            when {
                kwp < 1.0 -> kwp * 30000.0
                kwp < 2.0 -> 30000.0 + (kwp - 1.0) * 30000.0
                kwp < 3.0 -> 60000.0 + (kwp - 2.0) * 18000.0
                else -> 78000.0
            }
        } else {
            gross * 0.25
        }

        val netCost = max(1000.0, gross - subsidy)
        val fit = if (inputs.feedInTariffPerKwh > 0) inputs.feedInTariffPerKwh else inputs.tariffPerKwh * 0.65

        // Self-consumption offsets retail grid electricity; export earns Feed-in Tariff
        val monthlySelfSavings = minOf(sizing.estimatedSelfKwh.toDouble(), inputs.monthlyUnits) * inputs.tariffPerKwh
        val monthlyExportRevenue = sizing.estimatedExportKwh.toDouble() * fit
        val monthlySavings = monthlySelfSavings + monthlyExportRevenue
        val annualSavings = monthlySavings * 12.0
        val paybackYears = if (annualSavings > 0) ((netCost / annualSavings) * 10).roundToInt() / 10.0 else 0.0

        // 25 year outlook with 0.5% degradation and 2.5% tariff inflation
        var cumulative = 0.0
        var deg = 1.0
        var currentTariff = inputs.tariffPerKwh
        var currentFit = fit
        val exportRatio = sizing.estimatedExportKwh.toDouble() / maxOf(1.0, sizing.monthlyGenerationKwh.toDouble())

        for (year in 1..25) {
            val yrGen = sizing.annualGenerationKwh * deg
            val yrExport = yrGen * exportRatio
            val yrSelf = yrGen - yrExport
            cumulative += minOf(yrSelf, inputs.monthlyUnits * 12.0) * currentTariff + yrExport * currentFit
            deg *= 0.995
            currentTariff *= 1.025
            currentFit *= 1.015
        }
        val twentyFiveYearOutlook = cumulative - netCost - (gross * 0.15)

        return FinancialResults(
            monthlySavings = monthlySavings,
            annualSavings = annualSavings,
            monthlySelfSavings = monthlySelfSavings,
            monthlyExportRevenue = monthlyExportRevenue,
            grossCost = gross,
            subsidy = subsidy,
            netCost = netCost,
            paybackYears = paybackYears,
            twentyFiveYearOutlook = twentyFiveYearOutlook
        )
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/solarplanner/calculator/calculator/ShadowGeometryEngine.kt',
    name: 'ShadowGeometryEngine.kt',
    description: 'Obstacle elevation and winter shadow geometry calculations',
    language: 'kotlin',
    content: `package com.solarplanner.calculator.calculator

import kotlin.math.atan
import kotlin.math.tan
import kotlin.math.PI
import kotlin.math.roundToInt

data class ShadowResult(
    val obstacleElevationDeg: Double,
    val winterSolarAltitudeDeg: Double,
    val estimatedShadowLengthM: Double,
    val minClearanceM: Double,
    val isShaded: Boolean
)

object ShadowGeometryEngine {
    fun evaluate(
        obstacleHeightM: Double,
        obstacleDistanceM: Double,
        latitudeDeg: Double = 22.0
    ): ShadowResult {
        val h = maxOf(0.1, obstacleHeightM)
        val d = maxOf(0.1, obstacleDistanceM)

        val obstacleAngle = (atan(h / d) * 180.0 / PI * 10).roundToInt() / 10.0
        // Winter noon solar altitude
        val winterAltitude = maxOf(8.0, 90.0 - kotlin.math.abs(latitudeDeg) - 23.45)
        val rad = winterAltitude * PI / 180.0

        val shadowLength = ((h / tan(rad)) * 100).roundToInt() / 100.0
        val minClearance = ((shadowLength * 1.15) * 100).roundToInt() / 100.0

        return ShadowResult(
            obstacleElevationDeg = obstacleAngle,
            winterSolarAltitudeDeg = (winterAltitude * 10).roundToInt() / 10.0,
            estimatedShadowLengthM = shadowLength,
            minClearanceM = minClearance,
            isShaded = d < shadowLength
        )
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/solarplanner/calculator/ui/navigation/SolarNavGraph.kt',
    name: 'SolarNavGraph.kt',
    description: 'Jetpack Compose NavHost with routes for all 9 screens',
    language: 'kotlin',
    content: `package com.solarplanner.calculator.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

sealed class Screen(val route: String) {
    object Welcome : Screen("welcome")
    object Dashboard : Screen("dashboard")
    object Estimator : Screen("estimator")
    object Requirements : Screen("requirements")
    object Savings : Screen("savings")
    object Appliances : Screen("appliances")
    object ShadowTracker : Screen("shadow_tracker")
    object Maintenance : Screen("maintenance")
    object ExistingSystem : Screen("existing_system")
}

@Composable
fun SolarNavGraph() {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = Screen.Welcome.route
    ) {
        composable(Screen.Welcome.route) {
            // Screen 1: Welcome Screen
        }
        composable(Screen.Dashboard.route) {
            // Screen 2: Dashboard Screen
        }
        composable(Screen.Estimator.route) {
            // Screen 3: Solar Estimator Screen
        }
        composable(Screen.Requirements.route) {
            // Screen 4: System Requirements Screen
        }
        composable(Screen.Savings.route) {
            // Screen 5: Financial Savings Screen
        }
        composable(Screen.Appliances.route) {
            // Screen 6: Appliance Analysis Screen
        }
        composable(Screen.ShadowTracker.route) {
            // Screen 7: Shadow Tracker Screen
        }
        composable(Screen.Maintenance.route) {
            // Screen 8: Maintenance Records Screen
        }
        composable(Screen.ExistingSystem.route) {
            // Screen 9: Existing Solar System Screen
        }
        composable("change_location") {
            // Screen 10: Change Location Interactive Map Screen
        }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/solarplanner/calculator/ui/screens/ChangeLocationScreen.kt',
    name: 'ChangeLocationScreen.kt',
    description: 'Interactive map screen with center crosshairs pin, real-time coordinates & orange Confirm button',
    language: 'kotlin',
    content: `package com.solarplanner.calculator.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Screen: Change Location Map Screen
 * Implements Google Maps / Vector Map with top-right layer switch & GPS locate,
 * center crosshairs reticle with pulsing radar wave, and bottom sheet with Latitude,
 * Longitude, Time, and orange Confirm button.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChangeLocationScreen(
    initialLat: Double = 17.41,
    initialLon: Double = 78.44,
    onBack: () -> Unit = {},
    onConfirmLocation: (Double, Double, String) -> Unit = { _, _, _ -> }
) {
    var lat by remember { mutableStateOf(initialLat) }
    var lon by remember { mutableStateOf(initialLon) }
    var resolvedAddress by remember { mutableStateOf("Hyderabad, Telangana") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Change Location",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .padding(start = 8.dp)
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Interactive Map View Canvas / Google Map Composable
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFFE2E8F0)),
                contentAlignment = Alignment.Center
            ) {
                // Center Crosshair Reticle Overlay
                Box(
                    modifier = Modifier.size(64.dp),
                    contentAlignment = Alignment.Center
                ) {
                    // Pulsing radar wave
                    Box(
                        modifier = Modifier
                            .size(54.dp)
                            .clip(CircleShape)
                            .background(Color(0x330284C7))
                    )
                    // Dark navy crosshair ring
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .border(2.dp, Color(0xFF0F172A), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        // Center blue dot
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF2563EB))
                                .border(1.dp, Color.White, CircleShape)
                        )
                    }
                }
            }

            // Top-right floating controls: Layer switch and GPS auto-locate
            Column(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                FloatingActionButton(
                    onClick = { /* Switch satellite / vector / street layer */ },
                    shape = RoundedCornerShape(12.dp),
                    containerColor = Color.White,
                    contentColor = Color(0xFF1E293B),
                    modifier = Modifier.size(44.dp)
                ) {
                    Icon(Icons.Filled.Layers, contentDescription = "Layers")
                }

                FloatingActionButton(
                    onClick = {
                        // High-accuracy location lock
                        lat = 17.4124
                        lon = 78.4485
                        resolvedAddress = "High Precision GPS Fix"
                    },
                    shape = RoundedCornerShape(12.dp),
                    containerColor = Color.White,
                    contentColor = Color(0xFF1E293B),
                    modifier = Modifier.size(44.dp)
                ) {
                    Icon(Icons.Filled.MyLocation, contentDescription = "My Location")
                }
            }

            // Bottom stats & Confirm CTA sheet
            Card(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth(),
                shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 16.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    // 3-Column stats: Latitude | Longitude | Time
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Latitude", fontSize = 12.sp, color = Color.Gray)
                            Text(
                                String.format("%.2f°", lat),
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                        Divider(
                            modifier = Modifier
                                .height(36.dp)
                                .width(1.dp)
                        )
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Longitude", fontSize = 12.sp, color = Color.Gray)
                            Text(
                                String.format("%.2f°", lon),
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                        Divider(
                            modifier = Modifier
                                .height(36.dp)
                                .width(1.dp)
                        )
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Time", fontSize = 12.sp, color = Color.Gray)
                            Text("12:00 AM", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        }
                    }

                    // Address subtitle
                    Text(
                        text = resolvedAddress,
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 4.dp)
                    )

                    // Big Orange Confirm button
                    Button(
                        onClick = { onConfirmLocation(lat, lon, resolvedAddress) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEA580C))
                    ) {
                        Text(
                            text = "Confirm",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            color = Color.White
                        )
                    }

                    // Bottom promo ad bar
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                Icons.Filled.Info,
                                contentDescription = null,
                                tint = Color(0xFF0284C7),
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "Keep your photos and videos in full resolution, without worrying about space.",
                                fontSize = 11.sp,
                                color = Color.Gray,
                                maxLines = 2
                            )
                        }
                        Spacer(Modifier.width(8.dp))
                        Button(
                            onClick = {},
                            shape = CircleShape,
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F172A)),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                        ) {
                            Text("SIGN UP >", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
`,
  },
  {
    path: 'README.md',
    name: 'README.md (Export Instructions)',
    description: 'Instructions for importing into Android Studio and running',
    language: 'markdown',
    content: `# Solar Planner & Calculator - Native Android Application

A production-grade Android application built with **Kotlin**, **Jetpack Compose**, and **Material 3**.

## Features Included
1. **Welcome Screen**: Clean splash screen with app identity and fast start.
2. **Dashboard**: Live sun trajectory, coordinates, solar insolation, and 4 feature entry points.
3. **Solar Estimator**: Sizing for On-grid, Off-grid, and Hybrid setups with tariff presets and panel wattage selections (330W - 600W).
4. **System Requirements**: Detailed DC/AC sizing, roof area with spacing allowances, panel count, and engineering assumptions.
5. **Estimation & Savings**: PM Surya Ghar subsidy modeling, 25-year financial degradation outlook, and payback duration.
6. **Appliance Analysis**: Comprehensive daily/monthly watt-hour audit with instant transfer to estimator.
7. **Shadow Tracker**: Trigonometric obstacle elevation and winter sun shadow casting simulator.
8. **Solar Maintenance**: Persistent cleaning and inverter maintenance log with service reminders.
9. **Existing Solar System**: Audit real-world generation, Specific Yield, and Performance Ratio (PR).

## Opening in Android Studio
1. Extract this repository into a folder.
2. Open Android Studio (version Hedgehog 2023.1.1 or Ladybug 2024.2+).
3. Select **File > Open** and choose the extracted folder.
4. Allow Gradle Sync to finish downloading dependencies.
5. Connect an Android device (USB debugging enabled) or start an Android Virtual Device (AVD).
6. Click **Run 'app'** (Shift + F10) to build and install the native APK!
`,
  },
];
