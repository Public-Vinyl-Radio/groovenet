---
title: Record care
description: Track cleaning and sleeves for each physical copy, one stack at a time.
sidebar:
  order: 5
---

Open an album and find **Copies & care**. Use **Log care** for the default copy, or the action on a specific copy when you own more than one.

Log a cleaning or sleeve change with its date and details. **Add copy** separates a second pressing or duplicate from the first copy's history. Give copies labels you can recognise on the shelf.

## Chores: one stack at a time

**Chores** (under **More** on a phone) works through the whole library in stacks of ten. The to-do queue lists records that have never been cleaned: those spun recently first, then new arrivals, then the A–Z backlog.

**Pull next stack of 10** takes the next ten records in queue order as a numbered stack and selects them. The stack stays open until you log it or press **Clear**, which puts its records back in the queue, and it is still selected after a reload. You can also tick records yourself for an ad-hoc selection.

## Logging care for many records

With records selected, **Log care →** opens the log care dialog:

- **Care**: tick any of Cleaned, Sleeve change, Inspected and Repaired. One save can record a cleaning and a sleeve change together.
- **Sleeve**: appears with Sleeve change, and starts on the sleeve you're moving records to.
- **When**: now by default; change it to backdate the log.
- **Method**: appears with Cleaned. Leave it on "Not recorded" if you don't want to say.
- **Note**: optional, saved on every record in the log.

**Save** writes the care for every selected record at once. A pulled stack is logged as that stack; any other selection, including only part of a stack, is logged record by record. Logged records leave the queue, and the progress and sleeve counts update.

## The care log and undo

The care log (the right-hand column, or the **Care log** tab on a phone) lists recent logs, newest first. Each entry shows the stack, the kinds of care, the record count, covers, the method and note, and where it came from: **via web**, **via CLI** or **via MCP**.

The log you just saved shows **Undo** until you leave the page. Undo voids it and selects those records again; for a stack, it reopens the stack. A stack can't be reopened while another stack is open, so log or clear that one first.

**Full care history →** lists every log. Void an older entry there. A voided entry stays in the history, struck through, and stops counting. Void an incorrect care entry rather than logging a second event to compensate.

## Elsewhere

The care list shows records needing attention. `RECORD_CLEANING_OVERDUE_DAYS` controls the default overdue threshold. Removing a copy hides it from the list but keeps its history.

The [CLI](/docs/cli/#record-care) also provides `records` commands for care and copies. While a stack is open, the Chores page shows the command that logs it from the terminal, `groovenet records clean --stack N`.
