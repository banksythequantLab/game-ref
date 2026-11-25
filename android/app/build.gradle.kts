import java.util.Properties

plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
    id("com.google.devtools.ksp")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Gitignored: the App Check debug secret registered for this app.
val secrets = Properties().apply {
    val f = rootProject.file("secrets.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "ai.banksy.gameref"
    compileSdk = 36

    defaultConfig {
        applicationId = "ai.banksy.gameref"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildFeatures { resValues = true }

    buildTypes {
        debug {
            // The App Check debug provider reads its token from this resource (debuggable builds only).
            resValue("string", "firebase_app_check_debug_token", secrets.getProperty("appcheck.debug.secret", ""))
        }
    }
}

kotlin {
    compilerOptions { optIn.add("com.google.firebase.ai.type.PublicPreviewAPI") }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.12.4")
    implementation("androidx.webkit:webkit:1.17.1")
    implementation("com.google.firebase:firebase-ai:18.2.0")
    implementation("com.google.firebase:firebase-ai-ondevice:16.0.0-beta08")
    implementation("com.google.firebase:firebase-appcheck-debug:20.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.13.0")
    ksp("com.google.firebase:firebase-ai-ksp-processor:17.0.0")
}
