// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "TrinityPet",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "TrinityPet",
            path: "Sources/TrinityPet",
            resources: [.copy("Fonts")],
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
