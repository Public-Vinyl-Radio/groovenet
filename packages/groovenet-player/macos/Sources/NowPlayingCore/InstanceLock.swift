import Darwin
import Foundation

/// flock releases on exit/crash. Keep the file: unlinking a live lock allows races.
public final class InstanceLock {
  private let fd: Int32
  public init(path: String) throws {
    fd = open(path, O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC, S_IRUSR | S_IWUSR)
    guard fd >= 0 else {
      throw BridgeError(
        "Cannot open companion lock at \(path). Check the private player directory exists and is writable."
      )
    }
    guard flock(fd, LOCK_EX | LOCK_NB) == 0 else {
      Darwin.close(fd)
      throw BridgeError(
        "Another Groovenet Now Playing companion is running. Stop it before starting a second instance."
      )
    }
  }
  deinit { Darwin.close(fd) }
}
