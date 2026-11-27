import XCTest

final class OnboardingJourneyTests: XCTestCase {
    func testFreshInstallCompletesImmersivePrivateJourney() throws {
        let app = launchOnboarding()
        app.launch()
        app.activate()

        XCTAssertTrue(app.staticTexts["Talk and your Mac"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["does the typing."].exists)
        XCTAssertTrue(app.staticTexts["You’ll be ready in under a minute."].exists)
        XCTAssertTrue(app.staticTexts["1 of 4"].exists)
        XCTAssertFalse(
            app.sheets.staticTexts.matching(
                NSPredicate(format: "label CONTAINS[c] 'Documents'")
            ).firstMatch.exists,
            "A fresh install must not ask for access to the user's Documents folder"
        )
        keepScreenshot(named: "Onboarding 01 Welcome")

        app.buttons["clemii.onboarding.primary"].click()
        let voiceTitle = app.staticTexts["clemii.onboarding.voice.title"]
        XCTAssertTrue(voiceTitle.waitForExistence(timeout: 3))
        XCTAssertTrue((voiceTitle.value as? String)?.contains("Test your") == true)
        XCTAssertTrue((voiceTitle.value as? String)?.contains("voice.") == true)
        XCTAssertTrue(app.staticTexts["Say “Hello clemii, this is my voice.”"].exists)
        XCTAssertTrue(app.staticTexts["2 of 4"].exists)
        XCTAssertFalse(app.staticTexts["Allow clemii to listen and type."].exists)
        keepScreenshot(named: "Onboarding 02 Voice ready")

        app.buttons["clemii.onboarding.voice"].click()
        XCTAssertTrue(app.staticTexts["Allow clemii to listen and type."].waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["clemii.onboarding.permissions.continue"].isEnabled)
        keepScreenshot(named: "Onboarding 03 Contextual permissions")

        app.buttons["clemii.onboarding.microphone"].click()
        XCTAssertTrue(app.buttons["clemii.onboarding.microphone"].label.contains("Allowed"))
        app.buttons["clemii.onboarding.accessibility"].click()
        XCTAssertTrue(app.buttons["clemii.onboarding.accessibility"].label.contains("Enabled"))
        XCTAssertTrue(app.buttons["clemii.onboarding.permissions.continue"].isEnabled)
        keepScreenshot(named: "Onboarding 04 Permissions ready")

        app.buttons["clemii.onboarding.permissions.continue"].click()
        XCTAssertTrue(app.staticTexts["Listening"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["Listening…"].waitForExistence(timeout: 2))
        keepScreenshot(named: "Onboarding 05 Listening")
        XCTAssertTrue(app.staticTexts["Processing"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Transcribing locally…"].waitForExistence(timeout: 3))
        keepScreenshot(named: "Onboarding 06 Processing")

        let transcript = app.staticTexts["clemii.onboarding.transcript"]
        XCTAssertTrue(transcript.waitForExistence(timeout: 4))
        XCTAssertTrue((transcript.value as? String)?.contains("Hello clemii, this is my voice.") == true)
        XCTAssertTrue(app.buttons["clemii.onboarding.primary"].isEnabled)
        keepScreenshot(named: "Onboarding 07 Voice result")

        app.buttons["clemii.onboarding.primary"].click()
        XCTAssertTrue(app.staticTexts["Enable your"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Live Write."].exists)
        XCTAssertTrue(app.staticTexts["3 of 4"].exists)

        let personas = app.checkBoxes["clemii.onboarding.personas"]
        XCTAssertTrue(personas.exists)
        personas.click()
        XCTAssertTrue(
            app.staticTexts["Apple Intelligence is on. Live Write is ready."]
                .waitForExistence(timeout: 2)
        )
        keepScreenshot(named: "Onboarding 08 Personas enabled")

        app.buttons["clemii.onboarding.primary"].click()
        XCTAssertTrue(app.staticTexts["Proof it’s"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["really you."].exists)
        XCTAssertTrue(app.staticTexts["4 of 4"].exists)
        XCTAssertTrue(app.images["Example hiking profile photo"].exists)
        XCTAssertTrue(app.staticTexts["Clemoji"].exists)

        let proof = app.checkBoxes["clemii.onboarding.verified"]
        XCTAssertTrue(proof.exists)
        proof.click()
        XCTAssertTrue(app.staticTexts["Private proof links are ready."].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Voice-origin verified · signed on this Mac"].exists)
        XCTAssertTrue(app.staticTexts["Signed and encrypted"].exists)
        keepScreenshot(named: "Onboarding 09 Private proof ready")

        app.buttons["clemii.onboarding.primary"].click()
        XCTAssertTrue(app.staticTexts["Setting things up."].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["clemii stays in your menu bar"].exists)
        XCTAssertTrue(app.staticTexts["You’re ready."].waitForExistence(timeout: 3))
        keepScreenshot(named: "Onboarding 10 clemii ready")
        XCTAssertTrue(app.staticTexts["Dashboard"].waitForExistence(timeout: 4))
        XCTAssertFalse(app.staticTexts["Proof it’s"].exists)
        keepScreenshot(named: "Onboarding 11 Dashboard handoff")
    }

    func testOptionalPersonasAndProofCanStayOff() throws {
        let app = launchOnboarding()
        app.launch()
        app.activate()

        XCTAssertTrue(app.staticTexts["Talk and your Mac"].waitForExistence(timeout: 8))
        app.buttons["clemii.onboarding.primary"].click()
        XCTAssertTrue(app.buttons["clemii.onboarding.voice"].waitForExistence(timeout: 3))
        app.buttons["clemii.onboarding.voice"].click()
        app.buttons["clemii.onboarding.microphone"].click()
        app.buttons["clemii.onboarding.accessibility"].click()
        app.buttons["clemii.onboarding.permissions.continue"].click()

        XCTAssertTrue(app.staticTexts["clemii.onboarding.transcript"].waitForExistence(timeout: 8))
        app.buttons["clemii.onboarding.primary"].click()
        XCTAssertTrue(app.checkBoxes["clemii.onboarding.personas"].waitForExistence(timeout: 3))
        XCTAssertEqual(app.buttons["clemii.onboarding.primary"].label, "Skip")
        XCTAssertTrue(app.staticTexts["Everything runs on-device. Nothing goes to the cloud or to ChatGPT."].exists)
        keepScreenshot(named: "Onboarding 10 Personas optional")

        app.buttons["clemii.onboarding.primary"].click()
        XCTAssertTrue(app.checkBoxes["clemii.onboarding.verified"].waitForExistence(timeout: 3))
        XCTAssertEqual(app.buttons["clemii.onboarding.primary"].label, "Set up clemii")
        XCTAssertTrue(app.staticTexts["Draft · not signed yet"].exists)
        keepScreenshot(named: "Onboarding 11 Proof optional")

        app.buttons["clemii.onboarding.primary"].click()
        XCTAssertTrue(app.staticTexts["Setting things up."].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["You’re ready."].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Dashboard"].waitForExistence(timeout: 4))
    }

    private func launchOnboarding() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-didCompleteOnboarding", "NO",
            "-verifiedMessages.enabled.v1", "NO",
            "-postprocess.llmProvider", "off",
            "-postprocess.dictationPersona.enabled.v1", "NO",
            "--use-mock-transcriber",
            "--onboarding-ui-test",
            "--onboarding-verified-test-ready",
        ]
        return app
    }

    private func keepScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
