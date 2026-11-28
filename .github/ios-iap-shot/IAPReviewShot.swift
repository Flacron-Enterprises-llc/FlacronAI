import StoreKitTest
import XCTest

/// Captures the real FlacronAI Subscription screen in the iOS simulator for the App Store subscription review screenshot.
/// Products come from a StoreKit test session whose configuration mirrors the four App Store Connect subscriptions
/// (same product ids, group and USD prices). The plan list itself comes from the production backend for the demo account.
final class IAPReviewShot: XCTestCase {
    func testSubscriptionScreen() throws {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "FlacronAI", withExtension: "storekit"))
        let session = try SKTestSession(contentsOf: url)
        session.disableDialogs = true
        session.clearTransactions()

        let env = ProcessInfo.processInfo.environment
        let app = XCUIApplication()
        app.launch()

        let welcomeSignIn = app.buttons["Sign In"]
        if welcomeSignIn.waitForExistence(timeout: 90) { welcomeSignIn.tap() }
        let email = app.textFields.firstMatch
        XCTAssertTrue(email.waitForExistence(timeout: 60), "login screen")
        email.tap()
        email.typeText(env["REVIEW_EMAIL"] ?? "")
        let password = app.secureTextFields.firstMatch
        password.tap()
        password.typeText(env["REVIEW_PASSWORD"] ?? "")
        app.buttons["Sign in"].firstMatch.tap()

        let more = app.buttons.matching(NSPredicate(format: "label CONTAINS 'More'")).firstMatch
        XCTAssertTrue(more.waitForExistence(timeout: 120), "signed in")
        sleep(5)
        let skip = app.buttons["Skip tour"]
        if skip.exists { skip.tap() }
        let skipText = app.staticTexts["Skip tour"]
        if skipText.exists { skipText.tap() }

        app.open(URL(string: "flacronai://subscription")!)
        let price = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '$39.99'")).firstMatch
        XCTAssertTrue(price.waitForExistence(timeout: 120), "Apple prices shown")
        sleep(4)
        attach("subscription-1")
        app.swipeUp()
        sleep(2)
        attach("subscription-2")
    }

    private func attach(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
