import Foundation
import Testing
@testable import Clemii

struct ProofServiceConfigurationTests {
    @Test func releaseConfigurationUsesBundledProductionURLs() throws {
        let configuration = ProofServiceConfiguration.resolve(
            environment: [:],
            infoDictionary: [
                "ClemiiProofServiceURL": "https://clemii.com",
                "ClemiiProofShortURL": "https://clemii.com/s/",
            ]
        )

        #expect(configuration.serviceURL == URL(string: "https://clemii.com"))
        #expect(configuration.proofURLBaseURL == URL(string: "https://clemii.com/s/"))
    }

    @Test func environmentCanSelectLocalDevelopmentServer() throws {
        let configuration = ProofServiceConfiguration.resolve(
            environment: [
                "HUSH_PROOF_SERVICE_URL": "http://127.0.0.1:3000",
                "HUSH_PROOF_SHORT_URL": "http://127.0.0.1:3000/s/",
            ],
            infoDictionary: [
                "ClemiiProofServiceURL": "https://clemii.com",
                "ClemiiProofShortURL": "https://clemii.com/s/",
            ]
        )

        #expect(configuration.serviceURL == URL(string: "http://127.0.0.1:3000"))
        #expect(configuration.proofURLBaseURL == URL(string: "http://127.0.0.1:3000/s/"))
    }

    @Test func serviceOverrideDerivesMatchingShortURL() throws {
        let configuration = ProofServiceConfiguration.resolve(
            environment: ["HUSH_PROOF_SERVICE_URL": "http://localhost:4000"],
            infoDictionary: [
                "ClemiiProofServiceURL": "https://clemii.com",
                "ClemiiProofShortURL": "https://clemii.com/s/",
            ]
        )

        #expect(configuration.serviceURL == URL(string: "http://localhost:4000"))
        #expect(configuration.proofURLBaseURL == URL(string: "http://localhost:4000/s"))
    }

    @Test func unsafeRemoteHTTPOverrideFailsClosed() throws {
        let configuration = ProofServiceConfiguration.resolve(
            environment: [
                "HUSH_PROOF_SERVICE_URL": "http://example.com",
                "HUSH_PROOF_SHORT_URL": "https://clemii.com/s/?redirect=other",
            ],
            infoDictionary: [:]
        )

        #expect(configuration.serviceURL == ProofServiceConfiguration.productionServiceURL)
        #expect(configuration.proofURLBaseURL == URL(string: "https://clemii.com/s"))
    }
}
