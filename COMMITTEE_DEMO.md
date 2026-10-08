# Committee and IRB demonstration

Open `/committee-demo.html` from the home-page or workspace Committee demo link.
This is a provisional, fictional-data walkthrough, not approved research enrollment.

The demonstration includes the 29-question screening form, separate staff review,
MoCA 8.3 and Iowa Trail Making A/B baseline result entry, illustrative scripted
bot/control sessions, SAGE Form 1 at three-month follow-up, and 30 participant
feedback items. SAGE replaces the baseline tests at follow-up. Scores are kept
separate; no cross-instrument improvement, diagnosis or eligibility calculation
is made. The baseline date demonstrates calendar-month follow-up with end-of-month
clamping. Session frequency is not finalized.

Feedback is adapted from the supplied Research Tool 1.pdf. The two six-item
perception sections preserve their 1-disagree to 5-agree direction. The 18-item
usability section preserves the supplied 1-strongly-disagree to 7-strongly-agree
direction. DigiMoCA and administrator language are adapted for participants using
the study platform. Administrator demographics are omitted. Not applicable is
available for unexperienced comparisons. This is a provisional adaptation, not
an assertion of a validated questionnaire or PSSUQ composite scoring.

The public walkthrough stores entries in memory and exports JSON. Reloading
clears entries. It does not write to the study database, obtain consent, call a
trained bot, or simulate successful research outcomes. The authenticated prepared
study workflow from PR #2 remains separate and provides versioned configuration,
server storage and research exports. Its configuration requires staff sign-in.

Digit Span stays at `/digit-span.html`, with the original game and home/workspace
navigation preserved. It is a separate demonstration game and its scores are not
included in the new assessment export.

Build or regenerate the standalone committee page:

    cd frontend
    npm ci
    node build-review.mjs
    npm run build

Run browser validation after installing Playwright Chromium:

    node test-assessment-review.mjs

`PLAYWRIGHT_CHROMIUM_EXECUTABLE` can identify an existing compatible Chromium.
The generated public HTML should be committed with its corresponding source.
The standalone page is also embedded through AssessmentDraft in StudyPreparation.

Before live research: finalize and approve test administration/scoring, consent,
eligibility, assistance, session frequency, participant wording and analysis.
Deployment of this demonstration does not indicate committee or IRB approval.
