import shlex
import subprocess

from .config import logger


def run_subprocess(
    cmd: list[str],
    *,
    timeout: int = 300,
    log_sink: list[str] | None = None,
) -> subprocess.CompletedProcess:
    cmd_str = " ".join(shlex.quote(part) for part in cmd)
    logger.info(f"Executing command: {cmd_str}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            stdin=subprocess.DEVNULL,  # prevent interactive prompts from blocking
        )
    except subprocess.TimeoutExpired:
        logger.error(f"Command timed out after {timeout}s: {cmd_str}")
        raise

    logger.info(f"Command exit code: {result.returncode}")

    stdout_preview = ""
    stderr_preview = ""

    if result.stdout:
        stdout_preview = result.stdout if len(result.stdout) < 4000 else result.stdout[:4000] + "\n...[truncated]"
        logger.info("Command stdout:\n%s", stdout_preview.strip())

    if result.stderr:
        stderr_preview = result.stderr if len(result.stderr) < 4000 else result.stderr[:4000] + "\n...[truncated]"
        logger.info("Command stderr:\n%s", stderr_preview.strip())

    if log_sink is not None:
        log_sink.append(f"$ {cmd_str}")
        log_sink.append(f"exit: {result.returncode}")
        if stdout_preview:
            log_sink.append(f"stdout:\n{stdout_preview.strip()}")
        if stderr_preview:
            log_sink.append(f"stderr:\n{stderr_preview.strip()}")

    return result
