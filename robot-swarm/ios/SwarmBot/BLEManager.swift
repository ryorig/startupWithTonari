import Foundation
import CoreBluetooth

/// 1台分のロボット接続
final class Robot: ObservableObject, Identifiable {
    let id: Int
    @Published var connected = false
    @Published var status = "未接続"
    var peripheral: CBPeripheral?
    var rx: CBCharacteristic?
    var lastMsg = ""
    var lastSent = Date.distantPast
    init(id: Int) { self.id = id }
}

final class BLEManager: NSObject, ObservableObject {
    static let svcUUID = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
    static let rxUUID  = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
    static let txUUID  = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E")

    @Published var robots = [Robot(id: 1), Robot(id: 2)]
    @Published var poweredOn = false
    private var central: CBCentralManager!
    private var wanted = Set<Int>()   // 接続したいロボットID

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    func robot(_ id: Int) -> Robot { robots[id - 1] }

    func toggle(_ id: Int) {
        let r = robot(id)
        if r.connected || wanted.contains(id) {
            wanted.remove(id)
            if let p = r.peripheral { central.cancelPeripheralConnection(p) }
            r.status = "未接続"; r.connected = false
            if wanted.isEmpty { central.stopScan() }
        } else {
            wanted.insert(id); r.status = "探しています…"
            scan()
        }
        objectWillChange.send()
    }

    private func scan() {
        guard poweredOn, !wanted.isEmpty else { return }
        central.scanForPeripherals(withServices: [Self.svcUUID], options: nil)
    }

    /// 左右モーター値 (-255...255) を送信。同じ値は200ms毎にキープアライブ
    func send(_ id: Int, _ l: Int, _ r: Int, force: Bool = false) {
        let rb = robot(id)
        guard rb.connected, let p = rb.peripheral, let c = rb.rx else { return }
        let msg = (l == 0 && r == 0) ? "S\n" : "M,\(l),\(r)\n"
        let now = Date()
        if !force && msg == rb.lastMsg && now.timeIntervalSince(rb.lastSent) < 0.2 { return }
        guard force || p.canSendWriteWithoutResponse else { return }
        p.writeValue(Data(msg.utf8), for: c, type: .withoutResponse)
        rb.lastMsg = msg; rb.lastSent = now
    }

    func stopAll() { for r in robots { send(r.id, 0, 0, force: true) } }
}

extension BLEManager: CBCentralManagerDelegate, CBPeripheralDelegate {
    func centralManagerDidUpdateState(_ c: CBCentralManager) {
        poweredOn = c.state == .poweredOn
        if poweredOn { scan() }
    }

    func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral,
                        advertisementData ad: [String: Any], rssi: NSNumber) {
        let name = (ad[CBAdvertisementDataLocalNameKey] as? String) ?? p.name ?? ""
        guard name.hasPrefix("SwarmBot-"), let id = Int(name.dropFirst(9)),
              (1...2).contains(id), wanted.contains(id) else { return }
        let r = robot(id)
        guard r.peripheral == nil || !r.connected else { return }
        r.peripheral = p; r.status = "接続中…"
        p.delegate = self
        c.connect(p)
        if robots.allSatisfy({ !wanted.contains($0.id) || $0.peripheral != nil }) { c.stopScan() }
    }

    func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
        p.discoverServices([Self.svcUUID])
    }

    func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        handleDrop(p)
    }

    func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        handleDrop(p)
    }

    private func handleDrop(_ p: CBPeripheral) {
        guard let r = robots.first(where: { $0.peripheral?.identifier == p.identifier }) else { return }
        r.connected = false; r.rx = nil; r.peripheral = nil
        if wanted.contains(r.id) { r.status = "再接続中…"; scan() } else { r.status = "未接続" }
        objectWillChange.send()
    }

    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        guard let s = p.services?.first(where: { $0.uuid == Self.svcUUID }) else { return }
        p.discoverCharacteristics([Self.rxUUID, Self.txUUID], for: s)
    }

    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        guard let r = robots.first(where: { $0.peripheral?.identifier == p.identifier }) else { return }
        for ch in s.characteristics ?? [] {
            if ch.uuid == Self.rxUUID { r.rx = ch }
            if ch.uuid == Self.txUUID { p.setNotifyValue(true, for: ch) }
        }
        r.connected = r.rx != nil
        r.status = r.connected ? "接続済み" : "サービス不一致"
        objectWillChange.send()
    }

    func peripheral(_ p: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
        guard let d = ch.value, let s = String(data: d, encoding: .utf8),
              let r = robots.first(where: { $0.peripheral?.identifier == p.identifier }) else { return }
        r.status = "接続済み  " + s
    }
}
