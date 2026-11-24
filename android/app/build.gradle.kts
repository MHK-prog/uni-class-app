plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val releaseStorePath = providers.environmentVariable("SIGNING_KEYSTORE_PATH").orNull
val releaseStorePassword = providers.environmentVariable("SIGNING_KEYSTORE_PASSWORD").orNull
val releaseAlias = providers.environmentVariable("SIGNING_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("SIGNING_KEY_PASSWORD").orNull
val appVersion = providers.environmentVariable("APP_VERSION").orElse("1.16.1").get()
val buildNumber = providers.environmentVariable("GITHUB_RUN_NUMBER").orNull?.toIntOrNull() ?: 3
val releaseSigningReady = !releaseStorePath.isNullOrBlank() &&
    !releaseStorePassword.isNullOrBlank() && !releaseAlias.isNullOrBlank() &&
    !releaseKeyPassword.isNullOrBlank() && file(releaseStorePath).exists()

android {
    namespace = "com.mhkprog.uniclass"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mhkprog.uniclass"
        minSdk = 24
        targetSdk = 35
        versionCode = buildNumber
        versionName = appVersion
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions { jvmTarget = "17" }

    if (releaseSigningReady) {
        signingConfigs {
            create("release") {
                storeFile = file(releaseStorePath!!)
                storePassword = releaseStorePassword
                keyAlias = releaseAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = if (releaseSigningReady) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("org.jsoup:jsoup:1.18.3")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
