import SwiftUI

@main
struct SwarmBotApp: App {
    @StateObject private var ble = BLEManager()
    var body: some Scene {
        WindowGroup { ContentView().environmentObject(ble).preferredColorScheme(.dark) }
    }
}
