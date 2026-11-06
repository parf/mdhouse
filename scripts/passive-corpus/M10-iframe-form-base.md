# M10-iframe-form-base

```mermaid
graph TD
  A["<iframe srcdoc='<script>parent.__pwned.push(1)</script>'></iframe><form action=http://127.0.0.1:PROBE_PORT/form><base href=http://127.0.0.1:PROBE_PORT/>"]
```
