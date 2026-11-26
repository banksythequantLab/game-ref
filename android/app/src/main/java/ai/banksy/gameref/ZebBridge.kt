package ai.banksy.gameref

import android.speech.tts.TextToSpeech
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.firebase.Firebase
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.ondevice.DownloadStatus
import com.google.firebase.ai.ondevice.FirebaseAIOnDevice
import com.google.firebase.ai.ondevice.OnDeviceModelStatus
import com.google.firebase.ai.type.Content
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.Tool
import com.google.firebase.ai.type.content
import com.google.firebase.ai.type.generationConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import org.json.JSONObject
import java.util.Locale

/**
 * window.ZebNative — the web app calls this instead of the web SDK when it runs inside the Android app.
 * Rulings use Firebase AI Logic hybrid inference: Gemini Nano on the phone (AICore) when available,
 * the cloud Gemini model otherwise.
 */
class ZebBridge(private val activity: AppCompatActivity, private val web: WebView) {
    private val ai by lazy { Firebase.ai(backend = GenerativeBackend.googleAI()) }
    private val json = Json { encodeDefaults = true }
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    init {
        tts = TextToSpeech(activity) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) tts?.language = Locale.US
        }
    }

    @JavascriptInterface
    fun generate(id: String, specJson: String) {
        activity.lifecycleScope.launch(Dispatchers.IO) {
            val out = try {
                run(JSONObject(specJson))
            } catch (e: Throwable) {
                Log.w(TAG, "generate failed", e)
                JSONObject().put("error", "${e.javaClass.simpleName}: ${e.message ?: ""}")
            }
            reply("done", id, out.toString())
        }
    }

    private suspend fun run(spec: JSONObject): JSONObject {
        val kind = spec.getString("kind")
        val modelName = spec.getString("model")
        val temp = spec.optDouble("temperature", 0.2).toFloat()
        val prompt = toContent(spec)
        val hasImage = spec.getJSONArray("parts").let { a -> (0 until a.length()).any { a.getJSONObject(it).has("data") } }

        return when (kind) {
            // First ruling: on-device first. Photos go to the cloud (on-device is text-only for now).
            "referee", "ruling" -> {
                val mode = if (kind == "referee" && !hasImage) InferenceMode.PREFER_ON_DEVICE else InferenceMode.ONLY_IN_CLOUD
                val model = ai.generativeModel(
                    modelName = modelName,
                    generationConfig = generationConfig { temperature = temp },
                    onDeviceConfig = OnDeviceConfig(mode = mode, maxOutputTokens = 400, temperature = temp),
                )
                val res = model.generateObject(RulingOut.firebaseAISchema(), prompt)
                val obj = runCatching { res.getObject(0) }.getOrNull()
                val text = if (obj != null) json.encodeToString(RulingOut.serializer(), obj) else res.response.text ?: ""
                JSONObject().put("text", text).put("source", source(res.response.inferenceSource))
            }
            // Lessons: same hybrid routing as rulings, a longer answer.
            "lesson", "lesson_cloud" -> {
                val mode = if (kind == "lesson") InferenceMode.PREFER_ON_DEVICE else InferenceMode.ONLY_IN_CLOUD
                val model = ai.generativeModel(
                    modelName = modelName,
                    generationConfig = generationConfig { temperature = temp },
                    onDeviceConfig = OnDeviceConfig(mode = mode, maxOutputTokens = 700, temperature = temp),
                )
                val res = model.generateObject(LessonOut.firebaseAISchema(), prompt)
                val obj = runCatching { res.getObject(0) }.getOrNull()
                val text = if (obj != null) json.encodeToString(LessonOut.serializer(), obj) else res.response.text ?: ""
                JSONObject().put("text", text).put("source", source(res.response.inferenceSource))
            }
            "ingest" -> {
                val section = Schema.obj(mapOf("id" to Schema.string(), "title" to Schema.string(), "text" to Schema.string()))
                val model = ai.generativeModel(
                    modelName = modelName,
                    generationConfig = generationConfig {
                        temperature = 0f
                        maxOutputTokens = 32768
                        responseMimeType = "application/json"
                        responseSchema = Schema.obj(mapOf("game" to Schema.string(), "sections" to Schema.array(section)))
                    },
                )
                val res = model.generateContent(prompt)
                JSONObject().put("text", res.text ?: "").put("source", "in_cloud")
            }
            "search", "plain" -> {
                val model = ai.generativeModel(
                    modelName = modelName,
                    tools = if (kind == "search") listOf(Tool.googleSearch()) else null,
                )
                val res = model.generateContent(prompt)
                JSONObject().put("text", res.text ?: "").put("source", "in_cloud")
            }
            else -> error("Unknown kind $kind")
        }
    }

    private fun toContent(spec: JSONObject): Content {
        val parts = spec.getJSONArray("parts")
        return content {
            for (i in 0 until parts.length()) {
                val p = parts.getJSONObject(i)
                if (p.has("text")) text(p.getString("text"))
                else inlineData(Base64.decode(p.getString("data"), Base64.DEFAULT), p.getString("mime"))
            }
        }
    }

    private fun source(s: InferenceSource?) = if (s == InferenceSource.ON_DEVICE) "on_device" else "in_cloud"

    /** "available" | "downloadable" | "downloading" | "unavailable" — same words the web Prompt API uses. */
    @JavascriptInterface
    fun status(id: String) {
        activity.lifecycleScope.launch(Dispatchers.IO) {
            val s = try {
                when (FirebaseAIOnDevice.checkStatus()) {
                    OnDeviceModelStatus.AVAILABLE -> "available"
                    OnDeviceModelStatus.DOWNLOADABLE -> "downloadable"
                    OnDeviceModelStatus.DOWNLOADING -> "downloading"
                    else -> "unavailable"
                }
            } catch (e: Throwable) {
                Log.w(TAG, "checkStatus failed", e)
                "unavailable"
            }
            reply("done", id, JSONObject().put("text", s).toString())
        }
    }

    @JavascriptInterface
    fun download(id: String) {
        activity.lifecycleScope.launch(Dispatchers.IO) {
            var total = 0L
            var result = JSONObject().put("text", "ok")
            try {
                FirebaseAIOnDevice.download().collect { st ->
                    when (st) {
                        is DownloadStatus.DownloadStarted -> total = st.bytesToDownload
                        is DownloadStatus.DownloadInProgress -> if (total > 0) {
                            reply("progress", id, ((st.totalBytesDownloaded * 100) / total).toString())
                        }
                        is DownloadStatus.DownloadCompleted -> reply("progress", id, "100")
                        is DownloadStatus.DownloadFailed -> result = JSONObject().put("error", "Download failed: $st")
                        else -> {}
                    }
                }
            } catch (e: Throwable) {
                result = JSONObject().put("error", "${e.javaClass.simpleName}: ${e.message ?: ""}")
            }
            reply("done", id, result.toString())
        }
    }

    @JavascriptInterface
    fun speak(text: String) {
        if (ttsReady) tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "zeb")
    }

    @JavascriptInterface
    fun stopSpeaking() {
        tts?.stop()
    }

    private fun reply(fn: String, id: String, payload: String) {
        val js = "window.__zebNative && window.__zebNative.$fn(${JSONObject.quote(id)}, $payload)"
        web.post { web.evaluateJavascript(js, null) }
    }

    companion object {
        private const val TAG = "ZebBridge"
    }
}
