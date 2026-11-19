// SeamwiseClient.swift
//
// Drop-in client for the Seamwise API. Foundation + UIKit only, iOS 15+.
//
// NOT YET COMPILED: this was written on Windows, where Swift for iOS cannot be
// built. The models mirror src/types.ts field for field; expect small fixes the
// first time it goes through Xcode.
//
// Usage:
//   let client = SeamwiseClient(baseURL: URL(string: "http://192.168.1.20:8787")!, token: nil)
//   let result = try await client.assess(
//       photos: [(labelImage, .careLabel), (seamImage, .seamInterior)],
//       input: .init(price: 55))
//   print(result.headline)

import Foundation
import UIKit

// MARK: - Request

enum CaptureKind: String, Codable, CaseIterable {
    case fullGarment = "full_garment"
    case fabricMacro = "fabric_macro"
    case seamInterior = "seam_interior"
    case careLabel = "care_label"
    case hardwareCloseup = "hardware_closeup"
    case backlitFabric = "backlit_fabric"
}

enum GarmentCategory: String, Codable, CaseIterable {
    case tee, knitwear, denim, outerwear, shirt, other
}

struct Review: Codable {
    var id: String?
    var text: String
    var rating: Double?
}

struct AssessmentInput: Encodable {
    var category: GarmentCategory?
    var brand: String?
    var title: String?
    var price: Double?
    var currency: String?
    var pageText: String?
    var reviews: [Review]?
    var captureKinds: [CaptureKind?]?

    enum CodingKeys: String, CodingKey {
        case category, brand, title, price, currency, reviews
        case pageText = "page_text"
        case captureKinds = "capture_kinds"
    }
}

// MARK: - Response

struct Assessment: Decodable, Identifiable {
    let id: String
    let createdAt: String
    let title: String?
    let brand: String?
    let category: GarmentCategory
    let categorySource: String
    /// "graded" or "insufficient_information"
    let status: String
    /// nil when status is "insufficient_information"
    let grade: String?
    /// Ready to show: "Good, likely range Average to Good, medium confidence."
    let headline: String
    /// "high", "medium", "low" or "insufficient"
    let confidence: String
    let score: Score?
    let likelyRange: GradeRange?
    let dimensions: [DimensionResult]
    let reasons: Reasons
    let evidence: [Evidence]
    let notes: [Note]
    let nextBestEvidence: NextBestEvidence?
    let value: ValueView?
    let vision: VisionInfo
    let warnings: [String]

    struct Score: Decodable { let mean, low, high, conservative: Double }
    struct GradeRange: Decodable { let low, high: String }
    struct Reasons: Decodable {
        let `for`: [String]
        let against: [String]
        let unknown: [String]
    }
    struct DimensionResult: Decodable {
        let dimension: String
        let weight: Double
        let grade: String
        let mean, low, high: Double
        let evidenceCount: Int
        let summary: String
    }
    struct Evidence: Decodable {
        let key: String
        let dimension: String
        let claim: String
        let source: Source
        let value: Double
        let sd: Double
        let direction: String?
        let weight: Double?
        let contribution: Double?
    }
    struct Source: Decodable {
        let type: String
        let span: String?
        let images: [Int]?
        let reviewIds: [String]?
        let totalReviews: Int?
        let brand: String?
        let band: String?
    }
    struct Note: Decodable { let claim: String; let source: Source }
    struct NextBestEvidence: Decodable {
        let dimension: String
        /// A CaptureKind raw value, or "reviews" / "product_page"
        let captureKind: String
        /// Ready to show: "A photo of the care label would settle the fabric question."
        let prompt: String
        let expectedRangeReduction: Double
    }
    struct ValueView: Decodable { let index: Int; let label: String; let priceBand: String }
    struct VisionInfo: Decodable {
        /// "analyzed", "no_images", "skipped_no_provider" or "failed"
        let status: String
        let model: String?
        let detail: String?
        let images: [ImageInfo]
        struct ImageInfo: Decodable { let index: Int; let shotType: String; let quality: String; let flags: [String] }
    }
}

struct CaptureGuide: Decodable {
    let maxImages: Int
    let maxImageBytes: Int
    let steps: [Step]
    struct Step: Decodable { let kind: String; let title: String; let instruction: String; let why: String? }
}

struct SeamwiseError: Error, Decodable, LocalizedError {
    struct Body: Decodable { let code: String; let message: String }
    let error: Body
    var errorDescription: String? { error.message }
}

// MARK: - Client

final class SeamwiseClient {
    private let baseURL: URL
    private let token: String?
    private let session: URLSession
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    init(baseURL: URL, token: String?, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.token = token
        self.session = session
    }

    /// Photos are downscaled and re-encoded as JPEG here. Do not upload HEIC: the server rejects it.
    func assess(photos: [(image: UIImage, kind: CaptureKind?)], input: AssessmentInput = .init()) async throws -> Assessment {
        var input = input
        input.captureKinds = photos.map(\.kind)
        let boundary = "seamwise-\(UUID().uuidString)"
        var body = Data()

        body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"payload\"\r\n\r\n")
        body.append(try JSONEncoder().encode(input))
        body.append("\r\n")

        for (index, photo) in photos.enumerated() {
            guard let jpeg = Self.jpeg(photo.image) else { continue }
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"images\"; filename=\"photo\(index).jpg\"\r\nContent-Type: image/jpeg\r\n\r\n")
            body.append(jpeg)
            body.append("\r\n")
        }
        body.append("--\(boundary)--\r\n")

        var request = URLRequest(url: baseURL.appendingPathComponent("v1/assessments"))
        request.httpMethod = "POST"
        request.timeoutInterval = 120 // image analysis can take a while
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        return try await send(request, body: body)
    }

    func assessment(id: String) async throws -> Assessment {
        try await send(URLRequest(url: baseURL.appendingPathComponent("v1/assessments/\(id)")), body: nil)
    }

    func captureGuide() async throws -> CaptureGuide {
        try await send(URLRequest(url: baseURL.appendingPathComponent("v1/capture-guide")), body: nil)
    }

    private func send<T: Decodable>(_ request: URLRequest, body: Data?) async throws -> T {
        var request = request
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response): (Data, URLResponse)
        if let body {
            (data, response) = try await session.upload(for: request, from: body)
        } else {
            (data, response) = try await session.data(for: request)
        }
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else {
            if let apiError = try? decoder.decode(SeamwiseError.self, from: data) { throw apiError }
            throw URLError(.badServerResponse)
        }
        return try decoder.decode(T.self, from: data)
    }

    /// Longest edge 1600 px, JPEG quality 0.8: sharp enough to read a care label, well under the 5 MB limit.
    private static func jpeg(_ image: UIImage, maxEdge: CGFloat = 1600) -> Data? {
        let longest = max(image.size.width, image.size.height)
        let scale = min(1, maxEdge / longest)
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return resized.jpegData(compressionQuality: 0.8)
    }
}

private extension Data {
    mutating func append(_ string: String) { append(Data(string.utf8)) }
}
