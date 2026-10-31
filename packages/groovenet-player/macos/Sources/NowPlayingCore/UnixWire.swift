import Darwin
import Foundation

public final class UnixWire: Wire {
  public var onData: ((Data) -> Void)?
  public var onDisconnect: ((Error) -> Void)?
  private var fd: Int32
  private var source: DispatchSourceRead?

  public convenience init(path: String) throws {
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let bytes = Array(path.utf8) + [0]
    guard bytes.count <= MemoryLayout.size(ofValue: address.sun_path) else {
      throw BridgeError("Daemon socket path is too long.")
    }
    withUnsafeMutableBytes(of: &address.sun_path) { $0.copyBytes(from: bytes) }
    address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else {
      throw BridgeError("Cannot create daemon socket: \(String(cString: strerror(errno)))")
    }
    let result = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }
    guard result == 0 else {
      let reason = String(cString: strerror(errno))
      Darwin.close(fd)
      throw BridgeError(
        "Cannot connect to \(path): \(reason). Start “groovenet player start --detach” first.")
    }
    try self.init(connectedFD: fd)
  }

  /// Takes ownership of the descriptor, including on configuration failure.
  public init(connectedFD: Int32) throws {
    fd = connectedFD
    var yes: Int32 = 1
    guard setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &yes, socklen_t(MemoryLayout<Int32>.size)) == 0,
      fcntl(fd, F_SETFL, O_NONBLOCK) != -1
    else {
      Darwin.close(fd)
      fd = -1
      throw BridgeError("Cannot configure nonblocking daemon socket.")
    }
    let source = DispatchSource.makeReadSource(fileDescriptor: fd, queue: .main)
    // The source owns the original descriptor until cancellation completes.
    source.setCancelHandler { Darwin.close(connectedFD) }
    source.setEventHandler { [weak self] in self?.readAvailable() }
    self.source = source
    source.resume()
  }

  public func send(_ data: Data) throws {
    guard fd >= 0 else { throw BridgeError("Daemon connection is closed.") }
    let count = data.withUnsafeBytes { Darwin.send(fd, $0.baseAddress, $0.count, 0) }
    // Requests are tiny. Fail closed on backpressure/partial delivery rather
    // than blocking the AppKit run loop or sending a truncated second RPC.
    guard count == data.count else {
      throw BridgeError(
        "Cannot send daemon command. Restart the companion after checking the daemon.")
    }
  }

  public func close() {
    guard fd >= 0 else { return }
    fd = -1
    source?.cancel()
    source = nil
  }

  private func readAvailable() {
    var bytes = [UInt8](repeating: 0, count: 65536)
    while fd >= 0 {
      let count = Darwin.recv(fd, &bytes, bytes.count, 0)
      if count > 0 {
        onData?(Data(bytes.prefix(count)))
      } else if count < 0 && errno == EINTR {
        continue
      } else if count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK) {
        return
      } else {
        onDisconnect?(
          BridgeError(
            "Player daemon disconnected. Restart this companion after restarting the daemon."))
        close()
        return
      }
    }
  }

  deinit { close() }
}
