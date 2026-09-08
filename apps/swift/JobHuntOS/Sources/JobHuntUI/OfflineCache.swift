import Foundation
import JobHuntKit
import SwiftData

@Model
final class CachedSnapshot {
    @Attribute(.unique) var key: String
    var payload: Data
    var updatedAt: Date

    init(key: String, payload: Data, updatedAt: Date = .now) {
        self.key = key
        self.payload = payload
        self.updatedAt = updatedAt
    }
}

@MainActor
final class OfflineCache {
    private let container: ModelContainer?
    private let context: ModelContext?
    var userId: String?

    init() {
        let modelContainer = try? ModelContainer(for: CachedSnapshot.self)
        container = modelContainer
        context = modelContainer.map { ModelContext($0) }
    }

    private func scoped(_ key: String) -> String {
        "\(userId ?? "anonymous")/\(key)"
    }

    func save<T: Encodable>(_ value: T, key: String) {
        guard let context, let data = try? JSONEncoder().encode(value) else { return }
        let scopedKey = scoped(key)
        let descriptor = FetchDescriptor<CachedSnapshot>(
            predicate: #Predicate { $0.key == scopedKey }
        )
        if let existing = try? context.fetch(descriptor).first {
            existing.payload = data
            existing.updatedAt = .now
        } else {
            context.insert(CachedSnapshot(key: scopedKey, payload: data))
        }
        try? context.save()
    }

    func load<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let context else { return nil }
        let scopedKey = scoped(key)
        let descriptor = FetchDescriptor<CachedSnapshot>(
            predicate: #Predicate { $0.key == scopedKey }
        )
        guard let snapshot = try? context.fetch(descriptor).first else { return nil }
        return try? JSONDecoder().decode(type, from: snapshot.payload)
    }

    func removeAll(for userId: String? = nil) {
        guard let context else { return }
        let prefix = "\(userId ?? self.userId ?? "anonymous")/"
        let descriptor = FetchDescriptor<CachedSnapshot>()
        guard let rows = try? context.fetch(descriptor) else { return }
        for row in rows where row.key.hasPrefix(prefix) {
            context.delete(row)
        }
        try? context.save()
    }
}
