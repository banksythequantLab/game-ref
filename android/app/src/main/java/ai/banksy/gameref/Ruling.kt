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

/** A beginner lesson ("how do you play X?"), same shape as the web lessonSchema. */
@Serializable
@Generable(description = "A short beginner lesson on how to play a game")
data class LessonOut(
    @Guide(description = "One sentence on how you win")
    val goal: String,
    @Guide(description = "How many players and what equipment, one sentence")
    val needs: String,
    @Guide(description = "2 to 5 short setup steps")
    val setup: List<String>,
    @Guide(description = "3 to 6 short steps for a turn, ending with how a hand or round ends")
    val turn: List<String>,
    @Guide(description = "How the whole game ends and who wins")
    val winning: String,
    @Guide(description = "2 to 3 beginner mistakes")
    val tips: List<String>,
    @Guide(description = "Ids of the rule sections used")
    val citedRuleIds: List<String>,
) {
    companion object
}
