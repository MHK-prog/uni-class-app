import org.gradle.api.tasks.Copy

plugins {
    id("com.android.application")
}

val webRoot = rootProject.projectDir.parentFile
val generatedWebAssets = layout.buildDirectory.dir("generated/webAssets")
val copyWebAssets = tasks.register<Copy>("copyWebAssets") {
    from(webRoot) {
        include("index.html", "styles.css", "app.js", "manifest.webmanifest", "sw.js", "icon.svg", "icon-192.png", "icon-512.png")
        into("www")
    }
    from(webRoot.resolve("fonts")) {
        into("www/fonts")
    }
    from(webRoot.resolve("assets/icons")) {
        into("www/assets/icons")
    }
    into(generatedWebAssets)
}

val releaseStorePath = providers.environmentVariable("SIGNING_KEYSTORE_PATH").orNull
val releaseStorePassword = providers.environmentVariable("SIGNING_KEYSTORE_PASSWORD").orNull
val releaseAlias = providers.environmentVariable("SIGNING_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("SIGNING_KEY_PASSWORD").orNull
val appVersion = providers.environmentVariable("APP_VERSION").orElse("1.10.0").get()
val buildNumber = providers.environmentVariable("GITHUB_RUN_NUMBER").orNull?.toIntOrNull() ?: 2
val releaseSigningReady = !releaseStorePath.isNullOrBlank() &&
    !releaseStorePassword.isNullOrBlank() &&
    !releaseAlias.isNullOrBlank() &&
    !releaseKeyPassword.isNullOrBlank() &&
    file(releaseStorePath).exists()

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

    sourceSets.getByName("main").assets.srcDir(generatedWebAssets)
}

tasks.named("preBuild").configure {
    dependsOn(copyWebAssets)
}

dependencies {
    implementation("androidx.webkit:webkit:1.16.0")
}
