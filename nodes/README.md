# nodes (planned)

One file per n8n Code node. These are the only files in the repository that
touch `$input`, `$json` or `$('…')`; they read the node context, call
functions from `lib/`, and return items. Each file starts with a header
comment giving run mode, input shape, output shape and the lib functions it
uses. Tests run every wrapper through `test/helpers/n8n-context.js`.
