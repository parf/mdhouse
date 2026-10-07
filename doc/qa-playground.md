# Q&A playground

A page to try answering in the browser. Serve it writable and open it:

```bash
mdhouse doc -P --rw        # from the repository root — or any folder holding a copy of this file
```

In a `--rw` folder the ❓ and ⁉️ icons are buttons: click one, write the answer, **Save** (or
Ctrl+Enter). An unanswered question gets a 💬 under it; an answered one opens its answer for
editing. The answer is written into this file, in the same syntax as the question.

This page is meant to be written to. `git checkout doc/qa-playground.md` puts it back.
What each form means is in [Questions and answers in mdhouse](qa.md).

---

## Glyphs in a quote

> ? Should the scanner follow symlinks?

> ? Is the cache warm after a restart?
> 💬 Not until the first request touches each root.

> ?! The README says 7777 is the only port; the code reads `MDHOUSE_PORT` too.

> !? The spec says 5-year signals; the code uses 7.
> 💬 The code is right — the spec was never updated after the July review.

> ⁉️ Two runs of the scan disagree on the file count.

> ❓ Who owns the import job?
> 💬 The data team, from October:
> - schedule: first Monday of the month
> - alerts: #data-import

> Q: Do we keep the `.mdx` extension in names?

> Q Should hidden folders ever be listed?
> A: Only with `--all`, like ignored files.

## Alerts

> [!QUESTION]
> Should search results show the file size?

> [!QUESTION]
> What happens to a tick on a file that was renamed?

> [!ANSWER]
> The page reloads: the old path no longer resolves, so the server answers 404 and nothing is
> written.
>
> A rename shows up as a new file in the tree a moment later.

## Bold lines

**Q:** Does the front page show uncommitted work first?

**Q:** Can two tabs tick the same box at once?
**A:** Yes — the second one is refused (409), reloads, and shows the box already ticked.

As list items too:

- **Q:** Should a list of questions keep its bullets?
- **Q:** Do list-item questions take answers?
- **A:** Yes — the answer is written as the next item of the same list.

## Containers

::: q Should the about box show the git commit of the running build?
:::

::: question
Is the WebSocket reconnect fast enough after a laptop wakes?

It used to take up to 30 seconds.
:::

::: answer
Yes, now under a second:

- the client retries with backoff from 250 ms
- the server keeps no per-socket state to rebuild
:::

---

## Checkbox questions

The `QUESTIONS.md` convention: every task item is a question. In a writable folder a ❓ after the
checkbox opens the editor; the answer is written as an indented `> 💬` inside the item, and
**Check & Save** also ticks the box.

- [ ] Which hosts take the adapter and notifier instances in the versioned
      deployment inventory before each cutover?
- [ ] Which service groups are needed besides the initial `parf` and `prod`?
- [x] Does every provider accept a duplicate when the API call succeeds but the ack does not?
  > 💬 No — two of them reject it; those calls are made idempotent with a request key.

### Deferred

As they appear in a real `QUESTIONS.md` — Russian text, continuation lines indented under the item:

- [ ] Какие service-groups понадобятся кроме initial `parf` и `prod`?
- [ ] Какой residual duplicate policy принимает каждый external provider,
      когда API success и JetStream ACK не атомарны?

## Not questions — these must stay as they are

> A quick note: a quote starting with "A" is English, not an answer.

> Quite so — and "Q" counts only as a word of its own.

Text with a **Q:** in the middle of a sentence stays bold.
