import Foundation

public struct BridgeError: LocalizedError {
  public let message: String
  public init(_ message: String) { self.message = message }
  public var errorDescription: String? { message }
}

/// All callbacks and public methods run on the main queue.
public protocol Wire: AnyObject {
  var onData: ((Data) -> Void)? { get set }
  var onDisconnect: ((Error) -> Void)? { get set }
  func send(_ data: Data) throws
  func close()
}

public final class Session {
  public var onState: ((Playback?) -> Void)?
  public var onError: ((Error) -> Void)?
  public var onClose: (() -> Void)?
  public private(set) var snapshot: Playback?
  public private(set) var closed = false
  private let wire: Wire
  private let timeout: TimeInterval
  private var buffer = Data()
  private var nextID = 0
  private var pending: [Int: (String, DispatchWorkItem)] = [:]
  private var receivedState = false
  private var started = false
  private let limit = 8 * 1024 * 1024

  public init(wire: Wire, timeout: TimeInterval = 5) {
    self.wire = wire
    self.timeout = timeout
  }

  public func start() {
    guard !started, !closed else { return }
    started = true
    wire.onData = { [weak self] in self?.receive($0) }
    wire.onDisconnect = { [weak self] in self?.fail($0) }
    request("status")
  }

  /// Success means accepted for RPC delivery; failures are reported through onError.
  @discardableResult public func perform(_ command: Command) -> Bool {
    guard !closed, let method = snapshot?.method(for: command) else { return false }
    request(method)
    return !closed
  }

  public func close() {
    guard !closed else { return }
    closed = true
    pending.values.forEach { $0.1.cancel() }
    pending.removeAll()
    buffer.removeAll()
    wire.onData = nil
    wire.onDisconnect = nil
    wire.close()
    snapshot = nil
    onState?(nil)
    onClose?()
  }

  private func request(_ method: String) {
    nextID += 1
    let id = nextID
    let timer = DispatchWorkItem { [weak self] in
      guard let self, self.pending.removeValue(forKey: id) != nil else { return }
      self.fail(
        BridgeError(
          "Daemon timed out responding to \(method). Restart the companion after checking the daemon."
        ))
    }
    pending[id] = (method, timer)
    DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: timer)
    do {
      var data = try JSONSerialization.data(withJSONObject: [
        "jsonrpc": "2.0", "version": 1, "id": id, "method": method,
      ])
      data.append(0x0A)
      try wire.send(data)
    } catch { fail(error) }
  }

  private func receive(_ data: Data) {
    guard !closed else { return }
    buffer.append(data)
    while !closed, let newline = buffer.firstIndex(of: 0x0A) {
      let line = Data(buffer[..<newline])
      buffer.removeSubrange(...newline)
      guard line.count <= limit else {
        fail(BridgeError("Daemon message exceeds 8 MiB."))
        return
      }
      do { try message(line) } catch { fail(error) }
    }
    if buffer.count > limit { fail(BridgeError("Unterminated daemon message exceeds 8 MiB.")) }
  }

  private func message(_ data: Data) throws {
    struct Header: Decodable {
      let jsonrpc: String
      let version: Int
      let id: Int?
      let event: String?
    }
    let header = try JSONDecoder().decode(Header.self, from: data)
    guard let message = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      header.jsonrpc == "2.0"
    else {
      throw BridgeError("Invalid daemon JSON-RPC envelope.")
    }
    guard header.version == 1 else {
      throw BridgeError("Unsupported daemon protocol. Upgrade the Groovenet packages together.")
    }
    if let id = header.id {
      guard let (method, timer) = pending.removeValue(forKey: id) else { return }
      timer.cancel()
      if let error = message["error"] as? [String: Any] {
        let failure = BridgeError(
          "Daemon \(method): \(error["code"] ?? "RPC_ERROR"): \(error["message"] ?? "request failed")"
        )
        if method == "status" { fail(failure) } else { onError?(failure) }
      } else if method == "status", !receivedState {
        try update(message["result"])
      }
    } else if header.event == "state" {
      try update(message["data"])
      receivedState = true
    }
  }

  private func update(_ object: Any?) throws {
    guard let object = object as? [String: Any] else {
      throw BridgeError("Missing or invalid daemon playback snapshot.")
    }
    let data = try JSONSerialization.data(withJSONObject: object)
    snapshot = try JSONDecoder().decode(Playback.self, from: data)
    onState?(snapshot)
  }

  private func fail(_ error: Error) {
    guard !closed else { return }
    onError?(error)
    close()
  }

  deinit {
    if !closed {
      pending.values.forEach { $0.1.cancel() }
      wire.onData = nil
      wire.onDisconnect = nil
      wire.close()
    }
  }
}
