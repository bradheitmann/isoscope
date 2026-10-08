# tokens/04-layout.tokens.json

Moved out of `vendor/desert-pants/tokens/` (D13). The file is not byte-identical to the
pinned upstream commit `ba99de27974f623c20679962e8e3dc4d74c2a273`: upstream at the pin
contains a `visualization-workbench` component block (129 extra lines) that this copy
lacks. It matches a later upstream state instead, so it cannot be vendored as pinned.
Nothing in the repo imports it; it is an input to the external `desert-pants build`
generator. Kept as a reference copy only.
