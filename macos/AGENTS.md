# clemii macOS agent guidance

Read `docs/user-journeys/verified-messages.md` before changing Verified Messages, transcription insertion, or the HUD. Preserve its journey IDs and trust invariants in code and tests.

## Required verification

Pull request CI does not build or test the native app; the merge queue does. Run these on a Mac before pushing a native change:

- Package unit tests: `swift test --package-path Packages/ClemiiProvenance`
- Swift-to-Hono integration: start the sibling `webapp` server, then run `HUSH_PROVENANCE_E2E_BASE_URL=http://127.0.0.1:3000 swift test --package-path Packages/ClemiiProvenance --filter enrollsAndPublishesWithHonoService`
- Full app build: `xcodebuild -project Clemii/Clemii.xcodeproj -scheme Clemii -configuration Release build`
- App unit tests, headless: `HUSH_TEST_HOST=1 xcodebuild test -project Clemii/Clemii.xcodeproj -scheme Clemii -only-testing:ClemiiTests`

Use Swift Testing for domain and integration tests. Use XCTest UI automation for complete macOS user journeys. Never commit Swift OpenAPI generated sources from build directories.

When changing a user-visible journey, update its journey document and test mapping in the same change.
