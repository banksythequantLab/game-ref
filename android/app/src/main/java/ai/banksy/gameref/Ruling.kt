package ai.banksy.gameref

import com.google.firebase.ai.annotations.Generable
import com.google.firebase.ai.annotations.Guide
import kotlinx.serialization.Serializable

@Serializable
enum class Verdict { YES, NO, DEPENDS }

/** The shape of every ruling. KSP turns this into a schema the on-device model and the cloud both follow. */
@Serializable
@Generable(description = "A referee's ruling on a board or card game question")
data class RulingOut(
    @Guide(description = "Only when a photo was given: what the photo shows, before ruling")
    val observed: String? = null,
    @Guide(description = "YES if the move or action is allowed, NO if it is not, DEPENDS if it depends on details")
    val verdict: Verdict,
    @Guide(description = "One-sentence ruling")
    val ruling: String,
    @Guide(description = "Short explanation that refers to the rules")
    val explanation: String,
    @Guide(description = "Ids of the rule sections the ruling relies on")
    val citedRuleIds: List<String>,
    @Guide(description = "Confidence from 0 to 1", minimum = 0.0, maximum = 1.0)
    val confidence: Double,
) {
    companion object
}
