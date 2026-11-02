"""Offline contract tests for the read-only Claude audit runner."""
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

SCRIPT = Path(__file__).resolve().parents[1] / "claude-pr-audit.py"
spec = importlib.util.spec_from_file_location("claude_pr_audit", SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, *_):
        return json.dumps(self.payload).encode()


class AuditTests(unittest.TestCase):
    def test_429_retries_then_success_without_leaking_token(self):
        error = HTTPError("https://api.anthropic.com/v1/messages", 429, "Too Many Requests",
                          {"Retry-After": "1"}, io.BytesIO(
                              b'{"error":{"type":"rate_limit_error","message":"rate limit"}}'))
        req = audit.urllib.request.Request("https://api.anthropic.com/v1/messages")
        with patch.object(audit.urllib.request, "urlopen", side_effect=[
                error, FakeResponse({"ok": True})]) as opener, patch.object(audit.time, "sleep") as sleeper:
            self.assertEqual(audit.fetch_json(req), {"ok": True})
        self.assertEqual(opener.call_count, 2)
        sleeper.assert_called_once_with(1)

    def test_github_file_pagination(self):
        with patch.object(audit, "request", side_effect=[[{"patch": "x"}] * 100, [{"patch": "y"}]]) as call:
            files = audit.pr_files("owner/repo", 614, "fake-token")
        self.assertEqual(len(files), 101)
        self.assertIn("page=2", call.call_args_list[-1].args[0])

    def test_empty_diff_does_not_call_anthropic(self):
        with patch.dict(os.environ, {
                "GITHUB_REPOSITORY": "owner/repo", "GH_TOKEN": "fake",
                "ANTHROPIC_API_KEY": "fake", "AUDIT_PR": "614"}), \
                patch.object(audit, "request", return_value={
                    "state": "open", "head": {"sha": "deadbeef"}}), \
                patch.object(audit, "pr_files", return_value=[{"filename": "binary.png"}]), \
                patch.object(audit, "fetch_json") as anthropic:
            audit.main()
            anthropic.assert_not_called()

    def test_secret_redaction(self):
        error = HTTPError("https://api.anthropic.com/v1/messages", 400, "Bad Request",
                          {}, io.BytesIO(b'{"error":{"type":"invalid_request_error","message":"sk-ant-example-secret"}}'))
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-ant-example-secret"}):
            self.assertNotIn("sk-ant-example-secret", audit.safe_error(error))


if __name__ == "__main__":
    unittest.main()
