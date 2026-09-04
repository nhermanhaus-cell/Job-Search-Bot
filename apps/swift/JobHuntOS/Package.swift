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
        .executable(name: "JobHuntOSApp", targets: ["JobHuntApp"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/google/GoogleSignIn-iOS.git",
            from: "10.0.0"
        ),
    ],
    targets: [
        .target(name: "JobHuntKit"),
        .target(
            name: "JobHuntUI",
            dependencies: [
                "JobHuntKit",
                .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS"),
            ]
        ),
        .executableTarget(name: "JobHuntApp", dependencies: ["JobHuntUI"]),
    ]
)
