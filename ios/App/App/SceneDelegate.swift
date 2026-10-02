import UIKit
import Capacitor

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
        #if DEBUG
        // The self-test is read from stdout redirected to a file, which is block-buffered by default.
        if ProcessInfo.processInfo.arguments.contains("-JadeSelfTest") { setvbuf(stdout, nil, _IOLBF, 0) }
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
        #else
        let debug = false
        let selfTest = false
        #endif
        let unit = Bundle.main.object(forInfoDictionaryKey: "JadeInterstitialUnit") as? String ?? ""
        call.resolve([
            "debug": debug,
            "facebook": false,
            "platform": "ios",
            "interstitialId": unit,
            "selfTest": selfTest
        ])
    }
}
