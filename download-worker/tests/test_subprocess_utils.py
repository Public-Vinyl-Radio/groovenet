import subprocess
from unittest.mock import patch

import pytest
from worker.subprocess_utils import run_subprocess


def make_proc(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


@patch("worker.subprocess_utils.subprocess.run")
def test_returns_completed_process(mock_run):
    mock_run.return_value = make_proc(returncode=0, stdout="ok")
    result = run_subprocess(["echo", "hi"])
    assert result.returncode == 0
    assert result.stdout == "ok"


@patch("worker.subprocess_utils.subprocess.run")
def test_log_sink_captures_command_and_exit_code(mock_run):
    mock_run.return_value = make_proc(returncode=0, stdout="out", stderr="err")
    sink: list[str] = []
    run_subprocess(["my", "cmd"], log_sink=sink)
    assert any("my cmd" in line for line in sink)
    assert any("exit: 0" in line for line in sink)


@patch("worker.subprocess_utils.subprocess.run")
def test_log_sink_captures_stdout_and_stderr(mock_run):
    mock_run.return_value = make_proc(returncode=1, stdout="output text", stderr="error text")
    sink: list[str] = []
    run_subprocess(["cmd"], log_sink=sink)
    full = "\n".join(sink)
    assert "output text" in full
    assert "error text" in full


@patch("worker.subprocess_utils.subprocess.run")
def test_log_sink_none_does_not_raise(mock_run):
    mock_run.return_value = make_proc(returncode=0, stdout="x", stderr="y")
    run_subprocess(["cmd"])  # no log_sink


@patch("worker.subprocess_utils.subprocess.run")
def test_long_stdout_is_truncated_in_log_sink(mock_run):
    long_out = "x" * 5000
    mock_run.return_value = make_proc(returncode=0, stdout=long_out, stderr="")
    sink: list[str] = []
    run_subprocess(["cmd"], log_sink=sink)
    captured = "\n".join(sink)
    assert "[truncated]" in captured
    assert len(captured) < len(long_out)


@patch("worker.subprocess_utils.subprocess.run", side_effect=subprocess.TimeoutExpired(cmd=["cmd"], timeout=5))
def test_timeout_raises(mock_run):
    with pytest.raises(subprocess.TimeoutExpired):
        run_subprocess(["cmd"], timeout=5)


@patch("worker.subprocess_utils.subprocess.run")
def test_nonzero_exit_code_still_returned(mock_run):
    mock_run.return_value = make_proc(returncode=2, stderr="fail")
    result = run_subprocess(["cmd"])
    assert result.returncode == 2
