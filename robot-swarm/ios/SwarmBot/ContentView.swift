import SwiftUI

enum Mode: String, CaseIterable { case all = "同時", r1 = "1号機", r2 = "2号機", split = "個別" }

/// スティック/十字キーの入力 (x: 右+, y: 前+ / -1...1)
final class PadInput: ObservableObject {
    @Published var stick = CGPoint.zero
    @Published var dpad = CGPoint.zero
    var vector: CGPoint {
        if dpad != .zero {
            var v = dpad
            if v.x != 0 && v.y != 0 { v.x *= 0.5 }   // 斜め = カーブ
            return v
        }
        return stick
    }
    func reset() { stick = .zero; dpad = .zero }
}

let colR1 = Color(red: 1, green: 0.42, blue: 0.35)
let colR2 = Color(red: 0.25, green: 0.66, blue: 1)
let colAll = Color(red: 0.6, green: 0.48, blue: 1)

struct ContentView: View {
    @EnvironmentObject var ble: BLEManager
    @StateObject var padA = PadInput()
    @StateObject var padB = PadInput()
    @State var mode: Mode = .all
    @State var speed: Double = 70
    @State var mirror = false
    @Environment(\.scenePhase) var phase
    let timer = Timer.publish(every: 0.05, on: .main, in: .common).autoconnect()  // 20Hz

    var colorA: Color { mode == .r2 ? colR2 : mode == .all ? colAll : colR1 }

    var body: some View {
        VStack(spacing: 10) {
            // 接続
            HStack(spacing: 8) {
                ForEach(ble.robots) { r in ConnectButton(robot: r, color: r.id == 1 ? colR1 : colR2) }
            }
            Picker("モード", selection: $mode) {
                ForEach(Mode.allCases, id: \.self) { Text($0.rawValue) }
            }
            .pickerStyle(.segmented)
            .onChange(of: mode) { _ in stopAll() }

            Spacer(minLength: 0)
            if mode == .split {
                ControlPad(title: "1号機", color: colR1, input: padA, compact: true)
                ControlPad(title: "2号機", color: colR2, input: padB, compact: true)
            } else {
                ControlPad(title: mode == .all ? "2台同時" : mode.rawValue, color: colorA, input: padA, compact: false)
            }
            Spacer(minLength: 0)

            HStack {
                Text("速度 \(Int(speed))%").font(.caption).frame(width: 70, alignment: .leading)
                Slider(value: $speed, in: 20...100)
            }
            HStack {
                Toggle("2号機を左右反転", isOn: $mirror).font(.caption).disabled(mode != .all)
                Button(action: stopAll) {
                    Text("■ 全停止").bold().padding(.horizontal, 18).padding(.vertical, 10)
                        .background(Color.red).foregroundColor(.white).cornerRadius(10)
                }
            }
        }
        .padding()
        .background(Color(red: 0.07, green: 0.08, blue: 0.1).ignoresSafeArea())
        .onReceive(timer) { _ in tick() }
        .onChange(of: phase) { p in if p != .active { stopAll() } }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
    }

    func mix(_ v: CGPoint) -> (Int, Int) {
        if hypot(v.x, v.y) < 0.12 { return (0, 0) }       // デッドゾーン
        var l = v.y + v.x, r = v.y - v.x
        let m = max(1, abs(l), abs(r)); l /= m; r /= m
        let k = 255 * speed / 100
        return (Int((l * k).rounded()), Int((r * k).rounded()))
    }

    func tick() {
        let a = mix(padA.vector)
        var c1 = (0, 0), c2 = (0, 0)
        switch mode {
        case .all:   c1 = a; c2 = mirror ? (a.1, a.0) : a
        case .r1:    c1 = a
        case .r2:    c2 = a
        case .split: c1 = a; c2 = mix(padB.vector)
        }
        ble.send(1, c1.0, c1.1); ble.send(2, c2.0, c2.1)
    }

    func stopAll() { padA.reset(); padB.reset(); ble.stopAll() }
}

struct ConnectButton: View {
    @EnvironmentObject var ble: BLEManager
    @ObservedObject var robot: Robot
    let color: Color
    var body: some View {
        Button { ble.toggle(robot.id) } label: {
            HStack(spacing: 6) {
                Circle().fill(robot.connected ? Color.green : Color.gray).frame(width: 10, height: 10)
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(robot.id)号機").bold().foregroundColor(color)
                    Text(robot.status).font(.caption2).foregroundColor(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(10).frame(maxWidth: .infinity)
            .background(Color.white.opacity(0.06)).cornerRadius(10)
        }
    }
}

struct ControlPad: View {
    let title: String
    let color: Color
    @ObservedObject var input: PadInput
    let compact: Bool
    var body: some View {
        VStack(spacing: 8) {
            Text(title).font(.headline).foregroundColor(color)
            HStack(spacing: 20) {
                Joystick(value: $input.stick, color: color).frame(width: compact ? 150 : 210, height: compact ? 150 : 210)
                DPad(value: $input.dpad, color: color, size: compact ? 42 : 52)
            }
        }
    }
}

struct Joystick: View {
    @Binding var value: CGPoint
    let color: Color
    var body: some View {
        GeometryReader { g in
            let R = min(g.size.width, g.size.height) / 2
            ZStack {
                Circle().fill(Color.white.opacity(0.06)).overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 2))
                Circle().fill(color).frame(width: R * 0.75, height: R * 0.75).shadow(radius: 6)
                    .offset(x: value.x * R * 0.7, y: -value.y * R * 0.7)
            }
            .contentShape(Circle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { d in
                    var x = (d.location.x - R) / R, y = (d.location.y - R) / R
                    let m = hypot(x, y); if m > 1 { x /= m; y /= m }
                    value = CGPoint(x: x, y: -y)
                }
                .onEnded { _ in withAnimation(.spring(response: 0.2)) { value = .zero } })
        }
    }
}

struct DPad: View {
    @Binding var value: CGPoint
    let color: Color
    let size: CGFloat
    var body: some View {
        VStack(spacing: 4) {
            key("chevron.up", 0, 1)
            HStack(spacing: 4) {
                key("chevron.left", -1, 0)
                Color.clear.frame(width: size, height: size)
                key("chevron.right", 1, 0)
            }
            key("chevron.down", 0, -1)
        }
    }
    func key(_ icon: String, _ x: CGFloat, _ y: CGFloat) -> some View {
        let held = value == CGPoint(x: x, y: y)
        return Image(systemName: icon).font(.title2.bold())
            .frame(width: size, height: size)
            .background(held ? color : Color.white.opacity(0.08)).cornerRadius(8)
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { _ in value = CGPoint(x: x, y: y) }
                .onEnded { _ in if value == CGPoint(x: x, y: y) { value = .zero } })
    }
}
