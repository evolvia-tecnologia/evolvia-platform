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

    def test_github_comment_post_does_not_retry_ambiguous_503(self):
        error = HTTPError("https://api.github.com/repos/owner/repo/issues/614/comments",
                          503, "Service Unavailable", {}, io.BytesIO(b'{}'))
        req = audit.urllib.request.Request(
            "https://api.github.com/repos/owner/repo/issues/614/comments",
            data=b'{"body":"audit"}', method="POST")
        with patch.object(audit.urllib.request, "urlopen", side_effect=[
                error, FakeResponse({"id": 1})]) as opener, patch.object(audit.time, "sleep") as sleeper:
            with self.assertRaisesRegex(RuntimeError, "HTTP 503"):
                audit.fetch_json(req)
        self.assertEqual(opener.call_count, 1)
        sleeper.assert_not_called()

    def test_anthropic_post_retries_only_when_explicitly_enabled(self):
        error = HTTPError("https://api.anthropic.com/v1/messages",
                          429, "Too Many Requests", {"Retry-After": "1"},
                          io.BytesIO(b'{"error":{"type":"rate_limit_error","message":"rate limit"}}'))
        req = audit.urllib.request.Request(
            "https://api.anthropic.com/v1/messages", data=b'{}', method="POST")
        with patch.object(audit.urllib.request, "urlopen", side_effect=[
                error, FakeResponse({"content": []})]) as opener, patch.object(audit.time, "sleep") as sleeper:
            self.assertEqual(audit.fetch_json(req, retry_non_idempotent=True), {"content": []})
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


    def test_api_error_category_never_echoes_personal_data(self):
        error = HTTPError("https://api.anthropic.com/v1/messages", 400, "Bad Request",
                          {}, io.BytesIO(b'{"error":{"type":"invalid_request_error","message":"model unavailable for maria@example.com; Bearer sensitive"}}'))
        summary = audit.safe_error(error)
        self.assertEqual(summary, "invalid_request_error/model")
        self.assertNotIn("maria@example.com", summary)
        self.assertNotIn("Bearer", summary)

    def test_unstructured_api_error_is_not_logged_verbatim(self):
        error = HTTPError("https://api.anthropic.com/v1/messages", 503, "Unavailable",
                          {}, io.BytesIO(b'<html>private user data</html>'))
        self.assertEqual(audit.safe_error(error), "unstructured_api_response")


    def test_changed_head_refuses_stale_audit_comment(self):
        original = {"state": "open", "head": {"sha": "old-head"}}
        changed = {"state": "open", "head": {"sha": "new-head"}}
        with patch.dict(os.environ, {
                "GITHUB_REPOSITORY": "owner/repo", "GH_TOKEN": "fake",
                "ANTHROPIC_API_KEY": "fake", "AUDIT_PR": "614"}), \
                patch.object(audit, "request", side_effect=[original, changed]) as github, \
                patch.object(audit, "pr_files", return_value=[
                    {"filename": "example.py", "patch": "+pass"}]), \
                patch.object(audit, "fetch_json", return_value={
                    "content": [{"type": "text", "text": "Reviewed"}]}) as anthropic:
            with self.assertRaisesRegex(RuntimeError, "stale comment suppressed"):
                audit.main()
            self.assertEqual(github.call_count, 2)
            anthropic.assert_called_once()

    def test_unchanged_head_posts_audit_with_exact_sha(self):
        current = {"state": "open", "head": {"sha": "stable-head"}}
        with patch.dict(os.environ, {
                "GITHUB_REPOSITORY": "owner/repo", "GH_TOKEN": "fake",
                "ANTHROPIC_API_KEY": "fake", "AUDIT_PR": "614"}), \
                patch.object(audit, "request", side_effect=[
                    current, current, {"id": 123}]) as github, \
                patch.object(audit, "pr_files", return_value=[
                    {"filename": "example.py", "patch": "+pass"}]), \
                patch.object(audit, "fetch_json", return_value={
                    "content": [{"type": "text", "text": "Reviewed"}]}):
            audit.main()
            self.assertEqual(github.call_count, 3)
            self.assertEqual(github.call_args.args[2], "POST")
            self.assertIn("HEAD `stable-head`", github.call_args.args[3]["body"])


if __name__ == "__main__":
    unittest.main()
