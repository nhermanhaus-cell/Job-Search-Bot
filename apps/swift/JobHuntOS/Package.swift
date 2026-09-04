// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "JobHuntOS",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "JobHuntKit", targets: ["JobHuntKit"]),
        .library(name: "JobHuntUI", targets: ["JobHuntUI"]),
    ],
    targets: [
        .target(name: "JobHuntKit"),
        .target(name: "JobHuntUI", dependencies: ["JobHuntKit"]),
    ]
)
