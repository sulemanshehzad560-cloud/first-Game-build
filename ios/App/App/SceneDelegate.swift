import UIKit
import Capacitor
import GameKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Capacitor's view controller plus the app's own plugin.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BuildInfoPlugin())
        bridge?.registerPluginInstance(GameServicesPlugin())
        #if DEBUG
        // The self-test is read from stdout redirected to a file, which is block-buffered by default.
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-JadeSelfTest") || args.contains("-JadeDemo") { setvbuf(stdout, nil, _IOLBF, 0) }
        #endif
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}

/// Tells the web layer the build type (debug builds only request test ads), the platform,
/// and the AdMob interstitial unit configured for this build.
@objc(BuildInfoPlugin)
public class BuildInfoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BuildInfoPlugin"
    public let jsName = "BuildInfo"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isDebug", returnType: CAPPluginReturnPromise)
    ]

    @objc func isDebug(_ call: CAPPluginCall) {
        #if DEBUG
        let debug = true
        // CI launches the simulator build with -JadeSelfTest to run the in-app self-test.
        let selfTest = ProcessInfo.processInfo.arguments.contains("-JadeSelfTest")
        // -JadeDemo tours the app at full quality so CI can screen-record it.
        let demo = ProcessInfo.processInfo.arguments.contains("-JadeDemo")
        #else
        let debug = false
        let selfTest = false
        let demo = false
        #endif
        let unit = Bundle.main.object(forInfoDictionaryKey: "JadeInterstitialUnit") as? String ?? ""
        call.resolve([
            "debug": debug,
            "facebook": false,
            "platform": "ios",
            "interstitialId": unit,
            "selfTest": selfTest,
            "demo": demo
        ])
    }
}

/// Game Center: sign-in on launch and leaderboards ("Journey" and "Rush Hour").
@objc(GameServicesPlugin)
public class GameServicesPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameServicesPlugin"
    public let jsName = "GameServices"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "leaderboards", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadScores", returnType: CAPPluginReturnPromise)
    ]
    private var started = false
    private var inProgress = false
    private var waiting: [CAPPluginCall] = []

    private func info() -> [String: Any] {
        let p = GKLocalPlayer.local
        return [
            "available": true,
            "platform": "gamecenter",
            "signedIn": p.isAuthenticated,
            "name": p.isAuthenticated ? p.displayName : "",
            "id": p.isAuthenticated ? p.gamePlayerID : ""
        ]
    }

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let player = GKLocalPlayer.local
            if player.isAuthenticated { call.resolve(self.info()); return }
            // Game Center only shows its sign-in sheet once per launch; later calls report the current state.
            if self.started && !self.inProgress { call.resolve(self.info()); return }
            self.waiting.append(call)
            if self.started { return }
            self.started = true
            self.inProgress = true
            player.authenticateHandler = { [weak self] viewController, _ in
                guard let self = self else { return }
                if let vc = viewController {
                    self.bridge?.viewController?.present(vc, animated: true)
                    return
                }
                self.inProgress = false
                let state = self.info()
                let calls = self.waiting
                self.waiting = []
                calls.forEach { $0.resolve(state) }
                self.notifyListeners("change", data: state)
            }
        }
    }

    @objc func leaderboards(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { call.resolve(["leaderboards": [] as [Any]]); return }
        GKLeaderboard.loadLeaderboards(IDs: nil) { boards, _ in
            let list: [[String: Any]] = (boards ?? []).map { ["id": $0.baseLeaderboardID, "name": $0.title ?? ""] }
            call.resolve(["leaderboards": list])
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let id = call.getString("leaderboard"), GKLocalPlayer.local.isAuthenticated else { call.resolve(["ok": false]); return }
        let score = Int(call.getDouble("score") ?? 0)
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [id]) { error in
            call.resolve(["ok": error == nil])
        }
    }

    @objc func showLeaderboard(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { call.reject("Not signed in to Game Center"); return }
        DispatchQueue.main.async {
            let vc: GKGameCenterViewController
            if let id = call.getString("leaderboard") {
                vc = GKGameCenterViewController(leaderboardID: id, playerScope: .global, timeScope: .allTime)
            } else {
                vc = GKGameCenterViewController(state: .leaderboards)
            }
            vc.gameCenterDelegate = self
            self.bridge?.viewController?.present(vc, animated: true)
            call.resolve()
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }

    /// About `count` players ranked around this player (the top of the board if they have no score yet).
    @objc func loadScores(_ call: CAPPluginCall) {
        guard let id = call.getString("leaderboard"), GKLocalPlayer.local.isAuthenticated else {
            call.resolve(["ok": false, "entries": [] as [Any]]); return
        }
        let scope: GKLeaderboard.TimeScope = call.getString("span") == "day" ? .today : call.getString("span") == "week" ? .week : .allTime
        let count = min(100, max(10, call.getInt("count") ?? 50))
        let me = GKLocalPlayer.local.gamePlayerID
        GKLeaderboard.loadLeaderboards(IDs: [id]) { boards, error in
            guard let board = boards?.first else { call.resolve(["ok": false, "entries": [] as [Any], "error": error?.localizedDescription ?? "not found"]); return }
            board.loadEntries(for: .global, timeScope: scope, range: NSRange(location: 1, length: 1)) { local, _, _, _ in
                let start = max(1, (local?.rank ?? 0) - count / 2)
                board.loadEntries(for: .global, timeScope: scope, range: NSRange(location: start, length: count)) { _, entries, _, err in
                    let list: [[String: Any]] = (entries ?? []).map {
                        ["rank": $0.rank, "score": $0.score, "name": $0.player.displayName, "id": $0.player.gamePlayerID, "me": $0.player.gamePlayerID == me]
                    }
                    call.resolve(["ok": err == nil, "entries": list])
                }
            }
        }
    }
}
