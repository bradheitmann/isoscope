# Independent backend review remediation

Independent CLI Luna reviewed exact backend candidate
`a9a36691c1700c666ee1724aae766f17cc311160` and returned FAIL.
The author reproduced both findings with new regression fixtures before fixes:

- `edited_older_fail_supersedes_newer_created_pass`: RED, current_head_pass remained
  true when a comment created at 00:00 was edited to FAIL at 03:00 after a PASS
  created at 02:00. The post-fix reducer selects verdict order by the effective
  server timestamp (max of createdAt and updatedAt), preserves creation/edit
  provenance separately, and excludes the author PR body from QA verdicts.
- `foreign_repository_replay_cannot_publish_or_create_receipts`: RED, a fixture/test
  receipt published under the default bradheitmann/leitting configuration. The
  post-fix publisher checks raw repository against configuration and refuses
  reusing state already bound to another repository before creating receipts or
  publishing current.json.

Both regression commands were run before the correction and failed their named
assertions. The final test suite includes 21 workflow/graph/MCP integration tests
and 3 process-event parser tests. Strict clippy and formatting checks pass.
This author-run evidence is implementation validation; independent delta review
and final integrated product QA remain separate requirements.
