import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/gemini-developer.yml", import.meta.url);

test("piloto Gemini exige mantenedor, plano e aprovação", async () => {
  const source = await readFile(workflowUrl, "utf8");
  assert.match(source, /@gemini-dev \/plan/);
  assert.match(source, /@gemini-dev \/approve/);
  assert.match(source, /OWNER.*MEMBER.*COLLABORATOR/);
  assert.match(source, /Plano Gemini Developer/);
});

test("action oficial e checkout não expõem credenciais", async () => {
  const source = await readFile(workflowUrl, "utf8");
  assert.match(source, /run-gemini-cli@f77273f4c914e4bf38440cf36a0369cb64a37489/g);
  assert.equal((source.match(/run-gemini-cli@/g) || []).length, 2);
  assert.equal((source.match(/persist-credentials:\s*['"]false['"]/g) || []).length, 2);
  assert.doesNotMatch(source, /pull_request_target/);
  assert.doesNotMatch(source, /secrets:\s*inherit/);
});

test("execução preserva allowlist mutante mínima", async () => {
  const source = await readFile(workflowUrl, "utf8");
  for (const allowed of [
    "create_pull_request",
    "create_branch",
    "create_or_update_file",
    "push_files",
  ]) assert.match(source, new RegExp(allowed));
  for (const forbidden of [
    "delete_file",
    "fork_repository",
    "merge_pull_request",
    "actions:\\s*write",
    "deployments:\\s*write",
    "environments:\\s*write",
  ]) assert.doesNotMatch(source, new RegExp(forbidden));
  assert.equal(
    (source.match(/["']?tools["']?:\s*\{\s*["']?core["']?:\s*\[\s*\]\s*\}/g) || []).length,
    2,
  );
});

test("agente permanece em branch própria e Draft PR para develop", async () => {
  const source = await readFile(workflowUrl, "utf8");
  assert.match(source, /prefixo\s+"gemini\//);
  assert.match(source, /Draft PR/);
  assert.match(source, /direcionado a develop/);
  assert.match(source, /Não faça merge nem Ready/);
});
